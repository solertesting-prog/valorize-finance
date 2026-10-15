import { Injectable } from '@nestjs/common';
import { BookingStatus, IncidentStatus, Prisma } from '@prisma/client';
import type { DayDashboardDto, IncidentDto } from '@valorize/shared';
import { WebhookEvent } from '@valorize/shared';
import { DateTime } from 'luxon';
import { AuditService } from '../common/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { bookingInclude } from '../bookings/booking.mapper';
import { Actor, BookingsService } from '../bookings/bookings.service';
import { WebhooksService } from '../webhooks/webhooks.service';

const incidentInclude = {
  location: { select: { id: true, name: true } },
  booking: { select: { reference: true } },
  reportedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.IncidentInclude;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  async myLocations(actor: Actor) {
    const where: Prisma.LocationWhereInput =
      actor.role === 'ADMIN' ? { active: true } : { active: true, staff: { some: { userId: actor.id } } };
    return this.prisma.location.findMany({
      where,
      select: { id: true, name: true, city: true, timezone: true },
      orderBy: { name: 'asc' },
    });
  }

  private async dayRange(locationId: string, date?: string) {
    const loc = await this.prisma.location.findUnique({ where: { id: locationId }, select: { id: true, name: true, timezone: true } });
    if (!loc) throw Errors.notFound('Ubicación');
    const day = date ? DateTime.fromISO(date, { zone: loc.timezone }) : DateTime.now().setZone(loc.timezone);
    return { loc, date: day.toISODate()!, from: day.startOf('day').toJSDate(), to: day.endOf('day').toJSDate() };
  }

  async dashboard(actor: Actor, locationId: string, date?: string): Promise<DayDashboardDto> {
    await this.bookings.assertStaffLocation(actor, locationId);
    const { loc, date: d, from, to } = await this.dayRange(locationId, date);
    const where = { locationId, startsAt: { gte: from, lte: to } };
    const grouped = await this.prisma.booking.groupBy({ by: ['status'], where, _count: { _all: true } });
    const c = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    const upcoming = await this.prisma.booking.findMany({
      where: { ...where, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE'] } },
      include: bookingInclude,
      orderBy: { startsAt: 'asc' },
      take: 50,
    });
    return {
      date: d,
      location: { id: loc.id, name: loc.name },
      totals: {
        bookings: grouped.reduce((a, g) => a + g._count._all, 0) - c('CANCELLED'),
        attended: c('COMPLETED'),
        pending: c('PENDING') + c('CONFIRMED'),
        noShow: c('NO_SHOW'),
        cancelled: c('CANCELLED'),
        inService: c('CHECKED_IN') + c('IN_SERVICE'),
      },
      upcoming: upcoming.map((b) => this.bookings.dto(b, true)),
    };
  }

  async agenda(actor: Actor, locationId: string, date: string | undefined, status?: BookingStatus, q?: string) {
    await this.bookings.assertStaffLocation(actor, locationId);
    const { from, to } = await this.dayRange(locationId, date);
    const rows = await this.prisma.booking.findMany({
      where: {
        locationId,
        startsAt: { gte: from, lte: to },
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { reference: { contains: q, mode: 'insensitive' } },
                { user: { lastName: { contains: q, mode: 'insensitive' } } },
                { user: { firstName: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: bookingInclude,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((b) => this.bookings.dto(b, true));
  }

  async bookingDetail(actor: Actor, id: string) {
    const b = await this.bookings.findAny(id);
    await this.bookings.assertStaffLocation(actor, b.locationId);
    return { booking: this.bookings.dto(b, true), events: await this.bookings.events(id) };
  }

  /** Búsqueda manual por referencia (cuando el cliente no puede mostrar el QR). */
  async findByReference(actor: Actor, reference: string) {
    const b = await this.prisma.booking.findUnique({ where: { reference: reference.toUpperCase().trim() }, include: bookingInclude });
    if (!b) throw Errors.notFound('Cita');
    await this.bookings.assertStaffLocation(actor, b.locationId);
    return this.bookings.dto(b, true);
  }

  // ─────────── Incidencias ───────────

  async incidents(actor: Actor, filter: { locationId?: string; status?: IncidentStatus }, page: number, pageSize: number) {
    if (filter.locationId) await this.bookings.assertStaffLocation(actor, filter.locationId);
    const scope: Prisma.IncidentWhereInput =
      actor.role === 'ADMIN' || actor.role === 'MANAGER' ? {} : { location: { staff: { some: { userId: actor.id } } } };
    const where: Prisma.IncidentWhereInput = {
      ...scope,
      ...(filter.locationId ? { locationId: filter.locationId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.incident.findMany({ where, include: incidentInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.incident.count({ where }),
    ]);
    return { items: items.map(incidentDto), total, page, pageSize };
  }

  async createIncident(
    actor: Actor,
    input: { locationId: string; bookingId?: string | null; type: Prisma.IncidentCreateInput['type']; description: string },
    meta: RequestMeta,
  ) {
    await this.bookings.assertStaffLocation(actor, input.locationId);
    const i = await this.prisma.incident.create({
      data: {
        locationId: input.locationId,
        bookingId: input.bookingId ?? null,
        type: input.type,
        description: input.description,
        reportedById: actor.id,
      },
      include: incidentInclude,
    });
    await this.audit.log({ actorId: actor.id, action: 'incident.created', entityType: 'incident', entityId: i.id, meta });
    void this.webhooks.emit(WebhookEvent.INCIDENT_CREATED, { incidentId: i.id, locationId: i.locationId, type: i.type });
    return incidentDto(i);
  }

  async updateIncident(actor: Actor, id: string, status: IncidentStatus, resolution: string | undefined, meta: RequestMeta) {
    const existing = await this.prisma.incident.findUnique({ where: { id } });
    if (!existing) throw Errors.notFound('Incidencia');
    await this.bookings.assertStaffLocation(actor, existing.locationId);
    const i = await this.prisma.incident.update({
      where: { id },
      data: {
        status,
        resolution,
        ...(status === 'RESOLVED' ? { resolvedAt: new Date(), resolvedById: actor.id } : { resolvedAt: null, resolvedById: null }),
      },
      include: incidentInclude,
    });
    await this.audit.log({ actorId: actor.id, action: 'incident.updated', entityType: 'incident', entityId: id, metadata: { status }, meta });
    return incidentDto(i);
  }
}

function incidentDto(i: Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>): IncidentDto {
  return {
    id: i.id,
    type: i.type,
    status: i.status,
    description: i.description,
    resolution: i.resolution,
    location: i.location,
    bookingReference: i.booking?.reference ?? null,
    reportedBy: { id: i.reportedBy.id, name: `${i.reportedBy.firstName} ${i.reportedBy.lastName}` },
    createdAt: i.createdAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
  };
}
