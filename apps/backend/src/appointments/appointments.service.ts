import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailable() {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 30);
    const booked = await this.prisma.appointment.findMany({
      where: { startsAt: { gte: now, lt: horizon }, status: { in: [AppointmentStatus.PENDING, AppointmentStatus.BOOKED] } },
      select: { startsAt: true, endsAt: true },
    });
    const slots: Array<{ startsAt: string; endsAt: string; office: string }> = [];

    for (const day = new Date(now); day < horizon; day.setDate(day.getDate() + 1)) {
      const weekDay = day.getDay();
      if (weekDay === 0 || weekDay === 6) continue;
      for (const hour of [8, 9, 10, 11, 13, 14, 15, 16]) {
        for (const minutes of [0, 30]) {
          const startsAt = new Date(day);
          startsAt.setHours(hour, minutes, 0, 0);
          const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
          if (startsAt <= now || booked.some((appointment) => appointment.startsAt < endsAt && appointment.endsAt > startsAt)) continue;
          slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), office: 'Guichet général' });
        }
      }
    }

    return slots.slice(0, 50);
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

  async book(userId: string, input: { startsAt: string; requestId?: string; notes?: string }) {
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) throw new ConflictException('Créneau invalide');
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const conflict = await this.prisma.appointment.findFirst({ where: { status: AppointmentStatus.BOOKED, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (conflict) throw new ConflictException('Ce créneau est déjà réservé');
    if (input.requestId) {
      const request = await this.prisma.serviceRequest.findFirst({ where: { id: input.requestId, userId } });
      if (!request) throw new ForbiddenException('Demande introuvable');
    }
    return this.prisma.appointment.create({ data: { userId, requestId: input.requestId, startsAt, endsAt, notes: input.notes, status: AppointmentStatus.PENDING } });
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
