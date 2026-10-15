import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV, Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { TokensService } from './tokens.service';
import { VerificationService } from './verification.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { issuer: 'valorize-api', audience: 'valorize' },
        verifyOptions: { issuer: 'valorize-api', audience: 'valorize' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, VerificationService, MfaService],
  exports: [TokensService, MfaService, VerificationService],
})
export class AuthModule {}
