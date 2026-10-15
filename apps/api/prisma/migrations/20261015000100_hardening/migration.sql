-- Restricciones e invariantes que Prisma no expresa en el schema.

-- Coherencia temporal de citas
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_range_chk" CHECK ("endsAt" > "startsAt");

-- Horarios válidos (minutos desde medianoche, apertura < cierre)
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_range_chk"
  CHECK ("weekday" BETWEEN 1 AND 7 AND "opensAt" >= 0 AND "closesAt" <= 1440 AND "opensAt" < "closesAt");

ALTER TABLE "locations" ADD CONSTRAINT "locations_capacity_chk"
  CHECK ("defaultCapacity" > 0 AND "slotIntervalMin" > 0 AND "bookingHorizonDays" > 0 AND "minNoticeMin" >= 0);

ALTER TABLE "services" ADD CONSTRAINT "services_duration_chk" CHECK ("durationMin" > 0 AND "bufferMin" >= 0);

-- Índice parcial para el cálculo de ocupación (solo citas que consumen capacidad)
CREATE INDEX "bookings_active_slot_idx" ON "bookings" ("locationId", "startsAt", "endsAt")
  WHERE "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE');

-- Cola de webhooks pendientes
CREATE INDEX "webhook_deliveries_due_idx" ON "webhook_deliveries" ("nextAttemptAt")
  WHERE "status" = 'PENDING';

-- Auditoría inmutable: append-only
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
