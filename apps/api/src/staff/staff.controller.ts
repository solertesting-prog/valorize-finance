import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookingStatus, completeExchangeSchema, IncidentStatus, incidentSchema, incidentUpdateSchema, isoDate, paginationSchema, scanSchema, staffTransitionSchema, uuid } from '@valorize/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod-validation.pipe';
import { BookingsService } from '../bookings/bookings.service';
import { StaffService } from './staff.service';

const dayQuery = z.object({
  locationId: uuid,
  date: isoDate.optional(),
  status: z.enum(Object.values(BookingStatus) as [BookingStatus, ...BookingStatus[]]).optional(),
  q: z.string().trim().max(60).optional(),
});
const scanBody = scanSchema.extend({ locationId: uuid });
const incidentQuery = paginationSchema.extend({
  locationId: uuid.optional(),
  status: z.enum(Object.values(IncidentStatus) as [IncidentStatus, ...IncidentStatus[]]).optional(),
});
const rescheduleBody = z.object({ startsAt: z.string().datetime({ offset: true }), locationId: uuid.optional() });

@ApiTags('panel del empleado')
@ApiBearerAuth()
@Roles('EMPLOYEE', 'MANAGER', 'ADMIN')
@Controller('staff')
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly bookings: BookingsService,
  ) {}

  @Get('locations')
  locations(@CurrentUser() u: AuthUser) {
    return this.staff.myLocations(u);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() u: AuthUser, @Query(new ZodPipe(dayQuery)) q: z.infer<typeof dayQuery>) {
    return this.staff.dashboard(u, q.locationId, q.date);
  }

  @Get('bookings')
  agenda(@CurrentUser() u: AuthUser, @Query(new ZodPipe(dayQuery)) q: z.infer<typeof dayQuery>) {
    return this.staff.agenda(u, q.locationId, q.date, q.status, q.q);
  }

  @Get('bookings/by-reference/:reference')
  byReference(@CurrentUser() u: AuthUser, @Param('reference') reference: string) {
    return this.staff.findByReference(u, reference);
  }

  @Get('bookings/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.bookingDetail(u, id);
  }

  @Post('scan')
  scan(@CurrentUser() u: AuthUser, @Body(new ZodPipe(scanBody)) b: z.infer<typeof scanBody>, @ReqMeta() meta: RequestMeta) {
    return this.bookings.scan(u, b.token, b.locationId, meta);
  }

  @Post('bookings/:id/transition')
  transition(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(staffTransitionSchema)) b: z.infer<typeof staffTransitionSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.bookings.staffTransition(u, id, b.status, b.note, meta);
  }

  @Post('bookings/:id/reschedule')
  async reschedule(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rescheduleBody)) b: z.infer<typeof rescheduleBody>,
    @ReqMeta() meta: RequestMeta,
  ) {
    const existing = await this.bookings.findAny(id);
    await this.bookings.assertStaffLocation(u, existing.locationId);
    if (b.locationId) await this.bookings.assertStaffLocation(u, b.locationId);
    return this.bookings.reschedule(u, id, b.startsAt, b.locationId, meta);
  }

  @Post('bookings/:id/exchange')
  settlement(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(completeExchangeSchema)) b: z.infer<typeof completeExchangeSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.bookings.updateExchangeSettlement(u, id, b, meta);
  }

  @Get('incidents')
  incidents(@CurrentUser() u: AuthUser, @Query(new ZodPipe(incidentQuery)) q: z.infer<typeof incidentQuery>) {
    return this.staff.incidents(u, { locationId: q.locationId, status: q.status }, q.page, q.pageSize);
  }

  @Post('incidents')
  createIncident(@CurrentUser() u: AuthUser, @Body(new ZodPipe(incidentSchema)) b: z.infer<typeof incidentSchema>, @ReqMeta() meta: RequestMeta) {
    return this.staff.createIncident(u, b, meta);
  }

  @Patch('incidents/:id')
  updateIncident(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(incidentUpdateSchema)) b: z.infer<typeof incidentUpdateSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.staff.updateIncident(u, id, b.status, b.resolution, meta);
  }
}
