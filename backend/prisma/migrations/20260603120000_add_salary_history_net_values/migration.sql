ALTER TABLE "salary_history"
ADD COLUMN IF NOT EXISTS "old_salary_net" DECIMAL,
ADD COLUMN IF NOT EXISTS "new_salary_net" DECIMAL;
