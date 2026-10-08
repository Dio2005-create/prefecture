import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailable() {
    const now = new Date();
    const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    return this.prisma.appointmentSlot.findMany({
      where: {
        isActive: true,
        startsAt: { gt: now, lt: horizon },
        appointments: { none: { status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  listSlotsForAdmin() {
    return this.prisma.appointmentSlot.findMany({
      orderBy: { startsAt: 'asc' },
      include: {
        appointments: {
          where: { status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } },
          select: { id: true },
        },
      },
    });
  }

  async createSlot(input: { startsAt: string; endsAt: string; office?: string }) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date() || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new ConflictException('Les dates et heures du créneau sont invalides');
    }
    const overlappingSlot = await this.prisma.appointmentSlot.findFirst({
      where: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      select: { id: true },
    });
    if (overlappingSlot) throw new ConflictException('Un créneau existe déjà à ces horaires');
    try {
      return await this.prisma.appointmentSlot.create({
        data: { startsAt, endsAt, office: input.office?.trim() || 'Guichet général' },
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Un créneau existe déjà à ces horaires');
      }
      throw error;
    }
  }

  async updateSlot(id: string, isActive: boolean) {
    const slot = await this.prisma.appointmentSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException('Créneau introuvable');
    if (isActive && slot.startsAt <= new Date()) throw new ConflictException('Un créneau passé ne peut pas être réactivé');
    return this.prisma.appointmentSlot.update({ where: { id }, data: { isActive } });
  }

  listByUser(userId: string) {
    return this.prisma.appointment.findMany({ where: { userId }, orderBy: { startsAt: 'desc' }, include: { request: { include: { service: true } } } });
  }

  listAll() {
    return this.prisma.appointment.findMany({
      orderBy: { startsAt: 'asc' },
      include: { user: { select: { id: true, email: true, nom: true, phone: true } }, request: { include: { service: true } } },
    });
  }

  async book(userId: string, input: { slotId: string; requestId?: string; notes?: string }) {
    if (input.requestId) {
      const request = await this.prisma.serviceRequest.findFirst({ where: { id: input.requestId, userId } });
      if (!request) throw new ForbiddenException('Demande introuvable');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "AppointmentSlot" WHERE "id" = ${input.slotId} FOR UPDATE`;
      const slot = await tx.appointmentSlot.findUnique({ where: { id: input.slotId } });
      if (!slot || !slot.isActive || slot.startsAt <= new Date()) throw new ConflictException('Ce créneau n’est plus disponible');
      const existingAppointment = await tx.appointment.findFirst({
        where: { slotId: slot.id, status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } },
      });
      if (existingAppointment) throw new ConflictException('Ce créneau est déjà réservé');
      return tx.appointment.create({
        data: {
          userId,
          requestId: input.requestId,
          slotId: slot.id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          office: slot.office,
          notes: input.notes,
          status: AppointmentStatus.PENDING,
        },
      });
    });
  }

  async updateStatus(id: string, status: AppointmentStatus) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable');
    if (appointment.status === AppointmentStatus.CANCELLED || appointment.status === AppointmentStatus.COMPLETED) {
      throw new ConflictException('Ce rendez-vous ne peut plus être modifié');
    }
    return this.prisma.appointment.update({ where: { id }, data: { status } });
  }

  async cancel(userId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({ where: { id, userId } });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable');
    return this.prisma.appointment.update({ where: { id }, data: { status: AppointmentStatus.CANCELLED } });
  }
}
