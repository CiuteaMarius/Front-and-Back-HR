-- CreateEnum
CREATE TYPE "attendance_checkout_mode" AS ENUM ('automatic', 'manual');

-- CreateEnum
CREATE TYPE "attendance_approval_status" AS ENUM ('pending', 'approved');

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "check_in_at" TIMESTAMPTZ(6) NOT NULL,
    "scheduled_check_out_at" TIMESTAMPTZ(6) NOT NULL,
    "check_out_at" TIMESTAMPTZ(6) NOT NULL,
    "checkout_mode" "attendance_checkout_mode" NOT NULL DEFAULT 'automatic',
    "worked_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "overtime_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "approval_status" "attendance_approval_status" NOT NULL DEFAULT 'pending',
    "approved_by_manager_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employee_id_attendance_date_key" ON "attendance_records"("employee_id", "attendance_date");

-- CreateIndex
CREATE INDEX "idx_attendance_records_date" ON "attendance_records"("attendance_date");

-- CreateIndex
CREATE INDEX "idx_attendance_records_employee" ON "attendance_records"("employee_id");

-- CreateIndex
CREATE INDEX "idx_attendance_records_approval" ON "attendance_records"("approval_status");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_approved_by_manager_id_fkey" FOREIGN KEY ("approved_by_manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
