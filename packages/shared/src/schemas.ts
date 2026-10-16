import { z } from 'zod';
import {
  BookingChannel,
  BookingStatus,
  ChainNetwork,
  CryptoAsset,
  ExchangeDirection,
  ServiceKind,
  WalletRiskStatus,
  IncidentStatus,
  IncidentType,
  KycFieldType,
  KycStatus,
  Role,
  TxCheckStatus,
  UserStatus,
  VerificationChannel,
  WEBHOOK_EVENTS,
} from './enums';

const values = <T extends Record<string, string>>(o: T) =>
  Object.values(o) as [T[keyof T], ...T[keyof T][]];

// ---------- Primitivas ----------
export const emailSchema = z.string().trim().toLowerCase().email('Email no válido').max(254);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, 'Usa formato internacional, p. ej. +34600123456');
export const passwordSchema = z
  .string()
  .min(10, 'Mínimo 10 caracteres')
  .max(128)
  .regex(/[a-z]/, 'Incluye una minúscula')
  .regex(/[A-Z]/, 'Incluye una mayúscula')
  .regex(/\d/, 'Incluye un número');
export const otpSchema = z.string().regex(/^\d{6}$/, 'Código de 6 dígitos');
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora HH:MM');
export const uuid = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

// ---------- Auth ----------
export const clientKindSchema = z.enum(['web', 'mobile']).default('web');

export const registerSchema = z.object({
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(120),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar las condiciones' }) }),
  marketingOptIn: z.boolean().default(false),
  client: clientKindSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  client: clientKindSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const mfaLoginSchema = z.object({
  challengeToken: z.string().min(10),
  code: z.string().trim().min(6).max(12), // TOTP de 6 dígitos o código de recuperación
  client: clientKindSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().optional(), // móvil lo envía en body; web usa cookie httpOnly
  client: clientKindSchema,
});

export const sendVerificationSchema = z.object({ channel: z.enum(values(VerificationChannel)) });
export const confirmVerificationSchema = z.object({
  channel: z.enum(values(VerificationChannel)),
  code: otpSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: otpSchema,
  password: passwordSchema,
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const mfaEnableSchema = z.object({ code: otpSchema });
export const mfaDisableSchema = z.object({ password: z.string().min(1), code: otpSchema });

// ---------- Perfil ----------
export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  phone: phoneSchema.optional(),
  locale: z.enum(['es', 'ca', 'en']).optional(),
  marketingOptIn: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const registerDeviceSchema = z.object({
  token: z.string().min(10).max(255),
  platform: z.enum(['ios', 'android', 'web']),
});

// ---------- KYC genérico ----------
export const kycRequirementSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/, 'snake_case'),
  label: z.string().trim().min(1).max(120),
  helpText: z.string().trim().max(400).optional().nullable(),
  type: z.enum(values(KycFieldType)),
  required: z.boolean().default(true),
  options: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  level: z.number().int().min(1).max(3).default(1),
});
export type KycRequirementInput = z.infer<typeof kycRequirementSchema>;

export const kycSubmitSchema = z.object({
  fields: z
    .array(
      z.object({
        key: z.string().min(1).max(50),
        value: z.string().max(2000).optional().nullable(),
        fileId: uuid.optional().nullable(),
      }),
    )
    .max(100),
  submit: z.boolean().default(false), // false = guardar borrador, true = enviar a revisión
});
export type KycSubmitInput = z.infer<typeof kycSubmitSchema>;

export const kycReviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().max(500).optional(),
  level: z.number().int().min(1).max(3).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const uploadRequestSchema = z.object({
  purpose: z.enum(['KYC_DOCUMENT', 'AVATAR', 'INCIDENT_ATTACHMENT']),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  size: z.number().int().min(1).max(10 * 1024 * 1024),
  fileName: z.string().trim().min(1).max(200),
});
export type UploadRequestInput = z.infer<typeof uploadRequestSchema>;

// ---------- Ubicaciones y servicios ----------
export const openingHoursSchema = z.object({
  weekday: z.number().int().min(1).max(7), // ISO: 1 = lunes
  opensAt: hhmm,
  closesAt: hhmm,
});

export const locationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().max(12).optional().nullable(),
  country: z.string().length(2).default('ES'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().default('Europe/Madrid'),
  phone: phoneSchema.optional().nullable(),
  email: emailSchema.optional().nullable(),
  slotIntervalMin: z.number().int().min(5).max(120).default(15),
  defaultCapacity: z.number().int().min(1).max(100).default(2),
  bookingHorizonDays: z.number().int().min(1).max(365).default(60),
  minNoticeMin: z.number().int().min(0).max(10080).default(60),
  active: z.boolean().default(true),
  openingHours: z.array(openingHoursSchema).max(21).default([]),
  services: z
    .array(z.object({ serviceId: uuid, capacity: z.number().int().min(1).max(100).nullable().optional() }))
    .default([]),
});
export type LocationInput = z.infer<typeof locationSchema>;

export const closureSchema = z.object({
  date: isoDate,
  reason: z.string().trim().max(200).optional(),
});

export const serviceSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]{2,32}$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  durationMin: z.number().int().min(5).max(480),
  bufferMin: z.number().int().min(0).max(120).default(0),
  kind: z.enum(values(ServiceKind)).default('GENERAL'),
  requiresKyc: z.boolean().default(false),
  requiredKycLevel: z.number().int().min(1).max(3).default(1),
  requiresApproval: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  q: z.string().trim().max(80).optional(),
  serviceId: uuid.optional(),
});

// ---------- Reservas ----------
export const availabilityQuerySchema = z.object({
  locationId: uuid,
  serviceId: uuid,
  date: isoDate,
});

// ---------- Cambio cripto ----------
/** Validación de forma (rápida, en cliente). La API hace además la validación completa con checksum. */
export const walletAddressShape: Record<ChainNetwork, RegExp> = {
  TRON: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  ETHEREUM: /^0x[0-9a-fA-F]{40}$/,
  POLYGON: /^0x[0-9a-fA-F]{40}$/,
  BSC: /^0x[0-9a-fA-F]{40}$/,
};

export const walletInputSchema = z
  .object({
    network: z.enum(values(ChainNetwork)),
    address: z.string().trim().min(10).max(100),
    label: z.string().trim().max(60).optional(),
  })
  .refine((w) => walletAddressShape[w.network].test(w.address), {
    message: 'La dirección no tiene el formato de esa red',
    path: ['address'],
  });
export type WalletInput = z.infer<typeof walletInputSchema>;

const amountString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(',', '.').trim())
  .refine((v) => /^\d{1,12}(\.\d{1,6})?$/.test(v) && Number(v) > 0, 'Importe no válido');

export const exchangeInputSchema = z
  .object({
    direction: z.enum(values(ExchangeDirection)),
    asset: z.enum(values(CryptoAsset)),
    network: z.enum(values(ChainNetwork)),
    amount: amountString,
    walletId: uuid.optional(),
    wallet: walletInputSchema.optional(),
  })
  .refine((e) => !!e.walletId !== !!e.wallet, { message: 'Indica una wallet', path: ['wallet'] });
export type ExchangeInput = z.infer<typeof exchangeInputSchema>;

export const createBookingSchema = z.object({
  locationId: uuid,
  serviceId: uuid,
  startsAt: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(500).optional(),
  exchange: exchangeInputSchema.optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const rescheduleBookingSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  locationId: uuid.optional(),
});

export const cancelBookingSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const bookingListQuerySchema = paginationSchema.extend({
  status: z.enum(values(BookingStatus)).optional(),
  locationId: uuid.optional(),
  serviceId: uuid.optional(),
  userId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  scope: z.enum(['upcoming', 'past', 'all']).default('all'),
});

export const scanSchema = z.object({ token: z.string().min(10).max(512) });
export const scanReferenceSchema = z.object({ reference: z.string().trim().toUpperCase().min(6).max(20) });

export const staffTransitionSchema = z.object({
  status: z.enum(['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'NO_SHOW', 'CANCELLED']),
  note: z.string().trim().max(300).optional(),
});

// ---------- Incidencias ----------
export const incidentSchema = z.object({
  locationId: uuid,
  bookingId: uuid.optional().nullable(),
  type: z.enum(values(IncidentType)),
  description: z.string().trim().min(3).max(2000),
});
export const incidentUpdateSchema = z.object({
  status: z.enum(values(IncidentStatus)),
  resolution: z.string().trim().max(2000).optional(),
});

// ---------- Admin ----------
export const adminUserCreateSchema = z.object({
  email: emailSchema,
  phone: phoneSchema.optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(120),
  role: z.enum(values(Role)),
  locationIds: z.array(uuid).default([]),
});
export const adminUserUpdateSchema = z.object({
  role: z.enum(values(Role)).optional(),
  status: z.enum(values(UserStatus)).optional(),
  locationIds: z.array(uuid).optional(),
});
export const userListQuerySchema = paginationSchema.extend({
  role: z.enum(values(Role)).optional(),
  status: z.enum(values(UserStatus)).optional(),
  kycStatus: z.enum(values(KycStatus)).optional(),
});

export const webhookEndpointSchema = z.object({
  url: z.string().url().refine((u) => u.startsWith('https://') || u.startsWith('http://localhost'), {
    message: 'El endpoint debe usar HTTPS',
  }),
  description: z.string().trim().max(200).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS as [string, ...string[]])).min(1),
  active: z.boolean().default(true),
});
export type WebhookEndpointInput = z.infer<typeof webhookEndpointSchema>;

export const analyticsQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  locationId: uuid.optional(),
});

export const auditQuerySchema = paginationSchema.extend({
  actorId: uuid.optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  action: z.string().max(80).optional(),
});

// ---------- Aprobación y wallets (admin) ----------
const optionalDecimal = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(',', '.').trim())
  .refine((v) => v === '' || (/^\d{1,12}(\.\d{1,8})?$/.test(v) && Number(v) >= 0), 'Número no válido')
  .transform((v) => (v === '' ? undefined : v))
  .optional();

export const approveBookingSchema = z.object({
  agreedRate: optionalDecimal,
  fiatAmount: optionalDecimal,
  feeAmount: optionalDecimal,
  note: z.string().trim().max(1000).optional(),
  /** Aprobar aunque la wallet esté en "Revisar" (queda registrado). */
  overrideWalletReview: z.boolean().default(false),
});
export type ApproveBookingInput = z.infer<typeof approveBookingSchema>;

export const rejectBookingSchema = z.object({
  reason: z.string().trim().min(3, 'Indica el motivo').max(300),
});

export const walletReviewSchema = z.object({
  decision: z.enum(['CLEAR', 'BLOCKED']),
  note: z.string().trim().min(3, 'Explica la decisión').max(1000),
});

export const blockedAddressSchema = z.object({
  address: z.string().trim().min(10).max(100),
  reason: z.string().trim().max(300).optional(),
});

export const exchangeSettingsSchema = z.object({
  enabledAssets: z.array(z.enum(values(CryptoAsset))).min(1),
  enabledNetworks: z.array(z.enum(values(ChainNetwork))).min(1),
  sellEnabled: z.boolean(),
  buyEnabled: z.boolean(),
  minAmount: amountString,
  maxAmount: amountString,
  dailyLimitPerUser: amountString,
  monthlyLimitPerUser: amountString,
  enhancedKycAbove: amountString,
  minWalletAgeDays: z.number().int().min(0).max(3650),
  autoApproveEnabled: z.boolean().default(false),
  autoApproveMaxAmount: amountString.default('1000'),
  autoApproveMinCompleted: z.number().int().min(1).max(100).default(2),
  rateSource: z.enum(['AUTO', 'MANUAL']).default('AUTO'),
  manualRates: z
    .object({ USDT: z.string().trim().regex(/^\d{1,4}(\.\d{1,8})?$/, 'Tipo no válido').optional(), USDC: z.string().trim().regex(/^\d{1,4}(\.\d{1,8})?$/, 'Tipo no válido').optional() })
    .default({}),
  sellSpreadPct: z.coerce.number().min(0).max(20).default(1.5),
  buySpreadPct: z.coerce.number().min(0).max(20).default(1.5),
  fixedFeeEur: z.coerce.number().min(0).max(1000).default(0),
  /** Direcciones propias de Valorize por red: se usan para comprobar la contraparte de cada transacción. */
  receivingAddresses: z
    .object({
      TRON: z.array(z.string().trim()).max(20).optional(),
      ETHEREUM: z.array(z.string().trim()).max(20).optional(),
      POLYGON: z.array(z.string().trim()).max(20).optional(),
      BSC: z.array(z.string().trim()).max(20).optional(),
    })
    .superRefine((r, ctx) => {
      for (const n of values(ChainNetwork)) {
        (r[n] ?? []).forEach((a, i) => {
          if (!walletAddressShape[n].test(a)) ctx.addIssue({ code: 'custom', path: [n, i], message: `Dirección no válida para ${n}: ${a}` });
        });
      }
    })
    .default({}),
});
export type ExchangeSettingsInput = z.infer<typeof exchangeSettingsSchema>;

export const walletListQuerySchema = paginationSchema.extend({
  riskStatus: z.enum(values(WalletRiskStatus)).optional(),
  network: z.enum(values(ChainNetwork)).optional(),
});

/** Hash de transacción: EVM 0x + 64 hex; TRON 64 hex. */
export const txHashSchema = z
  .string()
  .trim()
  .regex(/^(0x)?[0-9a-fA-F]{64}$/, 'El hash de la transacción tiene 64 caracteres hexadecimales');

export const completeExchangeSchema = z.object({
  txHash: z.union([txHashSchema, z.literal('')]).optional(),
  agreedRate: optionalDecimal,
  fiatAmount: optionalDecimal,
  feeAmount: optionalDecimal,
  note: z.string().trim().max(300).optional(),
});

export const adminExchangeQuerySchema = paginationSchema.extend({
  status: z.enum(values(BookingStatus)).optional(),
  network: z.enum(values(ChainNetwork)).optional(),
  riskStatus: z.enum(values(WalletRiskStatus)).optional(),
  txStatus: z.union([z.enum(values(TxCheckStatus)), z.literal('NONE')]).optional(),
  channel: z.enum(values(BookingChannel)).optional(),
  locationId: z.string().uuid().optional(),
});
export type AdminExchangeQuery = z.infer<typeof adminExchangeQuerySchema>;

export const quoteQuerySchema = z.object({
  direction: z.enum(values(ExchangeDirection)),
  asset: z.enum(values(CryptoAsset)),
  amount: amountString,
});
export type QuoteQuery = z.infer<typeof quoteQuerySchema>;
