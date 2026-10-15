import { HttpException, HttpStatus } from '@nestjs/common';

/** Error de dominio con código estable que los clientes pueden traducir. */
export class AppError extends HttpException {
  constructor(code: string, message: string, status: HttpStatus = HttpStatus.BAD_REQUEST, details?: unknown) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  notFound: (what = 'Recurso') => new AppError('NOT_FOUND', `${what} no encontrado`, HttpStatus.NOT_FOUND),
  forbidden: (msg = 'No tienes permiso para esta acción') => new AppError('FORBIDDEN', msg, HttpStatus.FORBIDDEN),
  unauthorized: (msg = 'Sesión no válida') => new AppError('UNAUTHORIZED', msg, HttpStatus.UNAUTHORIZED),
  conflict: (code: string, msg: string) => new AppError(code, msg, HttpStatus.CONFLICT),
  unprocessable: (code: string, msg: string, details?: unknown) =>
    new AppError(code, msg, HttpStatus.UNPROCESSABLE_ENTITY, details),
  tooMany: (msg = 'Demasiados intentos, inténtalo más tarde') =>
    new AppError('TOO_MANY_REQUESTS', msg, HttpStatus.TOO_MANY_REQUESTS),
};
