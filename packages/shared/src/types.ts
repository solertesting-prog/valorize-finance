import type {
  BookingStatus,
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
  requiresKyc: boolean;
  requiredKycLevel: number;
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
  startsAt: string;
  endsAt: string;
  notes: string | null;
  location: Pick<LocationDto, 'id' | 'name' | 'address' | 'city' | 'timezone' | 'latitude' | 'longitude'>;
  service: Pick<ServiceDto, 'id' | 'code' | 'name' | 'durationMin'>;
  customer?: { id: string; firstName: string; lastName: string; email: string; phone: string | null; kycStatus: KycStatus };
  checkedInAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  rescheduleCount: number;
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
  reference: string;
  expiresAt: string;
}

export interface ScanResultDto {
  valid: boolean;
  reason?: 'INVALID_TOKEN' | 'NOT_FOUND' | 'WRONG_LOCATION' | 'WRONG_DAY' | 'CANCELLED' | 'ALREADY_USED' | 'EXPIRED';
  booking?: BookingDto;
  warnings: string[];
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
  level: number;
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
