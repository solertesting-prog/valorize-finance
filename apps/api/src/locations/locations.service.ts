import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LocationDto, LocationInput, ServiceDto, ServiceInput } from '@valorize/shared';
import { DateTime } from 'luxon';
import { AuditService } from '../common/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

const locationInclude = {
  openingHours: { orderBy: [{ weekday: 'asc' }, { opensAt: 'asc' }] },
  services: { include: { service: true } },
} satisfies Prisma.LocationInclude;

type LocationFull = Prisma.LocationGetPayload<{ include: typeof locationInclude }>;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Búsqueda pública con distancia (haversine) y estado "abierto ahora". */
  async search(q: { lat?: number; lng?: number; q?: string; serviceId?: string }, includeInactive = false): Promise<LocationDto[]> {
    const where: Prisma.LocationWhereInput = {
      ...(includeInactive ? {} : { active: true }),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { city: { contains: q.q, mode: 'insensitive' } },
              { address: { contains: q.q, mode: 'insensitive' } },
              { postalCode: { startsWith: q.q } },
            ],
          }
        : {}),
      ...(q.serviceId ? { services: { some: { serviceId: q.serviceId, service: { active: true } } } } : {}),
    };
    const rows = await this.prisma.location.findMany({ where, include: locationInclude, orderBy: { name: 'asc' } });
    const list = rows.map((l) => {
      const dto = this.toDto(l, includeInactive);
      if (q.lat != null && q.lng != null) dto.distanceKm = round1(haversineKm(q.lat, q.lng, l.latitude, l.longitude));
      return dto;
    });
    if (q.lat != null && q.lng != null) list.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    return list;
  }

  async get(idOrSlug: string, includeInactive = false): Promise<LocationDto> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const l = await this.prisma.location.findFirst({
      where: { ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }), ...(includeInactive ? {} : { active: true }) },
      include: locationInclude,
    });
    if (!l) throw Errors.notFound('Ubicación');
    return this.toDto(l, includeInactive);
  }

  async create(input: LocationInput, actorId: string, meta: RequestMeta) {
    const { openingHours, services, ...data } = input;
    validateHours(openingHours);
    const l = await this.prisma.location.create({
      data: {
        ...data,
        openingHours: { create: openingHours.map((h) => ({ weekday: h.weekday, opensAt: toMin(h.opensAt), closesAt: toMin(h.closesAt) })) },
        services: { create: services.map((s) => ({ serviceId: s.serviceId, capacity: s.capacity ?? null })) },
      },
      include: locationInclude,
    });
    await this.audit.log({ actorId, action: 'location.created', entityType: 'location', entityId: l.id, meta });
    return this.toDto(l, true);
  }

  async update(id: string, input: Partial<LocationInput>, actorId: string, meta: RequestMeta) {
    const { openingHours, services, ...data } = input;
    if (openingHours) validateHours(openingHours);
    const l = await this.prisma.$transaction(async (tx) => {
      if (openingHours) {
        await tx.openingHours.deleteMany({ where: { locationId: id } });
        await tx.openingHours.createMany({
          data: openingHours.map((h) => ({ locationId: id, weekday: h.weekday, opensAt: toMin(h.opensAt), closesAt: toMin(h.closesAt) })),
        });
      }
      if (services) {
        await tx.locationService.deleteMany({ where: { locationId: id, serviceId: { notIn: services.map((s) => s.serviceId) } } });
        for (const s of services) {
          await tx.locationService.upsert({
            where: { locationId_serviceId: { locationId: id, serviceId: s.serviceId } },
            create: { locationId: id, serviceId: s.serviceId, capacity: s.capacity ?? null },
            update: { capacity: s.capacity ?? null },
          });
        }
      }
      return tx.location.update({ where: { id }, data, include: locationInclude });
    });
    await this.audit.log({
      actorId,
      action: 'location.updated',
      entityType: 'location',
      entityId: id,
      metadata: { fields: Object.keys(input) },
      meta,
    });
    return this.toDto(l, true);
  }

  async closures(locationId: string) {
    const rows = await this.prisma.locationClosure.findMany({
      where: { locationId, date: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
      orderBy: { date: 'asc' },
    });
    return rows.map((c) => ({ id: c.id, date: c.date.toISOString().slice(0, 10), reason: c.reason }));
  }

  async addClosure(locationId: string, date: string, reason: string | undefined, actorId: string, meta: RequestMeta) {
    const c = await this.prisma.locationClosure.create({ data: { locationId, date: new Date(`${date}T00:00:00Z`), reason } });
    const affected = await this.prisma.booking.count({
      where: {
        locationId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startsAt: { gte: new Date(`${date}T00:00:00Z`), lt: new Date(`${date}T23:59:59Z`) },
      },
    });
    await this.audit.log({ actorId, action: 'location.closure_added', entityType: 'location', entityId: locationId, metadata: { date }, meta });
    return { id: c.id, date, reason: c.reason, affectedBookings: affected };
  }

  async removeClosure(locationId: string, closureId: string, actorId: string, meta: RequestMeta) {
    await this.prisma.locationClosure.deleteMany({ where: { id: closureId, locationId } });
    await this.audit.log({ actorId, action: 'location.closure_removed', entityType: 'location', entityId: locationId, meta });
  }

  // ─────────── Servicios ───────────

  async services(includeInactive: boolean): Promise<ServiceDto[]> {
    const rows = await this.prisma.service.findMany({ where: includeInactive ? {} : { active: true }, orderBy: { name: 'asc' } });
    return rows.map(serviceDto);
  }

  async createService(input: ServiceInput, actorId: string, meta: RequestMeta) {
    const s = await this.prisma.service.create({ data: input });
    await this.audit.log({ actorId, action: 'service.created', entityType: 'service', entityId: s.id, meta });
    return serviceDto(s);
  }

  async updateService(id: string, input: Partial<ServiceInput>, actorId: string, meta: RequestMeta) {
    const s = await this.prisma.service.update({ where: { id }, data: input });
    await this.audit.log({ actorId, action: 'service.updated', entityType: 'service', entityId: id, metadata: { fields: Object.keys(input) }, meta });
    return serviceDto(s);
  }

  private toDto(l: LocationFull, includeInactiveServices: boolean): LocationDto {
    const now = DateTime.now().setZone(l.timezone);
    const nowMin = now.hour * 60 + now.minute;
    return {
      id: l.id,
      name: l.name,
      slug: l.slug,
      address: l.address,
      city: l.city,
      postalCode: l.postalCode,
      country: l.country,
      latitude: l.latitude,
      longitude: l.longitude,
      timezone: l.timezone,
      phone: l.phone,
      email: l.email,
      slotIntervalMin: l.slotIntervalMin,
      defaultCapacity: l.defaultCapacity,
      bookingHorizonDays: l.bookingHorizonDays,
      minNoticeMin: l.minNoticeMin,
      active: l.active,
      openingHours: l.openingHours.map((h) => ({ weekday: h.weekday, opensAt: toHhmm(h.opensAt), closesAt: toHhmm(h.closesAt) })),
      services: l.services
        .filter((s) => includeInactiveServices || s.service.active)
        .map((s) => ({ ...serviceDto(s.service), capacity: s.capacity })),
      openNow: l.openingHours.some((h) => h.weekday === now.weekday && h.opensAt <= nowMin && nowMin < h.closesAt),
    };
  }
}

function serviceDto(s: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationMin: number;
  bufferMin: number;
  kind: ServiceDto['kind'];
  requiresKyc: boolean;
  requiredKycLevel: number;
  requiresApproval: boolean;
  active: boolean;
}): ServiceDto {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    description: s.description,
    durationMin: s.durationMin,
    bufferMin: s.bufferMin,
    kind: s.kind,
    requiresKyc: s.requiresKyc,
    requiredKycLevel: s.requiredKycLevel,
    requiresApproval: s.requiresApproval,
    active: s.active,
  };
}

function validateHours(hours: { weekday: number; opensAt: string; closesAt: string }[]) {
  const byDay = new Map<number, [number, number][]>();
  for (const h of hours) {
    const o = toMin(h.opensAt);
    const c = toMin(h.closesAt);
    if (o >= c) throw Errors.unprocessable('INVALID_HOURS', `Horario inválido el día ${h.weekday}: apertura posterior al cierre`);
    const list = byDay.get(h.weekday) ?? [];
    if (list.some(([a, b]) => o < b && c > a)) throw Errors.unprocessable('INVALID_HOURS', `Tramos solapados el día ${h.weekday}`);
    list.push([o, c]);
    byDay.set(h.weekday, list);
  }
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
