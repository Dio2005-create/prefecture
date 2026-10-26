import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes, randomInt, scrypt as deriveKey } from 'node:crypto';
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
        _count: { select: { firearms: { where: { isActive: true } } } },
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

  async updateCitizenStatus(userId: string, status: 'ACTIVE' | 'DISABLED') {
    if (status !== 'ACTIVE' && status !== 'DISABLED') {
      throw new BadRequestException('Statut de compte invalide');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.role !== 'CITIZEN') {
      throw new BadRequestException('Seuls les comptes citoyens peuvent être désactivés depuis cette section');
    }
    if (user.status === status) {
      throw new BadRequestException(status === 'DISABLED' ? 'Ce compte est déjà désactivé' : 'Ce compte est déjà actif');
    }
    if (status === 'DISABLED' && user.email) this.mailer.assertConfigured();

    const updatedUser = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: userId },
        data: { status },
        select: { id: true, email: true, nom: true, role: true, status: true },
      });
      if (status === 'ACTIVE' && user.status === 'REACTIVATION_REQUESTED') {
        await transaction.accountReactivationRequest.updateMany({
          where: { userId, status: 'PENDING' },
          data: { status: 'APPROVED' },
        });
      }
      return updated;
    });
    if (status === 'DISABLED') {
      try {
        if (user.email) await this.mailer.sendCitizenDeactivation(user.email, user.locale);
      } catch (error) {
        try {
          const rollback = await this.prisma.user.updateMany({
            where: { id: userId, status: 'DISABLED' },
            data: { status: user.status },
          });
          if (rollback.count !== 1) throw new Error('Le statut du compte a changé avant la restauration.');
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

  listReactivationRequests() {
    return this.prisma.accountReactivationRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, nom: true, email: true, phone: true, status: true } } },
    });
  }

  async decideReactivation(requestId: string, reviewerId: string, decision: 'APPROVED' | 'REJECTED') {
    const request = await this.prisma.accountReactivationRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });
    if (!request || request.status !== 'PENDING' || request.user.status !== 'REACTIVATION_REQUESTED') {
      throw new NotFoundException('Demande de réactivation introuvable ou déjà traitée');
    }
    if (request.user.email) this.mailer.assertConfigured();
    const nextStatus = decision === 'APPROVED' ? 'ACTIVE' : 'DISABLED';
    await this.prisma.$transaction(async (transaction) => {
      const updateRequest = await transaction.accountReactivationRequest.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: decision, reviewedById: reviewerId },
      });
      const updateUser = await transaction.user.updateMany({
        where: { id: request.userId, status: 'REACTIVATION_REQUESTED' },
        data: { status: nextStatus },
      });
      if (updateRequest.count !== 1 || updateUser.count !== 1) {
        throw new BadRequestException('Cette demande vient d’être traitée. Actualisez la liste.');
      }
    });
    if (request.user.email) {
      try {
        await this.mailer.sendReactivationDecision(request.user.email, decision === 'APPROVED', request.user.locale);
      } catch (error) {
        try {
          await this.prisma.$transaction(async (transaction) => {
            const userRollback = await transaction.user.updateMany({
              where: { id: request.userId, status: nextStatus },
              data: { status: 'REACTIVATION_REQUESTED' },
            });
            const requestRollback = await transaction.accountReactivationRequest.updateMany({
              where: { id: request.id, status: decision },
              data: { status: 'PENDING', reviewedById: null },
            });
            if (userRollback.count !== 1 || requestRollback.count !== 1) {
              throw new Error('Le statut de la demande ou du compte a changé avant la restauration.');
            }
          });
        } catch (rollbackError) {
          this.logger.error(
            `Failed to restore reactivation request after email failure for ${request.id}`,
            rollbackError instanceof Error ? rollbackError.stack : String(rollbackError),
          );
          throw new ServiceUnavailableException('L’e-mail n’a pas pu être envoyé et la décision n’a pas pu être annulée. Vérifiez le compte avant de continuer.');
        }
        throw error;
      }
    }
    if (decision === 'APPROVED') this.auth.revokeUserSessions(request.userId);
    return { success: true, status: nextStatus, emailSent: Boolean(request.user.email) };
  }

  listPasswordResetRequests() {
    return this.prisma.passwordResetRequest.findMany({
      where: { status: 'PASSWORD_RESET_REQUESTED' },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, nom: true, cin: true, email: true, phone: true } },
      },
    });
  }

  async issueTemporaryPassword(requestId: string, reviewerId: string, identityVerified: boolean) {
    if (!identityVerified) throw new BadRequestException('Vérifiez la CIN originale au guichet avant de continuer.');
    const request = await this.prisma.passwordResetRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });
    if (!request || request.status !== 'PASSWORD_RESET_REQUESTED') {
      throw new NotFoundException('Demande de réinitialisation introuvable ou déjà traitée.');
    }
    if (request.user.role !== 'CITIZEN' || !request.user.cin) {
      throw new BadRequestException('Cette demande ne correspond pas à un compte citoyen avec une CIN vérifiable.');
    }

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const temporaryCharacters = [
      alphabet[randomInt(0, 26)],
      alphabet[randomInt(26, alphabet.length)],
      ...Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]),
    ];
    for (let index = temporaryCharacters.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(0, index + 1);
      [temporaryCharacters[index], temporaryCharacters[swapIndex]] = [temporaryCharacters[swapIndex], temporaryCharacters[index]];
    }
    const temporaryPassword = temporaryCharacters.join('');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const reviewedAt = new Date();
    const passwordHash = await this.hashPassword(temporaryPassword);

    await this.prisma.$transaction(async (transaction) => {
      const updatedRequest = await transaction.passwordResetRequest.updateMany({
        where: { id: request.id, status: 'PASSWORD_RESET_REQUESTED' },
        data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt },
      });
      if (updatedRequest.count !== 1) {
        throw new BadRequestException('Cette demande vient d’être traitée. Actualisez la liste.');
      }
      await transaction.user.update({
        where: { id: request.userId },
        data: {
          passwordHash,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: expiresAt,
          temporaryPasswordUsedAt: null,
        },
      });
      await transaction.journalAudit.create({
        data: {
          utilisateurId: reviewerId,
          action: 'CITIZEN_TEMPORARY_PASSWORD_ISSUED',
          details: {
            userId: request.userId,
            passwordResetRequestId: request.id,
            identityVerified: true,
            reviewedAt: reviewedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
    });
    this.auth.revokeUserSessions(request.userId);

    return {
      requestId: request.id,
      temporaryPassword,
      expiresAt,
      message: 'Code temporaire généré. Communiquez-le au citoyen après vérification de son identité. Il est valable 24 heures et devra être remplacé à la première connexion.',
    };
  }
}
