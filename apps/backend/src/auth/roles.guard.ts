import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleName } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: { roles?: RoleName[]; role?: string } }>();
    if (request.user?.roles?.some((role) => requiredRoles.includes(role))) return true;
    if (request.user?.role === 'ADMIN' && requiredRoles.includes('ADMIN')) return true;

    throw new ForbiddenException('Permissions insuffisantes');
  }
}