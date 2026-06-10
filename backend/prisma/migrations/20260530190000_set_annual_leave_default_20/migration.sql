ALTER TABLE "employees"
  ALTER COLUMN "annual_leave_days" SET DEFAULT 20;

ALTER TABLE "leave_balances"
  ALTER COLUMN "total_days" SET DEFAULT 20;

UPDATE "employees"
SET "annual_leave_days" = 20
WHERE "annual_leave_days" < 20;

ALTER TABLE "employees"
  DROP CONSTRAINT "employees_annual_leave_days_check";

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_annual_leave_days_check"
  CHECK ("annual_leave_days" >= 20);
