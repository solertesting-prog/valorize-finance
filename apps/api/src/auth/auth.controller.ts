import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  confirmVerificationSchema,
  forgotPasswordSchema,
  loginSchema,
  mfaDisableSchema,
  mfaEnableSchema,
  mfaLoginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  sendVerificationSchema,
} from '@valorize/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentUser, Public, ReqMeta, RequestMeta } from '../common/auth.decorators';
import { Errors } from '../common/errors';
import { ZodPipe } from '../common/zod-validation.pipe';
import { ENV, Env } from '../config/env';
import { AuthService } from './auth.service';
import { IssuedTokens } from './tokens.service';

const REFRESH_COOKIE = 'vf_rt';
const AUTH_LIMIT = { default: { limit: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10), ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('register')
  async register(
    @Body(new ZodPipe(registerSchema)) body: z.infer<typeof registerSchema>,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.auth.register(body, meta);
    this.setRefreshCookie(res, body.client, r.tokens);
    return r.body;
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.auth.login(body.email, body.password, body.client, meta);
    if (r.tokens) this.setRefreshCookie(res, body.client, r.tokens);
    return r.result;
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('login/mfa')
  @HttpCode(200)
  async loginMfa(
    @Body(new ZodPipe(mfaLoginSchema)) body: z.infer<typeof mfaLoginSchema>,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.auth.loginMfa(body.challengeToken, body.code, body.client, meta);
    this.setRefreshCookie(res, body.client, r.tokens);
    return r.result;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>,
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = body.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (!token) throw Errors.unauthorized('Sin sesión');
    try {
      const r = await this.auth.refresh(token, body.client, meta);
      this.setRefreshCookie(res, body.client, r.tokens);
      return r.body;
    } catch (e) {
      if (body.client === 'web') this.clearRefreshCookie(res);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() body: { refreshToken?: string },
    @Req() req: Request & { user?: AuthUser },
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rt = body?.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? null;
    await this.auth.logout(req.user?.sessionId ?? null, rt, req.user?.id ?? null, meta);
    this.clearRefreshCookie(res);
  }

  // ─────────── Verificación de email / teléfono ───────────

  @ApiBearerAuth()
  @Throttle(AUTH_LIMIT)
  @Post('verify/send')
  @HttpCode(200)
  sendVerification(@CurrentUser() u: AuthUser, @Body(new ZodPipe(sendVerificationSchema)) b: z.infer<typeof sendVerificationSchema>) {
    return this.auth.sendVerification(u.id, b.channel);
  }

  @ApiBearerAuth()
  @Throttle(AUTH_LIMIT)
  @Post('verify/confirm')
  @HttpCode(200)
  confirmVerification(
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(confirmVerificationSchema)) b: z.infer<typeof confirmVerificationSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.auth.confirmVerification(u.id, b.channel, b.code, meta);
  }

  // ─────────── Contraseña ───────────

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('password/forgot')
  @HttpCode(202)
  async forgot(@Body(new ZodPipe(forgotPasswordSchema)) b: z.infer<typeof forgotPasswordSchema>, @ReqMeta() meta: RequestMeta) {
    await this.auth.forgotPassword(b.email, meta);
    return { message: 'Si existe una cuenta con ese email, recibirás un código.' };
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('password/reset')
  @HttpCode(204)
  reset(@Body(new ZodPipe(resetPasswordSchema)) b: z.infer<typeof resetPasswordSchema>, @ReqMeta() meta: RequestMeta) {
    return this.auth.resetPassword(b.email, b.code, b.password, meta);
  }

  @ApiBearerAuth()
  @Throttle(AUTH_LIMIT)
  @Post('password/change')
  @HttpCode(204)
  change(
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(changePasswordSchema)) b: z.infer<typeof changePasswordSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.auth.changePassword(u.id, u.sessionId, b.currentPassword, b.newPassword, meta);
  }

  // ─────────── MFA ───────────

  @ApiBearerAuth()
  @Post('mfa/setup')
  @HttpCode(200)
  mfaSetup(@CurrentUser() u: AuthUser) {
    return this.auth.mfaSetup(u.id);
  }

  @ApiBearerAuth()
  @Throttle(AUTH_LIMIT)
  @Post('mfa/enable')
  @HttpCode(200)
  mfaEnable(@CurrentUser() u: AuthUser, @Body(new ZodPipe(mfaEnableSchema)) b: z.infer<typeof mfaEnableSchema>, @ReqMeta() meta: RequestMeta) {
    return this.auth.mfaEnable(u.id, b.code, meta);
  }

  @ApiBearerAuth()
  @Throttle(AUTH_LIMIT)
  @Post('mfa/disable')
  @HttpCode(204)
  mfaDisable(@CurrentUser() u: AuthUser, @Body(new ZodPipe(mfaDisableSchema)) b: z.infer<typeof mfaDisableSchema>, @ReqMeta() meta: RequestMeta) {
    return this.auth.mfaDisable(u.id, b.password, b.code, meta);
  }

  // ─────────── Sesiones ───────────

  @ApiBearerAuth()
  @Get('sessions')
  sessions(@CurrentUser() u: AuthUser) {
    return this.auth.sessions(u.id, u.sessionId);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @HttpCode(204)
  revokeSession(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.auth.revokeSession(u.id, id, meta);
  }

  private setRefreshCookie(res: Response, client: string, t: IssuedTokens) {
    if (client !== 'web') return;
    res.cookie(REFRESH_COOKIE, t.refreshToken, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: t.refreshTokenExpiresAt,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }
}
