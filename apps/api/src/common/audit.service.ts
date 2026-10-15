import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestMeta } from './auth.decorators';
import { PrismaService } from './prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string; // p. ej. "booking.check_in", "auth.login_failed"
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  meta?: RequestMeta;
}

/** Trazabilidad: cada acceso, escaneo y cambio de estado queda registrado (tabla append-only). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: entry.meta?.ip,
          userAgent: entry.meta?.userAgent,
          requestId: entry.meta?.requestId,
        },
      });
    } catch (e) {
      // La auditoría nunca debe tumbar la operación principal si va fuera de transacción.
      if (tx) throw e;
      this.logger.error(`No se pudo registrar auditoría ${entry.action}`, e as Error);
    }
  }
}
