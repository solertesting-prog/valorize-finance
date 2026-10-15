import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AnalyticsDto } from '@valorize/shared';
import { DateTime } from 'luxon';
import { PrismaService } from '../common/prisma.service';

/**
 * Analítica operativa: demanda, ocupación y rendimiento por ubicación.
 * Ocupación = minutos reservados (citas no canceladas) / minutos de capacidad ofertada
 * (horario de apertura × puestos), descontando cierres.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(from: string, to: string, locationId?: string): Promise<AnalyticsDto> {
    const tz = 'Europe/Madrid';
    const start = DateTime.fromISO(from, { zone: tz }).startOf('day');
    const end = DateTime.fromISO(to, { zone: tz }).endOf('day');
    const fromD = start.toJSDate();
    const toD = end.toJSDate();
    const locFilter = locationId ? Prisma.sql`AND b."locationId" = ${locationId}::uuid` : Prisma.empty;

    const [totals] = await this.prisma.$queryRaw<
      { bookings: bigint; completed: bigint; cancelled: bigint; noshow: bigint; lead_hours: number | null; wait_min: number | null }[]
    >`
      SELECT
        COUNT(*)                                                   AS bookings,
        COUNT(*) FILTER (WHERE b.status = 'COMPLETED')             AS completed,
        COUNT(*) FILTER (WHERE b.status = 'CANCELLED')             AS cancelled,
        COUNT(*) FILTER (WHERE b.status = 'NO_SHOW')               AS noshow,
        (AVG(EXTRACT(EPOCH FROM (b."startsAt" - b."createdAt")) / 3600))::float8 AS lead_hours,
        (AVG(EXTRACT(EPOCH FROM (b."serviceStartedAt" - GREATEST(b."checkedInAt", b."startsAt"))) / 60)
          FILTER (WHERE b."serviceStartedAt" IS NOT NULL))::float8 AS wait_min
      FROM bookings b
      WHERE b."startsAt" BETWEEN ${fromD} AND ${toD} ${locFilter}`;

    const byDay = await this.prisma.$queryRaw<{ d: string; bookings: bigint; completed: bigint; noshow: bigint; cancelled: bigint }[]>`
      SELECT to_char(b."startsAt" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS d,
             COUNT(*) AS bookings,
             COUNT(*) FILTER (WHERE b.status = 'COMPLETED') AS completed,
             COUNT(*) FILTER (WHERE b.status = 'NO_SHOW') AS noshow,
             COUNT(*) FILTER (WHERE b.status = 'CANCELLED') AS cancelled
      FROM bookings b
      WHERE b."startsAt" BETWEEN ${fromD} AND ${toD} ${locFilter}
      GROUP BY 1 ORDER BY 1`;

    const byHour = await this.prisma.$queryRaw<{ h: number; bookings: bigint }[]>`
      SELECT EXTRACT(HOUR FROM b."startsAt" AT TIME ZONE ${tz})::int AS h, COUNT(*) AS bookings
      FROM bookings b
      WHERE b."startsAt" BETWEEN ${fromD} AND ${toD} AND b.status <> 'CANCELLED' ${locFilter}
      GROUP BY 1 ORDER BY 1`;

    const byService = await this.prisma.$queryRaw<{ id: string; name: string; bookings: bigint }[]>`
      SELECT s.id, s.name, COUNT(*) AS bookings
      FROM bookings b JOIN services s ON s.id = b."serviceId"
      WHERE b."startsAt" BETWEEN ${fromD} AND ${toD} AND b.status <> 'CANCELLED' ${locFilter}
      GROUP BY s.id, s.name ORDER BY bookings DESC`;

    const byLocationRaw = await this.prisma.$queryRaw<
      { id: string; name: string; bookings: bigint; noshow: bigint; booked_min: number | null }[]
    >`
      SELECT l.id, l.name,
             COUNT(b.id) FILTER (WHERE b.status <> 'CANCELLED') AS bookings,
             COUNT(b.id) FILTER (WHERE b.status = 'NO_SHOW') AS noshow,
             (SUM(EXTRACT(EPOCH FROM (b."endsAt" - b."startsAt")) / 60) FILTER (WHERE b.status <> 'CANCELLED'))::float8 AS booked_min
      FROM locations l
      LEFT JOIN bookings b ON b."locationId" = l.id AND b."startsAt" BETWEEN ${fromD} AND ${toD}
      WHERE l.active ${locationId ? Prisma.sql`AND l.id = ${locationId}::uuid` : Prisma.empty}
      GROUP BY l.id, l.name ORDER BY bookings DESC`;

    // Capacidad ofertada por ubicación en el rango.
    const capacity = await this.capacityMinutes(byLocationRaw.map((l) => l.id), start, end);

    const byLocation = byLocationRaw.map((l) => {
      const n = Number(l.bookings);
      const cap = capacity.get(l.id) ?? 0;
      return {
        locationId: l.id,
        name: l.name,
        bookings: n,
        occupancyRate: cap > 0 ? round3((l.booked_min ?? 0) / cap) : 0,
        noShowRate: n > 0 ? round3(Number(l.noshow) / n) : 0,
      };
    });

    const totalBooked = byLocationRaw.reduce((a, l) => a + (l.booked_min ?? 0), 0);
    const totalCap = [...capacity.values()].reduce((a, b) => a + b, 0);
    const bookings = Number(totals.bookings);
    const nonCancelled = bookings - Number(totals.cancelled);

    return {
      range: { from, to },
      totals: {
        bookings,
        completed: Number(totals.completed),
        cancelled: Number(totals.cancelled),
        noShow: Number(totals.noshow),
        noShowRate: nonCancelled > 0 ? round3(Number(totals.noshow) / nonCancelled) : 0,
        avgLeadTimeHours: round1(totals.lead_hours ?? 0),
        avgWaitMinutes: totals.wait_min != null ? round1(totals.wait_min) : null,
        occupancyRate: totalCap > 0 ? round3(totalBooked / totalCap) : 0,
      },
      byDay: fillDays(start, end, byDay),
      byHour: byHour.map((h) => ({ hour: h.h, bookings: Number(h.bookings) })),
      byService: byService.map((s) => ({ serviceId: s.id, name: s.name, bookings: Number(s.bookings) })),
      byLocation,
    };
  }

  private async capacityMinutes(locationIds: string[], start: DateTime, end: DateTime) {
    const out = new Map<string, number>();
    if (!locationIds.length) return out;
    const locs = await this.prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: {
        id: true,
        defaultCapacity: true,
        openingHours: { select: { weekday: true, opensAt: true, closesAt: true } },
        closures: { where: { date: { gte: start.toJSDate(), lte: end.toJSDate() } }, select: { date: true } },
      },
    });
    for (const l of locs) {
      const closed = new Set(l.closures.map((c) => c.date.toISOString().slice(0, 10)));
      let minutes = 0;
      for (let d = start; d <= end; d = d.plus({ days: 1 })) {
        if (closed.has(d.toISODate()!)) continue;
        for (const h of l.openingHours) if (h.weekday === d.weekday) minutes += h.closesAt - h.opensAt;
      }
      out.set(l.id, minutes * l.defaultCapacity);
    }
    return out;
  }
}

function fillDays(start: DateTime, end: DateTime, rows: { d: string; bookings: bigint; completed: bigint; noshow: bigint; cancelled: bigint }[]) {
  const map = new Map(rows.map((r) => [r.d, r]));
  const out: AnalyticsDto['byDay'] = [];
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    const key = d.toISODate()!;
    const r = map.get(key);
    out.push({
      date: key,
      bookings: Number(r?.bookings ?? 0),
      completed: Number(r?.completed ?? 0),
      noShow: Number(r?.noshow ?? 0),
      cancelled: Number(r?.cancelled ?? 0),
    });
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
