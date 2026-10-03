import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRequestDto } from './dto/create-request.dto';
import { NotificationsService } from '../notifications/notifications.service';
import PDFDocument = require('pdfkit');
import { Prisma } from '@prisma/client';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { RequestType } from '@prisma/client';
import { PaymentProvider } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { getRequestRequirements } from './request-requirements';
import { requestModels } from './request-models';
import { PDFDocument as EditablePDFDocument } from 'pdf-lib';

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

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  getRequirements(type: RequestType) {
    const requirements = getRequestRequirements(type);
    if (!requirements) throw new NotFoundException('Type de demande introuvable');
    return requirements;
  }

  getModelPdf(type: string) {
    if (!Object.values(RequestType).includes(type as RequestType)) throw new NotFoundException('Modèle de démarche introuvable');
    const model = requestModels[type as RequestType];
    const path = join(process.env.REQUEST_MODELS_DIR ?? join(process.cwd(), '../../modeles_pdf'), model.pdfFile);
    if (!existsSync(path)) throw new NotFoundException('Le modèle PDF de cette démarche est indisponible');
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
      include: { service: true, history: { orderBy: { createdAt: 'asc' } } },
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
    this.validateFormData(data.type, data.formData ?? {});
    const service = await this.prisma.prefectureService.findUnique({ where: { id: data.serviceId } });
    if (!service) throw new NotFoundException('Service introuvable');
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
        formData: (data.formData ?? {}) as Prisma.InputJsonValue,
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
    await this.notifications.createForUser(userId, 'Demande soumise', `Votre demande « ${created.title ?? service.nameFr} » a été transmise à la Préfecture.`);
    return created;
  }

  async createMultipart(
    userId: string,
    data: { serviceId: string; type: RequestType; title?: string; description?: string; formData?: Record<string, unknown>; attachmentLabels?: string[]; paymentConfirmed: boolean; paymentProvider?: PaymentProvider; paymentPhone?: string; confirmedAmount?: number; simulationPin?: string },
    files: Array<{ path: string; originalname: string; mimetype?: string; size?: number }>,
  ) {
    if (data.paymentConfirmed !== true) throw new BadRequestException('La confirmation du paiement est obligatoire avant l’envoi du dossier');
    if (!Object.values(RequestType).includes(data.type)) throw new BadRequestException('Type de demande invalide');
    const requirements = getRequestRequirements(data.type);
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
    const missing = getRequestRequirements(type).fields
      .filter((field) => formData[field.name] === undefined || String(formData[field.name]).trim() === '')
      .map((field) => field.label);
    if (missing.length > 0) throw new BadRequestException(`Champs obligatoires manquants : ${missing.join(', ')}`);
    if (type === RequestType.LOSS_DECLARATION && typeof formData.datePerte === 'string') {
      const today = new Date();
      const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
      if (formData.datePerte > localToday) throw new BadRequestException('La date de perte ne peut pas être dans le futur');
    }
    if (type === RequestType.CIN_REQUEST || type === RequestType.CIN_RENEWAL) {
      const dateValue = String(formData.dateNaissance);
      const birthDate = new Date(`${dateValue}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== dateValue) {
        throw new BadRequestException('La date de naissance est invalide');
      }
      const today = new Date();
      let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
      if (today.getUTCMonth() < birthDate.getUTCMonth() || (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate())) age -= 1;
      if (age < 18) throw new BadRequestException('La demande de CIN est réservée aux personnes âgées de 18 ans et plus');
    }
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
  ) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Demande introuvable');

    const isBackOffice = user.role === 'ADMIN' || user.roles?.includes('ADMIN');
    if (!isBackOffice && request.userId !== user.id) throw new ForbiddenException('Vous ne pouvez pas modifier cette demande');

    return this.prisma.requestAttachment.create({
      data: {
        requestId,
        label: 'Pièce complémentaire',
        originalName: file.originalname,
        storagePath: file.path,
        mimeType: file.mimetype,
        size: file.size,
      },
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
    const isBackOffice = user.role === 'ADMIN' || user.roles?.includes('ADMIN');
    if (!isBackOffice && request.userId !== user.id) throw new ForbiddenException('Vous ne pouvez pas télécharger cette demande');
    if (request.status !== 'APPROVED') throw new ForbiddenException('Le document sera disponible après approbation');
    const model = this.getModelPdf(request.type);
    const marks = await this.prisma.officialMark.findMany({ where: { isActive: true, kind: { in: ['STAMP', 'SIGNATURE'] } } });

    return new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({ size: 'A4', margin: 56 });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', async () => {
        try {
          const templatePdf = await EditablePDFDocument.load(readFileSync(model.path));
          const detailsPdf = await EditablePDFDocument.load(Buffer.concat(chunks));
          const detailsPages = await templatePdf.copyPages(detailsPdf, detailsPdf.getPageIndices());
          detailsPages.forEach((page) => templatePdf.addPage(page));
          resolve(Buffer.from(await templatePdf.save()));
        } catch (error) {
          reject(error);
        }
      });
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
        COMPLAINT: 'RECEPISSE DE SIGNALEMENT',
        ASSOCIATION_DECLARATION: 'RECEPISSE DE DECLARATION D’ASSOCIATION',
        EVENT_AUTHORIZATION: 'AUTORISATION DE MANIFESTATION',
        ACCREDITATION: 'DECISION D’AGREMENT',
        ADMINISTRATIVE_AUTHORIZATION: 'AUTORISATION ADMINISTRATIVE',
      };
      const fieldLabels: Record<string, string> = {
        nom: 'Nom', prenom: 'Prénom', cin: 'CIN', adresse: 'Adresse', motif: 'Motif',
        nomDemandeur: 'Nom et prénoms du demandeur', adresseDemandeur: 'Adresse du demandeur', cinDemandeur: 'CIN du demandeur', lienAvecPersonne: 'Lien avec la personne concernée', anneeNumeroActe: 'Année / numéro de l’acte',
        dateNaissance: 'Date de naissance', lieuNaissance: 'Lieu de naissance', nomPere: 'Nom du père',
        nomMere: 'Nom de la mère', dateDelivranceCin: 'Date de délivrance de la CIN', lieuDelivranceCin: 'Lieu de délivrance de la CIN', adresseActuelle: 'Adresse actuelle', lotLieuDit: 'Lot / lieu-dit', adresseTerrain: 'Adresse du terrain', surface: 'Surface (m²)',
        natureProjet: 'Nature du projet', referenceParcelle: 'Référence parcelle', nomEntreprise: 'Entreprise',
        activite: 'Activité', representant: 'Représentant', immatriculation: 'Immatriculation', profession: 'Profession', telephone: 'Téléphone', cinNif: 'CIN / NIF',
        marqueModele: 'Marque / type du véhicule', numeroChassis: 'Numéro de châssis', ancienneCarteGrise: 'Ancienne carte grise', puissanceFiscale: 'Puissance fiscale', superficie: 'Superficie approximative', formeJuridique: 'Forme juridique',
        objetPerdu: 'Objet perdu',         typeDocument: 'Matériel perdu', materielsPerdus: 'Matériel perdu', lieuPerte: 'Lieu de perte', lieuCirconstances: 'Lieu / circonstances',
        datePerte: 'Date de perte', document: 'Document', objet: 'Objet', lieu: 'Lieu',
        dateEvenement: 'Date de l’événement', urgence: 'Urgence', nomAssociation: 'Association / ONG',
        president: 'Président', nomPresident: 'Nom du président', cinPresident: 'CIN du président', adressePresident: 'Adresse du président', telephonePresident: 'Téléphone du président', sigle: 'Sigle', objetSocial: 'Objet social', siege: 'Siège', membres: 'Membres',
        nomEvenement: 'Événement', organisateur: 'Organisateur', dateDebut: 'Date de début',
        nomOrganisateur: 'Nom et prénoms de l’organisateur', cinOrganisateur: 'CIN de l’organisateur', heureDebutFin: 'Heure de début / fin', nombreSignatures: 'Nombre de signatures à légaliser', dateFin: 'Date de fin', participants: 'Participants', nomStructure: 'Structure',
        natureAutorisation: 'Nature de l’autorisation demandée',
        paysOrigine: 'Pays d’origine',
      };
      const formData = request.formData && typeof request.formData === 'object' && !Array.isArray(request.formData)
        ? request.formData as Record<string, unknown>
        : {};

      document.fontSize(18).text('PREFECTURE D’IHOSY', { align: 'center' });
      document.moveDown(0.5).fontSize(12).text('DOCUMENT ADMINISTRATIF OFFICIEL', { align: 'center' });
      document.moveDown(2).fontSize(11).text(`Service : ${request.service.nameFr}`);
      document.text(`Modèle appliqué : ${requestModels[request.type].title}`);
      document.text(`Référence : ${request.id}`);
      document.text(`Demandeur : ${request.user.nom ?? request.user.email}`);
      document.text(`Date de délivrance : ${new Date().toLocaleDateString('fr-FR')}`);
      document.moveDown(2).fontSize(14).text(labels[request.type] ?? request.title ?? request.service.nameFr, { align: 'center' });
      document.moveDown(1).fontSize(11).text('Informations du dossier', { underline: true });
      Object.entries(formData).forEach(([key, value]) => {
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        if (displayValue.trim()) document.fontSize(10).text(`${fieldLabels[key] ?? key} : ${displayValue}`);
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
      const stamp = marks.find((mark) => mark.kind === 'STAMP');
      const signature = marks.find((mark) => mark.kind === 'SIGNATURE');
      try {
        if (stamp && existsSync(stamp.storagePath)) document.image(stamp.storagePath, { fit: [120, 80] });
      } catch { }
      try {
        if (signature && existsSync(signature.storagePath)) document.image(signature.storagePath, { fit: [140, 80], align: 'right' });
      } catch { }
      document.moveDown(3).fontSize(9).text('Document généré par la plateforme e-Préfecture d’Ihosy. Toute vérification doit être effectuée auprès du service émetteur.', { align: 'center' });
      document.end();
    });
  }
}
