CREATE TABLE "employee_work_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'fixed',
  "weekly_schedule" JSONB NOT NULL DEFAULT '{"1":{"startTime":"09:00"},"2":{"startTime":"09:00"},"3":{"startTime":"09:00"},"4":{"startTime":"09:00"},"5":{"startTime":"09:00"}}'::jsonb,
  "shift_definitions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_work_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_work_schedules_mode_check" CHECK ("mode" IN ('fixed', 'shifts')),
  CONSTRAINT "employee_work_schedules_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "employee_work_schedules_employee_id_key"
  ON "employee_work_schedules"("employee_id");

INSERT INTO "employee_work_schedules" ("employee_id")
SELECT "id" FROM "employees"
ON CONFLICT ("employee_id") DO NOTHING;

DELETE FROM "work_time_exceptions" older
USING "work_time_exceptions" newer
WHERE older."employee_id" = newer."employee_id"
  AND older."type" = newer."type"
  AND older."exception_date" = newer."exception_date"
  AND older."created_at" < newer."created_at";

CREATE UNIQUE INDEX "work_time_exceptions_employee_type_date_key"
  ON "work_time_exceptions"("employee_id", "type", "exception_date");

CREATE INDEX "idx_work_time_exceptions_date"
  ON "work_time_exceptions"("exception_date");

CREATE INDEX "idx_work_time_exceptions_employee"
  ON "work_time_exceptions"("employee_id");
