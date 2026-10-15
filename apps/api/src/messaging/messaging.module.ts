import { Global, Module } from '@nestjs/common';
import { MailerService, PushService, SmsService } from './messaging.service';

@Global()
@Module({
  providers: [MailerService, SmsService, PushService],
  exports: [MailerService, SmsService, PushService],
})
export class MessagingModule {}
