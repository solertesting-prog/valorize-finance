-- Canal de origen de cada cita y verificación on-chain de las transacciones de cambio.

CREATE TYPE "BookingChannel" AS ENUM ('WEB', 'APP', 'BACKOFFICE');
CREATE TYPE "TxCheckStatus" AS ENUM ('PENDING', 'VERIFIED', 'WARNING', 'MISMATCH', 'NOT_FOUND', 'FAILED', 'ERROR');

ALTER TABLE "bookings" ADD COLUMN "channel" "BookingChannel" NOT NULL DEFAULT 'WEB';
CREATE INDEX "bookings_channel_createdAt_idx" ON "bookings"("channel", "createdAt");

ALTER TABLE "exchange_requests"
  ADD COLUMN "txCheckStatus" "TxCheckStatus",
  ADD COLUMN "txCheck" JSONB,
  ADD COLUMN "txCheckedAt" TIMESTAMP(3);
CREATE INDEX "exchange_requests_txCheckStatus_idx" ON "exchange_requests"("txCheckStatus");

ALTER TABLE "exchange_settings" ADD COLUMN "receivingAddresses" JSONB NOT NULL DEFAULT '{}';
