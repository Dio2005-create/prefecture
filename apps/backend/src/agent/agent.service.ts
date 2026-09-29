import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, RequestStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AgentService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  listTemplates() {
    return this.prisma.documentTemplate.findMany({ orderBy: { name: 'asc' } });
  }

  listSettings() { return this.prisma.platformSetting.findMany({ orderBy: { key: 'asc' } }); }

  async updateSettings(input: Record<string, string>) {
    const entries = Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '');
    return Promise.all(entries.map(([key, value]) => this.prisma.platformSetting.upsert({ where: { key }, update: { value }, create: { key, value } })));
  }

  async createTemplate(data: { requestType: string; name: string; bodyText?: string; storagePath: string; originalName: string; mimeType?: string }) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.documentTemplate.updateMany({ where: { requestType: data.requestType as any }, data: { isActive: false } });
      return transaction.documentTemplate.create({ data: { ...data, requestType: data.requestType as any, isActive: true } });
    });
  }

  async activateTemplate(id: string) {
    const template = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Modèle introuvable');
    return this.prisma.$transaction(async (transaction) => {
      await transaction.documentTemplate.updateMany({ where: { requestType: template.requestType }, data: { isActive: false } });
      return transaction.documentTemplate.update({ where: { id }, data: { isActive: true } });
    });
  }

  deactivateTemplate(id: string) { return this.prisma.documentTemplate.update({ where: { id }, data: { isActive: false } }); }
  deleteTemplate(id: string) { return this.prisma.documentTemplate.delete({ where: { id } }); }

  listMarks() {
    return this.prisma.officialMark.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
  }

  createMark(data: { name: string; kind: string; storagePath: string; mimeType?: string }) {
    return this.prisma.officialMark.create({ data });
  }

  deactivateMark(id: string) {
    return this.prisma.officialMark.update({ where: { id }, data: { isActive: false } });
  }

  activateMark(id: string) {
    return this.prisma.officialMark.update({ where: { id }, data: { isActive: true } });
  }

  deleteMark(id: string) {
    return this.prisma.officialMark.delete({ where: { id } });
  }

  async listPendingRequests(status?: RequestStatus) {
    const where = status ? { status, adminHidden: false } : { adminHidden: false };
    
    return this.prisma.serviceRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, nom: true, phone: true, cin: true } },
        service: true,
        attachments: true,
        history: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async hideRequest(requestId: string) {
    return this.prisma.serviceRequest.update({ where: { id: requestId }, data: { adminHidden: true } });
  }

  async getPrefectureStats() {
    const total = await this.prisma.serviceRequest.count();
    const pending = await this.prisma.serviceRequest.count({ where: { status: { in: ['SUBMITTED', 'IN_REVIEW', 'NEEDS_INFO'] } } });
    const approved = await this.prisma.serviceRequest.count({ where: { status: 'APPROVED' } });
    const rejected = await this.prisma.serviceRequest.count({ where: { status: 'REJECTED' } });

    return { total, pending, approved, rejected };
  }

  async approveRequest(requestId: string, changedById: string, notes?: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Demande introuvable');
    if (!['IN_REVIEW', 'PENDING_PREFECT'].includes(request.status)) throw new ForbiddenException('Cette demande doit être en instruction avant validation');

    const updated = await this.prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        updatedAt: new Date(),
        history: { create: { status: 'APPROVED', comment: notes ?? 'Dossier validé et document prêt à être délivré', changedById } },
      },
      include: { user: true, service: true },
    });
    await this.notifications.createForUser(request.userId, 'Demande approuvée', `Votre demande « ${updated.title ?? updated.service.nameFr} » a été approuvée.`);
    return updated;
  }

  async submitForReview(requestId: string, changedById: string, notes?: string) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Demande introuvable');
    if (!['SUBMITTED', 'IN_PROGRESS', 'NEEDS_INFO'].includes(request.status)) throw new ForbiddenException('Le dossier ne peut pas encore être mis en instruction');
    const updated = await this.prisma.serviceRequest.update({ where: { id: requestId }, data: { status: 'IN_REVIEW', history: { create: { status: 'IN_REVIEW', comment: notes ?? 'Dossier pris en charge et placé en instruction', changedById } } }, include: { user: true, service: true } });
    await this.notifications.createForUser(request.userId, 'Dossier en instruction', 'Votre dossier est en cours d’instruction par la Préfecture.');
    return updated;
  }

  async validateByChief(requestId: string, changedById: string, notes?: string) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Demande introuvable');
    if (request.status !== 'PENDING_CHIEF') throw new ForbiddenException('Le dossier n’est pas en attente de validation');
    const updated = await this.prisma.serviceRequest.update({ where: { id: requestId }, data: { status: 'PENDING_PREFECT', history: { create: { status: 'PENDING_PREFECT', comment: notes ?? 'Dossier validé par le chef de service', changedById } } }, include: { user: true, service: true } });
    await this.notifications.createForUser(request.userId, 'Dossier validé par le chef', 'Votre dossier est transmis au préfet pour décision finale.');
    return updated;
  }

  async rejectRequest(requestId: string, reason: string, changedById: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Demande introuvable');
    if (['APPROVED', 'REJECTED', 'ARCHIVED', 'CANCELLED'].includes(request.status)) throw new ForbiddenException('Ce dossier est déjà traité');

    const updated = await this.prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        description: (request.description ?? '') + `\n\n[REJET: ${reason}]`,
        updatedAt: new Date(),
        history: { create: { status: 'REJECTED', comment: reason, changedById } },
      },
      include: { user: true, service: true },
    });
    await this.notifications.createForUser(request.userId, 'Demande rejetée', `Votre demande a été rejetée : ${reason}`);
    return updated;
  }

  async requestMoreInfo(requestId: string, infoNeeded: string, changedById: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Demande introuvable');
    if (['APPROVED', 'REJECTED', 'ARCHIVED', 'CANCELLED'].includes(request.status)) throw new ForbiddenException('Ce dossier est déjà traité');

    const updated = await this.prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        status: 'NEEDS_INFO',
        description: (request.description ?? '') + `\n\n[INFO DEMANDÉE: ${infoNeeded}]`,
        updatedAt: new Date(),
        history: { create: { status: 'NEEDS_INFO', comment: infoNeeded, changedById } },
      },
      include: { user: true, service: true },
    });
    await this.notifications.createForUser(request.userId, 'Informations nécessaires', `Des informations complémentaires sont nécessaires : ${infoNeeded}`);
    return updated;
  }

  async moveToInProgress(requestId: string) {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Demande introuvable');
    if (['APPROVED', 'REJECTED', 'ARCHIVED', 'CANCELLED'].includes(request.status)) throw new ForbiddenException('Ce dossier est déjà traité');

    const updated = await this.prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        status: 'IN_PROGRESS',
        updatedAt: new Date(),
        history: { create: { status: 'IN_PROGRESS', comment: 'Traitement démarré' } },
      },
      include: { user: true, service: true },
    });
    await this.notifications.createForUser(request.userId, 'Dossier en traitement', `Le traitement de votre demande « ${updated.title ?? updated.service.nameFr} » a commencé.`);
    return updated;
  }

  async updateRequest(requestId: string, changedById: string, data: { formData?: Record<string, unknown>; description?: string; title?: string }) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Demande introuvable');
    if (['APPROVED', 'REJECTED', 'ARCHIVED', 'CANCELLED'].includes(request.status)) throw new ForbiddenException('Ce dossier est déjà traité');
    const updated = await this.prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        title: data.title ?? request.title,
        description: data.description ?? request.description,
        formData: data.formData === undefined ? request.formData ?? undefined : data.formData as Prisma.InputJsonValue,
        updatedAt: new Date(),
        history: { create: { status: request.status, comment: 'Informations du dossier corrigées par l’administration', changedById } },
      },
      include: { user: { select: { id: true, email: true, nom: true, phone: true, cin: true } }, service: true, attachments: true, history: { orderBy: { createdAt: 'asc' } } },
    });
    return updated;
  }
}
