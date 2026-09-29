import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaymentProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async initiate(userId: string, input: { requestId: string; provider: PaymentProvider; phone: string }) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw new NotFoundException('Demande introuvable');
    if (request.userId !== userId) throw new ForbiddenException('Cette demande ne vous appartient pas');
    if (!request.fee || Number(request.fee) <= 0) throw new NotFoundException('Aucun frais à payer pour cette demande');

    return this.prisma.payment.create({
      data: { requestId: request.id, userId, provider: input.provider, phone: input.phone, amount: request.fee, externalId: `SANDBOX-${randomUUID()}` },
    });
  }

  listByUser(userId: string) {
    return this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { request: { include: { service: true } } } });
  }
}
