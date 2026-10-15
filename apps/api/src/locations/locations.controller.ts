import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { closureSchema, locationSchema, nearbyQuerySchema, serviceSchema } from '@valorize/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser, Public, ReqMeta, RequestMeta, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod-validation.pipe';
import { LocationsService } from './locations.service';

const allSchema = z.object({ all: z.enum(['true', 'false']).default('false') });

@ApiTags('ubicaciones')
@Controller()
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Public()
  @Get('locations')
  search(@Query(new ZodPipe(nearbyQuerySchema)) q: z.infer<typeof nearbyQuerySchema>) {
    return this.locations.search(q);
  }

  @Public()
  @Get('locations/:idOrSlug')
  get(@Param('idOrSlug') idOrSlug: string) {
    return this.locations.get(idOrSlug);
  }

  @Public()
  @Get('services')
  services() {
    return this.locations.services(false);
  }
}

@ApiTags('admin · ubicaciones')
@ApiBearerAuth()
@Roles('MANAGER', 'ADMIN')
@Controller('admin')
export class AdminLocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get('locations')
  list(@Query(new ZodPipe(nearbyQuerySchema)) q: z.infer<typeof nearbyQuerySchema>) {
    return this.locations.search(q, true);
  }

  @Get('locations/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.locations.get(id, true);
  }

  @Roles('ADMIN')
  @Post('locations')
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(locationSchema)) b: z.infer<typeof locationSchema>, @ReqMeta() meta: RequestMeta) {
    return this.locations.create(b, u.id, meta);
  }

  @Patch('locations/:id')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(locationSchema.partial())) b: Partial<z.infer<typeof locationSchema>>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.locations.update(id, b, u.id, meta);
  }

  @Get('locations/:id/closures')
  closures(@Param('id', ParseUUIDPipe) id: string) {
    return this.locations.closures(id);
  }

  @Post('locations/:id/closures')
  addClosure(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(closureSchema)) b: z.infer<typeof closureSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.locations.addClosure(id, b.date, b.reason, u.id, meta);
  }

  @Delete('locations/:id/closures/:closureId')
  @HttpCode(204)
  removeClosure(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('closureId', ParseUUIDPipe) closureId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.locations.removeClosure(id, closureId, u.id, meta);
  }

  @Get('services')
  services(@Query(new ZodPipe(allSchema)) q: z.infer<typeof allSchema>) {
    return this.locations.services(q.all === 'true');
  }

  @Roles('ADMIN')
  @Post('services')
  createService(@CurrentUser() u: AuthUser, @Body(new ZodPipe(serviceSchema)) b: z.infer<typeof serviceSchema>, @ReqMeta() meta: RequestMeta) {
    return this.locations.createService(b, u.id, meta);
  }

  @Roles('ADMIN')
  @Patch('services/:id')
  updateService(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(serviceSchema.partial())) b: Partial<z.infer<typeof serviceSchema>>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.locations.updateService(id, b, u.id, meta);
  }
}
