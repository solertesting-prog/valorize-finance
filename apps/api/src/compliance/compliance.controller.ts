import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { alertQuerySchema, alertUpdateSchema } from '@valorize/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod-validation.pipe';
import { ComplianceService } from './compliance.service';

/** Bandeja de alertas de cumplimiento (prevención de blanqueo). */
@ApiTags('admin · cumplimiento')
@ApiBearerAuth()
@Roles('MANAGER', 'ADMIN')
@Controller('admin/alerts')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get()
  list(@Query(new ZodPipe(alertQuerySchema)) q: z.infer<typeof alertQuerySchema>) {
    return this.compliance.list(q);
  }

  @Get('count')
  async count() {
    return { open: await this.compliance.openCount() };
  }

  @Patch(':id')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(alertUpdateSchema)) b: z.infer<typeof alertUpdateSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.compliance.update(u.id, id, b, meta);
  }
}
