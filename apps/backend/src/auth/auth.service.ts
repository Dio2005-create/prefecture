import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomBytes, createHash, randomInt, scrypt as deriveKey, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import type { RoleName } from '@prisma/client';
import { MailerService } from '../users/mailer.service';

const SESSION_DURATION = 5 * 60 * 1000;
const scrypt = promisify(deriveKey);

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, { expiresAt: number; userId: string; temporaryPasswordLogin: boolean }>();
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService, private readonly mailer: MailerService) {}

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, 64) as Buffer;
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
  }

  private async verifyPassword(password: string, storedHash: string) {
    if (!storedHash.startsWith('scrypt:')) {
      return storedHash === createHash('sha256').update(password).digest('hex');
    }
    const [, salt, expectedHex] = storedHash.split(':');
    if (!salt || !expectedHex) return false;
    const actual = await scrypt(password, salt, 64) as Buffer;
    const expected = Buffer.from(expectedHex, 'hex');
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  }

  private toUserPayload(user: { id: string; email: string | null; nom: string | null; phone: string | null; cin: string | null; role: string; locale: string; status: string; isTwoFactorEnabled: boolean; lastLoginAt: Date | null; mustChangePassword: boolean; roles?: Array<{ role: { name: RoleName } }> }) {
    return {
      id: user.id,
      email: user.email,
      nom: user.nom,
      phone: user.phone,
      cin: user.cin,
      role: user.role,
      roles: user.roles?.map(({ role }) => role.name) ?? [],
      locale: user.locale,
      status: user.status,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async register(input: { email?: string; password: string; phone?: string; cin?: string; nom?: string; isAdult?: boolean }) {
    const email = input.email?.trim().toLowerCase() || null;
    const password = input.password.trim();
    if (!password) throw new UnauthorizedException('Le mot de passe est requis');
    if (!email && !input.phone?.trim()) throw new UnauthorizedException('Renseignez un email ou un téléphone pour pouvoir vous connecter');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UnauthorizedException('Adresse email invalide');
    if (typeof input.isAdult !== 'boolean') throw new UnauthorizedException('Veuillez indiquer si vous avez 18 ans ou plus');
    const cin = input.cin?.trim();
    if (input.isAdult && !cin) throw new UnauthorizedException('La CIN est obligatoire à partir de 18 ans');
    if (input.isAdult && !/^\d{12}$/.test(cin ?? '')) throw new UnauthorizedException('La CIN doit contenir exactement 12 chiffres');

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
          ...(input.phone ? [{ phone: { equals: input.phone, mode: 'insensitive' as const } }] : []),
          ...(input.isAdult && cin ? [{ cin: { equals: cin, mode: 'insensitive' as const } }] : []),
        ],
      },
    });

    if (existing) throw new UnauthorizedException('Un compte existe déjà avec ces informations');

    const user = await this.prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          email,
          phone: input.phone?.trim() || null,
          cin: input.isAdult ? cin : null,
          nom: input.nom?.trim() || null,
          passwordHash: await this.hashPassword(password),
          role: 'CITIZEN',
          status: 'ACTIVE',
          roles: {
            create: {
              role: { connect: { name: 'CITIZEN' } },
            },
          },
        },
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
            title: 'Nouvelle inscription citoyenne',
            message: `${createdUser.nom ?? createdUser.email ?? createdUser.phone ?? 'Un citoyen'} vient de créer un compte.`,
            metadata: { type: 'CITIZEN_REGISTERED', userId: createdUser.id },
          })),
        });
      }
      return createdUser;
    });

    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, { expiresAt: Date.now() + SESSION_DURATION, userId: user.id, temporaryPasswordLogin: false });

    const userWithRoles = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { roles: { include: { role: true } } },
    });
    return { token, expiresIn: SESSION_DURATION, user: this.toUserPayload(userWithRoles) };
  }

  async login(identifier: string, password: string, portal: 'citizen' | 'admin' = 'citizen') {
    const cleanIdentifier = identifier.trim();
    const cleanPassword = password.trim();
    if (!cleanIdentifier || !cleanPassword) throw new UnauthorizedException('Identifiant et mot de passe requis');

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: cleanIdentifier, mode: 'insensitive' } },
          { phone: { equals: cleanIdentifier, mode: 'insensitive' as const } },
          { cin: { equals: cleanIdentifier, mode: 'insensitive' as const } },
        ],
      },
      include: { roles: { include: { role: true } } },
    });

    if (!user || !user.passwordHash) throw new UnauthorizedException('Identifiants invalides');
    if (!(await this.verifyPassword(cleanPassword, user.passwordHash))) throw new UnauthorizedException('Identifiants invalides');
    const isAdmin = user.role === 'ADMIN' ||
      user.roles.some(({ role }) => role.name === 'ADMIN' || role.name === 'SUPERADMIN');
    if (portal === 'admin' && !isAdmin) {
      throw new UnauthorizedException('Vérifiez vos informations de connexion.');
    }
    if (portal === 'citizen' && isAdmin) {
      throw new UnauthorizedException('Vérifiez vos informations de connexion.');
    }
    if (user.status === 'DISABLED') {
      throw new UnauthorizedException('Votre compte a été désactivé. Vous pouvez demander sa réactivation.');
    }
    if (user.status === 'REACTIVATION_REQUESTED') throw new UnauthorizedException('Votre demande de réactivation est en cours de traitement.');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Compte indisponible');

    if (user.mustChangePassword) {
      if (!user.temporaryPasswordExpiresAt || user.temporaryPasswordExpiresAt <= new Date()) {
        throw new UnauthorizedException('Le mot de passe temporaire a expiré. Présentez-vous au guichet avec votre CIN.');
      }
      if (user.temporaryPasswordUsedAt) {
        throw new UnauthorizedException('Ce mot de passe temporaire a déjà été utilisé. Reprenez la procédure au guichet.');
      }
      const claimed = await this.prisma.user.updateMany({
        where: {
          id: user.id,
          mustChangePassword: true,
          temporaryPasswordUsedAt: null,
          temporaryPasswordExpiresAt: { gt: new Date() },
        },
        data: { temporaryPasswordUsedAt: new Date() },
      });
      if (claimed.count !== 1) throw new UnauthorizedException('Ce mot de passe temporaire a déjà été utilisé ou a expiré.');
    }

    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, { expiresAt: Date.now() + SESSION_DURATION, userId: user.id, temporaryPasswordLogin: user.mustChangePassword });

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(user.passwordHash.startsWith('scrypt:') ? {} : { passwordHash: await this.hashPassword(cleanPassword) }),
      },
      include: { roles: { include: { role: true } } },
    });

    return { token, expiresIn: SESSION_DURATION, user: this.toUserPayload(updatedUser) };
  }

  logout(token?: string) {
    if (token) this.sessions.delete(token);
    return { success: true };
  }

  revokeUserSessions(userId: string) {
    for (const [token, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(token);
    }
  }

  async validate(token?: string) {
    if (!token) throw new UnauthorizedException('Token manquant');
    const session = this.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      throw new UnauthorizedException('Session expirée');
    }

    this.sessions.set(token, { ...session, expiresAt: Date.now() + SESSION_DURATION });

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user) throw new UnauthorizedException('Utilisateur introuvable');
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Compte indisponible');
    }
    if (session.temporaryPasswordLogin && user.mustChangePassword &&
      (!user.temporaryPasswordExpiresAt || user.temporaryPasswordExpiresAt <= new Date())) {
      this.sessions.delete(token);
      throw new UnauthorizedException('Le mot de passe temporaire a expiré. Présentez-vous au guichet avec votre CIN.');
    }

    return { authenticated: true, user: this.toUserPayload(user) };
  }

  async changePassword(token: string, currentPassword: string, newPassword: string) {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      throw new UnauthorizedException('Session expirée');
    }
    const cleanCurrentPassword = currentPassword.trim();
    const cleanNewPassword = newPassword.trim();
    if (!cleanNewPassword) throw new UnauthorizedException('Le nouveau mot de passe est requis');
    if (cleanNewPassword.length < 8) throw new UnauthorizedException('Le nouveau mot de passe doit contenir au moins 8 caractères');
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user?.passwordHash) throw new UnauthorizedException('Utilisateur introuvable');
    if (session.temporaryPasswordLogin) {
      if (!user.mustChangePassword || !user.temporaryPasswordExpiresAt || user.temporaryPasswordExpiresAt <= new Date()) {
        throw new UnauthorizedException('Le mot de passe temporaire a expiré. Présentez-vous au guichet avec votre CIN.');
      }
    } else {
      if (!cleanCurrentPassword || !(await this.verifyPassword(cleanCurrentPassword, user.passwordHash))) {
        throw new UnauthorizedException('L’ancien mot de passe est incorrect');
      }
    }
    const updated = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        ...(session.temporaryPasswordLogin ? {
          mustChangePassword: true,
          temporaryPasswordExpiresAt: { gt: new Date() },
          temporaryPasswordUsedAt: { not: null },
        } : {}),
      },
      data: {
        passwordHash: await this.hashPassword(cleanNewPassword),
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        temporaryPasswordUsedAt: null,
      },
    });
    if (updated.count !== 1) throw new UnauthorizedException('Le mot de passe temporaire a expiré ou a déjà été remplacé.');
    this.revokeUserSessions(user.id);
    return { success: true, message: 'Mot de passe modifié. Veuillez vous reconnecter.' };
  }

  async updateProfile(token: string, input: { nom?: string; email?: string; phone?: string; cin?: string }) {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) throw new UnauthorizedException('Session expirée');
    if (session.temporaryPasswordLogin) throw new UnauthorizedException('Changez votre mot de passe avant de modifier votre profil.');
    const email = input.email?.trim().toLowerCase();
    const phone = input.phone?.trim() || null;
    const cin = input.cin?.trim() || null;
    if (!email) throw new UnauthorizedException('L’adresse email est obligatoire');
    if (cin && !/^\d{12}$/.test(cin)) throw new UnauthorizedException('La CIN doit contenir exactement 12 chiffres');
    const duplicate = await this.prisma.user.findFirst({ where: { OR: [{ email }, ...(phone ? [{ phone }] : []), ...(cin ? [{ cin }] : [])], NOT: { id: session.userId } } });
    if (duplicate) throw new UnauthorizedException('Ces informations sont déjà utilisées par un autre compte');
    const user = await this.prisma.user.update({ where: { id: session.userId }, data: { email, nom: input.nom?.trim() || null, phone, cin }, include: { roles: { include: { role: true } } } });
    this.sessions.set(token, { ...session, expiresAt: Date.now() + SESSION_DURATION });
    return { success: true, user: this.toUserPayload(user) };
  }

  async updateLocale(token: string, locale: string) {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) throw new UnauthorizedException('Session expirée');
    if (session.temporaryPasswordLogin) throw new UnauthorizedException('Changez votre mot de passe avant de modifier vos préférences.');
    if (locale !== 'fr' && locale !== 'mg') throw new BadRequestException('La langue doit être le français ou le malagasy.');
    const user = await this.prisma.user.update({
      where: { id: session.userId },
      data: { locale },
      include: { roles: { include: { role: true } } },
    });
    return { success: true, user: this.toUserPayload(user) };
  }

  async requestReactivation(identifier: string, password: string, reason?: string) {
    const cleanIdentifier = identifier.trim();
    const cleanPassword = password.trim();
    if (!cleanIdentifier || !cleanPassword) throw new UnauthorizedException('Identifiant et mot de passe requis');
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: cleanIdentifier, mode: 'insensitive' } },
          { phone: { equals: cleanIdentifier, mode: 'insensitive' } },
          { cin: { equals: cleanIdentifier, mode: 'insensitive' } },
        ],
      },
    });
    if (!user?.passwordHash || !(await this.verifyPassword(cleanPassword, user.passwordHash))) {
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    }
    if (user.status === 'REACTIVATION_REQUESTED') throw new UnauthorizedException('Une demande de réactivation est déjà en cours.');
    if (user.status !== 'DISABLED') throw new UnauthorizedException('Seul un compte désactivé peut demander sa réactivation.');
    const cleanReason = reason?.trim();
    if (cleanReason && cleanReason.length > 1000) throw new UnauthorizedException('Le motif ne peut pas dépasser 1000 caractères.');

    const administrators = await this.prisma.user.findMany({
      where: {
        OR: [
          { role: 'ADMIN' },
          { roles: { some: { role: { name: { in: ['ADMIN', 'SUPERADMIN'] } } } } },
        ],
      },
      select: { id: true, email: true, locale: true },
    });
    const recipients = administrators.filter((admin): admin is typeof admin & { email: string } => Boolean(admin.email));
    if (recipients.length > 0) {
      this.mailer.assertConfigured();
      await Promise.all(recipients.map((admin) => this.mailer.sendReactivationRequestToAdmin(
        admin.email,
        user.nom ?? user.email ?? user.phone ?? 'Un citoyen',
        cleanReason,
        admin.locale,
      )));
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.accountReactivationRequest.create({
        data: { userId: user.id, reason: cleanReason || null },
      });
      const result = await transaction.user.updateMany({
        where: { id: user.id, status: 'DISABLED' },
        data: { status: 'REACTIVATION_REQUESTED' },
      });
      if (result.count !== 1) throw new UnauthorizedException('Le statut du compte a changé. Actualisez la page et réessayez.');
      if (administrators.length > 0) {
        await transaction.notification.createMany({
          data: administrators.map(({ id }) => ({
            userId: id,
            channel: 'PUSH',
            title: 'Demande de réactivation de compte',
            message: `${user.nom ?? user.email ?? user.phone ?? 'Un citoyen'} demande la réactivation de son compte.`,
            metadata: { type: 'REACTIVATION_REQUESTED', userId: user.id },
          })),
        });
      }
    });
    return { success: true, message: 'Demande de réactivation transmise à l’administration.' };
  }

  private async findPasswordResetUser(identifierInput: string) {
    const identifier = identifierInput.trim();
    if (!identifier) throw new UnauthorizedException('Saisissez votre email, votre numéro de téléphone ou votre CIN.');
    if (identifier.includes('@')) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) throw new UnauthorizedException('Saisissez une adresse email valide.');
      return this.prisma.user.findFirst({ where: { email: { equals: identifier.toLowerCase(), mode: 'insensitive' } } });
    }
    if (/^\d{12}$/.test(identifier)) {
      return this.prisma.user.findFirst({ where: { cin: identifier } });
    }
    return this.prisma.user.findFirst({ where: { phone: { equals: identifier, mode: 'insensitive' } } });
  }

  async requestPasswordReset(identifierInput: string, channel: 'EMAIL' | 'SMS' | 'CIN') {
    const identifier = identifierInput.trim();
    if (!identifier) throw new UnauthorizedException('Saisissez votre identifiant.');
    if (channel === 'SMS') {
      throw new ServiceUnavailableException('Le service de réinitialisation par SMS n’est pas disponible pour le moment.');
    }
    if (channel === 'EMAIL' && !identifier.includes('@')) {
      throw new UnauthorizedException('Saisissez une adresse email valide.');
    }
    if (channel === 'CIN' && !/^\d{12}$/.test(identifier)) {
      throw new UnauthorizedException('La CIN doit contenir exactement 12 chiffres.');
    }

    const user = await this.findPasswordResetUser(identifier);
    const isEmail = channel === 'EMAIL';
    if (!user || (channel === 'CIN' && user.role !== 'CITIZEN')) {
      throw new UnauthorizedException('Aucun compte n’est associé à ces informations.');
    }

    if (channel === 'CIN') {
      if (!user.cin) throw new UnauthorizedException('Aucune CIN n’est associée à ce compte.');
      const existing = await this.prisma.passwordResetRequest.findFirst({
        where: { userId: user.id, status: 'PASSWORD_RESET_REQUESTED' },
        select: { id: true },
      });
      if (!existing) {
        await this.prisma.$transaction(async (transaction) => {
          const request = await transaction.passwordResetRequest.create({ data: { userId: user.id } });
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
                title: 'Demande de réinitialisation par CIN',
                message: `Nouvelle demande de réinitialisation par CIN pour ${user.nom?.trim() || 'un citoyen'}. Vérification de la CIN originale requise au guichet.`,
                metadata: { type: 'CITIZEN_PASSWORD_RESET_CIN_REQUESTED', userId: user.id, requestId: request.id },
              })),
            });
          }
        });
      }
      await this.prisma.passwordResetOtp.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return {
        success: true,
        requiresOtp: false,
        channel: 'CIN',
        message: 'Votre demande est enregistrée. Présentez-vous au guichet avec votre CIN originale pour vérifier votre identité et réinitialiser votre mot de passe.',
      };
    }
    if (!isEmail || !user.email?.trim()) throw new UnauthorizedException('Aucune adresse email n’est associée à ce compte.');
    const email = user.email.trim();

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otp = await this.prisma.passwordResetOtp.create({
      data: {
        userId: user.id,
        codeHash: createHash('sha256').update(code).digest('hex'),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    await this.prisma.passwordResetOtp.updateMany({
      where: { userId: user.id, id: { not: otp.id }, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    try {
      await this.mailer.sendPasswordResetOtp(email, code, user.locale);
    } catch (error) {
      await this.prisma.passwordResetOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
      this.logger.error('Failed to send password reset code', error instanceof Error ? error.stack : String(error));
      throw new ServiceUnavailableException('Le service d’envoi du code est momentanément inaccessible. Vérifiez votre connexion Internet puis réessayez.');
    }
    return { success: true, requiresOtp: true, channel: 'EMAIL', message: 'Un code de vérification a été envoyé à votre adresse email.' };
  }

  async resetPassword(identifierInput: string, codeInput: string, passwordInput: string) {
    const identifier = identifierInput.trim();
    const code = codeInput.trim();
    const password = passwordInput.trim();
    if (!/^\d{6}$/.test(code)) throw new UnauthorizedException('Le code OTP doit contenir 6 chiffres.');
    if (password.length < 8) throw new UnauthorizedException('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    const user = await this.findPasswordResetUser(identifier);
    if (!user || (!identifier.includes('@') && user.role !== 'CITIZEN') || !user.email) {
      throw new UnauthorizedException('Aucun compte associé à ces informations.');
    }
    const otp = await this.prisma.passwordResetOtp.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt <= new Date()) throw new UnauthorizedException('Le code OTP a expiré. Demandez un nouveau code.');
    if (otp.attempts >= 5) throw new UnauthorizedException('Trop de codes incorrects. Demandez un nouveau code.');
    const providedHash = createHash('sha256').update(code).digest();
    const expectedHash = Buffer.from(otp.codeHash, 'hex');
    if (providedHash.length !== expectedHash.length || !timingSafeEqual(providedHash, expectedHash)) {
      const attempt = await this.prisma.passwordResetOtp.updateMany({
        where: { id: otp.id, consumedAt: null, attempts: { lt: 5 } },
        data: { attempts: { increment: 1 } },
      });
      if (attempt.count !== 1) throw new UnauthorizedException('Trop de codes incorrects. Demandez un nouveau code.');
      throw new UnauthorizedException('Le code OTP est incorrect.');
    }
    const passwordHash = await this.hashPassword(password);
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetOtp.updateMany({
        where: { id: otp.id, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new UnauthorizedException('Le code OTP a expiré ou a déjà été utilisé. Demandez un nouveau code.');
      await transaction.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          temporaryPasswordExpiresAt: null,
          temporaryPasswordUsedAt: null,
        },
      });
    });
    this.revokeUserSessions(user.id);
    return { success: true, message: 'Mot de passe modifié. Vous pouvez vous connecter.' };
  }

  getUserByToken(token?: string) {
    if (!token) return undefined;
    const session = this.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return undefined;
    }
    return session.userId;
  }
}