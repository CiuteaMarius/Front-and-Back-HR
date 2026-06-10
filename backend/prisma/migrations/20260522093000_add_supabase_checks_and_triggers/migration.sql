-- Recreate database-level rules from the Supabase public schema that Prisma models
-- do not express directly: CHECK constraints and update timestamp triggers.

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_preferred_language_check"
  CHECK ("preferred_language" = ANY (ARRAY['en'::text, 'ro'::text, 'es'::text])),
  ADD CONSTRAINT "profiles_preferred_theme_check"
  CHECK ("preferred_theme" = ANY (ARRAY['light'::text, 'dark'::text]));

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_annual_leave_days_check"
  CHECK ("annual_leave_days" >= 0),
  ADD CONSTRAINT "employees_salary_gross_check"
  CHECK ("salary_gross" >= 0),
  ADD CONSTRAINT "employees_salary_net_check"
  CHECK ("salary_net" >= 0),
  ADD CONSTRAINT "employees_work_norm_hours_check"
  CHECK ("work_norm_hours" > 0);

ALTER TABLE "employment_contracts"
  ADD CONSTRAINT "employment_contracts_salary_gross_check"
  CHECK ("salary_gross" >= 0),
  ADD CONSTRAINT "employment_contracts_status_check"
  CHECK ("status" = ANY (ARRAY['active'::text, 'suspended'::text, 'ended'::text]));

ALTER TABLE "salary_history"
  ADD CONSTRAINT "salary_history_new_salary_gross_check"
  CHECK ("new_salary_gross" >= 0);

ALTER TABLE "leave_balances"
  ADD CONSTRAINT "leave_balances_total_days_check"
  CHECK ("total_days" >= 0),
  ADD CONSTRAINT "leave_balances_used_days_check"
  CHECK ("used_days" >= 0);

ALTER TABLE "requests"
  ADD CONSTRAINT "requests_check"
  CHECK (("end_date" IS NULL) OR ("start_date" IS NULL) OR ("end_date" >= "start_date"));

ALTER TABLE "work_time_exceptions"
  ADD CONSTRAINT "work_time_exceptions_hours_check"
  CHECK ("hours" >= 0);

ALTER TABLE "announcement_targets"
  ADD CONSTRAINT "announcement_targets_check"
  CHECK ((("department_id" IS NOT NULL) AND ("employee_id" IS NULL)) OR (("department_id" IS NULL) AND ("employee_id" IS NOT NULL)));

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_leave_balance_remaining_days()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.remaining_days = NEW.total_days - NEW.used_days;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON "profiles"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON "departments"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON "employees"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON "employment_contracts"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_requests_updated_at
  BEFORE UPDATE ON "requests"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_work_time_exceptions_updated_at
  BEFORE UPDATE ON "work_time_exceptions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_leave_balances_remaining_days
  BEFORE INSERT OR UPDATE OF "total_days", "used_days" ON "leave_balances"
  FOR EACH ROW EXECUTE FUNCTION set_leave_balance_remaining_days();