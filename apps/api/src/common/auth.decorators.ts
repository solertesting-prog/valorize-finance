import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  role: Role;
  sessionId: string;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  /** Cliente que hace la petición (cabecera X-Client): la app móvil envía "mobile". */
  client?: 'web' | 'mobile';
}

export type AppRequest = Request & { user?: AuthUser; id?: string };

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return req.user!;
});

export function metaFromRequest(req: AppRequest): RequestMeta {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: typeof ua === 'string' ? ua.slice(0, 300) : null,
    requestId: req.id ?? null,
    client: req.headers['x-client'] === 'mobile' ? 'mobile' : 'web',
  };
}

export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta =>
  metaFromRequest(ctx.switchToHttp().getRequest<AppRequest>()),
);
