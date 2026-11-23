-- Bloque 3: prueba de propiedad de wallets, periodo de espera y alertas de cumplimiento.
ALTER TABLE "crypto_wallets"
  ADD COLUMN "ownershipVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "ownershipMethod" VARCHAR(20),
  ADD COLUMN "ownershipProof" JSONB,
  ADD COLUMN "ownershipChallenge" VARCHAR(400),
  ADD COLUMN "ownershipChallengeAt" TIMESTAMP(3);

ALTER TABLE "exchange_settings"
  ADD COLUMN "ownershipRequiredAbove" DECIMAL(20,6) NOT NULL DEFAULT 1000,
  ADD COLUMN "walletCooldownHours" INTEGER NOT NULL DEFAULT 24;

CREATE TYPE "AlertRule" AS ENUM ('STRUCTURING', 'VELOCITY', 'MANY_WALLETS', 'SHARED_WALLET', 'BLOCKED_WALLET_ATTEMPT', 'REPEATED_REJECTIONS');
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'CLOSED');

CREATE TABLE "compliance_alerts" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "bookingId" UUID,
  "walletId" UUID,
  "rule" "AlertRule" NOT NULL,
  "severity" "AlertSeverity" NOT NULL,
  "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
  "details" JSONB NOT NULL,
  "resolution" VARCHAR(30),
  "note" VARCHAR(2000),
  "reviewedById" UUID,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "compliance_alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "compliance_alerts_status_createdAt_idx" ON "compliance_alerts"("status", "createdAt");
CREATE INDEX "compliance_alerts_userId_rule_status_idx" ON "compliance_alerts"("userId", "rule", "status");
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
