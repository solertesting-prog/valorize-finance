import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  availabilityQuerySchema,
  bookingListQuerySchema,
  cancelBookingSchema,
  createBookingSchema,
  isoDate,
  paginationSchema,
  rescheduleBookingSchema,
  uuid,
} from '@valorize/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentUser, Public, ReqMeta, RequestMeta } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod-validation.pipe';
import { AvailabilityService } from './availability.service';
import { BookingsService } from './bookings.service';

const daysSchema = z.object({
  locationId: uuid,
  serviceId: uuid,
  from: isoDate,
  days: z.coerce.number().int().min(1).max(31).default(14),
});

@ApiTags('reservas')
@Controller()
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly availability: AvailabilityService,
  ) {}

  @Public()
  @Get('availability')
  slots(@Query(new ZodPipe(availabilityQuerySchema)) q: z.infer<typeof availabilityQuerySchema>) {
    return this.availability.forDate(q.locationId, q.serviceId, q.date);
  }

  @Public()
  @Get('availability/days')
  days(@Query(new ZodPipe(daysSchema)) q: z.infer<typeof daysSchema>) {
    return this.availability.days(q.locationId, q.serviceId, q.from, q.days);
  }

  @ApiBearerAuth()
  @Post('me/bookings')
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createBookingSchema)) b: z.infer<typeof createBookingSchema>, @ReqMeta() meta: RequestMeta) {
    return this.bookings.create(u.id, b, meta);
  }

  @ApiBearerAuth()
  @Get('me/bookings')
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(bookingListQuerySchema)) q: z.infer<typeof bookingListQuerySchema>) {
    return this.bookings.listForUser(u.id, q.scope, q.page, q.pageSize);
  }

  /** Historial de operaciones de cambio con los totales del año. */
  @ApiBearerAuth()
  @Get('me/exchanges')
  myExchanges(@CurrentUser() u: AuthUser, @Query(new ZodPipe(paginationSchema)) q: z.infer<typeof paginationSchema>) {
    return this.bookings.myExchanges(u.id, q.page, q.pageSize);
  }

  @ApiBearerAuth()
  @Get('me/bookings/:id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.getForUser(u.id, id);
  }

  @ApiBearerAuth()
  @Get('me/bookings/:id/qr')
  @Header('Cache-Control', 'no-store')
  qr(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.qrForUser(u.id, id);
  }

  /** Enlace de descarga del justificante en PDF (válido 5 minutos). */
  @ApiBearerAuth()
  @Post('me/bookings/:id/receipt-link')
  @Header('Cache-Control', 'no-store')
  receiptLink(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.receiptLink(u, id);
  }

  @ApiBearerAuth()
  @Get('me/bookings/:id/calendar.ics')
  async ics(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const ics = await this.bookings.icsForUser(u.id, id);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="cita-valorize.ics"');
    res.send(ics);
  }

  @ApiBearerAuth()
  @Post('me/bookings/:id/reschedule')
  reschedule(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rescheduleBookingSchema)) b: z.infer<typeof rescheduleBookingSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.bookings.reschedule({ id: u.id, role: 'CUSTOMER' }, id, b.startsAt, b.locationId, meta);
  }

  @ApiBearerAuth()
  @Post('me/bookings/:id/cancel')
  cancel(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cancelBookingSchema)) b: z.infer<typeof cancelBookingSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.bookings.cancel({ id: u.id, role: 'CUSTOMER' }, id, b.reason, meta);
  }
}
