import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { Public } from '../common/auth.decorators';
import { Errors } from '../common/errors';
import { ZodPipe } from '../common/zod-validation.pipe';
import { ReceiptService } from './receipt.service';

const verifyQuery = z.object({
  reference: z.string().trim().min(6).max(20),
  code: z.string().trim().min(12).max(20),
});

/** Descarga del justificante por enlace firmado y comprobación pública de autenticidad. */
@ApiTags('receipts')
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptService) {}

  /** ¿Es auténtico este justificante? (referencia + código impreso). Limitado para evitar adivinar códigos. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('verify')
  verify(@Query(new ZodPipe(verifyQuery)) q: z.infer<typeof verifyQuery>) {
    return this.receipts.verify(q.reference, q.code);
  }

  @Public()
  @Get(':token')
  async download(@Param('token') token: string, @Res() res: Response) {
    const id = this.receipts.readLink(token);
    if (!id) throw Errors.unprocessable('LINK_EXPIRED', 'El enlace ha caducado. Vuelve a pulsar «Descargar justificante».');
    const { filename, data } = await this.receipts.pdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', String(data.length));
    res.end(data);
  }
}
