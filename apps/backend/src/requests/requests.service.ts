import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRequestDto } from './dto/create-request.dto';
import { NotificationsService } from '../notifications/notifications.service';
import PDFDocument = require('pdfkit');
import { Prisma } from '@prisma/client';
import { existsSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { RequestType } from '@prisma/client';
import { PaymentProvider } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { getRequestCompleteness, getRequestRequirements } from './request-requirements';
import { requestModels } from './request-models';
import { normalizeOfficialMark } from '../agent/official-mark-image';
import { FastApiAiService } from '../ai/fastapi-ai.service';

const defaultFees: Record<RequestType, number> = {
  BIRTH_CERTIFICATE: 5000,
  RESIDENCE_CERTIFICATE: 3000,
  NATIONALITY_CERTIFICATE: 10000,
  CIN_REQUEST: 2000,
  CIN_RENEWAL: 2000,
  GOOD_CHARACTER_CERTIFICATE: 3000,
  BUILDING_PERMIT: 25000,
  LAND_STATUS: 10000,
  COMMERCIAL_LICENSE: 15000,
  VEHICLE_REGISTRATION: 10000,
  LOSS_DECLARATION: 2000,
  SIGNATURE_LEGALIZATION: 5000,
  COMPLAINT: 0,
  SPECIAL_REQUEST: 5000,
  ASSOCIATION_DECLARATION: 20000,
  EVENT_AUTHORIZATION: 15000,
  ACCREDITATION: 20000,
  ADMINISTRATIVE_AUTHORIZATION: 10000,
};
const SIMULATED_PAYMENT_PIN = '1234';
const citizenEditableStatuses = ['DRAFT', 'SUBMITTED', 'PENDING_CHIEF', 'IN_REVIEW', 'PENDING_PREFECT', 'PENDING_PAYMENT', 'IN_PROGRESS', 'NEEDS_INFO'] as const;
const requestTypesByServiceCode: Record<string, RequestType[]> = {
  BC: [RequestType.BIRTH_CERTIFICATE],
  CR: [RequestType.RESIDENCE_CERTIFICATE],
  CIN: [RequestType.CIN_REQUEST, RequestType.CIN_RENEWAL],
  AP: [RequestType.BUILDING_PERMIT],
  LS: [RequestType.LAND_STATUS],
  BCC: [RequestType.GOOD_CHARACTER_CERTIFICATE],
  VR: [RequestType.VEHICLE_REGISTRATION],
  DL: [RequestType.LOSS_DECLARATION],
  ASSOC: [RequestType.ASSOCIATION_DECLARATION],
  MANIF: [RequestType.EVENT_AUTHORIZATION],
  AGREMENT: [RequestType.ACCREDITATION],
  AUTRE: [
    RequestType.NATIONALITY_CERTIFICATE,
    RequestType.COMMERCIAL_LICENSE,
    RequestType.SIGNATURE_LEGALIZATION,
    RequestType.SPECIAL_REQUEST,
    RequestType.ADMINISTRATIVE_AUTHORIZATION,
  ],
};

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly ai: FastApiAiService,
  ) {}

  getRequirements(type: RequestType, motif?: string, formData: Record<string, unknown> = {}) {
    const requirements = getRequestRequirements(type, { ...formData, ...(motif ? { motif } : {}) });
    if (!requirements) throw new NotFoundException('Type de demande introuvable');
    return requirements;
  }

  getModelPdf(type: string) {
    if (!Object.values(RequestType).includes(type as RequestType)) throw new NotFoundException('Modèle de démarche introuvable');
    const model = requestModels[type as RequestType];
    const modelDirectories = process.env.REQUEST_MODELS_DIR
      ? [process.env.REQUEST_MODELS_DIR]
      : [join(process.cwd(), 'modeles_pdf'), join(process.cwd(), '../../modeles_pdf')];
    const path = modelDirectories.map((directory) => join(directory, model.pdfFile)).find(existsSync);
    if (!path) throw new NotFoundException('Le modèle PDF de cette démarche est indisponible');
    return { path, filename: model.pdfFile };
  }

  async listAvailableServices() {
    return this.prisma.prefectureService.findMany({
      where: { isActive: true },
      orderBy: { nameFr: 'asc' },
    });
  }

  async listFees() {
    const settings = await this.prisma.platformSetting.findMany({ where: { key: { startsWith: 'fee.' } } });
    const configuredFees = new Map(settings.map(({ key, value }) => [key.slice(4), Number(value)]));
    return Object.fromEntries(Object.entries(defaultFees).map(([type, fallback]) => [type, configuredFees.get(type) ?? fallback]));
  }

  async listByUser(userId: string) {
    return this.prisma.serviceRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { service: true, attachments: true, history: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async getDashboardStats(userId: string) {
    const total = await this.prisma.serviceRequest.count({ where: { userId } });
    const inProgress = await this.prisma.serviceRequest.count({ where: { userId, status: { in: ['SUBMITTED', 'IN_REVIEW', 'IN_PROGRESS', 'NEEDS_INFO'] } } });
    const approved = await this.prisma.serviceRequest.count({ where: { userId, status: 'APPROVED' } });
    const rejected = await this.prisma.serviceRequest.count({ where: { userId, status: 'REJECTED' } });

    return { total, inProgress, approved, rejected };
  }

  async create(
    userId: string,
    data: CreateRequestDto,
    attachmentFiles: Array<{ label: string; path: string; originalname: string; mimetype?: string; size?: number }> = [],
    payment?: { provider: PaymentProvider; phone: string; confirmedAmount: number; simulationPin: string },
  ) {
    if (data.type === RequestType.COMPLAINT) {
      throw new BadRequestException('Les réclamations concernant un document délivré doivent être déposées depuis la page Réclamations.');
    }
    const service = await this.prisma.prefectureService.findUnique({ where: { id: data.serviceId } });
    if (!service) throw new NotFoundException('Service introuvable');
    if (!requestTypesByServiceCode[service.code]?.includes(data.type)) {
      throw new BadRequestException('Cette démarche n’est pas disponible dans le service sélectionné');
    }
    const formData = { ...(data.formData ?? {}) };
    delete formData.certificateAdministration;
    this.validateFormData(data.type, formData);
    const configuredFee = await this.prisma.platformSetting.findUnique({ where: { key: `fee.${data.type}` } });
    const fee = configuredFee ? Number(configuredFee.value) : defaultFees[data.type];
    if (!Number.isFinite(fee) || fee < 0) throw new BadRequestException('Le tarif de cette démarche est invalide');
    if (payment && payment.confirmedAmount !== fee) throw new BadRequestException('Le tarif a changé. Vérifiez le montant avant de confirmer à nouveau.');
    if (fee > 0 && !payment) throw new BadRequestException('Un paiement simulé est requis pour cette démarche');
    if (payment) {
      if (!/^\d{4}$/.test(payment.simulationPin) || payment.simulationPin !== SIMULATED_PAYMENT_PIN) {
        throw new BadRequestException('Code PIN de simulation incorrect. Utilisez le code de démonstration affiché.');
      }
      const prefixes: Partial<Record<PaymentProvider, string[]>> = {
        MVOLA: ['034', '038', '036'],
        AIRTEL_MONEY: ['033', '035'],
        ORANGE_MONEY: ['032', '037'],
      };
      if (!/^\d{10}$/.test(payment.phone) || !prefixes[payment.provider]?.some((prefix) => payment.phone.startsWith(prefix))) {
        throw new BadRequestException('Le numéro doit contenir 10 chiffres et correspondre à l’opérateur sélectionné');
      }
    }

    const created = await this.prisma.serviceRequest.create({
      data: {
        userId,
        serviceId: service.id,
        type: data.type,
        title: data.title ?? service.nameFr,
        description: data.description ?? '',
        formData: formData as Prisma.InputJsonValue,
        fee,
        status: 'SUBMITTED',
        history: {
          create: { status: 'SUBMITTED', comment: 'Demande soumise en ligne' },
        },
        attachments: {
          create: attachmentFiles.map((file) => ({
            label: file.label,
            originalName: file.originalname,
            storagePath: file.path,
            mimeType: file.mimetype,
            size: file.size,
          })),
        },
        ...(payment && fee > 0 ? {
          payments: {
            create: {
              userId,
              provider: payment.provider,
              phone: payment.phone,
              amount: fee,
              status: 'SUCCEEDED',
              externalId: `SIMULATION-${randomUUID()}`,
            },
          },
        } : {}),
      },
      include: { service: true, attachments: true, history: { orderBy: { createdAt: 'asc' } } },
    });
    this.indexAttachmentsInBackground(created.attachments);
    await this.notifications.createForUser(userId, 'Demande soumise', `Votre demande « ${created.title ?? service.nameFr} » a été transmise à la Préfecture.`);
    try {
      await this.notifications.createForAdministrators(
        'Nouveau dossier citoyen',
        `${created.title ?? service.nameFr} a été transmis à la Préfecture.`,
        { type: 'REQUEST_SUBMITTED', requestId: created.id },
      );
    } catch (error) {
      this.logger.error(
        `Request ${created.id} was submitted but admin notifications could not be created`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    return created;
  }

  async createMultipart(
    userId: string,
    data: { serviceId: string; type: RequestType; title?: string; description?: string; formData?: Record<string, unknown>; attachmentLabels?: string[]; paymentConfirmed: boolean; paymentProvider?: PaymentProvider; paymentPhone?: string; confirmedAmount?: number; simulationPin?: string },
    files: Array<{ path: string; originalname: string; mimetype?: string; size?: number }>,
  ) {
    if (data.paymentConfirmed !== true) throw new BadRequestException('La confirmation du paiement est obligatoire avant l’envoi du dossier');
    if (!Object.values(RequestType).includes(data.type)) throw new BadRequestException('Type de demande invalide');
    if (data.type === RequestType.COMPLAINT) {
      throw new BadRequestException('Les réclamations concernant un document délivré doivent être déposées depuis la page Réclamations.');
    }
    const requirements = getRequestRequirements(data.type, data.formData ?? {});
    this.validateFormData(data.type, data.formData ?? {});
    const labels = data.attachmentLabels ?? [];
    if (labels.length !== files.length) throw new BadRequestException('Chaque pièce jointe doit être associée à son champ de dépôt');
    const allowedLabels = new Set(requirements.attachments.map((item) => item.label));
    if (labels.some((label) => !allowedLabels.has(label))) throw new BadRequestException('Une pièce jointe ne correspond pas à cette démarche');
    const fileCounts = new Map<string, number>();
    labels.forEach((label) => fileCounts.set(label, (fileCounts.get(label) ?? 0) + 1));
    const invalidMultiplicity = requirements.attachments.find((item) => !item.multiple && (fileCounts.get(item.label) ?? 0) > 1);
    if (invalidMultiplicity) throw new BadRequestException(`Un seul fichier est autorisé pour : ${invalidMultiplicity.label}`);
    const missingAttachments = requirements.attachments.filter((item) => (fileCounts.get(item.label) ?? 0) < (item.required ? item.minFiles ?? 1 : 0));
    if (missingAttachments.length > 0) throw new BadRequestException(`Pièces obligatoires manquantes : ${missingAttachments.map((item) => item.label).join(', ')}`);
    const pairCounts = new Map<string, number[]>();
    requirements.attachments.forEach((item) => {
      if (!item.pairGroup) return;
      const counts = pairCounts.get(item.pairGroup) ?? [];
      counts.push(fileCounts.get(item.label) ?? 0);
      pairCounts.set(item.pairGroup, counts);
    });
    if ([...pairCounts.values()].some((counts) => counts.some((count) => count !== counts[0]))) {
      throw new BadRequestException('Chaque CIN doit comporter le même nombre de fichiers recto et verso');
    }
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (files.some((file) => !allowedMimeTypes.includes(file.mimetype ?? '') || (file.size ?? 0) > 10 * 1024 * 1024)) {
      throw new BadRequestException('Chaque pièce doit être un PDF, JPG ou PNG de 10 Mo maximum');
    }
    if (labels.some((label, index) => label === 'Photo d’identité 4 x 4' && !['image/jpeg', 'image/png'].includes(files[index]?.mimetype ?? ''))) {
      throw new BadRequestException('La photo d’identité 4 x 4 doit être une image JPG ou PNG');
    }
    const created = await this.create(
      userId,
      data as CreateRequestDto,
      files.map((file, index) => ({ ...file, label: labels[index] })),
      data.confirmedAmount && data.paymentProvider && data.paymentPhone
        ? { confirmedAmount: data.confirmedAmount, provider: data.paymentProvider, phone: data.paymentPhone, simulationPin: data.simulationPin ?? '' }
        : undefined,
    );
    return this.findById(created.id, { id: userId });
  }

  private validateFormData(type: RequestType, formData: Record<string, unknown>) {
    const fields = getRequestRequirements(type, formData).fields;
    const missing = fields
      .filter((field) => formData[field.name] === undefined || String(formData[field.name]).trim() === '')
      .map((field) => field.label);
    if (missing.length > 0) throw new BadRequestException(`Champs obligatoires manquants : ${missing.join(', ')}`);
    for (const field of fields) {
      const value = formData[field.name];
      if (value === undefined || String(value).trim() === '') continue;
      if (field.type === 'date') {
        const date = String(value);
        const parsed = new Date(`${date}T00:00:00.000Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
          throw new BadRequestException(`${field.label} : date invalide`);
        }
      }
      if (field.type === 'number' && !Number.isFinite(Number(value))) {
        throw new BadRequestException(`${field.label} : valeur numérique invalide`);
      }
      const selectedOption = String(value).trim();
      const validSelection = field.type === 'select' && (type === RequestType.CIN_RENEWAL && field.name === 'motif'
        ? field.options?.some((option) => option.toLocaleLowerCase('fr') === selectedOption.toLocaleLowerCase('fr'))
        : field.options?.includes(selectedOption));
      if (field.type === 'select' && !validSelection) {
        throw new BadRequestException(`${field.label} : sélection invalide`);
      }
      if (['cin', 'cinDemandeur', 'numeroCin'].includes(field.name) && !/^\d{12}$/.test(String(value).trim())) {
        throw new BadRequestException(`${field.label} : la CIN doit contenir exactement 12 chiffres`);
      }
    }
    if (type === RequestType.LOSS_DECLARATION && typeof formData.datePerte === 'string') {
      const today = new Date();
      const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
      if (formData.datePerte > localToday) throw new BadRequestException('La date de perte ne peut pas être dans le futur');
    }
    if (type === RequestType.RESIDENCE_CERTIFICATE && typeof formData.dateNaissance === 'string') {
      const birthDate = new Date(`${formData.dateNaissance}T00:00:00.000Z`);
      const today = new Date();
      let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
      if (today.getUTCMonth() < birthDate.getUTCMonth() || (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate())) age -= 1;
      if (age >= 18) {
        for (const [fieldName, label] of [['cin', 'Numéro CIN'], ['dateDelivranceCin', 'Date de délivrance de la CIN'], ['lieuDelivranceCin', 'Lieu de délivrance de la CIN']] as const) {
          const value = String(formData[fieldName] ?? '').trim();
          if (!value) throw new BadRequestException(`${label} obligatoire pour une personne majeure.`);
        }
        if (!/^\d{12}$/.test(String(formData.cin ?? '').trim())) {
          throw new BadRequestException('La CIN doit contenir exactement 12 chiffres.');
        }
      }
    }
    if (type === RequestType.CIN_REQUEST || type === RequestType.CIN_RENEWAL) {
      const dateValue = String(formData.dateNaissance);
      const birthDate = new Date(`${dateValue}T00:00:00.000Z`);
      const today = new Date();
      let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
      if (today.getUTCMonth() < birthDate.getUTCMonth() || (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate())) age -= 1;
      if (age < 18) throw new BadRequestException('La demande de CIN est réservée aux personnes âgées de 18 ans et plus');
      const height = Number(formData.tailleCm);
      if (!Number.isInteger(height) || height < 100 || height > 250) {
        throw new BadRequestException('La taille doit être renseignée en centimètres entre 100 et 250');
      }
    }
  }

  private ensureCitizenCanEdit(status: string) {
    if (['APPROVED', 'REJECTED', 'ARCHIVED', 'CANCELLED'].includes(status)) {
      throw new ForbiddenException('Cette demande ne peut plus être modifiée après la décision de l’administration');
    }
  }

  async updateByCitizen(requestId: string, userId: string, data: { formData?: Record<string, unknown>; description?: string; title?: string }) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Demande introuvable');
    if (request.userId !== userId) throw new ForbiddenException('Vous ne pouvez pas modifier cette demande');
    this.ensureCitizenCanEdit(request.status);

    const storedFormData = request.formData && typeof request.formData === 'object' && !Array.isArray(request.formData)
      ? request.formData as Record<string, unknown>
      : {};
    const formData = data.formData ? { ...data.formData } : { ...storedFormData };
    if (storedFormData.certificateAdministration !== undefined) {
      formData.certificateAdministration = storedFormData.certificateAdministration;
    } else {
      delete formData.certificateAdministration;
    }
    this.validateFormData(request.type, formData);

    const updated = await this.prisma.$transaction(async (transaction) => {
      const editable = await transaction.serviceRequest.updateMany({
        where: { id: requestId, userId, status: { in: [...citizenEditableStatuses] } },
        data: { updatedAt: new Date() },
      });
      if (editable.count === 0) throw new ForbiddenException('Cette demande ne peut plus être modifiée après la décision de l’administration');
      await transaction.serviceRequest.update({
        where: { id: requestId },
        data: {
          ...(data.title !== undefined ? { title: data.title.trim() || request.title } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          formData: formData as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
      await transaction.requestStatusHistory.create({
        data: { requestId, status: request.status, comment: 'Informations du dossier mises à jour par le citoyen', changedById: userId },
      });
      return transaction.serviceRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: { service: true, attachments: true, history: { orderBy: { createdAt: 'asc' } } },
      });
    });
    return updated;
  }

  async findById(id: string, user?: { id: string; roles?: string[]; role?: string }) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        service: true,
        attachments: true,
        history: { orderBy: { createdAt: 'asc' } },
        user: { select: { id: true, email: true, nom: true, phone: true, cin: true } },
      },
    });

    if (!request) throw new NotFoundException('Demande introuvable');
    if (user) {
      const isBackOffice = user.role === 'ADMIN' || user.roles?.includes('ADMIN');
      if (!isBackOffice && request.userId !== user.id) {
        throw new ForbiddenException('Vous ne pouvez pas consulter cette demande');
      }
    }
    return request;
  }

  async addAttachment(
    requestId: string,
    user: { id: string; roles?: string[]; role?: string },
    file: { path: string; originalname: string; mimetype?: string; size?: number },
    label?: string,
  ) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Demande introuvable');

    const isBackOffice = user.role === 'ADMIN' || user.roles?.includes('ADMIN');
    if (!isBackOffice && request.userId !== user.id) throw new ForbiddenException('Vous ne pouvez pas modifier cette demande');
    if (!isBackOffice) this.ensureCitizenCanEdit(request.status);
    const requestFormData = request.formData && typeof request.formData === 'object' && !Array.isArray(request.formData)
      ? request.formData as Record<string, unknown>
      : {};
    if (!label || !getRequestRequirements(request.type, requestFormData).attachments.some((requirement) => requirement.label === label)) {
      throw new BadRequestException('Sélectionnez un type de pièce justificative valide');
    }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype ?? '') || (file.size ?? 0) > 10 * 1024 * 1024) {
      throw new BadRequestException('La pièce doit être un PDF, JPG ou PNG de 10 Mo maximum');
    }
    if (label === 'Photo d’identité 4 x 4' && !['image/jpeg', 'image/png'].includes(file.mimetype ?? '')) {
      throw new BadRequestException('La photo d’identité 4 x 4 doit être une image JPG ou PNG');
    }

    const created = await this.prisma.$transaction(async (transaction) => {
      if (!isBackOffice) {
        const editable = await transaction.serviceRequest.updateMany({
          where: { id: requestId, userId: user.id, status: { in: [...citizenEditableStatuses] } },
          data: { updatedAt: new Date() },
        });
        if (editable.count === 0) throw new ForbiddenException('Cette demande ne peut plus être modifiée après la décision de l’administration');
      }
      const created = await transaction.requestAttachment.create({
        data: { requestId, label, originalName: file.originalname, storagePath: file.path, mimeType: file.mimetype, size: file.size },
      });
      await transaction.requestStatusHistory.create({
        data: { requestId, status: request.status, comment: 'Pièce justificative ajoutée au dossier', changedById: user.id },
      });
      return created;
    });
    this.indexAttachmentsInBackground([created]);
    return created;
  }

  async replaceAttachment(
    requestId: string,
    attachmentId: string,
    user: { id: string; roles?: string[]; role?: string },
    file: { path: string; originalname: string; mimetype?: string; size?: number },
  ) {
    const attachment = await this.prisma.requestAttachment.findUnique({ where: { id: attachmentId }, include: { request: true } });
    if (!attachment || attachment.requestId !== requestId) throw new NotFoundException('Pièce jointe introuvable');
    const isBackOffice = user.role === 'ADMIN' || user.roles?.includes('ADMIN');
    if (!isBackOffice && attachment.request.userId !== user.id) throw new ForbiddenException('Vous ne pouvez pas modifier cette demande');
    if (!isBackOffice) this.ensureCitizenCanEdit(attachment.request.status);
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype ?? '') || (file.size ?? 0) > 10 * 1024 * 1024) {
      throw new BadRequestException('La pièce doit être un PDF, JPG ou PNG de 10 Mo maximum');
    }
    if (attachment.label === 'Photo d’identité 4 x 4' && !['image/jpeg', 'image/png'].includes(file.mimetype ?? '')) {
      throw new BadRequestException('La photo d’identité 4 x 4 doit être une image JPG ou PNG');
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      if (!isBackOffice) {
        const editable = await transaction.serviceRequest.updateMany({
          where: { id: requestId, userId: user.id, status: { in: [...citizenEditableStatuses] } },
          data: { updatedAt: new Date() },
        });
        if (editable.count === 0) throw new ForbiddenException('Cette demande ne peut plus être modifiée après la décision de l’administration');
      }
      const replaced = await transaction.requestAttachment.update({
        where: { id: attachmentId },
        data: {
          originalName: file.originalname,
          storagePath: file.path,
          extractedText: null,
          mimeType: file.mimetype,
          size: file.size,
        },
      });
      await transaction.requestStatusHistory.create({
        data: { requestId, status: attachment.request.status, comment: 'Pièce justificative remplacée dans le dossier', changedById: user.id },
      });
      return replaced;
    });
    if (existsSync(attachment.storagePath)) await unlink(attachment.storagePath);
    this.indexAttachmentsInBackground([updated]);
    return updated;
  }

  private indexAttachmentsInBackground(attachments: Array<{
    id: string;
    storagePath: string;
    originalName: string;
    mimeType: string | null;
  }>) {
    void (async () => {
      for (let offset = 0; offset < attachments.length; offset += 4) {
        await Promise.all(attachments.slice(offset, offset + 4).map(async (attachment) => {
          if (!['application/pdf', 'image/jpeg', 'image/png'].includes(attachment.mimeType ?? '')) return;
          try {
            const extractedText = await this.ai.extraireTexte(attachment.storagePath, attachment.originalName);
            if (extractedText) {
              await this.prisma.requestAttachment.update({
                where: { id: attachment.id },
                data: { extractedText },
              });
            }
          } catch (error) {
            this.logger.warn(
              `OCR indisponible pour la pièce jointe ${attachment.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }));
      }
    })().catch((error: unknown) => {
      this.logger.error('Échec de l’indexation OCR des pièces jointes', error instanceof Error ? error.stack : String(error));
    });
  }

  async getAttachment(requestId: string, attachmentId: string, user: { id: string; roles?: string[]; role?: string }) {
    const attachment = await this.prisma.requestAttachment.findUnique({ where: { id: attachmentId }, include: { request: true } });
    if (!attachment || attachment.requestId !== requestId) throw new NotFoundException('Pièce jointe introuvable');
    const isBackOffice = user.role === 'ADMIN' || user.roles?.includes('ADMIN');
    if (!isBackOffice && attachment.request.userId !== user.id) throw new ForbiddenException('Vous ne pouvez pas consulter cette pièce jointe');
    if (!existsSync(attachment.storagePath)) throw new NotFoundException('Fichier indisponible');
    return { attachment, stream: createReadStream(attachment.storagePath) };
  }

  async generatePdf(requestId: string, user: { id: string; roles?: string[]; role?: string }) {
    const request = await this.findById(requestId);
    const isBackOffice = user.role === 'ADMIN' || user.role === 'SUPERADMIN'
      || user.roles?.includes('ADMIN') || user.roles?.includes('SUPERADMIN');
    if (!isBackOffice && request.userId !== user.id) throw new ForbiddenException('Vous ne pouvez pas télécharger cette demande');
    if (request.status !== 'APPROVED') throw new ForbiddenException('Le document sera disponible après approbation');
    if (request.type === RequestType.CIN_REQUEST || request.type === RequestType.CIN_RENEWAL) {
      throw new ForbiddenException('La CIN doit être retirée au guichet après la prise des empreintes digitales');
    }
    const formData = request.formData && typeof request.formData === 'object' && !Array.isArray(request.formData)
      ? request.formData as Record<string, unknown>
      : {};
    const model = this.getModelPdf(request.type);
    const marks = await this.prisma.officialMark.findMany({
      where: { isActive: true, kind: { in: ['STAMP', 'SIGNATURE'] } },
      orderBy: { createdAt: 'desc' },
    });
    const stamp = marks.find((mark) => mark.kind === 'STAMP');
    const signature = marks.find((mark) => mark.kind === 'SIGNATURE');
    const readOfficialMark = async (mark: typeof stamp, label: string) => {
      if (!mark) return null;
      try {
        return await normalizeOfficialMark(await readFile(mark.storagePath));
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'format non reconnu';
        throw new InternalServerErrorException(`Le fichier ${label} enregistré est illisible : ${detail}`);
      }
    };
    const [stampImage, signatureImage] = await Promise.all([
      readOfficialMark(stamp, 'du cachet'),
      readOfficialMark(signature, 'de la signature'),
    ]);

    return new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        margin: 56,
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      if (request.type === RequestType.BIRTH_CERTIFICATE) {
        const getText = (key: string) => {
          const value = formData[key];
          return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
        };
        const formatDate = (value: string) => {
          if (!value) return '';
          const date = new Date(`${value.slice(0, 10)}T00:00:00`);
          return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR');
        };
        const width = document.page.width;
        const height = document.page.height;
        const margin = 48;
        const contentWidth = width - margin * 2;
        const fill = (value: string) => value || '........................';
        const birthPlace = fill(getText('lieuNaissance'));
        const fullName = [getText('nom'), getText('prenoms')].filter(Boolean).join(' ') || '........................';
        const reference = fill(getText('anneeNumeroActe'));
        const birthDate = fill(formatDate(getText('dateNaissance')));
        const birthTime = fill(getText('heureNaissance'));
        const fatherBirthDate = fill(formatDate(getText('dateNaissancePere')));
        const motherBirthDate = fill(formatDate(getText('dateNaissanceMere')));
        const fatherName = fill(getText('nomPere'));
        const motherName = fill(getText('nomMere'));
        const fatherProfession = fill(getText('professionPere'));
        const motherProfession = fill(getText('professionMere'));
        const fatherBirthPlace = fill(getText('lieuNaissancePere'));
        const motherBirthPlace = fill(getText('lieuNaissanceMere'));
        const parentAddress = fill(getText('adresseDemandeur'));
        const centerText = (value: string, y: number, size = 8, bold = false, widthOverride = contentWidth) => {
          document.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
            .text(value, margin, y, { width: widthOverride, align: 'center', lineBreak: false });
        };

        const leftColumnWidth = contentWidth * 0.32;
        const rightColumnX = margin + leftColumnWidth + 16;
        const rightColumnWidth = contentWidth - leftColumnWidth - 16;

        document.font('Times-Bold').fontSize(8.5).text("REPOBLIKAN'I MADAGASIKARA", margin, 38, { width: leftColumnWidth, align: 'center' });
        document.font('Times-Roman').fontSize(7).text('Fitiavana-Tanindrazana-Fandrosoana', margin, 50, { width: leftColumnWidth, align: 'center' });
        document.font('Times-Bold').fontSize(8).text('FARITRA IHOROMBE\nDISTRIKA IHOSY\nKAOMININA IHOSY\nETAT CIVIL', margin, 70, { width: leftColumnWidth, align: 'center', lineGap: 0.5 });

        const legalX = width - margin - 230;
        document.rect(legalX, 38, 230, 78).lineWidth(0.7).stroke();
        document.font('Times-Roman').fontSize(8.5).text(
          "Teny midina laharana faha 788/CAB tamin'ny 29 desambra 1961 nataon'ny Minisitry ny Fitsarana\nsy ny Mpitahiry ny Kasem-panjakana",
          legalX + 8, 49, { width: 214, height: 56, align: 'center', lineGap: 1 },
        );

        document.font('Times-Bold').fontSize(13).text("KOPIAN'NY SORA-PIANKOHONANA", margin, 132, {
          width: contentWidth,
          align: 'center',
        });

        const leftCenterX = margin + 12;
        const leftCenterWidth = leftColumnWidth - 24;
        document.font('Times-Roman').fontSize(9);
        document.text('Laharana faha :', leftCenterX, 168, { width: leftCenterWidth, align: 'center' });
        document.font('Times-Bold').fontSize(10).text(reference, leftCenterX, 182, { width: leftCenterWidth, align: 'center' });
        document.font('Times-Roman').fontSize(9).text("Tamin'ny :", leftCenterX, 205, { width: leftCenterWidth, align: 'center' });
        document.font('Times-Bold').fontSize(10).text(birthDate, leftCenterX, 219, { width: leftCenterWidth, align: 'center' });
        document.font('Times-Roman').fontSize(9).text('Fahaterahana', leftCenterX, 258, { width: leftCenterWidth, align: 'center' });
        document.font('Times-Bold').fontSize(9.5).text(fullName, leftCenterX, 272, { width: leftCenterWidth, align: 'center' });
        document.font('Times-Roman').fontSize(9).text("Teraka tamin'ny :", leftCenterX, 309, { width: leftCenterWidth, align: 'center' });
        document.font('Times-Bold').fontSize(10).text(birthDate, leftCenterX, 323, { width: leftCenterWidth, align: 'center' });

        document.font('Times-Roman').fontSize(12).text(
          "Nalaina tamin'ny bokim-piankohonana taona roa sy roa arivo voatahiry ato amin'ny Kaominina ambonivohitra Ihosy izao soratra manaraka izao :",
          rightColumnX, 168, { width: rightColumnWidth, align: 'justify', indent: 18, height: 58, ellipsis: false, lineGap: 0 },
        );
        document.font('Times-Roman').fontSize(12).text(
          `Tamin'ny ${birthDate} tamin'ny ${birthTime} no teraka tao amin'ny trano fampivelomana ao ${birthPlace} ${fullName}, ${getText('sexe') === 'Féminin' ? 'zazavavy' : 'zazalahy'}, zanak'i ${fatherName}, ${fatherProfession}, teraka tamin'ny ${fatherBirthDate} tao ${fatherBirthPlace}, sy ${motherName}, vadiny, ${motherProfession}, teraka tamin'ny ${motherBirthDate} tao ${motherBirthPlace}, samy monina ao ${parentAddress}.`,
          rightColumnX, 228, { width: rightColumnWidth, align: 'justify', indent: 18, height: 112, ellipsis: false, lineGap: 0 },
        );
        document.font('Times-Roman').fontSize(12).text(
          `Nosoratana androany ${new Date().toLocaleDateString('fr-FR')}, araky ny fanambarana nataon-d${fatherName}, teraka tamin'ny ${fatherBirthDate}, ${fatherProfession}, monina ao ${parentAddress}, nanatrika ny fiterahana sy niara nanao sonia taminay, RAKOTOVAO Andrianarivelo Maurice, Mpiandraikitra ny Sora-piankohonana ao Ihosy, rehefa novakiana taminy ity soratra ity.`,
          rightColumnX, 347, { width: rightColumnWidth, align: 'justify', indent: 18, height: 86, ellipsis: false, lineGap: 0 },
        );

        document.font('Times-Bold').fontSize(10.5).text(
          '............................ MANARAKA NY SONIA ............................',
          rightColumnX, 465, { width: rightColumnWidth, align: 'center', lineBreak: false },
        );
        const copyDate = new Date().toLocaleDateString('fr-FR');
        document.font('Times-Roman').fontSize(10).text(
          `Kopia manontolo nadika tamin'ny boky androany, ${copyDate}\nary nomena an'i ${fullName}.`,
          rightColumnX, 495, { width: rightColumnWidth, height: 32, align: 'left', lineGap: 0 },
        );
        document.font('Times-Bold').fontSize(9).text('NY MPIANDRAIKITRA SORA-PIANKOHONANA', width - 330, 575, { width: 250, align: 'center' });
        if (stampImage) document.image(stampImage, margin + 20, 355, { fit: [105, 105] });
        if (signatureImage) document.image(signatureImage, width - 285, 605, { fit: [150, 55] });
        if (stampImage) document.image(stampImage, width - 205, 620, { fit: [85, 85] });
        document.end();
        return;
      }
      if (request.type === RequestType.RESIDENCE_CERTIFICATE) {
        const getText = (key: string) => {
          const value = formData[key];
          return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
        };
        const formatDate = (value: string) => {
          if (!value) return '';
          const date = new Date(`${value.slice(0, 10)}T00:00:00`);
          return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR').toUpperCase();
        };
        const administration = formData.certificateAdministration && typeof formData.certificateAdministration === 'object'
          ? formData.certificateAdministration as Record<string, unknown>
          : {};
        const admin = (key: string) => String(administration[key] ?? '').trim();
        const issuedAt = admin('issuedAt');
        const issueDate = formatDate(issuedAt) || new Date().toLocaleDateString('fr-FR').toUpperCase();
        const pageWidth = document.page.width;
        const margin = 42;
        const halfHeight = 391;
        const contentWidth = pageWidth - margin * 2;
        const boxX = 28;
        const boxY = 28;
        const boxWidth = pageWidth - 56;
        const fill = (value: string) => value || '........................';
        const fokontany = fill(getText('fokontany'));
        const issueLocation = fill(admin('issueLocation') || 'IHOSY');

        document.rect(boxX, boxY, boxWidth, halfHeight).lineWidth(1).strokeColor('#343434').stroke();
        document.font('Courier-Bold').fontSize(8).text("MINISTERE DE L'INTERIEUR", margin, 43, { width: contentWidth * 0.55 });
        document.font('Courier-Bold').fontSize(8).text('PREFECTURE DE POLICE D’IHOSY', margin, 55, { width: contentWidth * 0.55 });
        document.font('Courier-Bold').fontSize(7.5).text('DISTRICT D’IHOSY', margin, 67, { width: contentWidth * 0.55 });
        document.font('Courier-Bold').fontSize(7.5).text(`FOKONTANY : ${fokontany.toUpperCase()}`, margin, 79, { width: contentWidth * 0.55 });
        document.font('Courier-Bold').fontSize(9).text('FANAMARINAM-PONENANA', pageWidth - margin - 170, 48, { width: 170, align: 'right' });
        document.font('Courier-Bold').fontSize(8.5).text('CERTIFICAT DE RESIDENCE', pageWidth - margin - 170, 64, { width: 170, align: 'right', underline: true });
        document.font('Courier-Bold').fontSize(8).text(`N° ${fill(admin('certificateNumber'))} / MINTER / DIST. IHOSY / FKT. ${fill(admin('reference'))}`, margin, 105, { width: contentWidth });

        document.font('Courier').fontSize(8.5).text(
          `Ny sefom-pokontany eto ${fokontany} dia manamarina fa :`, margin, 126, { width: contentWidth, align: 'center' },
        );
        document.font('Courier-Oblique').fontSize(7.5).text('Le Chef Fokontany certifie que :', margin, 139, { width: contentWidth, align: 'center' });

        const bilingualField = (y: number, leftMg: string, leftFr: string, leftValue: string, rightMg = '', rightFr = '', rightValue = '', rightX = 310) => {
          document.font('Courier-Bold').fontSize(8).text(leftMg, margin, y);
          document.font('Courier-Oblique').fontSize(7).text(leftFr, margin, y + 9);
          document.font('Courier-Bold').fontSize(8.5).text(leftValue.toUpperCase(), margin + 112, y + 1, { width: rightX - margin - 112 });
          if (rightMg) {
            document.font('Courier-Bold').fontSize(8).text(rightMg, rightX, y);
            document.font('Courier-Oblique').fontSize(7).text(rightFr, rightX, y + 9);
            document.font('Courier-Bold').fontSize(8.5).text(rightValue.toUpperCase(), rightX + 78, y + 1, { width: pageWidth - margin - rightX - 78 });
          }
          document.moveTo(margin, y + 20).lineTo(pageWidth - margin, y + 20).lineWidth(0.35).dash(1, { space: 2 }).strokeColor('#777777').stroke();
          document.undash();
        };

        bilingualField(161, 'Anarana', 'Nom', fill(getText('nomComplet')), 'Fanampin’anarana', 'Prénom', fill(getText('prenoms')), 300);
        bilingualField(188, "Teraka tamin'ny", 'Né(e) le', formatDate(getText('dateNaissance')), 'Tao', 'à', fill(getText('lieuNaissance')), 330);
        bilingualField(215, 'Kara-panondro', 'CIN', fill(getText('cin')), 'ny', 'délivrée le', formatDate(getText('dateDelivranceCin')), 330);
        bilingualField(242, 'Ray', 'Père', fill(getText('nomPere')), 'Reny', 'Mère', fill(getText('nomMere')), 300);
        bilingualField(269, 'Asa aman-draharaha', 'Profession', fill(getText('profession')), 'Zom-pirenena', 'Nationalité', fill(getText('nationalite') || 'Malagasy'), 330);

        document.font('Courier-Bold').fontSize(8).text("Dia monina ao amin'ny Lot", margin, 296);
        document.font('Courier-Oblique').fontSize(7).text('réside effectivement', margin, 305);
        document.font('Courier-Bold').fontSize(8.5).text(fill(getText('lotLieuDit') || getText('adresse')).toUpperCase(), margin + 150, 297, { width: contentWidth - 150 });
        document.moveTo(margin, 318).lineTo(pageWidth - margin, 318).lineWidth(0.35).dash(1, { space: 2 }).stroke();
        document.undash();
        document.font('Courier-Bold').fontSize(8).text("Ary voasoratra ho isan'ny fokonolona laharana faha", margin, 326);
        document.font('Courier-Bold').fontSize(8.5).text(fill(getText('numeroFokonolona')).toUpperCase(), margin + 315, 327);

        document.moveTo(margin, 345).lineTo(pageWidth - margin, 345).lineWidth(0.35).dash(1, { space: 2 }).stroke();
        document.undash();
        document.font('Courier-Bold').fontSize(8).text(`N° ${fill(admin('receiptNumber'))}`, margin, 354);
        document.font('Courier-Bold').fontSize(7.5).text(`${issueLocation.toUpperCase()} faha, ${issueDate}`, pageWidth - margin - 220, 350, { width: 220, align: 'right' });
        document.font('Courier-Bold').fontSize(8).text('Ny Sefom-pokontany', pageWidth - margin - 170, 364, { width: 170, align: 'right' });
        if (stampImage) document.image(stampImage, pageWidth - margin - 85, 365, { fit: [58, 58] });
        if (signatureImage) document.image(signatureImage, pageWidth - margin - 155, 379, { fit: [105, 38] });
        document.end();
        return;
      }
      const labels: Record<string, string> = {
        BIRTH_CERTIFICATE: 'CERTIFICAT / EXTRAIT DE NAISSANCE',
        RESIDENCE_CERTIFICATE: 'CERTIFICAT DE RESIDENCE',
        NATIONALITY_CERTIFICATE: 'CERTIFICAT DE NATIONALITE',
        CIN_REQUEST: 'DOSSIER DE DEMANDE DE CIN',
        CIN_RENEWAL: 'DOSSIER DE RENOUVELLEMENT DE CIN',
        GOOD_CHARACTER_CERTIFICATE: 'CERTIFICAT DE BONNE VIE ET MOEURS',
        BUILDING_PERMIT: 'AUTORISATION / PERMIS DE CONSTRUIRE',
        LAND_STATUS: 'ATTESTATION DE SITUATION FONCIERE',
        COMMERCIAL_LICENSE: 'AUTORISATION COMMERCIALE',
        VEHICLE_REGISTRATION: 'ATTESTATION D’IMMATRICULATION',
        LOSS_DECLARATION: 'DECLARATION DE PERTE',
        SIGNATURE_LEGALIZATION: 'LEGALISATION DE SIGNATURE',
        COMPLAINT: 'RECEPISSE DE RÉCLAMATION',
        ASSOCIATION_DECLARATION: 'RECEPISSE DE DECLARATION D’ASSOCIATION',
        EVENT_AUTHORIZATION: 'AUTORISATION DE MANIFESTATION',
        ACCREDITATION: 'DECISION D’AGREMENT',
        ADMINISTRATIVE_AUTHORIZATION: 'AUTORISATION ADMINISTRATIVE',
      };
      const requestRequirements = getRequestRequirements(request.type, formData);
      const knownFields = new Set(requestRequirements.fields.map((field) => field.name));
      const printableFields = requestRequirements.fields.map((field) => ({
        label: field.label,
        value: formData[field.name],
      }));
      Object.entries(formData)
        .filter(([key]) => !knownFields.has(key))
        .forEach(([label, value]) => printableFields.push({ label, value }));

      document.fontSize(18).text('PREFECTURE D’IHOSY', { align: 'center' });
      document.moveDown(0.5).fontSize(12).text('DOCUMENT ADMINISTRATIF OFFICIEL', { align: 'center' });
      document.moveDown(2).fontSize(11).text(`Service : ${request.service.nameFr}`);
      document.text(`Démarche : ${requestModels[request.type].title}`);
      document.text(`Modèle de référence : ${model.filename}`);
      document.text(`Référence : ${request.id}`);
      document.text(`Demandeur : ${request.user.nom ?? request.user.email}`);
      document.text(`Date de délivrance : ${new Date().toLocaleDateString('fr-FR')}`);
      document.moveDown(2).fontSize(14).text(labels[request.type] ?? request.title ?? request.service.nameFr, { align: 'center' });
      document.moveDown(1).fontSize(11).text('Informations du dossier', { underline: true });
      printableFields.forEach(({ label, value }) => {
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        if (displayValue.trim()) {
          const formattedValue = (request.type === RequestType.CIN_REQUEST || request.type === RequestType.CIN_RENEWAL) && label === 'Taille (cm)'
            ? `${(Number(value) / 100).toFixed(2).replace('.', ',')} m`
            : displayValue;
          document.fontSize(10).text(`${label} : ${formattedValue}`);
        }
      });
      document.moveDown(1).fontSize(11).text('Pièces justificatives reçues', { underline: true });
      requestRequirements.attachments.forEach((requirement) => {
        const count = request.attachments.filter((attachment) => attachment.label === requirement.label).length;
        if (count > 0) document.fontSize(10).text(`${requirement.label} : ${count} fichier(s) reçu(s)`);
      });
      const templateVariables: Record<string, unknown> = {
        ...formData,
        demandeur: request.user.nom ?? request.user.email,
        reference: request.id,
        date: new Date().toLocaleDateString('fr-FR'),
        service: request.service.nameFr,
        titre: request.title ?? request.service.nameFr,
      };
      const templateBody = request.description ?? 'Aucune observation complémentaire.';
      const renderedTemplate = templateBody.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, variable: string) => {
        const value = templateVariables[variable.trim()];
        if (value === undefined || value === null) return '';
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      });
      document.moveDown(1).fontSize(11).text(renderedTemplate);
      document.moveDown(2);
      if (signatureImage || stampImage) {
        if (document.y + 140 > document.page.height - document.page.margins.bottom) document.addPage();
        const markY = document.y;
        const rightEdge = document.page.width - document.page.margins.right;
        if (signatureImage) document.image(signatureImage, rightEdge - 140, markY, { fit: [140, 80] });
        if (stampImage) document.image(stampImage, rightEdge - 120, markY + 8, { fit: [120, 80] });
        document.y = markY + 140;
      }
      document.moveDown(3).fontSize(9).text('Document généré par la plateforme e-Servisy d’Ihosy. Toute vérification doit être effectuée auprès du service émetteur.', { align: 'center' });
      document.end();
    });
  }

  async generateCorrectedPdf(requestId: string, user: { id: string; roles?: string[]; role?: string }) {
    const request = await this.findById(requestId, user);
    if (!await this.prisma.citizenComplaint.findFirst({
      where: { documentRequestId: request.id, userId: request.userId, status: 'RESOLVED' },
      select: { id: true },
    })) {
      throw new NotFoundException('Aucune réclamation résolue ne correspond à ce document.');
    }
    return this.generatePdf(requestId, user);
  }
}
