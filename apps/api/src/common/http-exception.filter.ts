import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';

/** Normaliza todos los errores a { statusCode, code, message, details, requestId }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Error interno del servidor';
    let details: unknown;

    if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = 'TOO_MANY_REQUESTS';
      message = 'Demasiadas peticiones. Espera unos segundos.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else {
        const b = body as { code?: string; message?: string | string[]; details?: unknown };
        code = b.code ?? HttpStatus[status] ?? 'HTTP_ERROR';
        message = Array.isArray(b.message) ? b.message.join(', ') : (b.message ?? message);
        details = b.details;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE';
        message = 'Ya existe un registro con esos datos';
        details = exception.meta;
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Recurso no encontrado';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        code = 'IN_USE';
        message = 'El recurso está en uso y no puede eliminarse';
      }
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} [${req.id}]`, exception instanceof Error ? exception.stack : exception);
    }

    res.status(status).json({ statusCode: status, code, message, details, requestId: req.id });
  }
}
