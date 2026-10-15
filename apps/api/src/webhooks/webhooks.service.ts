import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { WebhookDeliveryDto, WebhookEndpointDto, WebhookEndpointInput, WebhookEvent } from '@valorize/shared';
import { Job, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { CryptoService } from '../common/crypto.service';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

export const WEBHOOK_QUEUE = 'webhooks';
const MAX_ATTEMPTS = 8; // ~ 1s, 2s, 4s … ≈ 4 min en total con backoff exponencial base 2s
const TIMEOUT_MS = 10_000;

interface DeliveryJob {
  deliveryId: string;
}

/**
 * Webhooks salientes firmados.
 *
 * Cabeceras enviadas:
 *   X-Valorize-Event:     booking.checked_in
 *   X-Valorize-Delivery:  <uuid de la entrega>
 *   X-Valorize-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>
 *
 * El receptor debe verificar la firma y rechazar timestamps con más de 5 minutos de desfase.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue<DeliveryJob>,
  ) {}

  /** Publica un evento a todos los endpoints suscritos. Nunca lanza: los webhooks no bloquean el negocio. */
  async emit(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
    try {
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { active: true, events: { has: event } },
        select: { id: true },
      });
      if (!endpoints.length) return;
      const eventId = randomUUID();
      const payload = { id: eventId, type: event, createdAt: new Date().toISOString(), data };
      for (const ep of endpoints) {
        const d = await this.prisma.webhookDelivery.create({
          data: { endpointId: ep.id, eventId, event, payload: payload as Prisma.InputJsonValue },
        });
        await this.enqueue(d.id);
      }
    } catch (e) {
      this.logger.error(`No se pudo emitir ${event}`, e as Error);
    }
  }

  private enqueue(deliveryId: string) {
    return this.queue.add(
      'deliver',
      { deliveryId },
      {
        jobId: `${deliveryId}-${Date.now()}`,
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }

  /** Ejecuta un intento de entrega. Lanza si falla, para que BullMQ reintente. */
  async deliver(deliveryId: string, attempt: number, isLastAttempt: boolean): Promise<void> {
    const d = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { endpoint: true } });
    if (!d || d.status === 'SUCCEEDED') return;
    if (!d.endpoint.active) {
      await this.prisma.webhookDelivery.update({
        where: { id: d.id },
        data: { status: 'FAILED', error: 'Endpoint desactivado' },
      });
      return;
    }

    const body = JSON.stringify(d.payload);
    const ts = Math.floor(Date.now() / 1000);
    const secret = this.crypto.decrypt(d.endpoint.secretEnc);
    const signature = this.crypto.hmac(secret, `${ts}.${body}`);

    let responseCode: number | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(d.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Valorize-Webhooks/1.0',
          'X-Valorize-Event': d.event,
          'X-Valorize-Delivery': d.id,
          'X-Valorize-Signature': `t=${ts},v1=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'manual',
      });
      responseCode = res.status;
      if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
    } catch (e) {
      error = (e as Error).message.slice(0, 480);
    }

    const ok = error === null;
    await this.prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        attempts: attempt,
        responseCode,
        error,
        status: ok ? 'SUCCEEDED' : isLastAttempt ? 'FAILED' : 'PENDING',
        deliveredAt: ok ? new Date() : null,
        nextAttemptAt: ok || isLastAttempt ? null : new Date(Date.now() + 2000 * 2 ** attempt),
      },
    });
    if (!ok) throw new Error(error!);
  }

  // ─────────── Administración ───────────

  async list(): Promise<WebhookEndpointDto[]> {
    const eps = await this.prisma.webhookEndpoint.findMany({
      orderBy: { createdAt: 'desc' },
      include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return eps.map((e) => this.toDto(e, e.deliveries[0]));
  }

  async create(input: WebhookEndpointInput): Promise<WebhookEndpointDto & { secret: string }> {
    const secret = `whsec_${this.crypto.randomToken(24)}`;
    const ep = await this.prisma.webhookEndpoint.create({
      data: { ...input, secretEnc: this.crypto.encrypt(secret) },
    });
    // El secreto solo se muestra completo en la creación o al rotarlo.
    return { ...this.toDto(ep), secret };
  }

  async update(id: string, input: Partial<WebhookEndpointInput>): Promise<WebhookEndpointDto> {
    const ep = await this.prisma.webhookEndpoint.update({ where: { id }, data: input });
    return this.toDto(ep);
  }

  async rotateSecret(id: string): Promise<{ secret: string }> {
    const secret = `whsec_${this.crypto.randomToken(24)}`;
    await this.prisma.webhookEndpoint.update({ where: { id }, data: { secretEnc: this.crypto.encrypt(secret) } });
    return { secret };
  }

  async remove(id: string) {
    await this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  async sendTest(id: string) {
    const ep = await this.prisma.webhookEndpoint.findUnique({ where: { id } });
    if (!ep) throw Errors.notFound('Endpoint');
    const eventId = randomUUID();
    const d = await this.prisma.webhookDelivery.create({
      data: {
        endpointId: id,
        eventId,
        event: 'webhook.test',
        payload: { id: eventId, type: 'webhook.test', createdAt: new Date().toISOString(), data: { ping: true } },
      },
    });
    await this.enqueue(d.id);
    return { deliveryId: d.id };
  }

  async deliveries(endpointId: string, page: number, pageSize: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.webhookDelivery.findMany({
        where: { endpointId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.webhookDelivery.count({ where: { endpointId } }),
    ]);
    return {
      items: items.map(
        (d): WebhookDeliveryDto => ({
          id: d.id,
          event: d.event,
          status: d.status,
          attempts: d.attempts,
          responseCode: d.responseCode,
          error: d.error,
          createdAt: d.createdAt.toISOString(),
          deliveredAt: d.deliveredAt?.toISOString() ?? null,
        }),
      ),
      total,
      page,
      pageSize,
    };
  }

  async redeliver(deliveryId: string) {
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'PENDING', error: null, attempts: 0 },
    });
    await this.enqueue(deliveryId);
  }

  private toDto(
    e: { id: string; url: string; description: string | null; events: string[]; active: boolean; secretEnc: string; createdAt: Date },
    last?: { status: string; responseCode: number | null; createdAt: Date },
  ): WebhookEndpointDto {
    let preview = 'whsec_••••';
    try {
      preview = `whsec_••••${this.crypto.decrypt(e.secretEnc).slice(-4)}`;
    } catch {
      /* noop */
    }
    return {
      id: e.id,
      url: e.url,
      description: e.description,
      events: e.events,
      active: e.active,
      secretPreview: preview,
      createdAt: e.createdAt.toISOString(),
      lastDelivery: last
        ? { status: last.status, responseCode: last.responseCode, createdAt: last.createdAt.toISOString() }
        : null,
    };
  }
}

@Processor(WEBHOOK_QUEUE, { concurrency: 10 })
export class WebhookProcessor extends WorkerHost {
  constructor(private readonly webhooks: WebhooksService) {
    super();
  }

  async process(job: Job<DeliveryJob>): Promise<void> {
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    await this.webhooks.deliver(job.data.deliveryId, attempt, attempt >= maxAttempts);
  }
}
