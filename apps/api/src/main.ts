import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: { id?: string; headers: Record<string, unknown> }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    const incoming = req.headers['x-request-id'];
    req.id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    maxAge: 600,
  });

  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  app.enableShutdownHooks();

  if (env.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Valorize Finance API')
        .setDescription('Registro, reservas, identificación por QR y operación presencial.')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, doc);
  }

  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`API escuchando en :${env.PORT} (${env.NODE_ENV})`, 'Bootstrap');
}

void bootstrap();
