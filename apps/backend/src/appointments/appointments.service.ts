import { ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import PDFDocument = require('pdfkit');
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { generateAppointmentSlots } from './appointment-slots';
import { NotificationsService } from '../notifications/notifications.service';
import { getRequestCompleteness } from '../requests/request-requirements';
import { normalizeOfficialMark } from '../agent/official-mark-image';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  async listAvailable(date?: string) {
    const now = new Date();
    const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const dateRange = date ? this.getDateRange(date) : undefined;
    return this.prisma.appointmentSlot.findMany({
      where: {
        isActive: true,
        availabilityId: { not: null },
        startsAt: {
          gt: dateRange ? new Date(Math.max(now.getTime(), dateRange.start.getTime())) : now,
          lt: dateRange ? dateRange.end : horizon,
        },
        appointments: { none: { status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } } },
      },
      include: { availability: true },
      orderBy: { startsAt: 'asc' },
    }).then((slots) => slots.filter((slot) => {
      if (!slot.availability) return false;
      return generateAppointmentSlots({
        date: slot.availability.date.toISOString().slice(0, 10),
        startTime: slot.availability.startTime,
        endTime: slot.availability.endTime,
        slotDurationMinutes: slot.availability.slotDurationMinutes,
        breakStart: slot.availability.breakStart,
        breakEnd: slot.availability.breakEnd,
      }).some((interval) => interval.startsAt.getTime() === slot.startsAt.getTime() &&
        interval.endsAt.getTime() === slot.endsAt.getTime());
    }));
  }

  listAvailabilityForAdmin() {
    return this.prisma.appointmentAvailability.findMany({
      orderBy: { date: 'asc' },
    });
  }

  listSlotsForAdmin() {
    return this.prisma.appointmentSlot.findMany({
      where: { availabilityId: { not: null } },
      orderBy: { startsAt: 'asc' },
      include: {
        appointments: {
          where: { status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } },
          select: { id: true },
        },
      },
    });
  }

  async createAvailability(input: {
    date: string;
    startTime: string;
    endTime: string;
    slotDurationMinutes: number;
    breakStart?: string;
    breakEnd?: string;
    office?: string;
  }) {
    if (Boolean(input.breakStart) !== Boolean(input.breakEnd)) {
      throw new ConflictException('Renseignez les deux heures de pause ou laissez-les toutes les deux vides');
    }
    const schedule = {
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      slotDurationMinutes: input.slotDurationMinutes,
      breakStart: input.breakStart ?? null,
      breakEnd: input.breakEnd ?? null,
    };
    let generatedSlots;
    try {
      generatedSlots = generateAppointmentSlots(schedule);
    } catch (error) {
      if (error instanceof RangeError) throw new ConflictException(error.message);
      throw error;
    }
    this.getDateRange(input.date);
    const now = new Date();
    if (!generatedSlots.some((slot) => slot.startsAt > now)) {
      throw new ConflictException('La disponibilité doit contenir au moins un créneau futur');
    }

    const date = new Date(`${input.date}T00:00:00.000Z`);
    const existingSchedule = await this.prisma.appointmentAvailability.findUnique({ where: { date } });
    if (existingSchedule) {
      const reservedSlot = await this.prisma.appointmentSlot.findFirst({
        where: {
          availabilityId: existingSchedule.id,
          appointments: { some: { status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } } },
        },
        select: { id: true },
      });
      if (reservedSlot) throw new ConflictException('Cette disponibilité ne peut pas être modifiée car elle contient déjà des rendez-vous réservés');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const firstSlot = generatedSlots[0];
        const lastSlot = generatedSlots[generatedSlots.length - 1];
        const overlappingReservedSlot = await tx.appointmentSlot.findFirst({
          where: {
            ...(existingSchedule ? { availabilityId: { not: existingSchedule.id } } : {}),
            startsAt: { lt: lastSlot.endsAt },
            endsAt: { gt: firstSlot.startsAt },
            appointments: { some: { status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } } },
          },
          select: { id: true },
        });
        if (overlappingReservedSlot) {
          throw new ConflictException('Un rendez-vous réservé chevauche cette nouvelle disponibilité');
        }
        if (existingSchedule) {
          await tx.$queryRaw`SELECT "id" FROM "AppointmentSlot" WHERE "availabilityId" = ${existingSchedule.id} FOR UPDATE`;
          const reservedSlot = await tx.appointmentSlot.findFirst({
            where: {
              availabilityId: existingSchedule.id,
              appointments: { some: { status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } } },
            },
            select: { id: true },
          });
          if (reservedSlot) throw new ConflictException('Cette disponibilité ne peut pas être modifiée car elle contient déjà des rendez-vous réservés');
        }
        const availability = existingSchedule
          ? await tx.appointmentAvailability.update({
              where: { id: existingSchedule.id },
              data: {
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                slotDurationMinutes: schedule.slotDurationMinutes,
                breakStart: schedule.breakStart,
                breakEnd: schedule.breakEnd,
                office: input.office?.trim() || 'Guichet général',
              },
            })
          : await tx.appointmentAvailability.create({
              data: {
                date,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                slotDurationMinutes: schedule.slotDurationMinutes,
                breakStart: schedule.breakStart,
                breakEnd: schedule.breakEnd,
                office: input.office?.trim() || 'Guichet général',
              },
            });

        await tx.appointmentSlot.updateMany({
          where: { availabilityId: availability.id },
          data: { isActive: false },
        });
        for (const interval of generatedSlots) {
          const existingSlot = await tx.appointmentSlot.findFirst({
            where: { startsAt: interval.startsAt, endsAt: interval.endsAt },
            include: {
              appointments: {
                where: { status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } },
                select: { id: true },
              },
            },
          });
          if (existingSlot) {
            if (existingSlot.appointments.length > 0) {
              throw new ConflictException('Un rendez-vous existe déjà à ces horaires');
            }
            await tx.appointmentSlot.update({
              where: { id: existingSlot.id },
              data: { isActive: true, office: availability.office, availabilityId: availability.id },
            });
          } else {
            await tx.appointmentSlot.create({
              data: { ...interval, office: availability.office, availabilityId: availability.id },
            });
          }
        }
        return { ...availability, generatedSlotCount: generatedSlots.length };
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Un autre créneau existe déjà à ces horaires');
      }
      throw error;
    }
  }

  private getDateRange(date: string) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new ConflictException('La date de disponibilité est invalide');
    }
    const start = new Date(`${date}T00:00:00+03:00`);
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }

  async updateSlot(id: string, isActive: boolean) {
    const slot = await this.prisma.appointmentSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException('Créneau introuvable');
    if (!slot.availabilityId) throw new ConflictException('Ce créneau n’appartient pas à une disponibilité configurée');
    if (isActive && slot.startsAt <= new Date()) throw new ConflictException('Un créneau passé ne peut pas être réactivé');
    return this.prisma.appointmentSlot.update({ where: { id }, data: { isActive } });
  }

  listByUser(userId: string) {
    return this.prisma.appointment.findMany({ where: { userId }, orderBy: { startsAt: 'desc' }, include: { request: { include: { service: true } } } });
  }

  async generateTicket(id: string, userId: string): Promise<{ pdf: Buffer; filename: string }> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nom: true, email: true, phone: true } },
        request: { include: { service: true } },
      },
    });
    if (!appointment || appointment.userId !== userId) throw new NotFoundException('Rendez-vous introuvable');
    if (appointment.status !== AppointmentStatus.BOOKED && appointment.status !== AppointmentStatus.COMPLETED) {
      throw new ForbiddenException('Le ticket sera disponible après confirmation du rendez-vous par l’administration');
    }

    const logoPath = [
      join(process.cwd(), 'assets', 'logoPrefet.png'),
      join(process.cwd(), '..', 'frontend', 'public', 'logoPrefet.png'),
      join(process.cwd(), 'apps', 'frontend', 'public', 'logoPrefet.png'),
    ].find(existsSync);
    if (!logoPath) throw new InternalServerErrorException('Le logo de la préfecture est indisponible');
    const marks = await this.prisma.officialMark.findMany({
      where: { isActive: true, kind: { in: ['STAMP', 'SIGNATURE'] } },
      orderBy: { createdAt: 'desc' },
    });
    const stamp = marks.find((mark) => mark.kind === 'STAMP' && existsSync(mark.storagePath));
    const signature = marks.find((mark) => mark.kind === 'SIGNATURE' && existsSync(mark.storagePath));
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
    const reference = appointment.ticketReference;
    if (!reference) throw new InternalServerErrorException('La référence de ce rendez-vous est indisponible');
    const requestName = appointment.request?.title?.trim() || appointment.request?.service.nameFr || 'rendez-vous';
    const fileSlug = requestName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'rendez-vous';
    const filename = `ticket-${fileSlug}.pdf`;

    const pdf = await new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({ size: [420, 595], margin: 32 });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      document.image(logoPath, 170, 24, { fit: [80, 56], align: 'center' });
      document.moveDown(5);
      document.fontSize(13).font('Helvetica-Bold').text('PRÉFECTURE D’IHOSY', { align: 'center' });
      document.moveDown(0.4).fontSize(17).text('TICKET DE RENDEZ-VOUS', { align: 'center' });
      document.moveDown(0.5).fontSize(9).font('Helvetica').text('JUSTIFICATIF DE RENDEZ-VOUS CONFIRMÉ', { align: 'center' });
      document.moveDown(1);
      document.strokeColor('#6b7d70').lineWidth(1).roundedRect(28, document.y, 364, 255, 10).stroke();
      document.moveDown(0.7);
      document.fontSize(9).fillColor('#53645a').text('RÉFÉRENCE DU TICKET');
      document.moveDown(0.2).fontSize(11).font('Helvetica-Bold').fillColor('#172820').text(reference, { width: 340 });
      document.moveDown(1);
      const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'Indian/Antananarivo' }).format(appointment.startsAt);
      const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Antananarivo' }).format(appointment.startsAt);
      const endTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Antananarivo' }).format(appointment.endsAt);
      const purpose = appointment.request?.service.nameFr ?? appointment.notes?.trim() ?? 'Rendez-vous à la préfecture';
      const rows: Array<[string, string]> = [
        ['NOM DU CITOYEN', appointment.user.nom ?? 'Non renseigné'],
        ['DATE', date],
        ['HEURE', `${time} – ${endTime}`],
        ['LIEU / GUICHET', appointment.office],
        ['MOTIF', purpose],
        ...(appointment.user.phone ? [['TÉLÉPHONE', appointment.user.phone] as [string, string]] : []),
        ...(appointment.user.email ? [['EMAIL', appointment.user.email] as [string, string]] : []),
      ];
      rows.forEach(([label, value]) => {
        document.font('Helvetica').fontSize(8).fillColor('#53645a').text(label);
        document.moveDown(0.15).font('Helvetica-Bold').fontSize(10).fillColor('#172820').text(value, { width: 330 });
        document.moveDown(0.6);
      });

      const markY = Math.min(document.y + 10, 435);
      const rightEdge = 420 - 32;
      if (signatureImage) document.image(signatureImage, rightEdge - 120, markY, { fit: [120, 58] });
      if (stampImage) document.image(stampImage, rightEdge - 80, markY + 6, { fit: [80, 60] });
      document.font('Helvetica').fontSize(8).fillColor('#53645a')
        .text('Présentez ce ticket à votre arrivée. Merci de vous présenter quelques minutes avant l’heure indiquée.', 32, 535, { width: 356, align: 'center' });
      document.end();
    });
    return { pdf, filename };
  }

  listAll() {
    return this.prisma.appointment.findMany({
      orderBy: { startsAt: 'asc' },
      include: { user: { select: { id: true, email: true, nom: true, phone: true } }, request: { include: { service: true } } },
    });
  }

  private async nextTicketReference(tx: Prisma.TransactionClient, startsAt: Date) {
    const localDateParts = new Intl.DateTimeFormat('en', {
      timeZone: 'Indian/Antananarivo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(startsAt);
    const localDate = `${localDateParts.find((part) => part.type === 'year')?.value}-${localDateParts.find((part) => part.type === 'month')?.value}-${localDateParts.find((part) => part.type === 'day')?.value}`;
    const localDay = Number(localDate.slice(-2));
    const dayStart = new Date(`${localDate}T00:00:00+03:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${localDate}))`;
    const dailyCount = await tx.appointment.count({
      where: { startsAt: { gte: dayStart, lt: dayEnd }, ticketReference: { not: null } },
    });
    return `RDV-${String(dailyCount + 1).padStart(3, '0')}-${localDay}`;
  }

  async book(userId: string, input: { slotId: string; requestId?: string; notes?: string }) {
    let requestType: string | undefined;
    if (input.requestId) {
      const request = await this.prisma.serviceRequest.findFirst({
        where: { id: input.requestId, userId },
        select: { id: true, type: true },
      });
      if (!request) throw new ForbiddenException('Demande introuvable');
      requestType = request.type;
    }
    if (requestType === 'CIN_REQUEST' || requestType === 'CIN_RENEWAL') {
      throw new ForbiddenException('Le rendez-vous d’empreintes CIN doit être attribué par l’administration');
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.requestId) {
        await tx.$queryRaw`SELECT "id" FROM "ServiceRequest" WHERE "id" = ${input.requestId} FOR UPDATE`;
        const currentRequest = await tx.serviceRequest.findFirst({
          where: { id: input.requestId, userId },
          select: { type: true },
        });
        if (!currentRequest) throw new ForbiddenException('Demande introuvable');
        if (currentRequest.type === 'CIN_REQUEST' || currentRequest.type === 'CIN_RENEWAL') {
          throw new ForbiddenException('Le rendez-vous d’empreintes CIN doit être attribué par l’administration');
        }
        const existingRequestAppointment = await tx.appointment.findFirst({
          where: { requestId: input.requestId, status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } },
          select: { id: true },
        });
        if (existingRequestAppointment) throw new ConflictException('Un rendez-vous est déjà réservé pour cette demande');
      }
      await tx.$queryRaw`SELECT "id" FROM "AppointmentSlot" WHERE "id" = ${input.slotId} FOR UPDATE`;
      const slot = await tx.appointmentSlot.findUnique({
        where: { id: input.slotId },
        include: { availability: true },
      });
      if (!slot || !slot.availabilityId || !slot.availability || !slot.isActive || slot.startsAt <= new Date()) {
        throw new ConflictException('Ce créneau n’est plus disponible');
      }
      const configuredIntervals = generateAppointmentSlots({
        date: slot.availability.date.toISOString().slice(0, 10),
        startTime: slot.availability.startTime,
        endTime: slot.availability.endTime,
        slotDurationMinutes: slot.availability.slotDurationMinutes,
        breakStart: slot.availability.breakStart,
        breakEnd: slot.availability.breakEnd,
      });
      if (!configuredIntervals.some((interval) => interval.startsAt.getTime() === slot.startsAt.getTime() &&
          interval.endsAt.getTime() === slot.endsAt.getTime())) {
        throw new ConflictException('Ce créneau ne correspond plus aux horaires configurés');
      }
      const existingAppointment = await tx.appointment.findFirst({
        where: { slotId: slot.id, status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } },
      });
      if (existingAppointment) throw new ConflictException('Ce créneau est déjà réservé');
      const ticketReference = await this.nextTicketReference(tx, slot.startsAt);
      return tx.appointment.create({
        data: {
          ticketReference,
          userId,
          requestId: input.requestId,
          slotId: slot.id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          office: slot.office,
          notes: requestType === 'CIN_REQUEST' || requestType === 'CIN_RENEWAL'
            ? `Prise d’empreintes digitales — ${input.notes ?? ''}`.trim()
            : input.notes,
          status: AppointmentStatus.PENDING,
        },
      });
    });
  }

  async assignCinRequest(requestId: string, slotId: string, adminId: string) {
    const appointment = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ServiceRequest" WHERE "id" = ${requestId} FOR UPDATE`;
      const request = await tx.serviceRequest.findUnique({
        where: { id: requestId },
        include: { attachments: { select: { label: true } } },
      });
      if (!request) throw new NotFoundException('Demande introuvable');
      if (!['CIN_REQUEST', 'CIN_RENEWAL'].includes(request.type)) throw new ConflictException('Cette demande ne concerne pas une carte d’identité');
      if (request.status !== 'IN_REVIEW') throw new ConflictException('La demande doit être en instruction avant l’attribution du rendez-vous');
      const formData = request.formData && typeof request.formData === 'object' && !Array.isArray(request.formData)
        ? request.formData as Record<string, unknown>
        : {};
      const completeness = getRequestCompleteness(request.type, formData, request.attachments);
      if (completeness.missingFields.length || completeness.invalidFields.length || completeness.missingAttachments.length) {
        throw new ConflictException(`Le dossier ne peut pas être approuvé : ${[...completeness.missingFields, ...completeness.invalidFields, ...completeness.missingAttachments].join(', ')}`);
      }
      const existingAppointment = await tx.appointment.findFirst({
        where: { requestId, status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } },
        select: { id: true },
      });
      if (existingAppointment) throw new ConflictException('Un rendez-vous est déjà attribué à cette demande');

      await tx.$queryRaw`SELECT "id" FROM "AppointmentSlot" WHERE "id" = ${slotId} FOR UPDATE`;
      const slot = await tx.appointmentSlot.findUnique({ where: { id: slotId }, include: { availability: true } });
      if (!slot || !slot.availabilityId || !slot.availability || !slot.isActive || slot.startsAt <= new Date()) {
        throw new ConflictException('Ce créneau n’est plus disponible');
      }
      const configuredSlots = generateAppointmentSlots({
        date: slot.availability.date.toISOString().slice(0, 10),
        startTime: slot.availability.startTime,
        endTime: slot.availability.endTime,
        slotDurationMinutes: slot.availability.slotDurationMinutes,
        breakStart: slot.availability.breakStart,
        breakEnd: slot.availability.breakEnd,
      });
      if (!configuredSlots.some((interval) => interval.startsAt.getTime() === slot.startsAt.getTime() && interval.endsAt.getTime() === slot.endsAt.getTime())) {
        throw new ConflictException('Ce créneau ne correspond plus aux horaires configurés');
      }
      const occupied = await tx.appointment.findFirst({
        where: { slotId, status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } },
        select: { id: true },
      });
      if (occupied) throw new ConflictException('Ce créneau est déjà réservé');

      const ticketReference = await this.nextTicketReference(tx, slot.startsAt);
      const created = await tx.appointment.create({
        data: {
          ticketReference,
          userId: request.userId,
          requestId,
          slotId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          office: slot.office,
          notes: 'Prise d’empreintes digitales — rendez-vous attribué par l’administration',
          status: AppointmentStatus.BOOKED,
        },
      });
      await tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          status: 'IN_PROGRESS',
          updatedAt: new Date(),
          history: { create: { status: 'IN_PROGRESS', comment: `Dossier CIN en attente du rendez-vous d’empreintes du ${slot.startsAt.toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo' })}`, changedById: adminId } },
        },
      });
      return { ...created, userId: request.userId };
    });
    await this.notifications.createForUser(
      appointment.userId,
      'Rendez-vous pour les empreintes CIN',
      `L’administration vous attend le ${appointment.startsAt.toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo' })} à ${appointment.office} pour la prise de vos empreintes digitales. Votre demande restera en attente jusqu’à la fin du rendez-vous.`,
    );
    return appointment;
  }

  async updateStatus(id: string, status: AppointmentStatus) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable');
    if (appointment.status === AppointmentStatus.CANCELLED || appointment.status === AppointmentStatus.COMPLETED) {
      throw new ConflictException('Ce rendez-vous ne peut plus être modifié');
    }
    if (status === AppointmentStatus.COMPLETED && appointment.endsAt > new Date()) {
      throw new ConflictException('Le rendez-vous ne peut être terminé qu’après son horaire de fin');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedAppointment = await tx.appointment.update({ where: { id }, data: { status } });
      let completedCinRequest: { id: string; userId: string } | undefined;
      let reopenedCinRequest: { id: string; userId: string } | undefined;
      if (appointment.requestId) {
        const request = await tx.serviceRequest.findUnique({ where: { id: appointment.requestId } });
        if (request && ['CIN_REQUEST', 'CIN_RENEWAL'].includes(request.type) &&
            status === AppointmentStatus.COMPLETED && request.status !== 'APPROVED') {
          await tx.serviceRequest.update({
            where: { id: request.id },
            data: {
              status: 'APPROVED',
              updatedAt: new Date(),
              history: { create: { status: 'APPROVED', comment: 'Empreintes digitales prises ; demande de CIN validée pour remise au guichet' } },
            },
          });
          completedCinRequest = { id: request.id, userId: request.userId };
        } else if (request && ['CIN_REQUEST', 'CIN_RENEWAL'].includes(request.type) &&
            status === AppointmentStatus.CANCELLED && request.status === 'IN_PROGRESS') {
          await tx.serviceRequest.update({
            where: { id: request.id },
            data: {
              status: 'IN_REVIEW',
              updatedAt: new Date(),
              history: { create: { status: 'IN_REVIEW', comment: 'Le rendez-vous d’empreintes a été annulé ; un nouveau créneau doit être attribué' } },
            },
          });
          reopenedCinRequest = { id: request.id, userId: request.userId };
        }
      }
      return { appointment: updatedAppointment, completedCinRequest, reopenedCinRequest };
    });
    if (status === AppointmentStatus.BOOKED && appointment.status !== AppointmentStatus.BOOKED) {
      await this.notifications.createForUser(
        appointment.userId,
        'Rendez-vous confirmé',
        `Votre rendez-vous du ${appointment.startsAt.toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo' })} à ${appointment.office} est confirmé. Téléchargez votre ticket depuis la rubrique « Mes rendez-vous ».`,
      );
    }
    if (result.completedCinRequest) {
      await this.notifications.createForUser(result.completedCinRequest.userId, 'Demande de CIN prête', 'Le rendez-vous de prise des empreintes est terminé. Votre demande de CIN est validée ; vous pouvez la retirer au guichet.');
    }
    if (result.reopenedCinRequest) {
      await this.notifications.createForUser(result.reopenedCinRequest.userId, 'Rendez-vous d’empreintes annulé', 'Le rendez-vous d’empreintes a été annulé. Votre demande est de nouveau en instruction et l’administration pourra vous attribuer un autre créneau.');
    }
    return result.appointment;
  }

  async cancel(userId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({ where: { id, userId } });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable');
    if (appointment.status === AppointmentStatus.CANCELLED || appointment.status === AppointmentStatus.COMPLETED) {
      throw new ConflictException('Ce rendez-vous ne peut plus être annulé');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedAppointment = await tx.appointment.update({ where: { id }, data: { status: AppointmentStatus.CANCELLED } });
      let reopenedCinRequest: { id: string; userId: string } | undefined;
      if (appointment.requestId) {
        const request = await tx.serviceRequest.findUnique({ where: { id: appointment.requestId } });
        if (request && ['CIN_REQUEST', 'CIN_RENEWAL'].includes(request.type) && request.status === 'IN_PROGRESS') {
          await tx.serviceRequest.update({
            where: { id: request.id },
            data: {
              status: 'IN_REVIEW',
              updatedAt: new Date(),
              history: { create: { status: 'IN_REVIEW', comment: 'Le citoyen a annulé le rendez-vous d’empreintes ; un nouveau créneau doit être attribué' } },
            },
          });
          reopenedCinRequest = { id: request.id, userId: request.userId };
        }
      }
      return { appointment: updatedAppointment, reopenedCinRequest };
    });
    if (result.reopenedCinRequest) {
      await this.notifications.createForUser(result.reopenedCinRequest.userId, 'Rendez-vous d’empreintes annulé', 'Votre rendez-vous d’empreintes a été annulé. Votre demande est de nouveau en instruction et l’administration pourra vous attribuer un autre créneau.');
    }
    return result.appointment;
  }
}
