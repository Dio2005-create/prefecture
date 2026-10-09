import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, createHash, randomInt, scrypt as deriveKey, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import type { RoleName } from '@prisma/client';

const SESSION_DURATION = 5 * 60 * 1000;
const scrypt = promisify(deriveKey);

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, { expiresAt: number; userId: string }>();

  constructor(private readonly prisma: PrismaService) {}

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

  private toUserPayload(user: { id: string; email: string; nom: string | null; phone: string | null; cin: string | null; role: string; locale: string; status: string; isTwoFactorEnabled: boolean; lastLoginAt: Date | null; roles?: Array<{ role: { name: RoleName } }> }) {
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
    };
  }

  async register(input: { email: string; password: string; phone?: string; cin?: string; nom?: string; isAdult?: boolean }) {
    const email = input.email.trim();
    const password = input.password.trim();
    if (!email || !password) throw new UnauthorizedException('Email et mot de passe requis');
    if (typeof input.isAdult !== 'boolean') throw new UnauthorizedException('Veuillez indiquer si vous avez 18 ans ou plus');
    const cin = input.cin?.trim();
    if (input.isAdult && !cin) throw new UnauthorizedException('La CIN est obligatoire à partir de 18 ans');
    if (input.isAdult && !/^\d{12}$/.test(cin ?? '')) throw new UnauthorizedException('La CIN doit contenir exactement 12 chiffres');

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: email, mode: 'insensitive' } },
          ...(input.phone ? [{ phone: { equals: input.phone, mode: 'insensitive' as const } }] : []),
          ...(input.isAdult && cin ? [{ cin: { equals: cin, mode: 'insensitive' as const } }] : []),
        ],
      },
    });

    if (existing) throw new UnauthorizedException('Un compte existe déjà avec ces informations');

    const user = await this.prisma.user.create({
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

    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, { expiresAt: Date.now() + SESSION_DURATION, userId: user.id });

    const userWithRoles = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { roles: { include: { role: true } } },
    });
    return { token, expiresIn: SESSION_DURATION, user: this.toUserPayload(userWithRoles) };
  }

  async login(identifier: string, password: string) {
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
    });

    if (!user || !user.passwordHash) throw new UnauthorizedException('Identifiants invalides');
    if (!(await this.verifyPassword(cleanPassword, user.passwordHash))) throw new UnauthorizedException('Identifiants invalides');
    if (user.status === 'INACTIVE') {
      throw new UnauthorizedException('Votre compte est désactivé. Veuillez contacter l’administration.');
    }
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Compte indisponible');

    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, { expiresAt: Date.now() + SESSION_DURATION, userId: user.id });

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

    this.sessions.set(token, { expiresAt: Date.now() + SESSION_DURATION, userId: session.userId });

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user) throw new UnauthorizedException('Utilisateur introuvable');
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Compte indisponible');
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
    if (!cleanCurrentPassword || !cleanNewPassword) throw new UnauthorizedException('Les deux mots de passe sont requis');
    if (cleanNewPassword.length < 8) throw new UnauthorizedException('Le nouveau mot de passe doit contenir au moins 8 caractères');
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user?.passwordHash || !(await this.verifyPassword(cleanCurrentPassword, user.passwordHash))) {
      throw new UnauthorizedException('L’ancien mot de passe est incorrect');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await this.hashPassword(cleanNewPassword) } });
    this.sessions.delete(token);
    return { success: true, message: 'Mot de passe modifié. Veuillez vous reconnecter.' };
  }

  async updateProfile(token: string, input: { nom?: string; email?: string; phone?: string; cin?: string }) {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) throw new UnauthorizedException('Session expirée');
    const email = input.email?.trim().toLowerCase();
    const phone = input.phone?.trim() || null;
    const cin = input.cin?.trim() || null;
    if (!email) throw new UnauthorizedException('L’adresse email est obligatoire');
    if (cin && !/^\d{12}$/.test(cin)) throw new UnauthorizedException('La CIN doit contenir exactement 12 chiffres');
    const duplicate = await this.prisma.user.findFirst({ where: { OR: [{ email }, ...(phone ? [{ phone }] : []), ...(cin ? [{ cin }] : [])], NOT: { id: session.userId } } });
    if (duplicate) throw new UnauthorizedException('Ces informations sont déjà utilisées par un autre compte');
    const user = await this.prisma.user.update({ where: { id: session.userId }, data: { email, nom: input.nom?.trim() || null, phone, cin }, include: { roles: { include: { role: true } } } });
    this.sessions.set(token, { expiresAt: Date.now() + SESSION_DURATION, userId: session.userId });
    return { success: true, user: this.toUserPayload(user) };
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