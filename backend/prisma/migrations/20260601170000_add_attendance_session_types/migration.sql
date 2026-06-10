ALTER TABLE "attendance_records"
ADD COLUMN IF NOT EXISTS "session_type" TEXT NOT NULL DEFAULT 'normal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_records_session_type_check'
  ) THEN
    ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_session_type_check"
    CHECK ("session_type" IN ('normal', 'overtime'));
  END IF;
END $$;

DROP INDEX IF EXISTS "attendance_records_employee_id_attendance_date_key";

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_employee_normal_date_key"
ON "attendance_records"("employee_id", "attendance_date")
WHERE "session_type" = 'normal';

CREATE INDEX IF NOT EXISTS "idx_attendance_records_employee_date_type"
ON "attendance_records"("employee_id", "attendance_date", "session_type");
