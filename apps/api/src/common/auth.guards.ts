import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { AppRequest, IS_PUBLIC, ROLES } from './auth.decorators';
import { Errors } from './errors';
import { PrismaService } from './prisma.service';

interface AccessPayload {
  sub: string;
  role: Role;
  sid: string;
  typ: 'access';
}

/**
 * Guard global: exige access token JWT salvo en rutas @Public().
 * Comprueba además que la sesión siga viva (revocación inmediata) y que el usuario esté activo.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      if (isPublic) return true;
      throw Errors.unauthorized('Necesitas iniciar sesión');
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token);
      if (payload.typ !== 'access') throw new Error('typ');
    } catch {
      if (isPublic) return true;
      throw Errors.unauthorized('Sesión caducada');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { revokedAt: true, expiresAt: true, user: { select: { status: true, role: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') {
      if (isPublic) return true;
      throw Errors.unauthorized('Sesión cerrada');
    }

    // El rol se toma de BD: un cambio de rol surte efecto sin esperar a que caduque el token.
    req.user = { id: payload.sub, role: session.user.role, sessionId: payload.sid };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user || !roles.includes(req.user.role)) throw Errors.forbidden();
    return true;
  }
}
