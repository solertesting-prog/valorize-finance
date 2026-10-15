import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { WEBHOOK_QUEUE, WebhookProcessor, WebhooksService } from './webhooks.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: WEBHOOK_QUEUE })],
  providers: [WebhooksService, WebhookProcessor],
  exports: [WebhooksService],
})
export class WebhooksModule {}
