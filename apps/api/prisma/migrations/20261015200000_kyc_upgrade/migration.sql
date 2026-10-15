-- Solicitud de verificación ampliada de un cliente ya verificado.
ALTER TABLE "kyc_profiles" ADD COLUMN "upgradeRequestedAt" TIMESTAMP(3);
CREATE INDEX "kyc_profiles_upgradeRequestedAt_idx" ON "kyc_profiles"("upgradeRequestedAt");
