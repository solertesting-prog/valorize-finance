import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  blockedAddressSchema,
  ChainNetwork,
  exchangeSettingsSchema,
  paginationSchema,
  quoteQuerySchema,
  walletInputSchema,
  walletListQuerySchema,
  walletReviewSchema,
} from '@valorize/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser, Public, ReqMeta, RequestMeta, Roles } from '../common/auth.decorators';
import { Errors } from '../common/errors';
import { ZodPipe } from '../common/zod-validation.pipe';
import { WalletScreeningService } from './screening.service';
import { WalletsService } from './wallets.service';
import { RatesService } from '../bookings/rates.service';

const networkQuery = z.object({
  network: z.enum(Object.values(ChainNetwork) as [ChainNetwork, ...ChainNetwork[]]).optional(),
});

@ApiTags('wallets')
@Controller()
export class WalletsController {
  constructor(
    private readonly wallets: WalletsService,
    private readonly rates: RatesService,
  ) {}

  /** Cotización orientativa (simulador): cuántos euros recibe o paga el cliente. */
  @Public()
  @Get('exchange/quote')
  quote(@Query(new ZodPipe(quoteQuerySchema)) q: z.infer<typeof quoteQuerySchema>) {
    return this.rates.quote(q.direction, q.asset, q.amount);
  }

  /** Condiciones públicas del servicio de cambio (activos, redes, límites). */
  @Public()
  @Get('exchange/settings')
  settings() {
    return this.wallets.settings();
  }

  @ApiBearerAuth()
  @Get('me/wallets')
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(networkQuery)) q: z.infer<typeof networkQuery>) {
    return this.wallets.listMine(u.id, q.network);
  }

  @ApiBearerAuth()
  @Post('me/wallets')
  async add(@CurrentUser() u: AuthUser, @Body(new ZodPipe(walletInputSchema)) b: z.infer<typeof walletInputSchema>, @ReqMeta() meta: RequestMeta) {
    return this.wallets.customerDto(await this.wallets.upsertForUser(u.id, b, meta));
  }

  @ApiBearerAuth()
  @Delete('me/wallets/:id')
  @HttpCode(204)
  archive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.wallets.archive(u.id, id);
  }
}

@ApiTags('admin · wallets')
@ApiBearerAuth()
@Roles('MANAGER', 'ADMIN')
@Controller('admin')
export class AdminWalletsController {
  constructor(
    private readonly wallets: WalletsService,
    private readonly screening: WalletScreeningService,
  ) {}

  @Get('wallets')
  list(@Query(new ZodPipe(walletListQuerySchema)) q: z.infer<typeof walletListQuerySchema>) {
    return this.wallets.adminList(q);
  }

  @Get('wallets/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.wallets.adminDetail(id, u.id, meta);
  }

  @Post('wallets/:id/screen')
  async rescreen(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.screening.screen(id, {}, u.id);
    return this.wallets.latestScreening(id);
  }

  @Post('wallets/:id/review')
  async review(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(walletReviewSchema)) b: z.infer<typeof walletReviewSchema>,
    @ReqMeta() meta: RequestMeta,
  ) {
    try {
      await this.screening.review(id, b.decision, b.note, u.id, meta);
    } catch (e) {
      throw Errors.unprocessable('NO_SCREENING', (e as Error).message);
    }
    return this.wallets.latestScreening(id);
  }

  @Get('blocked-addresses')
  blocked(@Query(new ZodPipe(paginationSchema)) q: z.infer<typeof paginationSchema>) {
    return this.wallets.blockedList(q);
  }

  @Post('blocked-addresses')
  addBlocked(@CurrentUser() u: AuthUser, @Body(new ZodPipe(blockedAddressSchema)) b: z.infer<typeof blockedAddressSchema>, @ReqMeta() meta: RequestMeta) {
    return this.wallets.addBlocked(b.address, b.reason, u.id, meta);
  }

  @Delete('blocked-addresses/:id')
  @HttpCode(204)
  removeBlocked(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.wallets.removeBlocked(id, u.id, meta);
  }

  @Roles('ADMIN')
  @Post('blocked-addresses/sync-ofac')
  async syncOfac() {
    try {
      return await this.wallets.syncOfac();
    } catch (e) {
      throw Errors.unprocessable('OFAC_SYNC_FAILED', (e as Error).message);
    }
  }

  @Get('exchange-settings')
  settings() {
    return this.wallets.settings(true);
  }

  @Roles('ADMIN')
  @Put('exchange-settings')
  updateSettings(@CurrentUser() u: AuthUser, @Body(new ZodPipe(exchangeSettingsSchema)) b: z.infer<typeof exchangeSettingsSchema>, @ReqMeta() meta: RequestMeta) {
    return this.wallets.updateSettings(b, u.id, meta);
  }
}
