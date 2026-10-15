-- Generado a partir de prisma/schema.prisma

CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'EMPLOYEE', 'MANAGER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "VerificationChannel" AS ENUM ('EMAIL', 'PHONE');
CREATE TYPE "VerificationPurpose" AS ENUM ('VERIFY_CONTACT', 'PASSWORD_RESET');
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "KycFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'COUNTRY', 'DOCUMENT', 'BOOLEAN');
CREATE TYPE "FilePurpose" AS ENUM ('KYC_DOCUMENT', 'AVATAR', 'INCIDENT_ATTACHMENT');
CREATE TYPE "FileStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'DELETED');
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED', 'BOOKING_REMINDER', 'BOOKING_CHECKED_IN', 'BOOKING_COMPLETED', 'BOOKING_NO_SHOW', 'KYC_STATUS_CHANGED', 'SECURITY', 'SYSTEM');
CREATE TYPE "DevicePlatform" AS ENUM ('ios', 'android', 'web');
CREATE TYPE "IncidentType" AS ENUM ('INVALID_QR', 'IDENTITY_MISMATCH', 'CUSTOMER_COMPLAINT', 'TECHNICAL', 'OTHER');
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(20),
    "passwordHash" TEXT NOT NULL,
    "firstName" VARCHAR(80) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" VARCHAR(5) NOT NULL DEFAULT 'es',
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "termsAcceptedAt" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEnc" TEXT,
    "mfaRecoveryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "mfaEnabledAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "family" UUID NOT NULL,
    "client" VARCHAR(10) NOT NULL DEFAULT 'web',
    "userAgent" VARCHAR(300),
    "ip" VARCHAR(64),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "VerificationChannel" NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "target" VARCHAR(254) NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_requirements" (
    "id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "helpText" VARCHAR(400),
    "type" "KycFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "level" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "level" INTEGER NOT NULL DEFAULT 0,
    "provider" VARCHAR(40) NOT NULL DEFAULT 'manual',
    "providerRef" VARCHAR(120),
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" UUID,
    "rejectionReason" VARCHAR(500),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_field_values" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "requirementId" UUID NOT NULL,
    "valueEnc" TEXT,
    "fileId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "bucket" VARCHAR(80) NOT NULL,
    "key" VARCHAR(300) NOT NULL,
    "fileName" VARCHAR(200) NOT NULL,
    "contentType" VARCHAR(80) NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "postalCode" VARCHAR(12),
    "country" CHAR(2) NOT NULL DEFAULT 'ES',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timezone" VARCHAR(40) NOT NULL DEFAULT 'Europe/Madrid',
    "phone" VARCHAR(20),
    "email" VARCHAR(254),
    "slotIntervalMin" INTEGER NOT NULL DEFAULT 15,
    "defaultCapacity" INTEGER NOT NULL DEFAULT 2,
    "bookingHorizonDays" INTEGER NOT NULL DEFAULT 60,
    "minNoticeMin" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_hours" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opensAt" INTEGER NOT NULL,
    "closesAt" INTEGER NOT NULL,

    CONSTRAINT "opening_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_closures" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "durationMin" INTEGER NOT NULL,
    "bufferMin" INTEGER NOT NULL DEFAULT 0,
    "requiresKyc" BOOLEAN NOT NULL DEFAULT false,
    "requiredKycLevel" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_services" (
    "locationId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "capacity" INTEGER,

    CONSTRAINT "location_services_pkey" PRIMARY KEY ("locationId", "serviceId")
);

-- CreateTable
CREATE TABLE "staff_locations" (
    "userId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_locations_pkey" PRIMARY KEY ("userId", "locationId")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "userId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" VARCHAR(500),
    "qrNonce" VARCHAR(32) NOT NULL,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "remindedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "checkedInById" UUID,
    "serviceStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_events" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "actorId" UUID,
    "note" VARCHAR(300),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_counters" (
    "scope" VARCHAR(20) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reference_counters_pkey" PRIMARY KEY ("scope")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "description" VARCHAR(200),
    "secretEnc" TEXT NOT NULL,
    "events" TEXT[] NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "event" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "responseCode" INTEGER,
    "error" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "bookingId" UUID,
    "type" "IncidentType" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "description" VARCHAR(2000) NOT NULL,
    "resolution" VARCHAR(2000),
    "attachmentId" UUID,
    "reportedById" UUID NOT NULL,
    "resolvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(40),
    "entityId" VARCHAR(64),
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(300),
    "requestId" VARCHAR(64),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");
CREATE INDEX "users_lastName_firstName_idx" ON "users"("lastName", "firstName");
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");
CREATE INDEX "sessions_family_idx" ON "sessions"("family");
CREATE INDEX "verification_codes_userId_channel_purpose_consumedAt_idx" ON "verification_codes"("userId", "channel", "purpose", "consumedAt");
CREATE UNIQUE INDEX "kyc_requirements_key_key" ON "kyc_requirements"("key");
CREATE UNIQUE INDEX "kyc_profiles_userId_key" ON "kyc_profiles"("userId");
CREATE INDEX "kyc_profiles_status_idx" ON "kyc_profiles"("status");
CREATE UNIQUE INDEX "kyc_field_values_profileId_requirementId_key" ON "kyc_field_values"("profileId", "requirementId");
CREATE UNIQUE INDEX "files_key_key" ON "files"("key");
CREATE INDEX "files_ownerId_purpose_idx" ON "files"("ownerId", "purpose");
CREATE UNIQUE INDEX "locations_slug_key" ON "locations"("slug");
CREATE INDEX "locations_city_active_idx" ON "locations"("city", "active");
CREATE INDEX "opening_hours_locationId_weekday_idx" ON "opening_hours"("locationId", "weekday");
CREATE UNIQUE INDEX "location_closures_locationId_date_key" ON "location_closures"("locationId", "date");
CREATE UNIQUE INDEX "services_code_key" ON "services"("code");
CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings"("reference");
CREATE INDEX "bookings_locationId_startsAt_idx" ON "bookings"("locationId", "startsAt");
CREATE INDEX "bookings_userId_startsAt_idx" ON "bookings"("userId", "startsAt");
CREATE INDEX "bookings_status_startsAt_idx" ON "bookings"("status", "startsAt");
CREATE INDEX "booking_events_bookingId_createdAt_idx" ON "booking_events"("bookingId", "createdAt");
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");
CREATE INDEX "webhook_deliveries_endpointId_createdAt_idx" ON "webhook_deliveries"("endpointId", "createdAt");
CREATE INDEX "webhook_deliveries_status_nextAttemptAt_idx" ON "webhook_deliveries"("status", "nextAttemptAt");
CREATE INDEX "incidents_locationId_status_createdAt_idx" ON "incidents"("locationId", "status", "createdAt");
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kyc_field_values" ADD CONSTRAINT "kyc_field_values_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "kyc_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kyc_field_values" ADD CONSTRAINT "kyc_field_values_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "kyc_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_field_values" ADD CONSTRAINT "kyc_field_values_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "files" ADD CONSTRAINT "files_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "location_closures" ADD CONSTRAINT "location_closures_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "location_services" ADD CONSTRAINT "location_services_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "location_services" ADD CONSTRAINT "location_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
