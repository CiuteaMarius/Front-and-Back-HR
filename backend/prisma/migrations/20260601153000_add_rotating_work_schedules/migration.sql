ALTER TABLE "employee_work_schedules"
ADD COLUMN "rotation_anchor_date" DATE,
ADD COLUMN "rotation_work_days" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "rotation_off_days" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "rotation_start_time" TEXT NOT NULL DEFAULT '09:00';

ALTER TABLE "employee_work_schedules"
DROP CONSTRAINT "employee_work_schedules_mode_check";

ALTER TABLE "employee_work_schedules"
ADD CONSTRAINT "employee_work_schedules_mode_check"
CHECK ("mode" IN ('fixed', 'shifts', 'rotating'));

ALTER TABLE "employee_work_schedules"
ADD CONSTRAINT "employee_work_schedules_rotation_days_check"
CHECK ("rotation_work_days" >= 1 AND "rotation_off_days" >= 1);
