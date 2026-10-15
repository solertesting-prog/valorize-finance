import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { kycRequirementSchema, kycReviewSchema, kycSubmitSchema, KycStatus, paginationSchema } from '@valorize/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod-validation.pipe';
import { KycService } from './kyc.service';

@ApiTags('kyc')
@ApiBearerAuth()
@Controller('me/kyc')
export class MyKycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  get(@CurrentUser() u: AuthUser) {
    return this.kyc.getProfile(u.id);
  }

  @Put()
  save(@CurrentUser() u: AuthUser, @Body(new ZodPipe(kycSubmitSchema)) b: z.infer<typeof kycSubmitSchema>, @ReqMeta() meta: RequestMeta) {
    return this.kyc.save(u.id, b, meta);
  }
}

const queueSchema = paginationSchema.extend({
  status: z.enum(Object.values(KycStatus) as [KycStatus, ...KycStatus[]]).optional(),
});
const includeInactiveSchema = z.object({ all: z.enum(['true', 'false']).default('false') });

@ApiTags('admin · kyc')
@ApiBearerAuth()
@Roles('MANAGER', 'ADMIN')
@Controller('admin/kyc')
export class AdminKycController {
  constructor(private readonly kyc: KycService) {}

  @Get('requirements')
  requirements(@Query(new ZodPipe(includeInactiveSchema)) q: z.infer<typeof includeInactiveSchema>) {
    return this.kyc.listRequirements(q.all === 'true');
  }

  @Roles('ADMIN')
  @Post('requirements')
  createRequirement(@Body(new ZodPipe(kycRequirementSchema)) b: z.infer<typeof kycRequirementSchema>) {
    return this.kyc.createRequirement(b);
  }

  @Roles('ADMIN')
  @Patch('requirements/:id')
  updateRequirement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(kycRequirementSchema.partial())) b: Partial<z.infer<typeof kycRequirementSchema>>,
  ) {
    return this.kyc.updateRequirement(id, b);
  }

  @Roles('ADMIN')
  @Delete('requirements/:id')
  deleteRequirement(@Param('id', ParseUUIDPipe) id: string) {
    return this.kyc.deleteRequirement(id);
  }

  @Get('queue')
  queue(@Query(new ZodPipe(queueSchema)) q: z.infer<typeof queueSchema>) {
    return this.kyc.reviewQueue(q.status, q.page, q.pageSize);
  }

  @Get('users/:userId')
  detail(@CurrentUser() u: AuthUser, @Param('userId', ParseUUIDPipe) userId: string, @ReqMeta() meta: RequestMeta) {
    return this.kyc.adminDetail(u.id, userId, meta);
  }

  @Post('users/:userId/review')
  @HttpCode(204)
  review(
    @CurrentUser() u: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodPipe(kycReviewSchema)) b: z.infer<typeof kycReviewSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.kyc.review(u.id, userId, b.decision, { reason: b.reason, level: b.level, expiresAt: b.expiresAt }, meta);
  }
}
