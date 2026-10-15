import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AvailabilityDto, SlotDto } from '@valorize/shared';
import { ACTIVE_BOOKING_STATUSES } from '@valorize/shared';
import { DateTime } from 'luxon';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

interface Ctx {
  location: {
    id: string;
    timezone: string;
    slotIntervalMin: number;
    defaultCapacity: number;
    bookingHorizonDays: number;
    minNoticeMin: number;
    active: boolean;
  };
  service: { id: string; durationMin: number; bufferMin: number; active: boolean };
  serviceCapacity: number | null;
}

interface Busy {
  start: number;
  end: number; // incluye el buffer del servicio
  serviceId: string;
}

/**
 * Motor de disponibilidad.
 *
 * Capacidad: la ubicación tiene N puestos de atención compartidos (defaultCapacity).
 * Opcionalmente un servicio puede limitarse a M citas simultáneas en esa ubicación (LocationService.capacity).
 * Un hueco está libre si en todo su intervalo [inicio, inicio + duración + buffer) hay menos de N citas
 * activas en la ubicación y menos de M del mismo servicio.
 *
 * Todas las horas se calculan en la zona horaria de la ubicación (DST incluido) y se devuelven en ISO con offset.
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async loadContext(locationId: string, serviceId: string, db: Db = this.prisma): Promise<Ctx> {
    const ls = await db.locationService.findUnique({
      where: { locationId_serviceId: { locationId, serviceId } },
      include: { location: true, service: true },
    });
    if (!ls || !ls.location.active || !ls.service.active) {
      throw Errors.notFound('Servicio no disponible en esta ubicación');
    }
    return { location: ls.location, service: ls.service, serviceCapacity: ls.capacity };
  }

  async forDate(locationId: string, serviceId: string, date: string, opts: { excludeBookingId?: string; db?: Db } = {}): Promise<AvailabilityDto> {
    const db = opts.db ?? this.prisma;
    const ctx = await this.loadContext(locationId, serviceId, db);
    const tz = ctx.location.timezone;
    const day = DateTime.fromISO(date, { zone: tz });
    if (!day.isValid) throw Errors.unprocessable('INVALID_DATE', 'Fecha no válida');

    const today = DateTime.now().setZone(tz).startOf('day');
    const empty = (reason: string | null, closed = true): AvailabilityDto => ({
      date,
      timezone: tz,
      closed,
      closedReason: reason,
      slots: [],
    });

    if (day < today) return empty('Fecha pasada');
    if (day > today.plus({ days: ctx.location.bookingHorizonDays })) {
      return empty(`Solo se puede reservar con ${ctx.location.bookingHorizonDays} días de antelación`);
    }

    const closure = await db.locationClosure.findUnique({
      where: { locationId_date: { locationId, date: new Date(`${date}T00:00:00Z`) } },
    });
    if (closure) return empty(closure.reason ?? 'Cerrado');

    const hours = await db.openingHours.findMany({
      where: { locationId, weekday: day.weekday },
      orderBy: { opensAt: 'asc' },
    });
    if (!hours.length) return empty('Cerrado este día');

    const dayStart = day.startOf('day').toUTC().toJSDate();
    const dayEnd = day.endOf('day').toUTC().toJSDate();
    const busy = await this.busyIntervals(db, locationId, dayStart, dayEnd, opts.excludeBookingId);

    const minStart = DateTime.now().plus({ minutes: ctx.location.minNoticeMin }).toMillis();
    const occupyMin = ctx.service.durationMin + ctx.service.bufferMin;
    const slots: SlotDto[] = [];

    for (const h of hours) {
      for (let m = h.opensAt; m + ctx.service.durationMin <= h.closesAt; m += ctx.location.slotIntervalMin) {
        const start = DateTime.fromObject(
          { year: day.year, month: day.month, day: day.day, hour: Math.floor(m / 60), minute: m % 60 },
          { zone: tz },
        );
        // Huecos inexistentes por cambio de hora (p. ej. 02:30 el último domingo de marzo).
        if (!start.isValid || start.hour !== Math.floor(m / 60)) continue;
        if (start.toMillis() < minStart) continue;

        const s = start.toMillis();
        const e = s + occupyMin * 60_000;
        const { total, sameService } = peakOverlap(busy, s, e, ctx.service.id);
        const capacity = ctx.location.defaultCapacity;
        const available = Math.max(
          0,
          Math.min(capacity - total, ctx.serviceCapacity != null ? ctx.serviceCapacity - sameService : Infinity),
        );
        slots.push({
          startsAt: start.toISO({ suppressMilliseconds: true })!,
          endsAt: start.plus({ minutes: ctx.service.durationMin }).toISO({ suppressMilliseconds: true })!,
          label: start.toFormat('HH:mm'),
          available,
          capacity: ctx.serviceCapacity != null ? Math.min(capacity, ctx.serviceCapacity) : capacity,
        });
      }
    }

    return { date, timezone: tz, closed: false, closedReason: null, slots };
  }

  /** Resumen de días con huecos libres, para pintar el calendario. */
  async days(locationId: string, serviceId: string, from: string, count: number) {
    const ctx = await this.loadContext(locationId, serviceId);
    const start = DateTime.fromISO(from, { zone: ctx.location.timezone });
    const out: { date: string; available: number; closed: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const date = start.plus({ days: i }).toISODate()!;
      const a = await this.forDate(locationId, serviceId, date);
      out.push({ date, closed: a.closed, available: a.slots.filter((s) => s.available > 0).length });
    }
    return out;
  }

  /**
   * Comprueba que un inicio concreto es un hueco válido con plaza libre.
   * Debe llamarse dentro de la transacción que crea/modifica la cita, tras tomar el lock de la ubicación.
   */
  async assertSlotAvailable(db: Db, locationId: string, serviceId: string, startsAtIso: string, excludeBookingId?: string) {
    const ctx = await this.loadContext(locationId, serviceId, db);
    const start = DateTime.fromISO(startsAtIso, { setZone: true }).setZone(ctx.location.timezone);
    if (!start.isValid) throw Errors.unprocessable('INVALID_DATE', 'Fecha no válida');
    const availability = await this.forDate(locationId, serviceId, start.toISODate()!, { excludeBookingId, db });
    const slot = availability.slots.find((s) => DateTime.fromISO(s.startsAt).toMillis() === start.toMillis());
    if (!slot) throw Errors.unprocessable('SLOT_INVALID', 'Ese horario no está disponible para reservar');
    if (slot.available <= 0) throw Errors.conflict('SLOT_FULL', 'Ese horario se acaba de completar. Elige otro.');
    return {
      startsAt: start.toUTC().toJSDate(),
      endsAt: start.plus({ minutes: ctx.service.durationMin }).toUTC().toJSDate(),
      ctx,
    };
  }

  private async busyIntervals(db: Db, locationId: string, from: Date, to: Date, excludeId?: string): Promise<Busy[]> {
    const rows = await db.booking.findMany({
      where: {
        locationId,
        status: { in: ACTIVE_BOOKING_STATUSES },
        startsAt: { lt: to },
        endsAt: { gt: new Date(from.getTime() - 4 * 3600_000) }, // margen para buffers largos
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { startsAt: true, endsAt: true, serviceId: true, service: { select: { bufferMin: true } } },
    });
    return rows.map((r) => ({
      start: r.startsAt.getTime(),
      end: r.endsAt.getTime() + r.service.bufferMin * 60_000,
      serviceId: r.serviceId,
    }));
  }
}

/** Máximo número de citas simultáneas dentro de [s, e) (barrido de eventos). */
export function peakOverlap(busy: Busy[], s: number, e: number, serviceId: string) {
  const relevant = busy.filter((b) => b.start < e && b.end > s);
  const sweep = (items: Busy[]) => {
    const ev: [number, number][] = [];
    for (const b of items) {
      ev.push([Math.max(b.start, s), 1], [Math.min(b.end, e), -1]);
    }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0;
    let max = 0;
    for (const [, d] of ev) {
      cur += d;
      max = Math.max(max, cur);
    }
    return max;
  };
  return { total: sweep(relevant), sameService: sweep(relevant.filter((b) => b.serviceId === serviceId)) };
}
