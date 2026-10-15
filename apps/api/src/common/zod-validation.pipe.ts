import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';

/** Valida body/query con un schema zod compartido (@valorize/shared). */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  // La entrada puede diferir de la salida (defaults, coerce, transform).
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: result.error.issues[0]?.message ?? 'Datos no válidos',
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
