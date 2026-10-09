import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes, scrypt as deriveKey } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { MailerService } from './mailer.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mailer: MailerService,
  ) {}

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
        roles: { select: { role: { select: { name: true } } } },
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

  async updateCitizenStatus(userId: string, status: 'ACTIVE' | 'INACTIVE') {
    if (status !== 'ACTIVE' && status !== 'INACTIVE') {
      throw new BadRequestException('Statut de compte invalide');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.role !== 'CITIZEN') {
      throw new BadRequestException('Seuls les comptes citoyens peuvent être désactivés depuis cette section');
    }
    if (user.status === status) {
      throw new BadRequestException(status === 'INACTIVE' ? 'Ce compte est déjà désactivé' : 'Ce compte est déjà actif');
    }
    if (status === 'INACTIVE') this.mailer.assertConfigured();

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { id: true, email: true, nom: true, role: true, status: true },
    });
    if (status === 'INACTIVE') {
      try {
        await this.mailer.sendCitizenDeactivation(user.email, user.locale);
      } catch (error) {
        try {
          await this.prisma.user.update({ where: { id: userId }, data: { status: user.status } });
        } catch (rollbackError) {
          this.logger.error(
            `Failed to restore account status after deactivation email failure for ${userId}`,
            rollbackError instanceof Error ? rollbackError.stack : String(rollbackError),
          );
          throw new ServiceUnavailableException('L’e-mail n’a pas pu être envoyé et le statut du compte n’a pas pu être restauré. Vérifiez le compte avant de réessayer.');
        }
        throw error;
      }
      this.auth.revokeUserSessions(userId);
    }
    return updatedUser;
  }
}
