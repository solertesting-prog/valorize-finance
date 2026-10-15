// Enumeraciones compartidas entre API, web y app.
// Deben mantenerse alineadas con los enums de prisma/schema.prisma.

export const Role = {
  CUSTOMER: 'CUSTOMER',
  EMPLOYEE: 'EMPLOYEE',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const STAFF_ROLES: Role[] = [Role.EMPLOYEE, Role.MANAGER, Role.ADMIN];
export const ADMIN_ROLES: Role[] = [Role.MANAGER, Role.ADMIN];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const BookingStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  IN_SERVICE: 'IN_SERVICE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

/** Estados que ocupan capacidad en el booking engine. */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN,
  BookingStatus.IN_SERVICE,
];

/** Transiciones permitidas de estado de una cita. */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_SERVICE', 'COMPLETED', 'CANCELLED'],
  IN_SERVICE: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const KycStatus = {
  NOT_STARTED: 'NOT_STARTED',
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const KycFieldType = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  DATE: 'DATE',
  SELECT: 'SELECT',
  COUNTRY: 'COUNTRY',
  DOCUMENT: 'DOCUMENT',
  BOOLEAN: 'BOOLEAN',
} as const;
export type KycFieldType = (typeof KycFieldType)[keyof typeof KycFieldType];

export const NotificationType = {
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_REMINDER: 'BOOKING_REMINDER',
  BOOKING_CHECKED_IN: 'BOOKING_CHECKED_IN',
  BOOKING_COMPLETED: 'BOOKING_COMPLETED',
  BOOKING_NO_SHOW: 'BOOKING_NO_SHOW',
  KYC_STATUS_CHANGED: 'KYC_STATUS_CHANGED',
  SECURITY: 'SECURITY',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const IncidentStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const IncidentType = {
  INVALID_QR: 'INVALID_QR',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  CUSTOMER_COMPLAINT: 'CUSTOMER_COMPLAINT',
  TECHNICAL: 'TECHNICAL',
  OTHER: 'OTHER',
} as const;
export type IncidentType = (typeof IncidentType)[keyof typeof IncidentType];

export const WebhookEvent = {
  USER_REGISTERED: 'user.registered',
  KYC_STATUS_CHANGED: 'kyc.status_changed',
  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_RESCHEDULED: 'booking.rescheduled',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_CHECKED_IN: 'booking.checked_in',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_NO_SHOW: 'booking.no_show',
  INCIDENT_CREATED: 'incident.created',
} as const;
export type WebhookEvent = (typeof WebhookEvent)[keyof typeof WebhookEvent];
export const WEBHOOK_EVENTS = Object.values(WebhookEvent);

export const VerificationChannel = { EMAIL: 'EMAIL', PHONE: 'PHONE' } as const;
export type VerificationChannel = (typeof VerificationChannel)[keyof typeof VerificationChannel];

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'Check-in hecho',
  IN_SERVICE: 'En atención',
  COMPLETED: 'Atendida',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No presentado',
};

export const KYC_STATUS_LABEL: Record<KycStatus, string> = {
  NOT_STARTED: 'Sin iniciar',
  PENDING: 'Pendiente de enviar',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Verificado',
  REJECTED: 'Rechazado',
  EXPIRED: 'Caducado',
};

export const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: 'Cliente',
  EMPLOYEE: 'Empleado',
  MANAGER: 'Responsable',
  ADMIN: 'Administrador',
};
