import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  listByUser(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async createForUser(userId: string, title: string, message: string, channel: NotificationChannel = 'PUSH') {
    return this.prisma.notification.create({ data: { userId, title, message, channel } });
  }

  markAsRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { id, userId }, data: { status: NotificationStatus.READ } });
  }
}
