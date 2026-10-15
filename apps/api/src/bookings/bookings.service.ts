import { Inject, Injectable } from '@nestjs/common';
import { BookingStatus, NotificationType, Prisma, Role } from '@prisma/client';
import type { ApproveBookingInput, BookingDto, BookingEventDto, BookingQrDto, CreateBookingInput, ScanResultDto } from '@valorize/shared';
import { ACTIVE_BOOKING_STATUSES, BOOKING_TRANSITIONS, formatDateTime, WebhookEvent } from '@valorize/shared';
import { DateTime } from 'luxon';
import { AuditService } from '../common/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { ENV, Env } from '../config/env';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AvailabilityService } from './availability.service';
import { bookingInclude, BookingFull, BookingRules, toBookingDto } from './booking.mapper';
import { ExchangeService } from './exchange.service';
import { QrService } from './qr.service';

export interface Actor {
  id: string;
  role: Role;
}

const STATUS_EVENT: Partial<Record<BookingStatus, WebhookEvent>> = {
  CONFIRMED: WebhookEvent.BOOKING_CONFIRMED,
  CANCELLED: WebhookEvent.BOOKING_CANCELLED,
  CHECKED_IN: WebhookEvent.BOOKING_CHECKED_IN,
  COMPLETED: WebhookEvent.BOOKING_COMPLETED,
  NO_SHOW: WebhookEvent.BOOKING_NO_SHOW,
  REJECTED: WebhookEvent.BOOKING_REJECTED,
};

@Injectable()
export class BookingsService {
  readonly rules: BookingRules;

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly qr: QrService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
    private readonly exchange: ExchangeService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.rules = { cancelCutoffMin: env.CANCEL_CUTOFF_MIN, maxReschedules: env.MAX_RESCHEDULES };
  }

  dto(b: BookingFull, includeCustomer = false): BookingDto {
    return toBookingDto(b, this.rules, { includeCustomer });
  }

  // ─────────────────────────── Cliente ───────────────────────────

  async create(userId: string, input: CreateBookingInput, meta: RequestMeta): Promise<BookingDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { kycProfile: true },
    });
    if (!user.emailVerifiedAt) {
      throw Errors.unprocessable('EMAIL_NOT_VERIFIED', 'Verifica tu email antes de reservar');
    }

    const service = await this.prisma.service.findUniqueOrThrow({ where: { id: input.serviceId } });
    if (service.requiresKyc) {
      const kyc = user.kycProfile;
      if (!kyc || kyc.status !== 'APPROVED' || kyc.level < service.requiredKycLevel) {
        throw Errors.unprocessable('KYC_REQUIRED', 'Este servicio requiere verificar tu identidad. Complétalo desde tu perfil.');
      }
      if (kyc.expiresAt && kyc.expiresAt < new Date()) {
        throw Errors.unprocessable('KYC_EXPIRED', 'Tu verificación de identidad ha caducado. Actualízala desde tu perfil.');
      }
    }
    // Operación de cambio: validación de importes y auditoría de la wallet (antes de bloquear la agenda).
    const exchange = await this.exchange.prepare(userId, service, user.kycProfile, input.exchange, meta);
    const initialStatus: BookingStatus = service.requiresApproval ? 'PENDING' : 'CONFIRMED';

    const booking = await this.prisma.$transaction(
      async (tx) => {
        // Serializa las reservas de una misma ubicación: evita overbooking con peticiones concurrentes.
        await lockLocation(tx, input.locationId);

        const active = await tx.booking.count({
          where: { userId, status: { in: ACTIVE_BOOKING_STATUSES }, startsAt: { gt: new Date() } },
        });
        if (active >= this.env.MAX_ACTIVE_BOOKINGS_PER_USER) {
          throw Errors.unprocessable(
            'TOO_MANY_BOOKINGS',
            `Puedes tener como máximo ${this.env.MAX_ACTIVE_BOOKINGS_PER_USER} citas pendientes`,
          );
        }

        const slot = await this.availability.assertSlotAvailable(tx, input.locationId, input.serviceId, input.startsAt);
        await this.assertNoOverlapForUser(tx, userId, slot.startsAt, slot.endsAt);
        if (exchange) await this.exchange.assertLimits(tx, userId, slot.startsAt, exchange.amount);

        const reference = await nextReference(tx, slot.startsAt);
        const created = await tx.booking.create({
          data: {
            reference,
            userId,
            locationId: input.locationId,
            serviceId: input.serviceId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            notes: input.notes,
            status: initialStatus,
            qrNonce: this.qr.newNonce(),
            events: {
              create: {
                toStatus: initialStatus,
                actorId: userId,
                note: initialStatus === 'PENDING' ? 'Solicitud enviada, pendiente de aprobación' : 'Reserva creada',
              },
            },
            ...(exchange ? { exchange: { create: exchange } } : {}),
          },
          include: bookingInclude,
        });
        await this.audit.log(
          {
            actorId: userId,
            action: 'booking.created',
            entityType: 'booking',
            entityId: created.id,
            metadata: { reference, status: initialStatus, exchange: exchange ? { ...exchange } : undefined },
            meta,
          },
          tx,
        );
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 },
    );

    const when = formatDateTime(booking.startsAt.toISOString(), booking.location.timezone);
    if (booking.status === 'PENDING') {
      void this.notifications.notify({
        userId,
        type: 'BOOKING_REQUESTED',
        title: 'Solicitud recibida',
        body: `Hemos recibido tu solicitud ${booking.reference} para el ${when} en ${booking.location.name}. Te avisaremos en cuanto la revisemos; el QR estará disponible al aprobarla.`,
        data: { bookingId: booking.id },
        email: {},
      });
    } else {
      this.notifyConfirmed(booking);
    }
    void this.webhooks.emit(WebhookEvent.BOOKING_CREATED, webhookPayload(booking));
    return this.dto(booking);
  }

  private notifyConfirmed(booking: BookingFull, approved = false) {
    const when = formatDateTime(booking.startsAt.toISOString(), booking.location.timezone);
    void this.notifications.notify({
      userId: booking.userId,
      type: 'BOOKING_CONFIRMED',
      title: approved ? 'Solicitud aprobada' : 'Reserva confirmada',
      body: `${booking.service.name} en ${booking.location.name}, ${when}. Referencia ${booking.reference}. Muestra tu QR al llegar.`,
      data: { bookingId: booking.id },
      email: { cta: { label: 'Ver mi QR', url: `${this.env.APP_URL}/app/reservas/${booking.id}` } },
    });
  }

  // ─────────────────────────── Aprobación (backoffice) ───────────────────────────

  async pendingApprovals(locationId?: string) {
    const rows = await this.prisma.booking.findMany({
      where: { status: 'PENDING', startsAt: { gt: new Date() }, ...(locationId ? { locationId } : {}) },
      include: bookingInclude,
      orderBy: { startsAt: 'asc' },
      take: 200,
    });
    return rows;
  }

  async approve(actor: Actor, id: string, input: ApproveBookingInput, meta: RequestMeta) {
    const b = await this.findAny(id);
    if (b.status !== 'PENDING') throw Errors.conflict('NOT_PENDING', 'Esta cita no está pendiente de aprobación');
    if (b.startsAt < new Date()) throw Errors.conflict('IN_THE_PAST', 'La cita ya ha pasado; pide al cliente que reserve otra');
    if (b.exchange) {
      const risk = b.exchange.wallet.riskStatus;
      if (risk === 'BLOCKED') throw Errors.conflict('WALLET_BLOCKED', 'La wallet está bloqueada: la solicitud no se puede aprobar');
      if (risk === 'PENDING') throw Errors.conflict('WALLET_NOT_SCREENED', 'La wallet aún no se ha auditado. Lanza la auditoría primero.');
      if (risk === 'REVIEW' && !input.overrideWalletReview) {
        throw Errors.conflict('WALLET_REVIEW', 'La wallet necesita revisión. Revísala o marca la aprobación excepcional.');
      }
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({ where: { id, status: 'PENDING' }, data: { updatedAt: new Date() } });
      if (!count) throw Errors.conflict('STALE_STATE', 'La cita ha cambiado de estado. Recarga e inténtalo de nuevo.');
      if (b.exchange) {
        await tx.exchangeRequest.update({
          where: { id: b.exchange.id },
          data: {
            agreedRate: input.agreedRate ?? undefined,
            fiatAmount: input.fiatAmount ?? undefined,
            feeAmount: input.feeAmount ?? undefined,
            internalNote: input.note ?? undefined,
          },
        });
      }
      const u = await tx.booking.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          approvedAt: new Date(),
          approvedById: actor.id,
          events: {
            create: {
              fromStatus: 'PENDING',
              toStatus: 'CONFIRMED',
              actorId: actor.id,
              note: input.overrideWalletReview ? 'Aprobada con wallet en revisión (excepción)' : 'Aprobada',
            },
          },
        },
        include: bookingInclude,
      });
      await this.audit.log(
        {
          actorId: actor.id,
          action: 'booking.approved',
          entityType: 'booking',
          entityId: id,
          metadata: { overrideWalletReview: input.overrideWalletReview, agreedRate: input.agreedRate, fiatAmount: input.fiatAmount },
          meta,
        },
        tx,
      );
      return u;
    });
    this.notifyConfirmed(updated, true);
    void this.webhooks.emit(WebhookEvent.BOOKING_CONFIRMED, webhookPayload(updated));
    return this.dto(updated, true);
  }

  async reject(actor: Actor, id: string, reason: string, meta: RequestMeta) {
    const b = await this.findAny(id);
    if (b.status !== 'PENDING') throw Errors.conflict('NOT_PENDING', 'Esta cita no está pendiente de aprobación');
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({ where: { id, status: 'PENDING' }, data: { updatedAt: new Date() } });
      if (!count) throw Errors.conflict('STALE_STATE', 'La cita ha cambiado de estado. Recarga e inténtalo de nuevo.');
      const u = await tx.booking.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectReason: reason,
          qrNonce: this.qr.newNonce(),
          events: { create: { fromStatus: 'PENDING', toStatus: 'REJECTED', actorId: actor.id, note: reason } },
        },
        include: bookingInclude,
      });
      await this.audit.log({ actorId: actor.id, action: 'booking.rejected', entityType: 'booking', entityId: id, metadata: { reason }, meta }, tx);
      return u;
    });
    void this.notifications.notify({
      userId: updated.userId,
      type: 'BOOKING_REJECTED',
      title: 'Solicitud no aprobada',
      body: `No hemos podido aprobar tu solicitud ${updated.reference}. Motivo: ${reason}. Puedes hacer una nueva solicitud cuando quieras.`,
      data: { bookingId: updated.id },
      email: {},
    });
    void this.webhooks.emit(WebhookEvent.BOOKING_REJECTED, webhookPayload(updated));
    return this.dto(updated, true);
  }

  /** Datos de liquidación al completar la operación en oficina (tipo, importe en euros, hash). */
  async updateExchangeSettlement(
    actor: Actor,
    id: string,
    input: { txHash?: string; agreedRate?: string; fiatAmount?: string; feeAmount?: string; note?: string },
    meta: RequestMeta,
  ) {
    const b = await this.findAny(id);
    await this.assertStaffLocation(actor, b.locationId);
    if (!b.exchange) throw Errors.unprocessable('NOT_EXCHANGE', 'Esta cita no es una operación de cambio');
    await this.prisma.exchangeRequest.update({
      where: { id: b.exchange.id },
      data: {
        txHash: input.txHash || undefined,
        agreedRate: input.agreedRate ?? undefined,
        fiatAmount: input.fiatAmount ?? undefined,
        feeAmount: input.feeAmount ?? undefined,
        internalNote: input.note ? [b.exchange.internalNote, input.note].filter(Boolean).join('\n') : undefined,
      },
    });
    await this.audit.log({ actorId: actor.id, action: 'exchange.settlement_updated', entityType: 'booking', entityId: id, metadata: input, meta });
    return this.dto(await this.findAny(id), true);
  }

  async listForUser(userId: string, scope: 'upcoming' | 'past' | 'all', page: number, pageSize: number) {
    const now = new Date();
    const where: Prisma.BookingWhereInput = {
      userId,
      ...(scope === 'upcoming'
        ? { endsAt: { gte: now }, status: { in: ACTIVE_BOOKING_STATUSES } }
        : scope === 'past'
          ? { OR: [{ endsAt: { lt: now } }, { status: { notIn: ACTIVE_BOOKING_STATUSES } }] }
          : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        include: bookingInclude,
        orderBy: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.booking.count({ where }),
    ]);
    return { items: items.map((b) => this.dto(b)), total, page, pageSize };
  }

  async getForUser(userId: string, id: string): Promise<BookingDto> {
    return this.dto(await this.findOwned(userId, id));
  }

  async qrForUser(userId: string, id: string): Promise<BookingQrDto> {
    const b = await this.findOwned(userId, id);
    if (b.status === 'PENDING') throw Errors.conflict('QR_PENDING_APPROVAL', 'El QR estará disponible cuando aprobemos tu solicitud');
    if (b.status !== 'CONFIRMED') throw Errors.conflict('QR_UNAVAILABLE', 'Esta cita ya no tiene un QR válido');
    return {
      token: this.qr.sign(b.id, b.qrNonce),
      reference: b.reference,
      expiresAt: new Date(b.endsAt.getTime() + this.env.NO_SHOW_GRACE_MIN * 60_000).toISOString(),
    };
  }

  async reschedule(actor: Actor, id: string, startsAt: string, locationId: string | undefined, meta: RequestMeta) {
    const isStaff = actor.role !== 'CUSTOMER';
    const existing = isStaff ? await this.findAny(id) : await this.findOwned(actor.id, id);
    if (!['PENDING', 'CONFIRMED'].includes(existing.status)) {
      throw Errors.conflict('NOT_MODIFIABLE', 'Esta cita ya no se puede modificar');
    }
    if (!isStaff) {
      if ((existing.startsAt.getTime() - Date.now()) / 60_000 < this.rules.cancelCutoffMin) {
        throw Errors.unprocessable('TOO_LATE', `Solo se puede reprogramar hasta ${this.rules.cancelCutoffMin} minutos antes`);
      }
      if (existing.rescheduleCount >= this.rules.maxReschedules) {
        throw Errors.unprocessable('MAX_RESCHEDULES', 'Has alcanzado el máximo de cambios para esta cita');
      }
    }
    const targetLocation = locationId ?? existing.locationId;
    // Si el cliente cambia una cita que requería aprobación, vuelve a quedar pendiente.
    const newStatus: BookingStatus =
      !isStaff && existing.service.requiresApproval && existing.status === 'CONFIRMED' ? 'PENDING' : existing.status;

    const updated = await this.prisma.$transaction(
      async (tx) => {
        await lockLocation(tx, targetLocation);
        if (targetLocation !== existing.locationId) await lockLocation(tx, existing.locationId);
        const slot = await this.availability.assertSlotAvailable(tx, targetLocation, existing.serviceId, startsAt, existing.id);
        await this.assertNoOverlapForUser(tx, existing.userId, slot.startsAt, slot.endsAt, existing.id);
        if (existing.exchange) {
          await this.exchange.assertLimits(tx, existing.userId, slot.startsAt, existing.exchange.amount.toString(), existing.id);
        }
        const b = await tx.booking.update({
          where: { id: existing.id },
          data: {
            status: newStatus,
            ...(newStatus === 'PENDING' ? { approvedAt: null, approvedById: null } : {}),
            locationId: targetLocation,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            rescheduleCount: { increment: 1 },
            remindedAt: null,
            qrNonce: this.qr.newNonce(), // invalida el QR anterior
            events: {
              create: {
                fromStatus: existing.status,
                toStatus: newStatus,
                actorId: actor.id,
                note: newStatus !== existing.status ? 'Reprogramada: vuelve a requerir aprobación' : 'Reprogramada',
                metadata: { from: existing.startsAt.toISOString(), to: slot.startsAt.toISOString(), fromLocation: existing.locationId },
              },
            },
          },
          include: bookingInclude,
        });
        await this.audit.log(
          {
            actorId: actor.id,
            action: 'booking.rescheduled',
            entityType: 'booking',
            entityId: b.id,
            metadata: { from: existing.startsAt.toISOString(), to: b.startsAt.toISOString() },
            meta,
          },
          tx,
        );
        return b;
      },
      { timeout: 15_000 },
    );

    const when = formatDateTime(updated.startsAt.toISOString(), updated.location.timezone);
    void this.notifications.notify({
      userId: updated.userId,
      type: 'BOOKING_RESCHEDULED',
      title: 'Cita reprogramada',
      body:
        updated.status === 'PENDING'
          ? `Tu solicitud ${updated.reference} es ahora para el ${when} en ${updated.location.name}. La revisaremos de nuevo y te avisaremos.`
          : `Tu cita ${updated.reference} es ahora el ${when} en ${updated.location.name}. Tu QR se ha actualizado.`,
      data: { bookingId: updated.id },
      email: { cta: { label: 'Ver mi QR', url: `${this.env.APP_URL}/app/reservas/${updated.id}` } },
    });
    void this.webhooks.emit(WebhookEvent.BOOKING_RESCHEDULED, {
      ...webhookPayload(updated),
      previousStartsAt: existing.startsAt.toISOString(),
    });
    return this.dto(updated, isStaff);
  }

  async cancel(actor: Actor, id: string, reason: string | undefined, meta: RequestMeta) {
    const isStaff = actor.role !== 'CUSTOMER';
    const existing = isStaff ? await this.findAny(id) : await this.findOwned(actor.id, id);
    if (!isStaff && (existing.startsAt.getTime() - Date.now()) / 60_000 < this.rules.cancelCutoffMin) {
      throw Errors.unprocessable('TOO_LATE', `Solo se puede cancelar hasta ${this.rules.cancelCutoffMin} minutos antes`);
    }
    return this.transition(actor, existing, 'CANCELLED', reason ?? (isStaff ? 'Cancelada por Valorize' : 'Cancelada por el cliente'), meta, isStaff);
  }

  icsForUser = async (userId: string, id: string): Promise<string> => {
    const b = await this.findOwned(userId, id);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (s: string) => s.replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Valorize Finance//Reservas//ES',
      'BEGIN:VEVENT',
      `UID:${b.id}@valorize.finance`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(b.startsAt)}`,
      `DTEND:${fmt(b.endsAt)}`,
      `SUMMARY:${esc(`Valorize · ${b.service.name}`)}`,
      `LOCATION:${esc(`${b.location.name}, ${b.location.address}, ${b.location.city}`)}`,
      `DESCRIPTION:${esc(`Referencia ${b.reference}. Muestra tu QR al llegar.`)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  };

  // ─────────────────────────── Personal ───────────────────────────

  /** Valida un QR escaneado en mostrador. No cambia el estado: el empleado confirma el check-in después. */
  async scan(actor: Actor, token: string, locationId: string, meta: RequestMeta): Promise<ScanResultDto> {
    await this.assertStaffLocation(actor, locationId);
    const parsed = this.qr.verify(token);
    const result = await this.evaluateScan(parsed, locationId);
    await this.audit.log({
      actorId: actor.id,
      action: result.valid ? 'booking.qr_scanned' : 'booking.qr_rejected',
      entityType: 'booking',
      entityId: parsed?.bookingId,
      metadata: { locationId, reason: result.reason, warnings: result.warnings },
      meta,
    });
    return result;
  }

  private async evaluateScan(parsed: { bookingId: string; nonce: string } | null, locationId: string): Promise<ScanResultDto> {
    if (!parsed) return { valid: false, reason: 'INVALID_TOKEN', warnings: [] };
    const b = await this.prisma.booking.findUnique({ where: { id: parsed.bookingId }, include: bookingInclude });
    if (!b) return { valid: false, reason: 'NOT_FOUND', warnings: [] };
    if (b.qrNonce !== parsed.nonce) return { valid: false, reason: 'EXPIRED', warnings: ['QR antiguo: la cita se reprogramó'] };

    const booking = this.dto(b, true);
    if (b.status === 'CANCELLED' || b.status === 'REJECTED') return { valid: false, reason: 'CANCELLED', booking, warnings: [] };
    if (b.status === 'PENDING') return { valid: false, reason: 'NOT_APPROVED', booking, warnings: ['La solicitud aún no está aprobada'] };
    if (['CHECKED_IN', 'IN_SERVICE', 'COMPLETED'].includes(b.status)) {
      return { valid: false, reason: 'ALREADY_USED', booking, warnings: [] };
    }
    if (b.status === 'NO_SHOW') return { valid: false, reason: 'EXPIRED', booking, warnings: ['Marcada como no presentada'] };
    if (b.locationId !== locationId) return { valid: false, reason: 'WRONG_LOCATION', booking, warnings: [`La cita es en ${b.location.name}`] };

    const tz = b.location.timezone;
    const today = DateTime.now().setZone(tz).toISODate();
    if (DateTime.fromJSDate(b.startsAt).setZone(tz).toISODate() !== today) {
      return { valid: false, reason: 'WRONG_DAY', booking, warnings: [] };
    }

    const warnings: string[] = [];
    const minutes = (b.startsAt.getTime() - Date.now()) / 60_000;
    if (minutes > this.env.CHECKIN_EARLY_MIN) warnings.push(`Llega ${Math.round(minutes)} min antes de su hora`);
    if (minutes < -this.env.NO_SHOW_GRACE_MIN) warnings.push(`Llega ${Math.round(-minutes)} min tarde`);
    if (b.user.kycProfile?.status !== 'APPROVED') warnings.push('Identidad no verificada: comprueba documentación');
    if (b.exchange && b.exchange.wallet.riskStatus !== 'CLEAR') warnings.push('Wallet pendiente de revisión: consulta con un responsable');
    return { valid: true, booking, warnings };
  }

  async staffTransition(actor: Actor, id: string, to: BookingStatus, note: string | undefined, meta: RequestMeta) {
    const b = await this.findAny(id);
    await this.assertStaffLocation(actor, b.locationId);
    return this.transition(actor, b, to, note, meta, true);
  }

  private async transition(actor: Actor, b: BookingFull, to: BookingStatus, note: string | undefined, meta: RequestMeta, includeCustomer: boolean) {
    if (!BOOKING_TRANSITIONS[b.status].includes(to)) {
      throw Errors.conflict('INVALID_TRANSITION', `No se puede pasar de ${b.status} a ${to}`);
    }
    const now = new Date();
    const data: Prisma.BookingUpdateInput = { status: to };
    if (to === 'CHECKED_IN') Object.assign(data, { checkedInAt: now, checkedInBy: { connect: { id: actor.id } } });
    if (to === 'IN_SERVICE') data.serviceStartedAt = now;
    if (to === 'COMPLETED') data.completedAt = now;
    if (to === 'CANCELLED') Object.assign(data, { cancelledAt: now, cancelReason: note, qrNonce: this.qr.newNonce() });

    const updated = await this.prisma.$transaction(async (tx) => {
      // Bloqueo optimista: la transición solo se aplica si el estado no ha cambiado.
      const { count } = await tx.booking.updateMany({ where: { id: b.id, status: b.status }, data: { updatedAt: now } });
      if (count === 0) throw Errors.conflict('STALE_STATE', 'La cita ha cambiado de estado. Recarga e inténtalo de nuevo.');
      const u = await tx.booking.update({
        where: { id: b.id },
        data: { ...data, events: { create: { fromStatus: b.status, toStatus: to, actorId: actor.id, note } } },
        include: bookingInclude,
      });
      await this.audit.log(
        {
          actorId: actor.id,
          action: `booking.${to.toLowerCase()}`,
          entityType: 'booking',
          entityId: b.id,
          metadata: { from: b.status, note },
          meta,
        },
        tx,
      );
      return u;
    });

    this.sideEffects(updated, to, note);
    return this.dto(updated, includeCustomer);
  }

  private sideEffects(b: BookingFull, to: BookingStatus, note?: string) {
    const ev = STATUS_EVENT[to];
    if (ev) void this.webhooks.emit(ev, webhookPayload(b));
    const msg: Partial<Record<BookingStatus, [NotificationType, string, string]>> = {
      CANCELLED: ['BOOKING_CANCELLED', 'Cita cancelada', `Tu cita ${b.reference} se ha cancelado.${note ? ` Motivo: ${note}.` : ''}`],
      CHECKED_IN: ['BOOKING_CHECKED_IN', 'Check-in realizado', `Te hemos registrado en ${b.location.name}. En breve te atenderemos.`],
      COMPLETED: ['BOOKING_COMPLETED', 'Gracias por tu visita', `Tu cita ${b.reference} ha finalizado.`],
      NO_SHOW: [
        'BOOKING_NO_SHOW',
        'No te hemos visto',
        `Tu cita ${b.reference} se ha marcado como no presentada. Puedes reservar otra cuando quieras.`,
      ],
    };
    const m = msg[to];
    if (m) {
      void this.notifications.notify({
        userId: b.userId,
        type: m[0],
        title: m[1],
        body: m[2],
        data: { bookingId: b.id },
        email: to === 'CANCELLED' ? {} : false,
      });
    }
  }

  async events(id: string): Promise<BookingEventDto[]> {
    const evs = await this.prisma.bookingEvent.findMany({
      where: { bookingId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });
    return evs.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      actor: e.actor ? { id: e.actor.id, name: `${e.actor.firstName} ${e.actor.lastName}`, role: e.actor.role } : null,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  // ─────────────────────────── Tareas programadas ───────────────────────────

  /** Marca como NO_SHOW las citas confirmadas sin check-in pasado el margen de cortesía. */
  async sweepNoShows(): Promise<number> {
    const cutoff = new Date(Date.now() - this.env.NO_SHOW_GRACE_MIN * 60_000);
    // Solicitudes que nadie aprobó a tiempo: se cancelan (no son "no presentado").
    const expired = await this.prisma.booking.findMany({ where: { status: 'PENDING', startsAt: { lt: new Date() } }, include: bookingInclude, take: 500 });
    for (const b of expired) {
      const { count } = await this.prisma.booking.updateMany({
        where: { id: b.id, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'No se aprobó antes de la hora de la cita', qrNonce: this.qr.newNonce() },
      });
      if (!count) continue;
      await this.prisma.bookingEvent.create({
        data: { bookingId: b.id, fromStatus: 'PENDING', toStatus: 'CANCELLED', note: 'Automático: sin aprobar a tiempo' },
      });
      this.sideEffects({ ...b, status: 'CANCELLED' }, 'CANCELLED', 'no se aprobó antes de la hora de la cita');
    }

    const due = await this.prisma.booking.findMany({
      where: { status: 'CONFIRMED', startsAt: { lt: cutoff } },
      include: bookingInclude,
      take: 500,
    });
    let n = 0;
    for (const b of due) {
      const { count } = await this.prisma.booking.updateMany({ where: { id: b.id, status: b.status }, data: { status: 'NO_SHOW' } });
      if (!count) continue;
      await this.prisma.bookingEvent.create({
        data: { bookingId: b.id, fromStatus: b.status, toStatus: 'NO_SHOW', note: 'Automático: sin check-in' },
      });
      await this.audit.log({ action: 'booking.no_show', entityType: 'booking', entityId: b.id, metadata: { automatic: true } });
      this.sideEffects({ ...b, status: 'NO_SHOW' }, 'NO_SHOW');
      n++;
    }
    return n;
  }

  /** Envía recordatorios REMINDER_HOURS_BEFORE horas antes. */
  async sendReminders(): Promise<number> {
    const now = Date.now();
    const due = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        remindedAt: null,
        startsAt: { gt: new Date(now + 30 * 60_000), lte: new Date(now + this.env.REMINDER_HOURS_BEFORE * 3600_000) },
      },
      include: bookingInclude,
      take: 500,
    });
    for (const b of due) {
      const { count } = await this.prisma.booking.updateMany({ where: { id: b.id, remindedAt: null }, data: { remindedAt: new Date() } });
      if (!count) continue;
      const when = formatDateTime(b.startsAt.toISOString(), b.location.timezone);
      void this.notifications.notify({
        userId: b.userId,
        type: 'BOOKING_REMINDER',
        title: 'Recordatorio de tu cita',
        body: `${b.service.name} en ${b.location.name} (${b.location.address}), ${when}. Ten tu QR a mano.`,
        data: { bookingId: b.id },
        email: { cta: { label: 'Ver mi QR', url: `${this.env.APP_URL}/app/reservas/${b.id}` } },
      });
    }
    return due.length;
  }

  // ─────────────────────────── Helpers ───────────────────────────

  async assertStaffLocation(actor: Actor, locationId: string) {
    if (actor.role === 'ADMIN') return;
    if (actor.role === 'CUSTOMER') throw Errors.forbidden();
    const assigned = await this.prisma.staffLocation.findUnique({ where: { userId_locationId: { userId: actor.id, locationId } } });
    if (!assigned) throw Errors.forbidden('No estás asignado a esta ubicación');
  }

  private async findOwned(userId: string, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, userId }, include: bookingInclude });
    if (!b) throw Errors.notFound('Cita');
    return b;
  }

  async findAny(id: string) {
    const b = await this.prisma.booking.findUnique({ where: { id }, include: bookingInclude });
    if (!b) throw Errors.notFound('Cita');
    return b;
  }

  private async assertNoOverlapForUser(tx: Prisma.TransactionClient, userId: string, start: Date, end: Date, excludeId?: string) {
    const clash = await tx.booking.findFirst({
      where: {
        userId,
        status: { in: ACTIVE_BOOKING_STATUSES },
        startsAt: { lt: end },
        endsAt: { gt: start },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { reference: true },
    });
    if (clash) throw Errors.conflict('USER_OVERLAP', `Ya tienes otra cita a esa hora (${clash.reference})`);
  }
}

async function lockLocation(tx: Prisma.TransactionClient, locationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${locationId}`}))`;
}

/** Referencia legible y correlativa por año: VF-2026-000458. */
async function nextReference(tx: Prisma.TransactionClient, startsAt: Date): Promise<string> {
  const year = startsAt.getUTCFullYear();
  const scope = `VF-${year}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "reference_counters" ("scope", "value") VALUES (${scope}, 1)
    ON CONFLICT ("scope") DO UPDATE SET "value" = "reference_counters"."value" + 1
    RETURNING "value"`;
  return `${scope}-${String(rows[0].value).padStart(6, '0')}`;
}

function webhookPayload(b: BookingFull) {
  // Sin datos personales: solo identificadores y datos operativos.
  return {
    bookingId: b.id,
    reference: b.reference,
    status: b.status,
    userId: b.userId,
    locationId: b.locationId,
    serviceId: b.serviceId,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
  };
}
