import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { FirearmPermitStatus, FirearmPermitType, FirearmRequestStatus, FirearmRequestType, Prisma } from '@prisma/client';
import PDFDocument = require('pdfkit');
import { createReadStream, existsSync } from 'node:fs';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type ActingUser = { id: string; role?: string; roles?: string[] };
type IncomingFile = { path: string; originalname: string; mimetype?: string; size?: number; label: string };
type FirearmInput = {
  weaponType?: unknown;
  brand?: unknown;
  model?: unknown;
  serialNumber?: unknown;
  caliber?: unknown;
  acquiredAt?: unknown;
  origin?: unknown;
  firearmId?: unknown;
  permitId?: unknown;
  recipientCin?: unknown;
};

const requestTypeLabels: Record<FirearmRequestType, string> = {
  HOLDING_PERMIT: 'Permis de détention',
  CARRY_PERMIT: 'Permis de port',
  REGISTER_FIREARM: 'Enregistrement d’une arme',
  RENEW_PERMIT: 'Renouvellement de permis',
  DEREGISTER_FIREARM: 'Radiation d’une arme',
  TRANSFER_FIREARM: 'Cession / transfert d’une arme',
};
const citizenRequestInclude = {
  firearm: { select: { id: true, weaponType: true, brand: true, model: true, serialNumber: true, caliber: true, isActive: true } },
  attachments: { select: { id: true, label: true, originalName: true, mimeType: true, size: true, createdAt: true } },
  issuedPermit: true,
  history: { orderBy: { createdAt: 'asc' as const }, include: { actor: { select: { id: true, nom: true } } } },
};
const adminRequestInclude = {
  ...citizenRequestInclude,
  user: { select: { id: true, nom: true, email: true, phone: true, cin: true } },
  decidedBy: { select: { id: true, nom: true } },
};

@Injectable()
export class FirearmsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FirearmsService.name);
  private reminderTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    void this.notifyUpcomingPermitExpirations().catch((error: unknown) => {
      this.logger.error('Échec du contrôle des échéances de permis', error instanceof Error ? error.stack : String(error));
    });
    this.reminderTimer = setInterval(() => {
      void this.notifyUpcomingPermitExpirations().catch((error: unknown) => {
        this.logger.error('Échec du contrôle des échéances de permis', error instanceof Error ? error.stack : String(error));
      });
    }, 6 * 60 * 60 * 1000);
    this.reminderTimer.unref();
  }

  onModuleDestroy() {
    if (this.reminderTimer) clearInterval(this.reminderTimer);
  }

  async listCitizenFirearms(userId: string) {
    return this.prisma.firearm.findMany({
      where: { ownerId: userId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: { permits: { orderBy: { issuedAt: 'desc' } } },
    });
  }

  listCitizenPermits(userId: string) {
    return this.prisma.firearmPermit.findMany({
      where: { userId, status: { in: ['ACTIVE', 'EXPIRED'] } },
      orderBy: { expiresAt: 'asc' },
      include: { firearm: { select: { id: true, weaponType: true, brand: true, model: true, serialNumber: true } } },
    });
  }

  listCitizenRequests(userId: string) {
    return this.prisma.firearmRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: citizenRequestInclude,
    }).then((requests) => requests.map((request) => ({
      ...request,
      history: request.history.map((entry) => ({
        ...entry,
        details: this.citizenHistoryDetails(entry.details as Prisma.JsonValue),
      })),
    })));
  }

  async createRequest(userId: string, rawType: string, data: FirearmInput, files: IncomingFile[]) {
    if (!userId) throw new ForbiddenException('Utilisateur non authentifié');
    if (!Object.values(FirearmRequestType).includes(rawType as FirearmRequestType)) {
      throw new BadRequestException('Type de demande de contrôle des armements invalide');
    }
    const type = rawType as FirearmRequestType;
    if (files.length === 0) throw new BadRequestException('Ajoutez au moins une pièce justificative à la demande');
    for (const file of files) {
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype ?? '') || (file.size ?? 0) > 10 * 1024 * 1024) {
        throw new BadRequestException('Chaque justificatif doit être un PDF, JPG ou PNG de 10 Mo maximum');
      }
      if (!file.label.trim() || file.label.length > 80) throw new BadRequestException('La catégorie d’un justificatif est invalide');
    }

    let firearmId: string | null = null;
    let requestData: Record<string, unknown> = {};
    switch (type) {
      case FirearmRequestType.REGISTER_FIREARM:
        requestData = this.validateNewFirearm(data);
        await this.ensureSerialIsAvailable(String(requestData.serialNumber));
        break;
      case FirearmRequestType.HOLDING_PERMIT:
      case FirearmRequestType.CARRY_PERMIT:
        firearmId = this.optionalFirearmId(data.firearmId);
        if (type === FirearmRequestType.CARRY_PERMIT && !firearmId) {
          throw new BadRequestException('Sélectionnez l’arme concernée par le permis de port');
        }
        if (firearmId) await this.requireOwnedActiveFirearm(firearmId, userId);
        requestData = firearmId ? { firearmId } : {};
        break;
      case FirearmRequestType.RENEW_PERMIT: {
        const permitId = this.requiredString(data.permitId, 'Sélectionnez le permis à renouveler');
        const permit = await this.prisma.firearmPermit.findFirst({
          where: { id: permitId, userId, status: { in: ['ACTIVE', 'EXPIRED'] } },
        });
        if (!permit) throw new NotFoundException('Permis à renouveler introuvable');
        firearmId = permit.firearmId;
        requestData = { permitId, permitType: permit.type };
        break;
      }
      case FirearmRequestType.DEREGISTER_FIREARM:
      case FirearmRequestType.TRANSFER_FIREARM:
        firearmId = this.requiredString(data.firearmId, 'Sélectionnez une arme');
        await this.requireOwnedActiveFirearm(firearmId, userId);
        if (type === FirearmRequestType.TRANSFER_FIREARM) {
          const recipientCin = this.requiredString(data.recipientCin, 'La CIN du citoyen bénéficiaire est obligatoire', 12);
          if (!/^\d{12}$/.test(recipientCin)) throw new BadRequestException('La CIN doit contenir exactement 12 chiffres');
          requestData = { recipientCin };
        }
        break;
      default:
        throw new BadRequestException('Type de demande de contrôle des armements invalide');
    }

    const created = await this.prisma.$transaction(async (transaction) => {
      const request = await transaction.firearmRequest.create({
        data: {
          userId,
          firearmId,
          type,
          data: requestData as Prisma.InputJsonValue,
          attachments: {
            create: files.map((file) => ({
              label: file.label.trim(),
              originalName: file.originalname,
              storagePath: file.path,
              mimeType: file.mimetype,
              size: file.size,
            })),
          },
        },
        include: citizenRequestInclude,
      });
      await transaction.firearmControlHistory.create({
        data: {
          requestId: request.id,
          firearmId,
          actorId: userId,
          action: 'REQUEST_SUBMITTED',
          details: { type, status: 'PENDING' },
        },
      });
      await transaction.notification.create({
        data: {
          userId,
          channel: 'PUSH',
          title: 'Demande reçue',
          message: `Votre demande « ${requestTypeLabels[type]} » a été transmise à l’administration.`,
        },
      });
      return request;
    });

    try {
      await this.notifications.createForAdministrators(
        'Nouvelle demande de contrôle des armements',
        `Une demande « ${requestTypeLabels[type]} » attend son instruction.`,
        { type: 'FIREARM_REQUEST_SUBMITTED', requestId: created.id },
      );
    } catch (error) {
      this.logger.error('La notification de nouvelle demande aux administrateurs a échoué', error instanceof Error ? error.stack : String(error));
    }
    return created;
  }

  async getAttachment(requestId: string, attachmentId: string, user: ActingUser) {
    const attachment = await this.prisma.firearmRequestAttachment.findFirst({
      where: {
        id: attachmentId,
        requestId,
        request: this.isAdministrator(user) ? undefined : { userId: user.id },
      },
    });
    if (!attachment) throw new NotFoundException('Pièce justificative introuvable');
    if (!existsSync(attachment.storagePath)) throw new NotFoundException('Le fichier justificatif est indisponible');
    return { attachment, stream: createReadStream(attachment.storagePath) };
  }

  async listAdminRequests(rawStatus?: string) {
    let status: FirearmRequestStatus | undefined;
    if (rawStatus) {
      if (!Object.values(FirearmRequestStatus).includes(rawStatus as FirearmRequestStatus)) {
        throw new BadRequestException('Statut de demande invalide');
      }
      status = rawStatus as FirearmRequestStatus;
    }
    return this.prisma.firearmRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: adminRequestInclude,
    });
  }

  async decideRequest(requestId: string, adminId: string, decision: { status?: string; comment?: string; expiresAt?: string }) {
    if (!['IN_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED'].includes(decision.status ?? '')) {
      throw new BadRequestException('Décision invalide');
    }
    const status = decision.status as FirearmRequestStatus;
    const comment = decision.comment?.trim() ?? '';
    if (['NEEDS_INFO', 'REJECTED'].includes(status) && !comment) {
      throw new BadRequestException('Un commentaire est obligatoire pour cette décision');
    }
    const request = await this.prisma.firearmRequest.findUnique({
      where: { id: requestId },
      include: { firearm: true, user: { select: { id: true, nom: true } } },
    });
    if (!request) throw new NotFoundException('Demande introuvable');
    if (!['PENDING', 'IN_REVIEW', 'NEEDS_INFO'].includes(request.status)) {
      throw new ConflictException('Cette demande a déjà fait l’objet d’une décision définitive');
    }
    const data = this.jsonRecord(request.data);
    const permitRequest = [
      FirearmRequestType.HOLDING_PERMIT,
      FirearmRequestType.CARRY_PERMIT,
      FirearmRequestType.RENEW_PERMIT,
    ].some((type) => request.type === type);
    const expiresAt = status === 'APPROVED' && permitRequest
      ? this.parseExpirationDate(decision.expiresAt)
      : undefined;
    const messages: Record<FirearmRequestStatus, string> = {
      PENDING: 'Votre demande a été reçue.',
      IN_REVIEW: 'Votre demande est en cours d’instruction.',
      NEEDS_INFO: `Des informations complémentaires sont nécessaires : ${comment}`,
      APPROVED: 'Votre demande a été validée. Le document officiel est disponible dans votre espace.',
      REJECTED: `Votre demande a été rejetée : ${comment}`,
      CANCELLED: 'Votre demande a été annulée.',
    };
    let result;

    try {
      result = await this.prisma.$transaction(async (transaction) => {
        const changed = await transaction.firearmRequest.updateMany({
          where: { id: requestId, status: { in: ['PENDING', 'IN_REVIEW', 'NEEDS_INFO'] } },
          data: {
            status,
            decisionComment: comment || null,
            decidedById: adminId,
            decidedAt: ['APPROVED', 'REJECTED'].includes(status) ? new Date() : null,
          },
        });
        if (changed.count === 0) throw new ConflictException('Cette demande a déjà été traitée');

        let firearmId = request.firearmId;
        if (status === 'APPROVED') {
          if (request.type === FirearmRequestType.REGISTER_FIREARM) {
            const firearm = await transaction.firearm.create({
              data: {
                ownerId: request.userId,
                weaponType: String(data.weaponType),
                brand: String(data.brand),
                model: String(data.model),
                serialNumber: String(data.serialNumber),
                caliber: typeof data.caliber === 'string' && data.caliber ? data.caliber : null,
                acquiredAt: new Date(`${String(data.acquiredAt)}T00:00:00.000Z`),
                origin: String(data.origin),
              },
            });
            firearmId = firearm.id;
            await transaction.firearmControlHistory.create({
              data: { firearmId, requestId, actorId: adminId, action: 'FIREARM_REGISTERED', details: { serialNumber: firearm.serialNumber } },
            });
          } else if (request.type === FirearmRequestType.DEREGISTER_FIREARM) {
            const firearm = await this.requireFirearmInTransaction(transaction, request.firearmId, request.userId);
            await transaction.firearm.update({ where: { id: firearm.id }, data: { isActive: false } });
            await transaction.firearmPermit.updateMany({
              where: { firearmId: firearm.id, status: 'ACTIVE' },
              data: { status: 'REVOKED' },
            });
            await transaction.firearmControlHistory.create({
              data: { firearmId: firearm.id, requestId, actorId: adminId, action: 'FIREARM_DEREGISTERED', details: { serialNumber: firearm.serialNumber } },
            });
          } else if (request.type === FirearmRequestType.TRANSFER_FIREARM) {
            const firearm = await this.requireFirearmInTransaction(transaction, request.firearmId, request.userId);
            const recipient = await transaction.user.findFirst({
              where: {
                cin: String(data.recipientCin),
                role: 'CITIZEN',
                status: 'ACTIVE',
                roles: { none: { role: { name: { in: ['ADMIN', 'SUPERADMIN'] } } } },
              },
              select: { id: true },
            });
            if (!recipient) throw new BadRequestException('Le citoyen bénéficiaire de la cession n’a pas pu être identifié');
            if (recipient.id === request.userId) throw new BadRequestException('Le bénéficiaire doit être un autre citoyen');
            await transaction.firearm.update({ where: { id: firearm.id }, data: { ownerId: recipient.id } });
            await transaction.firearmPermit.updateMany({
              where: { firearmId: firearm.id, status: 'ACTIVE' },
              data: { status: 'REVOKED' },
            });
            await transaction.firearmControlHistory.create({
              data: {
                firearmId: firearm.id,
                requestId,
                actorId: adminId,
                action: 'FIREARM_TRANSFERRED',
                details: { fromUserId: request.userId, toUserId: recipient.id, serialNumber: firearm.serialNumber },
              },
            });
            await transaction.notification.create({
              data: {
                userId: recipient.id,
                channel: 'PUSH',
                title: 'Cession d’arme enregistrée',
                message: 'Une arme a été enregistrée à votre nom après validation administrative. Consultez votre dossier.',
                metadata: { type: 'FIREARM_TRANSFERRED', firearmId: firearm.id },
              },
            });
          } else if (request.type === FirearmRequestType.HOLDING_PERMIT || request.type === FirearmRequestType.CARRY_PERMIT || request.type === FirearmRequestType.RENEW_PERMIT) {
            const permitType = request.type === FirearmRequestType.HOLDING_PERMIT
              ? FirearmPermitType.HOLDING
              : request.type === FirearmRequestType.CARRY_PERMIT
                ? FirearmPermitType.CARRY
                : data.permitType as FirearmPermitType;
            let renewedFromId: string | null = null;
            if (request.type === FirearmRequestType.RENEW_PERMIT) {
              const oldPermit = await transaction.firearmPermit.findFirst({
                where: { id: String(data.permitId), userId: request.userId, status: { in: ['ACTIVE', 'EXPIRED'] } },
              });
              if (!oldPermit) throw new ConflictException('Le permis à renouveler n’est plus renouvelable');
              renewedFromId = oldPermit.id;
              await transaction.firearmPermit.update({ where: { id: oldPermit.id }, data: { status: 'REPLACED' } });
            }
            await transaction.firearmPermit.create({
              data: {
                userId: request.userId,
                firearmId,
                requestId,
                type: permitType,
                expiresAt: expiresAt!,
                renewedFromId,
              },
            });
            if (firearmId) {
              await transaction.firearmControlHistory.create({
                data: { firearmId, requestId, actorId: adminId, action: 'PERMIT_ISSUED', details: { type: permitType, expiresAt: expiresAt!.toISOString() } },
              });
            }
          }
        }

        await transaction.firearmControlHistory.create({
          data: {
            requestId,
            firearmId,
            actorId: adminId,
            action: `REQUEST_${status}`,
            details: { status, comment },
          },
        });
        await transaction.notification.create({
          data: {
            userId: request.userId,
            channel: 'PUSH',
            title: 'Mise à jour de votre demande',
            message: messages[status],
          },
        });
        return transaction.firearmRequest.findUniqueOrThrow({
          where: { id: requestId },
          include: adminRequestInclude,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Le numéro de série de cette arme est déjà enregistré');
      }
      throw error;
    }

    return result;
  }

  async getCitizenDossier(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, nom: true, email: true, phone: true, cin: true,
        firearms: {
          orderBy: { createdAt: 'desc' },
          include: { permits: { orderBy: { issuedAt: 'desc' } }, history: { orderBy: { createdAt: 'desc' } } },
        },
        firearmRequests: { orderBy: { createdAt: 'desc' }, include: adminRequestInclude },
      },
    });
    if (!user) throw new NotFoundException('Citoyen introuvable');
    return user;
  }

  async findBySerialNumber(serialNumber: string) {
    const normalized = serialNumber.trim();
    if (!normalized) throw new BadRequestException('Saisissez un numéro de série');
    const firearm = await this.prisma.firearm.findUnique({
      where: { serialNumber: normalized.toUpperCase() },
      include: {
        owner: { select: { id: true, nom: true, email: true, phone: true, cin: true } },
        permits: { orderBy: { issuedAt: 'desc' } },
        requests: { orderBy: { createdAt: 'desc' }, include: adminRequestInclude },
        history: { orderBy: { createdAt: 'desc' }, include: { actor: { select: { id: true, nom: true } } } },
      },
    });
    if (!firearm) throw new NotFoundException('Aucune arme trouvée pour ce numéro de série');
    return firearm;
  }

  async getFirearmHistory(firearmId: string) {
    const firearm = await this.prisma.firearm.findUnique({ where: { id: firearmId }, select: { id: true } });
    if (!firearm) throw new NotFoundException('Arme introuvable');
    return this.prisma.firearmControlHistory.findMany({
      where: { firearmId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, nom: true, email: true } }, request: { select: { id: true, type: true, status: true } } },
    });
  }

  async getAdminStats() {
    const [firearms, activeFirearms, requests, pendingRequests, permits, expiringPermits, requestGroups, typeGroups] = await Promise.all([
      this.prisma.firearm.count(),
      this.prisma.firearm.count({ where: { isActive: true } }),
      this.prisma.firearmRequest.count(),
      this.prisma.firearmRequest.count({ where: { status: { in: ['PENDING', 'IN_REVIEW', 'NEEDS_INFO'] } } }),
      this.prisma.firearmPermit.count({ where: { status: 'ACTIVE' } }),
      this.prisma.firearmPermit.count({
        where: { status: 'ACTIVE', expiresAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400000) } },
      }),
      this.prisma.firearmRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.firearm.groupBy({ by: ['weaponType'], where: { isActive: true }, _count: { _all: true } }),
    ]);
    return {
      firearms,
      activeFirearms,
      requests,
      pendingRequests,
      activePermits: permits,
      expiringPermits,
      requestsByStatus: Object.fromEntries(requestGroups.map(({ status, _count }) => [status, _count._all])),
      firearmsByType: typeGroups.map(({ weaponType, _count }) => ({ weaponType, count: _count._all })),
    };
  }

  async generateReport() {
    const [firearms, requests] = await Promise.all([
      this.prisma.firearm.findMany({
        orderBy: { createdAt: 'desc' },
        include: { owner: { select: { nom: true, cin: true } } },
      }),
      this.prisma.firearmRequest.findMany({
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { nom: true, cin: true } }, firearm: { select: { serialNumber: true } } },
      }),
    ]);
    const escape = (value: unknown) => {
      const text = String(value ?? '');
      const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const rows = [
      ['Catégorie', 'Référence', 'Type', 'Statut', 'Numéro de série', 'Citoyen', 'CIN', 'Créé le'],
      ...firearms.map((firearm) => ['Arme', firearm.id, firearm.weaponType, firearm.isActive ? 'ACTIVE' : 'DEREGISTERED', firearm.serialNumber, firearm.owner.nom, firearm.owner.cin, firearm.createdAt.toISOString()]),
      ...requests.map((request) => ['Demande', request.id, requestTypeLabels[request.type], request.status, request.firearm?.serialNumber ?? '', request.user.nom, request.user.cin, request.createdAt.toISOString()]),
    ];
    return rows.map((row) => row.map(escape).join(';')).join('\r\n');
  }

  async generateOfficialDocument(requestId: string, user: ActingUser) {
    const request = await this.prisma.firearmRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { id: true, nom: true, cin: true } }, firearm: true, issuedPermit: true },
    });
    if (!request) throw new NotFoundException('Demande introuvable');
    if (!this.isAdministrator(user) && request.userId !== user.id) {
      throw new ForbiddenException('Vous ne pouvez pas télécharger ce document');
    }
    if (request.status !== 'APPROVED') throw new ForbiddenException('Le document officiel sera disponible après validation de la demande');

    const permit = request.issuedPermit;
    const title = permit
      ? permit.type === 'CARRY' ? 'PERMIS DE PORT D’ARME' : 'PERMIS DE DÉTENTION D’ARME'
      : request.type === 'REGISTER_FIREARM' ? 'CERTIFICAT D’ENREGISTREMENT D’ARME' : 'ATTESTATION DE DÉCISION ADMINISTRATIVE';
    const filename = `document-controle-armements-${request.id}.pdf`;
    const chunks: Buffer[] = [];
    const pdf = new PDFDocument({ size: 'A4', margin: 56, info: { Title: title, Author: 'E-servisy' } });
    const output = new Promise<Buffer>((resolve, reject) => {
      pdf.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
    });
    pdf.fontSize(10).fillColor('#45545a').text('E-SERVISY  |  CONTRÔLE DES ARMEMENTS', { align: 'center' });
    pdf.moveDown(2).fontSize(18).fillColor('#173f46').text(title, { align: 'center' });
    pdf.moveDown(2).fontSize(11).fillColor('#172326');
    pdf.text(`Référence : ${request.id}`);
    pdf.text(`Bénéficiaire : ${request.user.nom ?? 'Citoyen'}`);
    pdf.text(`CIN : ${request.user.cin ?? '—'}`);
    pdf.text(`Délivré le : ${request.decidedAt?.toLocaleDateString('fr-FR') ?? new Date().toLocaleDateString('fr-FR')}`);
    pdf.moveDown();
    if (request.firearm) {
      pdf.text(`Type d’arme : ${request.firearm.weaponType}`);
      pdf.text(`Marque et modèle : ${request.firearm.brand} ${request.firearm.model}`);
      pdf.text(`Numéro de série : ${request.firearm.serialNumber}`);
      pdf.text(`Calibre : ${request.firearm.caliber ?? '—'}`);
    }
    if (permit) {
      pdf.text(`Valide jusqu’au : ${permit.expiresAt.toLocaleDateString('fr-FR')}`);
      pdf.text(`Statut du permis : ${permit.status}`);
    }
    pdf.moveDown(3).fontSize(9).fillColor('#59686d')
      .text('Document généré par la plateforme E-servisy à la suite d’une décision administrative.', { align: 'center' });
    pdf.end();
    return { pdf: await output, filename };
  }

  private validateNewFirearm(data: FirearmInput) {
    const weaponType = this.requiredString(data.weaponType, 'Le type d’arme est obligatoire', 80);
    const brand = this.requiredString(data.brand, 'La marque est obligatoire', 100);
    const model = this.requiredString(data.model, 'Le modèle est obligatoire', 100);
    const serialNumber = this.requiredString(data.serialNumber, 'Le numéro de série est obligatoire', 100).toUpperCase();
    const acquiredAt = this.requiredString(data.acquiredAt, 'La date d’acquisition est obligatoire', 10);
    const origin = this.requiredString(data.origin, 'L’origine de l’arme est obligatoire', 120);
    const acquiredDate = new Date(`${acquiredAt}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acquiredAt) || Number.isNaN(acquiredDate.getTime()) || acquiredDate.toISOString().slice(0, 10) !== acquiredAt) {
      throw new BadRequestException('La date d’acquisition est invalide');
    }
    if (acquiredDate.getTime() > Date.now()) throw new BadRequestException('La date d’acquisition ne peut pas être dans le futur');
    if (serialNumber.length > 100) throw new BadRequestException('Le numéro de série est trop long');
    const caliber = typeof data.caliber === 'string' ? data.caliber.trim() : '';
    if (caliber.length > 80) throw new BadRequestException('Le calibre est trop long');
    return {
      weaponType, brand, model, serialNumber,
      caliber,
      acquiredAt, origin,
    };
  }

  private async ensureSerialIsAvailable(serialNumber: string) {
    const registered = await this.prisma.firearm.findUnique({ where: { serialNumber }, select: { id: true } });
    if (registered) throw new ConflictException('Une demande ne peut pas être créée pour ce numéro de série');
    const pending = await this.prisma.firearmRequest.findMany({
      where: { type: 'REGISTER_FIREARM', status: { in: ['PENDING', 'IN_REVIEW', 'NEEDS_INFO'] } },
      select: { data: true },
    });
    if (pending.some((request) => this.jsonRecord(request.data).serialNumber === serialNumber)) {
      throw new ConflictException('Une demande ne peut pas être créée pour ce numéro de série');
    }
  }

  private async requireOwnedActiveFirearm(firearmId: string, userId: string) {
    const firearm = await this.prisma.firearm.findFirst({ where: { id: firearmId, ownerId: userId, isActive: true } });
    if (!firearm) throw new NotFoundException('Arme enregistrée introuvable');
    return firearm;
  }

  private async requireFirearmInTransaction(transaction: Prisma.TransactionClient, firearmId: string | null, userId: string) {
    if (!firearmId) throw new ConflictException('La demande ne référence aucune arme');
    const firearm = await transaction.firearm.findFirst({ where: { id: firearmId, ownerId: userId, isActive: true } });
    if (!firearm) throw new ConflictException('Cette arme n’est plus détenue par le demandeur ou n’est plus active');
    return firearm;
  }

  private parseExpirationDate(value?: string) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('La date d’échéance du permis doit être fixée lors de sa validation');
    }
    const date = new Date(`${value}T23:59:59.999Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getTime() <= Date.now()) {
      throw new BadRequestException('La date d’échéance du permis doit être une date future valide');
    }
    return date;
  }

  private requiredString(value: unknown, message: string, maxLength = 250) {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(message);
    const normalized = value.trim();
    if (normalized.length > maxLength) throw new BadRequestException('Une valeur de la demande est trop longue');
    return normalized;
  }

  private optionalFirearmId(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    return this.requiredString(value, 'Identifiant d’arme invalide');
  }

  private jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private citizenHistoryDetails(value: Prisma.JsonValue) {
    const { fromUserId: _fromUserId, toUserId: _toUserId, ...details } = this.jsonRecord(value);
    return details;
  }

  private isAdministrator(user: ActingUser) {
    return user.role === 'ADMIN' || user.roles?.includes('ADMIN') === true || user.roles?.includes('SUPERADMIN') === true;
  }

  private async notifyUpcomingPermitExpirations() {
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 86400000);
    const permits = await this.prisma.firearmPermit.findMany({
      where: { status: { in: ['ACTIVE', 'EXPIRED'] }, reminderSentAt: null, expiresAt: { lte: horizon } },
      select: { id: true, userId: true, expiresAt: true, type: true },
    });
    for (const permit of permits) {
      try {
        await this.prisma.$transaction(async (transaction) => {
          const claimed = await transaction.firearmPermit.updateMany({
            where: { id: permit.id, reminderSentAt: null },
            data: { reminderSentAt: now, ...(permit.expiresAt <= now ? { status: FirearmPermitStatus.EXPIRED } : {}) },
          });
          if (claimed.count === 0) return;
          await transaction.notification.create({
            data: {
              userId: permit.userId,
              channel: 'PUSH',
              title: 'Échéance de permis',
              message: `Votre permis de ${permit.type === 'CARRY' ? 'port' : 'détention'} ${permit.expiresAt <= now ? 'a expiré' : 'arrive à échéance'} le ${permit.expiresAt.toLocaleDateString('fr-FR')}.`,
            },
          });
        });
      } catch (error) {
        this.logger.error(`Échec de la notification d’échéance du permis ${permit.id}`, error instanceof Error ? error.stack : String(error));
      }
    }
    await this.prisma.firearmPermit.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      data: { status: FirearmPermitStatus.EXPIRED },
    });
  }
}
