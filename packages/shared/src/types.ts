import type {
  BookingChannel,
  TxCheckStatus,
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
  NotificationType,
  Role,
  UserStatus,
} from './enums';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

export interface MeDto {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  locale: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  marketingOptIn: boolean;
  kycStatus: KycStatus;
  kycLevel: number;
  locationIds: string[];
  createdAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string; // solo clientes móviles
  user: MeDto;
}

export interface MfaChallengeDto {
  mfaRequired: true;
  challengeToken: string;
}

export type LoginResultDto = AuthTokensDto | MfaChallengeDto;

export interface MfaSetupDto {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export interface OpeningHoursDto {
  weekday: number;
  opensAt: string;
  closesAt: string;
}

export interface ServiceDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationMin: number;
  bufferMin: number;
  kind: ServiceKind;
  requiresKyc: boolean;
  requiredKycLevel: number;
  requiresApproval: boolean;
  active: boolean;
}

export interface LocationDto {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  postalCode: string | null;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  phone: string | null;
  email: string | null;
  slotIntervalMin: number;
  defaultCapacity: number;
  bookingHorizonDays: number;
  minNoticeMin: number;
  active: boolean;
  openingHours: OpeningHoursDto[];
  services: (ServiceDto & { capacity: number | null })[];
  distanceKm?: number | null;
  nextAvailable?: string | null;
  openNow?: boolean;
}

export interface SlotDto {
  startsAt: string; // ISO con offset
  endsAt: string;
  label: string; // HH:mm local
  available: number;
  capacity: number;
}

export interface AvailabilityDto {
  date: string;
  timezone: string;
  closed: boolean;
  closedReason?: string | null;
  slots: SlotDto[];
}

export interface BookingDto {
  id: string;
  reference: string;
  status: BookingStatus;
  /** Desde dónde se creó: web, app o backoffice. */
  channel: BookingChannel;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  location: Pick<LocationDto, 'id' | 'name' | 'address' | 'city' | 'timezone' | 'latitude' | 'longitude'>;
  service: Pick<ServiceDto, 'id' | 'code' | 'name' | 'durationMin' | 'kind'>;
  customer?: { id: string; firstName: string; lastName: string; email: string; phone: string | null; kycStatus: KycStatus };
  checkedInAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  rescheduleCount: number;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  exchange: ExchangeDto | null;
  canCancel: boolean;
  canReschedule: boolean;
  createdAt: string;
}

export interface BookingEventDto {
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  note: string | null;
  actor: { id: string; name: string; role: Role } | null;
  createdAt: string;
}

export interface BookingQrDto {
  token: string;
  /** Lo que se codifica en el QR: enlace a la web con el token. */
  url: string;
  reference: string;
  expiresAt: string;
}

export interface ScanResultDto {
  valid: boolean;
  reason?: 'INVALID_TOKEN' | 'NOT_FOUND' | 'WRONG_LOCATION' | 'WRONG_DAY' | 'CANCELLED' | 'ALREADY_USED' | 'EXPIRED' | 'NOT_APPROVED';
  booking?: BookingDto;
  /** Datos de identidad verificados para cotejar con el documento en el mostrador. */
  identity?: IdentitySummaryDto | null;
  warnings: string[];
}

/** Resumen de la identidad verificada del cliente, para el personal del mostrador (acceso auditado). */
export interface IdentitySummaryDto {
  kycStatus: KycStatus;
  kycLevel: number;
  kycExpiresAt: string | null;
  legalName: string | null;
  birthDate: string | null;
  nationality: string | null;
  documentType: string | null;
  /** Solo los últimos 4 caracteres. */
  documentNumberMasked: string | null;
  documentExpiry: string | null;
  documentExpired: boolean;
  /** Fotos del documento (se abren con /files/:id/url; acceso auditado). */
  documentFrontFileId: string | null;
  documentBackFileId: string | null;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface KycRequirementDto {
  id: string;
  key: string;
  label: string;
  helpText: string | null;
  type: KycFieldType;
  required: boolean;
  options: string[];
  sortOrder: number;
  active: boolean;
  level: number;
}

export interface KycProfileDto {
  status: KycStatus;
  /** Nivel aprobado (0 = ninguno, 1 = básico, 2 = ampliado). */
  level: number;
  /** Nivel que cubren los datos enviados (lo que se aprobaría ahora). */
  levelReached: number;
  /** Nivel más alto que se puede solicitar con los requisitos configurados. */
  maxLevel: number;
  /** Fecha en la que un cliente ya verificado envió los datos de la verificación ampliada. */
  upgradeRequestedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  rejectionReason: string | null;
  requirements: KycRequirementDto[];
  fields: { key: string; value: string | null; fileId: string | null; fileName: string | null }[];
}

export interface UploadTicketDto {
  fileId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface DayDashboardDto {
  date: string;
  location: { id: string; name: string };
  totals: { bookings: number; attended: number; pending: number; noShow: number; cancelled: number; inService: number };
  upcoming: BookingDto[];
}

export interface AdminUserDto {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  kycStatus: KycStatus;
  locationIds: string[];
  lastLoginAt: string | null;
  createdAt: string;
  bookingCount?: number;
}

export interface IncidentDto {
  id: string;
  type: IncidentType;
  status: IncidentStatus;
  description: string;
  resolution: string | null;
  location: { id: string; name: string };
  bookingReference: string | null;
  reportedBy: { id: string; name: string };
  createdAt: string;
  resolvedAt: string | null;
}

export interface AnalyticsDto {
  range: { from: string; to: string };
  totals: {
    bookings: number;
    completed: number;
    cancelled: number;
    noShow: number;
    noShowRate: number;
    avgLeadTimeHours: number;
    avgWaitMinutes: number | null;
    occupancyRate: number;
  };
  byDay: { date: string; bookings: number; completed: number; noShow: number; cancelled: number }[];
  byHour: { hour: number; bookings: number }[];
  byService: { serviceId: string; name: string; bookings: number }[];
  byLocation: { locationId: string; name: string; bookings: number; occupancyRate: number; noShowRate: number }[];
}

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actor: { id: string; name: string; role: Role } | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface WebhookEndpointDto {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  secretPreview: string;
  createdAt: string;
  lastDelivery?: { status: string; responseCode: number | null; createdAt: string } | null;
}

export interface WebhookDeliveryDto {
  id: string;
  event: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  attempts: number;
  responseCode: number | null;
  error: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface SessionDto {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  current: boolean;
}

// ───────── Cambio USDT / USDC ─────────

export interface WalletDto {
  id: string;
  network: ChainNetwork;
  address: string;
  label: string | null;
  riskStatus: WalletRiskStatus;
  riskScore: number | null;
  lastScreenedAt: string | null;
  createdAt: string;
}

export interface ExchangeDto {
  id: string;
  direction: ExchangeDirection;
  asset: CryptoAsset;
  network: ChainNetwork;
  amount: string;
  wallet: WalletDto;
  agreedRate: string | null;
  fiatAmount: string | null;
  feeAmount: string | null;
  txHash: string | null;
  /** Solo visible para personal. */
  internalNote?: string | null;
  /** Verificación on-chain de la transacción. Solo visible para personal. */
  txCheck?: TxCheckDto | null;
}

/** Resultado de comprobar en la blockchain la transacción de una operación. */
export interface TxCheckDto {
  status: TxCheckStatus;
  checkedAt: string;
  txHash: string;
  blockNumber: number | null;
  /** Fecha del bloque (ISO). */
  timestamp: string | null;
  confirmations: number | null;
  requiredConfirmations: number;
  /** Transferencia del token que se ha casado con la operación. */
  transfer: { from: string; to: string; amount: string; token: string } | null;
  checks: ScreeningCheckDto[];
}

export type CheckResult = 'pass' | 'warn' | 'fail' | 'error' | 'skip';

export interface ScreeningCheckDto {
  code: string;
  label: string;
  result: CheckResult;
  detail: string;
  provider: string;
}

export interface WalletScreeningDto {
  id: string;
  status: WalletRiskStatus;
  riskScore: number;
  providers: string[];
  checks: ScreeningCheckDto[];
  snapshot: Record<string, unknown> | null;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  reviewDecision: WalletRiskStatus | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface AdminWalletDto extends WalletDto {
  owner: { id: string; name: string; email: string };
  sharedWithOtherCustomers: number;
  exchangeCount: number;
}

export interface AdminWalletDetailDto {
  wallet: AdminWalletDto;
  screenings: WalletScreeningDto[];
  exchanges: {
    bookingId: string;
    reference: string;
    status: BookingStatus;
    direction: ExchangeDirection;
    asset: CryptoAsset;
    amount: string;
    startsAt: string;
    txHash: string | null;
    txCheckStatus: TxCheckStatus | null;
  }[];
}

export interface ExchangeSettingsDto {
  enabledAssets: CryptoAsset[];
  enabledNetworks: ChainNetwork[];
  sellEnabled: boolean;
  buyEnabled: boolean;
  minAmount: string;
  maxAmount: string;
  dailyLimitPerUser: string;
  monthlyLimitPerUser: string;
  enhancedKycAbove: string;
  minWalletAgeDays: number;
  /** Instancia de OpenScan para revisar wallets y transacciones. */
  openscanUrl: string;
  /** Direcciones propias de Valorize por red (solo backoffice). */
  receivingAddresses?: Partial<Record<ChainNetwork, string[]>>;
}

export interface PendingApprovalDto {
  booking: BookingDto;
  screening: WalletScreeningDto | null;
}
