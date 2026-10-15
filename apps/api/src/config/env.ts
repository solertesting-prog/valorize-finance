import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().url(),
  API_PUBLIC_URL: z.string().url(),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.coerce.number().default(1),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  QR_SIGNING_SECRET: z.string().min(32),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'FIELD_ENCRYPTION_KEY debe ser 32 bytes en base64'),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: bool,
  MAIL_FROM: z.string().default('Valorize Finance <no-reply@valorize.finance>'),

  SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),

  EXPO_ACCESS_TOKEN: z.string().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('eu-west-1'),
  S3_BUCKET: z.string().default('valorize-private'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,

  RATE_LIMIT_TTL_SEC: z.coerce.number().default(60),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),

  CANCEL_CUTOFF_MIN: z.coerce.number().default(60),
  MAX_RESCHEDULES: z.coerce.number().default(3),
  MAX_ACTIVE_BOOKINGS_PER_USER: z.coerce.number().default(3),
  NO_SHOW_GRACE_MIN: z.coerce.number().default(15),
  CHECKIN_EARLY_MIN: z.coerce.number().default(60),
  REMINDER_HOURS_BEFORE: z.coerce.number().default(24),
  DISABLE_JOBS: bool,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production') {
    for (const k of ['JWT_ACCESS_SECRET', 'QR_SIGNING_SECRET'] as const) {
      if (parsed.data[k].startsWith('change-me')) throw new Error(`${k} no puede usar el valor de ejemplo en producción`);
    }
  }
  cached = parsed.data;
  return cached;
}

export const ENV = Symbol('ENV');
