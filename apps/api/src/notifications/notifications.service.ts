import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import type { NotificationDto } from '@valorize/shared';
import { PrismaService } from '../common/prisma.service';
import { MailerService, PushService } from '../messaging/messaging.service';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Envía también por email (con botón opcional). */
  email?: { cta?: { label: string; url: string } } | false;
  push?: boolean;
}

/** Bandeja de notificaciones in-app + entrega por push y email. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly mailer: MailerService,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    const n = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    // Canales externos en segundo plano: un fallo no afecta a la operación.
    void this.deliverExternal(input, n.id).catch((e) => this.logger.warn(`Entrega externa fallida: ${e.message}`));
  }

  private async deliverExternal(input: NotifyInput, notificationId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, status: true, devices: { select: { token: true } } },
    });
    if (!user || user.status !== 'ACTIVE') return;

    if (input.push !== false && user.devices.length) {
      const invalid = await this.push.send({
        tokens: user.devices.map((d) => d.token),
        title: input.title,
        body: input.body,
        data: { ...input.data, notificationId, type: input.type },
      });
      if (invalid.length) await this.prisma.pushDevice.deleteMany({ where: { token: { in: invalid } } });
    }

    if (input.email) {
      await this.mailer.send({ to: user.email, subject: input.title, text: input.body, cta: input.email.cta });
    }
  }

  async list(userId: string, page: number, pageSize: number, unreadOnly = false) {
    const where: Prisma.NotificationWhereInput = { userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items: items.map(toDto), total, page, pageSize, unread };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }

  async remove(userId: string, id: string) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
  }

  async registerDevice(userId: string, token: string, platform: 'ios' | 'android' | 'web') {
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
    });
  }

  async unregisterDevice(userId: string, token: string) {
    await this.prisma.pushDevice.deleteMany({ where: { userId, token } });
  }
}

function toDto(n: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: (n.data as Record<string, unknown>) ?? null,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}
