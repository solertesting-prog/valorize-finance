import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { paginationSchema, registerDeviceSchema } from '@valorize/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

const listSchema = paginationSchema.extend({
  unread: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

@ApiTags('notificaciones')
@ApiBearerAuth()
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) {
    return this.notifications.list(u.id, q.page, q.pageSize, q.unread);
  }

  @Get('unread-count')
  async unread(@CurrentUser() u: AuthUser) {
    return { count: await this.notifications.unreadCount(u.id) };
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(u.id, id);
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentUser() u: AuthUser) {
    return this.notifications.markAllRead(u.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.remove(u.id, id);
  }

  @Post('devices')
  @HttpCode(204)
  registerDevice(
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(registerDeviceSchema)) b: z.infer<typeof registerDeviceSchema>,
  ) {
    return this.notifications.registerDevice(u.id, b.token, b.platform);
  }

  @Delete('devices/:token')
  @HttpCode(204)
  unregisterDevice(@CurrentUser() u: AuthUser, @Param('token') token: string) {
    return this.notifications.unregisterDevice(u.id, token);
  }
}
