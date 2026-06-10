ALTER TABLE "employee_work_schedules"
ADD COLUMN "effective_from" DATE NOT NULL DEFAULT CURRENT_DATE;
