ALTER TABLE "employment_contracts"
  DROP CONSTRAINT IF EXISTS "employment_contracts_created_by_fkey",
  DROP CONSTRAINT IF EXISTS "employment_contracts_salary_gross_check",
  DROP CONSTRAINT IF EXISTS "employment_contracts_status_check";

ALTER TABLE "employment_contracts"
  DROP COLUMN IF EXISTS "contract_type",
  DROP COLUMN IF EXISTS "position",
  DROP COLUMN IF EXISTS "salary_gross",
  DROP COLUMN IF EXISTS "start_date",
  DROP COLUMN IF EXISTS "end_date",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "created_by";
