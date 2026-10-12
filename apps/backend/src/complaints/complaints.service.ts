import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CitizenComplaintStatus, Prisma } from '@prisma/client';
import { createReadStream, existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';

type ComplaintFile = { path: string; originalname: string; mimetype?: string; size?: number };

@Injectable()
export class ComplaintsService {
  constructor(private readonly prisma: PrismaService) {}

  eligibleDocuments(userId: string) {
    return this.prisma.serviceRequest.findMany({
      where: {
        userId,
        status: 'APPROVED',
        type: { notIn: ['CIN_REQUEST', 'CIN_RENEWAL', 'COMPLAINT'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, type: true, updatedAt: true, service: { select: { nameFr: true, nameMg: true } } },
    });
  }

  listForCitizen(userId: string) {
    return this.prisma.citizenComplaint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        documentRequest: { select: { id: true, title: true, type: true, service: { select: { nameFr: true, nameMg: true } } } },
        attachments: { select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true } },
      },
    });
  }

  listForAdmin() {
    return this.prisma.citizenComplaint.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { id: true, nom: true, email: true, phone: true } },
        documentRequest: { select: { id: true, title: true, type: true, formData: true, service: { select: { nameFr: true } } } },
        attachments: { select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true } },
      },
    });
  }

  async create(userId: string, input: { documentRequestId?: string; reason?: string; details?: string }, file: ComplaintFile) {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype ?? '') || (file.size ?? 0) > 10 * 1024 * 1024) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('Le justificatif doit être un PDF, JPG ou PNG de 10 Mo maximum.');
    }
    const reason = input.reason?.trim();
    if (!input.documentRequestId || !reason || reason.length > 500 || (input.details?.length ?? 0) > 5000) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('Sélectionnez un document délivré, indiquez un motif de 500 caractères maximum et des détails de 5000 caractères maximum.');
    }
    const document = await this.prisma.serviceRequest.findFirst({
      where: { id: input.documentRequestId, userId, status: 'APPROVED' },
      include: { service: true },
    });
    if (!document || document.type === 'CIN_REQUEST' || document.type === 'CIN_RENEWAL' || document.type === 'COMPLAINT') {
      await unlink(file.path).catch(() => undefined);
      throw new NotFoundException('Le document sélectionné est introuvable ou ne peut pas faire l’objet d’une réclamation en ligne.');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const complaint = await transaction.citizenComplaint.create({
          data: {
            userId,
            documentRequestId: document.id,
            reason,
            details: input.details?.trim() || null,
            attachments: {
              create: {
                originalName: file.originalname,
                storagePath: file.path,
                mimeType: file.mimetype,
                size: file.size,
              },
            },
          },
          include: { documentRequest: { select: { title: true, service: { select: { nameFr: true } } } }, attachments: true },
        });
        const administrators = await transaction.user.findMany({
          where: {
            OR: [
              { role: 'ADMIN' },
              { roles: { some: { role: { name: { in: ['ADMIN', 'SUPERADMIN'] } } } } },
            ],
          },
          select: { id: true },
        });
        if (administrators.length > 0) {
          await transaction.notification.createMany({
            data: administrators.map(({ id }) => ({
              userId: id,
              channel: 'PUSH',
              title: 'Nouvelle réclamation citoyenne',
              message: `${document.title ?? document.service.nameFr} — ${reason}`,
              metadata: { type: 'CITIZEN_COMPLAINT', complaintId: complaint.id },
            })),
          });
        }
        return complaint;
      });
    } catch (error) {
      await unlink(file.path).catch(() => undefined);
      throw error;
    }
  }

  async markInReview(id: string) {
    const complaint = await this.prisma.citizenComplaint.findUnique({ where: { id } });
    if (!complaint) throw new NotFoundException('Réclamation introuvable');
    if (complaint.status === 'RESOLVED' || complaint.status === 'REJECTED') throw new BadRequestException('Cette réclamation est déjà clôturée.');
    return this.prisma.citizenComplaint.update({ where: { id }, data: { status: 'IN_REVIEW' } });
  }

  async resolve(id: string, corrections: Record<string, string>, response: string) {
    const complaint = await this.prisma.citizenComplaint.findUnique({
      where: { id },
      include: { user: true, documentRequest: true },
    });
    if (!complaint || complaint.status === 'RESOLVED' || complaint.status === 'REJECTED') {
      throw new NotFoundException('Réclamation introuvable ou déjà clôturée');
    }
    if (complaint.documentRequest.status !== 'APPROVED') throw new BadRequestException('Le document concerné n’est plus disponible.');
    const original = complaint.documentRequest.formData && typeof complaint.documentRequest.formData === 'object' && !Array.isArray(complaint.documentRequest.formData)
      ? complaint.documentRequest.formData as Record<string, unknown>
      : {};
    const keys = Object.keys(corrections);
    if (keys.length === 0) throw new BadRequestException('Saisissez au moins une correction avant de redélivrer le document.');
    for (const [key, value] of Object.entries(corrections)) {
      if (!Object.prototype.hasOwnProperty.call(original, key) || typeof value !== 'string' || !value.trim()) {
        throw new BadRequestException('Les corrections doivent concerner des champs existants et ne peuvent pas être vides.');
      }
    }
    const formData = { ...original, ...Object.fromEntries(Object.entries(corrections).map(([key, value]) => [key, value.trim()])) };
    const cleanResponse = response.trim();
    if (!cleanResponse) throw new BadRequestException('Indiquez une réponse avant de clôturer la réclamation.');

    await this.prisma.$transaction(async (transaction) => {
      const resolved = await transaction.citizenComplaint.updateMany({
        where: { id, status: { in: [CitizenComplaintStatus.PENDING, CitizenComplaintStatus.IN_REVIEW] } },
        data: { status: CitizenComplaintStatus.RESOLVED, adminResponse: cleanResponse },
      });
      if (resolved.count !== 1) throw new BadRequestException('Cette réclamation vient d’être traitée. Actualisez la page.');
      await transaction.serviceRequest.update({
        where: { id: complaint.documentRequestId },
        data: { formData: formData as Prisma.InputJsonValue },
      });
      await transaction.notification.create({
        data: {
          userId: complaint.userId,
          title: 'Réclamation traitée',
          message: `Votre réclamation concernant « ${complaint.documentRequest.title ?? complaint.documentRequest.type} » a été traitée. Le document corrigé est à nouveau disponible.`,
          channel: 'PUSH',
        },
      });
    });
    return { success: true, status: 'RESOLVED' };
  }

  async reject(id: string, response: string) {
    const complaint = await this.prisma.citizenComplaint.findUnique({
      where: { id },
      include: { user: true, documentRequest: { select: { title: true, type: true } } },
    });
    if (!complaint || complaint.status === 'RESOLVED' || complaint.status === 'REJECTED') {
      throw new NotFoundException('Réclamation introuvable ou déjà clôturée');
    }
    const cleanResponse = response.trim();
    if (!cleanResponse) throw new BadRequestException('Indiquez le motif du refus.');
    await this.prisma.$transaction(async (transaction) => {
      const rejected = await transaction.citizenComplaint.updateMany({
        where: { id, status: { in: [CitizenComplaintStatus.PENDING, CitizenComplaintStatus.IN_REVIEW] } },
        data: { status: 'REJECTED', adminResponse: cleanResponse },
      });
      if (rejected.count !== 1) throw new BadRequestException('Cette réclamation vient d’être traitée. Actualisez la page.');
      await transaction.notification.create({
        data: { userId: complaint.userId, title: 'Réclamation refusée', message: cleanResponse, channel: 'PUSH' },
      });
    });
    return { success: true, status: 'REJECTED' };
  }

  async getAttachment(id: string, attachmentId: string, user: { id: string; roles?: string[]; role?: string }) {
    const attachment = await this.prisma.complaintAttachment.findUnique({
      where: { id: attachmentId },
      include: { complaint: { select: { id: true, userId: true } } },
    });
    if (!attachment || attachment.complaintId !== id) throw new NotFoundException('Justificatif introuvable');
    const isAdmin = user.role === 'ADMIN' || user.roles?.includes('ADMIN') || user.roles?.includes('SUPERADMIN');
    if (!isAdmin && attachment.complaint.userId !== user.id) throw new ForbiddenException('Vous ne pouvez pas consulter ce justificatif.');
    if (!existsSync(attachment.storagePath)) throw new NotFoundException('Fichier indisponible');
    return { attachment, stream: createReadStream(attachment.storagePath) };
  }
}
