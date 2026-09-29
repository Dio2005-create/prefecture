import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, scrypt as deriveKey } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = await promisify(deriveKey)(password, salt, 64) as Buffer;
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nom: true,
        phone: true,
        cin: true,
        role: true,
        locale: true,
        status: true,
        isTwoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async list() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        nom: true,
        phone: true,
        cin: true,
        role: true,
        status: true,
        locale: true,
        createdAt: true,
      },
    });
  }

  async createAdmin(input: { email?: string; password?: string; nom?: string; phone?: string }) {
    const email = input.email?.trim().toLowerCase();
    const password = input.password?.trim();
    if (!email || !password || password.length < 8) throw new BadRequestException('Email et mot de passe de 8 caractères minimum requis');
    const exists = await this.prisma.user.findFirst({ where: { OR: [{ email }, ...(input.phone ? [{ phone: input.phone.trim() }] : [])] } });
    if (exists) throw new BadRequestException('Un compte existe déjà avec ces informations');
    return this.prisma.user.create({
      data: {
        email,
        nom: input.nom?.trim() || null,
        phone: input.phone?.trim() || null,
        passwordHash: await this.hashPassword(password),
        role: 'ADMIN',
        status: 'ACTIVE',
        roles: { create: { role: { connect: { name: 'ADMIN' } } } },
      },
      select: { id: true, email: true, nom: true, phone: true, role: true, status: true, createdAt: true },
    });
  }
}
