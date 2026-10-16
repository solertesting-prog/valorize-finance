-- Cotización del cambio: tipo de mercado o manual, márgenes, comisión fija y cotización guardada en cada solicitud.
ALTER TABLE "exchange_settings"
  ADD COLUMN "rateSource" VARCHAR(10) NOT NULL DEFAULT 'AUTO',
  ADD COLUMN "manualRates" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "sellSpreadPct" DECIMAL(6,3) NOT NULL DEFAULT 1.5,
  ADD COLUMN "buySpreadPct" DECIMAL(6,3) NOT NULL DEFAULT 1.5,
  ADD COLUMN "fixedFeeEur" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "exchange_requests"
  ADD COLUMN "quotedRate" DECIMAL(20,8),
  ADD COLUMN "quotedFiatAmount" DECIMAL(20,2),
  ADD COLUMN "quotedAt" TIMESTAMP(3);
