-- Cambio USDT/USDC, aprobación de citas y auditoría de wallets
ALTER TYPE "BookingStatus" ADD VALUE 'REJECTED';
CREATE TYPE "ServiceKind" AS ENUM ('GENERAL', 'CRYPTO_EXCHANGE');
CREATE TYPE "ExchangeDirection" AS ENUM ('SELL_CRYPTO', 'BUY_CRYPTO');
CREATE TYPE "CryptoAsset" AS ENUM ('USDT', 'USDC');
CREATE TYPE "ChainNetwork" AS ENUM ('TRON', 'ETHEREUM', 'POLYGON', 'BSC');
CREATE TYPE "WalletRiskStatus" AS ENUM ('PENDING', 'CLEAR', 'REVIEW', 'BLOCKED');
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_REJECTED';

ALTER TABLE "services" ADD COLUMN "kind" "ServiceKind" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "services" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "approvedById" UUID;
ALTER TABLE "bookings" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "rejectReason" VARCHAR(300);
CREATE TABLE "exchange_requests" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "direction" "ExchangeDirection" NOT NULL,
    "asset" "CryptoAsset" NOT NULL,
    "network" "ChainNetwork" NOT NULL,
    "amount" DECIMAL(20, 6) NOT NULL,
    "walletId" UUID NOT NULL,
    "agreedRate" DECIMAL(20, 8),
    "fiatAmount" DECIMAL(20, 2),
    "feeAmount" DECIMAL(20, 2),
    "internalNote" VARCHAR(1000),
    "txHash" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crypto_wallets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "network" "ChainNetwork" NOT NULL,
    "address" VARCHAR(100) NOT NULL,
    "label" VARCHAR(60),
    "riskStatus" "WalletRiskStatus" NOT NULL DEFAULT 'PENDING',
    "riskScore" INTEGER,
    "lastScreenedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crypto_wallets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallet_screenings" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "status" "WalletRiskStatus" NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "providers" TEXT[] NOT NULL,
    "checks" JSONB NOT NULL,
    "snapshot" JSONB,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewDecision" "WalletRiskStatus",
    "reviewNote" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_screenings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "blocked_addresses" (
    "id" UUID NOT NULL,
    "address" VARCHAR(100) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(300),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exchange_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabledAssets" "CryptoAsset"[] NOT NULL DEFAULT ARRAY['USDT', 'USDC']::"CryptoAsset"[],
    "enabledNetworks" "ChainNetwork"[] NOT NULL DEFAULT ARRAY['TRON', 'ETHEREUM', 'POLYGON', 'BSC']::"ChainNetwork"[],
    "sellEnabled" BOOLEAN NOT NULL DEFAULT true,
    "buyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minAmount" DECIMAL(20, 6) NOT NULL DEFAULT 50,
    "maxAmount" DECIMAL(20, 6) NOT NULL DEFAULT 10000,
    "dailyLimitPerUser" DECIMAL(20, 6) NOT NULL DEFAULT 10000,
    "monthlyLimitPerUser" DECIMAL(20, 6) NOT NULL DEFAULT 50000,
    "enhancedKycAbove" DECIMAL(20, 6) NOT NULL DEFAULT 1000,
    "minWalletAgeDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_settings_pkey" PRIMARY KEY ("id")
);


CREATE INDEX "exchange_requests_walletId_idx" ON "exchange_requests"("walletId");
CREATE INDEX "crypto_wallets_network_address_idx" ON "crypto_wallets"("network", "address");
CREATE INDEX "wallet_screenings_walletId_createdAt_idx" ON "wallet_screenings"("walletId", "createdAt");
CREATE INDEX "blocked_addresses_address_idx" ON "blocked_addresses"("address");
CREATE UNIQUE INDEX "exchange_requests_bookingId_key" ON "exchange_requests"("bookingId");
CREATE UNIQUE INDEX "crypto_wallets_userId_network_address_key" ON "crypto_wallets"("userId", "network", "address");
CREATE UNIQUE INDEX "blocked_addresses_address_source_key" ON "blocked_addresses"("address", "source");
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exchange_requests" ADD CONSTRAINT "exchange_requests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exchange_requests" ADD CONSTRAINT "exchange_requests_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "crypto_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crypto_wallets" ADD CONSTRAINT "crypto_wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_screenings" ADD CONSTRAINT "wallet_screenings_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "crypto_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_screenings" ADD CONSTRAINT "wallet_screenings_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariantes
ALTER TABLE "exchange_requests" ADD CONSTRAINT "exchange_requests_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "exchange_settings" ADD CONSTRAINT "exchange_settings_singleton_chk" CHECK ("id" = 1);
ALTER TABLE "exchange_settings" ADD CONSTRAINT "exchange_settings_limits_chk"
  CHECK ("minAmount" > 0 AND "maxAmount" >= "minAmount" AND "dailyLimitPerUser" > 0 AND "monthlyLimitPerUser" >= "dailyLimitPerUser");

-- Configuración inicial
INSERT INTO "exchange_settings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- El servicio de cambio existente pasa a ser de tipo cambio cripto con aprobación previa
UPDATE "services" SET "kind" = 'CRYPTO_EXCHANGE', "requiresApproval" = true, "requiresKyc" = true
WHERE "code" = 'CAMBIO_PRESENCIAL';
