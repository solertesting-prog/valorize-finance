-- Aprobación automática de solicitudes de cambio de clientes de confianza.
ALTER TABLE "exchange_settings"
  ADD COLUMN "autoApproveEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoApproveMaxAmount" DECIMAL(20,6) NOT NULL DEFAULT 1000,
  ADD COLUMN "autoApproveMinCompleted" INTEGER NOT NULL DEFAULT 2;
