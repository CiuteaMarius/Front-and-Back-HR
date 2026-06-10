import cors from "cors";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import express from "express";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { Pool, type PoolClient } from "pg";
import { fileURLToPath } from "url";
import { hashPassword, signToken, verifyPassword, verifyToken } from "./security.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4001);
const authSecret = process.env.AUTH_SECRET ?? "dev-only-change-me";
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(serverDir, "../uploads");
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const allowedTables = {
  profiles: ["id", "email", "full_name", "role", "avatar_url", "preferred_language", "preferred_theme", "created_at", "updated_at"],
  departments: ["id", "name", "icon_key", "description", "created_at", "updated_at", "manager_id"],
  employees: ["id", "profile_id", "employee_code", "first_name", "last_name", "cnp", "email", "phone", "address", "department_id", "position", "salary_gross", "salary_net", "hire_date", "contract_type", "work_norm_hours", "annual_leave_days", "manager_id", "status", "termination_date", "created_at", "updated_at"],
  employment_contracts: ["id", "employee_id", "contract_number", "document_path", "created_at", "updated_at"],
  salary_history: ["id", "employee_id", "old_salary_gross", "new_salary_gross", "old_salary_net", "new_salary_net", "reason", "changed_by", "effective_date", "created_at"],
  leave_balances: ["id", "employee_id", "year", "total_days", "used_days", "remaining_days"],
  requests: ["id", "employee_id", "type", "status", "details", "start_date", "end_date", "requested_salary_gross", "routed_to_role", "assigned_to_employee_id", "decided_by", "decision_comment", "rejection_reason", "submitted_at", "decided_at", "created_at", "updated_at"],
  request_attachments: ["id", "request_id", "uploaded_by", "file_name", "file_path", "mime_type", "created_at"],
  request_approved_dates: ["id", "request_id", "approved_date"],
  request_messages: ["id", "request_id", "sender_profile_id", "body", "created_at"],
  leave_days: ["id", "employee_id", "request_id", "leave_type", "leave_date", "created_at"],
  work_time_exceptions: ["id", "employee_id", "reported_by_manager_id", "type", "exception_date", "hours", "reason", "status", "created_at", "updated_at"],
  attendance_records: ["id", "employee_id", "attendance_date", "check_in_at", "scheduled_check_out_at", "check_out_at", "checkout_mode", "session_type", "worked_hours", "overtime_hours", "approval_status", "approved_by_manager_id", "approved_at", "created_at", "updated_at"],
  employee_work_schedules: ["id", "employee_id", "mode", "weekly_schedule", "shift_definitions", "rotation_anchor_date", "rotation_work_days", "rotation_off_days", "rotation_start_time", "effective_from", "created_at", "updated_at"],
  employee_documents: ["id", "employee_id", "uploaded_by", "title", "category", "file_name", "file_path", "mime_type", "created_at"],
  announcements: ["id", "author_id", "title", "content", "target", "created_at"],
  announcement_targets: ["id", "announcement_id", "department_id", "employee_id"],
  notifications: ["id", "recipient_profile_id", "title", "body", "related_request_id", "read_at", "created_at"],
  report_exports: ["id", "generated_by", "report_type", "department_id", "parameters", "created_at"],
  local_auth_users: ["id", "profile_id", "email", "password_hash", "password_salt", "password_reset_required", "created_at", "updated_at"],
} as const;

type TableName = keyof typeof allowedTables;
type DbFilter = { column: string; op: "eq"; value: unknown };
type DbInFilter = { column: string; values: unknown[] };
type DbOrder = { column: string; ascending?: boolean };
type DbQueryRequest = {
  action: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  filters?: DbFilter[];
  inFilters?: DbInFilter[];
  or?: string;
  order?: DbOrder;
  limit?: number;
  maybeSingle?: boolean;
  values?: Record<string, unknown> | Array<Record<string, unknown>>;
  onConflict?: string;
};

type UploadFileInput = {
  name?: string;
  type?: string;
  contentBase64?: string;
};

type AppUser = {
  id: string;
  profileId: string;
  name: string;
  email: string;
  role: "employee" | "manager" | "hr";
  department: string;
  salary?: number;
  hireDate?: string;
  managerId?: string;
  profilePicture?: string;
};

function queryFilterValues(query: DbQueryRequest, column: string) {
  const values = (query.filters ?? [])
    .filter((filter) => filter.column === column)
    .map((filter) => String(filter.value));
  const inValues = (query.inFilters ?? [])
    .filter((filter) => filter.column === column)
    .flatMap((filter) => filter.values.map(String));
  return [...values, ...inValues];
}

async function authenticatedUser(req: express.Request) {
  const token = requestAuthToken(req);
  const payload = token ? verifyToken(token, authSecret) : null;
  return payload ? buildAppUser(payload.profileId) : null;
}

async function requireHrUser(req: express.Request) {
  const user = await authenticatedUser(req);
  if (!user || user.role !== "hr") {
    throw new Error("HR access is required.");
  }

  return user;
}

type WeeklySchedule = Record<string, { startTime: string; shiftId?: string }>;
type ShiftDefinition = { id: string; name: string; startTime: string };

const defaultWeeklySchedule: WeeklySchedule = {
  "1": { startTime: "09:00" },
  "2": { startTime: "09:00" },
  "3": { startTime: "09:00" },
  "4": { startTime: "09:00" },
  "5": { startTime: "09:00" },
};
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timeOnlyPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizedWeeklySchedule(value: unknown): WeeklySchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A weekly schedule is required.");
  }

  const result: WeeklySchedule = {};
  for (const [day, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[1-7]$/.test(day) || !entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("The weekly schedule contains an invalid day.");
    }

    const scheduleEntry = entry as Record<string, unknown>;
    const startTime = String(scheduleEntry.startTime ?? "");
    if (!timeOnlyPattern.test(startTime)) {
      throw new Error("Every working day must have a valid start time.");
    }
    result[day] = {
      startTime,
      ...(scheduleEntry.shiftId ? { shiftId: String(scheduleEntry.shiftId) } : {}),
    };
  }

  return result;
}

function normalizedShiftDefinitions(value: unknown): ShiftDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((definition) => {
    const item = definition as Record<string, unknown>;
    const id = String(item.id ?? "").trim();
    const name = String(item.name ?? "").trim();
    const startTime = String(item.startTime ?? "");
    if (!id || !name || !timeOnlyPattern.test(startTime)) {
      throw new Error("Every shift must have a name and a valid start time.");
    }
    return { id, name, startTime };
  });
}

function eachDate(from: string, to: string) {
  if (!dateOnlyPattern.test(from) || !dateOnlyPattern.test(to)) {
    throw new Error("Invalid attendance date range.");
  }

  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
    if (dates.length > 370) {
      throw new Error("Attendance date range cannot exceed 370 days.");
    }
  }
  return dates;
}

function weekdayKey(date: string) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 ? "7" : String(day);
}

type PersistedWorkSchedule = {
  mode: string;
  weeklySchedule: WeeklySchedule;
  effectiveFrom: string;
  rotationAnchorDate?: string;
  rotationWorkDays: number;
  rotationOffDays: number;
  rotationStartTime: string;
};
type ScheduledWindow = { attendanceDate: string; start: Date; end: Date };

function calendarDayDifference(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.floor((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86_400_000);
}

function scheduledEntryForDate(schedule: PersistedWorkSchedule | undefined, date: string) {
  if (!schedule) {
    return defaultWeeklySchedule[weekdayKey(date)];
  }

  if (schedule.mode !== "rotating") {
    return schedule.weeklySchedule[weekdayKey(date)];
  }

  if (!schedule.rotationAnchorDate || date < schedule.rotationAnchorDate) {
    return undefined;
  }

  const cycleLength = schedule.rotationWorkDays + schedule.rotationOffDays;
  const cycleDay = calendarDayDifference(schedule.rotationAnchorDate, date) % cycleLength;
  return cycleDay < schedule.rotationWorkDays ? { startTime: schedule.rotationStartTime } : undefined;
}

function databaseDateOnly(value: unknown) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return String(value).slice(0, 10);
}

function localDateString(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addLocalCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDateString(value);
}

function nextLocalMidnight(date: string) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + 1);
  return value;
}

function hoursBetween(from: Date, to: Date) {
  return Math.round(Math.max(0, to.getTime() - from.getTime()) / 36_000) / 100;
}

async function scheduledWindowForDate(client: PoolClient, employeeId: string, date: string): Promise<ScheduledWindow | undefined> {
  const { rows } = await client.query(
    `
      SELECT
        employee.work_norm_hours,
        schedule.mode,
        schedule.weekly_schedule,
        schedule.effective_from,
        schedule.rotation_anchor_date,
        schedule.rotation_work_days,
        schedule.rotation_off_days,
        schedule.rotation_start_time
      FROM employees employee
      LEFT JOIN employee_work_schedules schedule ON schedule.employee_id = employee.id
      WHERE employee.id = $1
      LIMIT 1
    `,
    [employeeId],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Employee not found.");
  }

  const schedule: PersistedWorkSchedule | undefined = row.mode ? {
    mode: String(row.mode),
    weeklySchedule: row.weekly_schedule as WeeklySchedule,
    effectiveFrom: databaseDateOnly(row.effective_from),
    rotationAnchorDate: row.rotation_anchor_date ? databaseDateOnly(row.rotation_anchor_date) : undefined,
    rotationWorkDays: Number(row.rotation_work_days ?? 1),
    rotationOffDays: Number(row.rotation_off_days ?? 1),
    rotationStartTime: String(row.rotation_start_time ?? "09:00"),
  } : undefined;
  if (schedule?.effectiveFrom && date < schedule.effectiveFrom) {
    return undefined;
  }

  const entry = scheduledEntryForDate(schedule, date);
  if (!entry) {
    return undefined;
  }

  const start = new Date(`${date}T${entry.startTime}:00`);
  return {
    attendanceDate: date,
    start,
    end: new Date(start.getTime() + Number(row.work_norm_hours ?? 8) * 60 * 60 * 1000),
  };
}

async function scheduledWindowForMoment(client: PoolClient, employeeId: string, moment: Date) {
  const date = localDateString(moment);
  const windows = await Promise.all([
    scheduledWindowForDate(client, employeeId, date),
    scheduledWindowForDate(client, employeeId, addLocalCalendarDays(date, -1)),
  ]);
  return windows.find((window) => window && moment >= window.start && moment < window.end);
}

async function deleteAutomaticException(client: PoolClient, employeeId: string, type: "late_arrival" | "unmotivated_absence", date: string) {
  await client.query(
    `
      DELETE FROM work_time_exceptions
      WHERE employee_id = $1
        AND type = $2::work_exception_type
        AND exception_date = $3
        AND reason LIKE '[AUTO]%'
    `,
    [employeeId, type, date],
  );
}

async function upsertAutomaticException(
  client: PoolClient,
  employeeId: string,
  type: "late_arrival" | "unmotivated_absence",
  date: string,
  hours: number,
  reason: string,
) {
  await client.query(
    `
      INSERT INTO work_time_exceptions (employee_id, type, exception_date, hours, reason, status)
      VALUES ($1, $2::work_exception_type, $3, $4, $5, 'closed')
      ON CONFLICT (employee_id, type, exception_date)
      DO UPDATE SET hours = EXCLUDED.hours, reason = EXCLUDED.reason, status = 'closed', updated_at = CURRENT_TIMESTAMP
    `,
    [employeeId, type, date, hours, `[AUTO] ${reason}`],
  );
}

async function syncAttendanceExceptions(client: PoolClient, employeeIds: string[], from: string, to: string) {
  if (!employeeIds.length) return;

  const dates = eachDate(from, to);
  const [employeeResult, scheduleResult, attendanceResult, leaveResult] = await Promise.all([
    client.query(
      "SELECT id, hire_date, work_norm_hours FROM employees WHERE id = ANY($1::uuid[])",
      [employeeIds],
    ),
    client.query(
      `
        SELECT employee_id, mode, weekly_schedule, effective_from,
          rotation_anchor_date, rotation_work_days, rotation_off_days, rotation_start_time
        FROM employee_work_schedules
        WHERE employee_id = ANY($1::uuid[])
      `,
      [employeeIds],
    ),
    client.query(
      "SELECT employee_id, attendance_date, check_in_at FROM attendance_records WHERE employee_id = ANY($1::uuid[]) AND attendance_date BETWEEN $2 AND $3 AND session_type = 'normal'",
      [employeeIds, from, to],
    ),
    client.query(
      "SELECT employee_id, leave_date FROM leave_days WHERE employee_id = ANY($1::uuid[]) AND leave_date BETWEEN $2 AND $3",
      [employeeIds, from, to],
    ),
  ]);
  const schedules = new Map(scheduleResult.rows.map((row) => [String(row.employee_id), {
    mode: String(row.mode ?? "fixed"),
    weeklySchedule: row.weekly_schedule as WeeklySchedule,
    effectiveFrom: databaseDateOnly(row.effective_from),
    rotationAnchorDate: row.rotation_anchor_date ? databaseDateOnly(row.rotation_anchor_date) : undefined,
    rotationWorkDays: Number(row.rotation_work_days ?? 1),
    rotationOffDays: Number(row.rotation_off_days ?? 1),
    rotationStartTime: String(row.rotation_start_time ?? "09:00"),
  }]));
  const attendances = new Map(attendanceResult.rows.map((row) => [`${row.employee_id}:${databaseDateOnly(row.attendance_date)}`, row]));
  const leaveDays = new Set(leaveResult.rows.map((row) => `${row.employee_id}:${databaseDateOnly(row.leave_date)}`));
  const now = new Date();

  for (const employee of employeeResult.rows) {
    const employeeId = String(employee.id);
    const persistedSchedule = schedules.get(employeeId);
    const hireDate = databaseDateOnly(employee.hire_date);
    const normHours = Number(employee.work_norm_hours ?? 8);

    for (const date of dates) {
      const entry = scheduledEntryForDate(persistedSchedule, date);
      const key = `${employeeId}:${date}`;
      if (!entry || date < hireDate || (persistedSchedule?.effectiveFrom && date < persistedSchedule.effectiveFrom) || leaveDays.has(key)) {
        await deleteAutomaticException(client, employeeId, "late_arrival", date);
        await deleteAutomaticException(client, employeeId, "unmotivated_absence", date);
        continue;
      }

      const scheduledStart = new Date(`${date}T${entry.startTime}:00`);
      const scheduledEnd = new Date(scheduledStart.getTime() + normHours * 60 * 60 * 1000);
      const attendance = attendances.get(key);

      if (attendance) {
        const lateMinutes = Math.max(0, Math.round((new Date(attendance.check_in_at).getTime() - scheduledStart.getTime()) / 60_000));
        await deleteAutomaticException(client, employeeId, "unmotivated_absence", date);
        if (lateMinutes > 0) {
          await upsertAutomaticException(client, employeeId, "late_arrival", date, lateMinutes / 60, `Check-in was recorded ${lateMinutes} minute(s) after ${entry.startTime}.`);
        } else {
          await deleteAutomaticException(client, employeeId, "late_arrival", date);
        }
      } else if (now >= scheduledEnd) {
        await deleteAutomaticException(client, employeeId, "late_arrival", date);
        await upsertAutomaticException(client, employeeId, "unmotivated_absence", date, normHours, `No check-in was recorded for the scheduled workday starting at ${entry.startTime}.`);
      }
    }
  }
}

async function assertAttendanceAccess(req: express.Request, query: DbQueryRequest) {
  const user = await authenticatedUser(req);
  if (!user) {
    throw new Error("Authentication is required for attendance data.");
  }

  if (user.role === "hr") {
    return;
  }

  const rows = rowList(query.values);
  const employeeIds = [
    ...queryFilterValues(query, "employee_id"),
    ...rows.map((row) => row.employee_id).filter(Boolean).map(String),
  ];
  const recordIds = queryFilterValues(query, "id");

  if (recordIds.length > 0) {
    const result = await pool.query(
      `
        SELECT employee_id
        FROM attendance_records
        WHERE id = ANY($1::uuid[])
      `,
      [recordIds],
    );
    employeeIds.push(...result.rows.map((row) => String(row.employee_id)));
  }

  const uniqueEmployeeIds = Array.from(new Set(employeeIds));
  if (uniqueEmployeeIds.length === 0) {
    throw new Error("Attendance queries must be scoped to permitted employees.");
  }

  if (user.role === "employee") {
    if (uniqueEmployeeIds.some((employeeId) => employeeId !== user.id)) {
      throw new Error("Employees can only access their own attendance.");
    }

    if (query.action !== "select") {
      throw new Error("Employees must use the attendance check-in and checkout actions.");
    }
    return;
  }

  const directReports = await pool.query(
    `
      SELECT id
      FROM employees
      WHERE manager_id = $1
        AND id = ANY($2::uuid[])
    `,
    [user.id, uniqueEmployeeIds],
  );
  const directReportIds = new Set(directReports.rows.map((row) => String(row.id)));
  if (uniqueEmployeeIds.some((employeeId) => !directReportIds.has(employeeId))) {
    throw new Error("Managers can only access attendance for their direct reports.");
  }

  if (query.action === "insert" || query.action === "delete") {
    throw new Error("Managers cannot create or delete employee attendance.");
  }

  if (query.action === "update") {
    const allowedColumns = new Set(["approval_status", "approved_by_manager_id", "approved_at"]);
    const updatedColumns = Object.keys(rows[0] ?? {});
    if (
      updatedColumns.some((column) => !allowedColumns.has(column))
      || rows[0]?.approved_by_manager_id !== user.id
    ) {
      throw new Error("Managers can only approve attendance for their direct reports.");
    }
  }
}

function scopedQuery(query: DbQueryRequest): DbQueryRequest {
  return {
    ...query,
    filters: [...(query.filters ?? [])],
    inFilters: [...(query.inFilters ?? [])],
  };
}

function addFilter(query: DbQueryRequest, column: string, value: unknown) {
  query.filters = [...(query.filters ?? []), { column, op: "eq", value }];
}

function addInFilter(query: DbQueryRequest, column: string, values: unknown[]) {
  query.inFilters = [...(query.inFilters ?? []), { column, values }];
}

function mutationColumnNames(table: TableName, query: DbQueryRequest) {
  return mutationColumns(table, rowList(query.values));
}

function assertOnlyColumns(columns: string[], allowed: string[], message: string) {
  const allowedSet = new Set(allowed);
  if (columns.some((column) => !allowedSet.has(column))) {
    throw new Error(message);
  }
}

function rowsContainOnly(rows: Array<Record<string, unknown>>, column: string, allowedValues: string[], message: string) {
  const allowedSet = new Set(allowedValues);
  if (rows.length === 0 || rows.some((row) => !allowedSet.has(String(row[column] ?? "")))) {
    throw new Error(message);
  }
}

async function permittedEmployeeIds(user: AppUser) {
  if (user.role === "employee") {
    return [user.id];
  }

  const { rows } = await pool.query(
    `
      SELECT id
      FROM employees
      WHERE manager_id = $1
    `,
    [user.id],
  );
  return [user.id, ...rows.map((row) => String(row.id))];
}

async function assertRequestsAllowed(requestIds: string[], allowedEmployeeIds: string[], message: string) {
  if (requestIds.length === 0) {
    throw new Error(message);
  }

  const { rows } = await pool.query(
    `
      SELECT employee_id
      FROM requests
      WHERE id = ANY($1::uuid[])
    `,
    [requestIds],
  );
  if (rows.length !== new Set(requestIds).size) {
    throw new Error(message);
  }

  const allowedSet = new Set(allowedEmployeeIds);
  if (rows.some((row) => !allowedSet.has(String(row.employee_id)))) {
    throw new Error(message);
  }
}

async function assertRequestsExist(requestIds: string[], message: string) {
  if (requestIds.length === 0) {
    throw new Error(message);
  }

  const { rows } = await pool.query(
    `
      SELECT id
      FROM requests
      WHERE id = ANY($1::uuid[])
    `,
    [requestIds],
  );
  if (rows.length !== new Set(requestIds).size) {
    throw new Error(message);
  }
}

async function authorizeRequestMessagesQuery(user: AppUser, query: DbQueryRequest) {
  const requestIds = [
    ...queryFilterValues(query, "request_id"),
    ...rowList(query.values).map((row) => row.request_id).filter(Boolean).map(String),
  ];
  const message = "Users can only access messages for permitted conversations.";

  if (user.role === "hr") {
    await assertRequestsExist(requestIds, message);
  } else {
    await assertRequestsAllowed(requestIds, await permittedEmployeeIds(user), message);
  }

  if (query.action === "insert" || query.action === "upsert") {
    for (const row of rowList(query.values)) {
      row.sender_profile_id = user.profileId;
    }
    assertOnlyColumns(
      mutationColumnNames("request_messages", query),
      ["request_id", "sender_profile_id", "body"],
      "Messages can only contain a body and the current sender.",
    );
  }

  if (query.action !== "select" && query.action !== "insert" && query.action !== "upsert") {
    throw new Error("Messages cannot be edited or deleted from this API.");
  }

  return query;
}

async function assertRequestScopedTableAllowed(
  table: "request_attachments" | "request_approved_dates",
  query: DbQueryRequest,
  allowedEmployeeIds: string[],
  message: string,
) {
  const requestIds = [
    ...queryFilterValues(query, "request_id"),
    ...rowList(query.values).map((row) => row.request_id).filter(Boolean).map(String),
  ];

  if (requestIds.length > 0) {
    await assertRequestsAllowed(requestIds, allowedEmployeeIds, message);
    return;
  }

  const ids = queryFilterValues(query, "id");
  if (ids.length === 0) {
    throw new Error(message);
  }

  const { rows } = await pool.query(
    `
      SELECT r.employee_id
      FROM ${quoteIdent(table)} scoped
      JOIN requests r ON r.id = scoped.request_id
      WHERE scoped.id = ANY($1::uuid[])
    `,
    [ids],
  );
  const allowedSet = new Set(allowedEmployeeIds);
  if (rows.length !== new Set(ids).size || rows.some((row) => !allowedSet.has(String(row.employee_id)))) {
    throw new Error(message);
  }
}

async function assertNotificationsAllowed(query: DbQueryRequest, profileId: string) {
  const ids = queryFilterValues(query, "id");
  if (ids.length === 0) {
    return;
  }

  const { rows } = await pool.query(
    `
      SELECT recipient_profile_id
      FROM notifications
      WHERE id = ANY($1::uuid[])
    `,
    [ids],
  );
  if (rows.length !== new Set(ids).size || rows.some((row) => String(row.recipient_profile_id) !== profileId)) {
    throw new Error("Users can only access their own notifications.");
  }
}

async function authorizeDbQuery(req: express.Request, table: TableName, originalQuery: DbQueryRequest) {
  const user = await authenticatedUser(req);
  if (!user) {
    throw new Error("Authentication is required.");
  }

  const query = scopedQuery(originalQuery);
  if (table === "attendance_records") {
    await assertAttendanceAccess(req, query);
    return query;
  }

  if (table === "request_messages") {
    return authorizeRequestMessagesQuery(user, query);
  }

  if (user.role === "hr") {
    return query;
  }

  const allowedEmployeeIds = await permittedEmployeeIds(user);
  const isManager = user.role === "manager";

  switch (table) {
    case "employees":
      if (query.action === "select") {
        addInFilter(query, "id", allowedEmployeeIds);
        return query;
      }
      if (query.action === "update") {
        assertOnlyColumns(
          mutationColumnNames(table, query),
          ["phone", "address"],
          "Employees can only update their own contact details.",
        );
        addFilter(query, "id", user.id);
        return query;
      }
      break;

    case "profiles":
      if (query.action === "select") {
        addFilter(query, "id", user.profileId);
        return query;
      }
      if (query.action === "update") {
        assertOnlyColumns(
          mutationColumnNames(table, query),
          ["preferred_language", "preferred_theme", "avatar_url"],
          "Users can only update their own profile preferences.",
        );
        addFilter(query, "id", user.profileId);
        return query;
      }
      break;

    case "departments":
    case "announcements":
    case "announcement_targets":
      if (query.action === "select") {
        return query;
      }
      break;

    case "requests":
      if (query.action === "select") {
        addInFilter(query, "employee_id", allowedEmployeeIds);
        return query;
      }
      if (query.action === "insert" || query.action === "upsert") {
        rowsContainOnly(rowList(query.values), "employee_id", [user.id], "Users can only create their own requests.");
        return query;
      }
      if (query.action === "update" && isManager) {
        await assertRequestsAllowed(queryFilterValues(query, "id"), allowedEmployeeIds, "Managers can only answer direct-report requests.");
        assertOnlyColumns(
          mutationColumnNames(table, query),
          ["status", "decided_by", "decided_at", "decision_comment", "rejection_reason"],
          "Managers can only answer requests.",
        );
        for (const row of rowList(query.values)) {
          if (row.decided_by && String(row.decided_by) !== user.profileId) {
            throw new Error("Managers can only sign their own request decisions.");
          }
        }
        return query;
      }
      break;

    case "request_attachments":
    case "request_approved_dates":
      await assertRequestScopedTableAllowed(table, query, allowedEmployeeIds, "Users can only access documents and dates for permitted requests.");
      return query;

    case "leave_days":
    case "leave_balances":
    case "salary_history":
    case "employment_contracts":
    case "employee_documents":
    case "employee_work_schedules":
    case "work_time_exceptions":
      if (query.action === "select") {
        addInFilter(query, "employee_id", allowedEmployeeIds);
        return query;
      }
      if (table === "leave_days" && isManager && (query.action === "insert" || query.action === "upsert")) {
        rowsContainOnly(rowList(query.values), "employee_id", allowedEmployeeIds, "Managers can only manage leave days for direct reports.");
        return query;
      }
      if (table === "leave_days" && isManager && query.action === "delete") {
        const requestIds = queryFilterValues(query, "request_id");
        if (requestIds.length > 0) {
          await assertRequestsAllowed(requestIds, allowedEmployeeIds, "Managers can only manage leave days for direct reports.");
          return query;
        }
      }
      break;

    case "notifications":
      if (query.action === "select") {
        addFilter(query, "recipient_profile_id", user.profileId);
        return query;
      }
      if (query.action === "insert" || query.action === "upsert") {
        return query;
      }
      if (query.action === "update" || query.action === "delete") {
        await assertNotificationsAllowed(query, user.profileId);
        addFilter(query, "recipient_profile_id", user.profileId);
        return query;
      }
      break;

    case "report_exports":
      if (query.action === "select") {
        addFilter(query, "generated_by", user.profileId);
        return query;
      }
      break;

    case "local_auth_users":
      break;
  }

  throw new Error("You do not have permission to access this data.");
}

function authHeaderToken(header: string | undefined) {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

function requestAuthToken(req: express.Request) {
  const queryToken = typeof req.query.token === "string" ? req.query.token : null;
  return authHeaderToken(req.headers.authorization) ?? queryToken;
}

async function canAccessFile(user: AppUser, filePath: string) {
  if (user.role === "hr") {
    return true;
  }

  const employeeIds = await permittedEmployeeIds(user);
  const { rows } = await pool.query(
    `
      SELECT 1
      FROM request_attachments ra
      JOIN requests r ON r.id = ra.request_id
      WHERE ra.file_path = $1 AND r.employee_id = ANY($2::uuid[])
      UNION ALL
      SELECT 1
      FROM employee_documents ed
      WHERE ed.file_path = $1 AND ed.employee_id = ANY($2::uuid[])
      UNION ALL
      SELECT 1
      FROM employment_contracts ec
      WHERE ec.document_path = $1 AND ec.employee_id = ANY($2::uuid[])
      LIMIT 1
    `,
    [filePath, employeeIds],
  );
  return rows.length > 0;
}

function sanitizeFileName(fileName: string) {
  const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeName || "document";
}

function sanitizeFolder(folder: string | undefined) {
  return String(folder ?? "general")
    .split("/")
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_"))
    .filter(Boolean)
    .join("/");
}

async function storeUploadedFiles(folder: string, files: UploadFileInput[]) {
  const targetDir = path.resolve(uploadRoot, sanitizeFolder(folder));
  if (!targetDir.startsWith(uploadRoot)) {
    throw new Error("Invalid upload folder.");
  }

  await mkdir(targetDir, { recursive: true });

  const uploadedFiles = [];
  for (const file of files) {
    const originalName = sanitizeFileName(String(file.name ?? "document"));
    const contentBase64 = String(file.contentBase64 ?? "");

    if (!contentBase64) {
      throw new Error(`Missing content for ${originalName}.`);
    }

    const storedName = `${randomUUID()}-${originalName}`;
    const absolutePath = path.join(targetDir, storedName);
    await writeFile(absolutePath, Buffer.from(contentBase64, "base64"));

    uploadedFiles.push({
      fileName: originalName,
      filePath: path.relative(uploadRoot, absolutePath).replaceAll("\\", "/"),
      mimeType: file.type || "application/octet-stream",
    });
  }

  return uploadedFiles;
}

async function deleteUploadedFile(filePath: string | null | undefined) {
  if (!filePath || /^https?:\/\//i.test(filePath)) return;

  const absolutePath = path.resolve(uploadRoot, filePath);
  const relativePath = path.relative(uploadRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid stored document path.");
  }

  await unlink(absolutePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

function assertTable(table: string): asserts table is TableName {
  if (!(table in allowedTables)) {
    throw new Error(`Table ${table} is not exposed by the local API.`);
  }
}

function assertColumn(table: TableName, column: string) {
  if (!(allowedTables[table] as readonly string[]).includes(column)) {
    throw new Error(`Column ${table}.${column} is not exposed by the local API.`);
  }
}

function quoteIdent(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function normalizeValue(value: unknown) {
  return value === undefined ? null : value;
}

function normalizeRowValues(row: Record<string, unknown>) {
  if (typeof row.recipient_profile_id === "string") {
    row.recipient_profile_id = row.recipient_profile_id || null;
  }

  if (row.target === "specific") {
    row.target = "employees";
  }

  return row;
}

function buildWhere(table: TableName, query: DbQueryRequest, params: unknown[]) {
  const clauses: string[] = [];

  for (const filter of query.filters ?? []) {
    assertColumn(table, filter.column);
    params.push(normalizeValue(filter.value));
    clauses.push(`${quoteIdent(filter.column)} = $${params.length}`);
  }

  for (const filter of query.inFilters ?? []) {
    assertColumn(table, filter.column);
    if (!filter.values.length) {
      clauses.push("FALSE");
      continue;
    }

    const placeholders = filter.values.map((value) => {
      params.push(normalizeValue(value));
      return `$${params.length}`;
    });
    clauses.push(`${quoteIdent(filter.column)} IN (${placeholders.join(", ")})`);
  }

  const orClause = buildOrClause(table, query.or, params);
  if (orClause) {
    clauses.push(orClause);
  }

  return clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
}

function buildOrClause(table: TableName, expression: string | undefined, params: unknown[]) {
  if (!expression) {
    return "";
  }

  const parts = expression
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [column, op, ...rest] = part.split(".");
      if (op !== "eq" || !column || rest.length === 0) {
        throw new Error(`Unsupported OR expression: ${part}`);
      }

      assertColumn(table, column);
      params.push(rest.join("."));
      return `${quoteIdent(column)} = $${params.length}`;
    });

  return parts.length ? `(${parts.join(" OR ")})` : "";
}

function buildOrder(table: TableName, order: DbOrder | undefined) {
  if (!order) {
    return "";
  }

  assertColumn(table, order.column);
  return ` ORDER BY ${quoteIdent(order.column)} ${order.ascending === false ? "DESC" : "ASC"}`;
}

function buildLimit(limit: number | undefined, params: unknown[]) {
  if (!limit) {
    return "";
  }

  params.push(limit);
  return ` LIMIT $${params.length}`;
}

function rowList(values: DbQueryRequest["values"]) {
  if (!values) {
    return [];
  }

  return Array.isArray(values) ? values : [values];
}

function mutationColumns(table: TableName, rows: Array<Record<string, unknown>>) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row).filter((key) => row[key] !== undefined))));
  columns.forEach((column) => assertColumn(table, column));
  return columns;
}

async function executeSelect(table: TableName, query: DbQueryRequest) {
  const params: unknown[] = [];
  const where = buildWhere(table, query, params);
  const order = buildOrder(table, query.order);
  const limit = buildLimit(query.limit, params);

  const sql = table === "requests"
    ? `
        SELECT
          r.*,
          COALESCE((
            SELECT json_agg(json_build_object('approved_date', rad.approved_date) ORDER BY rad.approved_date)
            FROM request_approved_dates rad
            WHERE rad.request_id = r.id
          ), '[]'::json) AS request_approved_dates,
          COALESCE((
            SELECT json_agg(json_build_object('file_name', ra.file_name, 'file_path', ra.file_path, 'mime_type', ra.mime_type) ORDER BY ra.created_at)
            FROM request_attachments ra
            WHERE ra.request_id = r.id
          ), '[]'::json) AS request_attachments
        FROM requests r${where}${order}${limit}
      `
    : `SELECT * FROM ${quoteIdent(table)}${where}${order}${limit}`;

  const { rows } = await pool.query(sql, params);
  return query.maybeSingle ? rows[0] ?? null : rows;
}

async function executeInsert(table: TableName, query: DbQueryRequest) {
  let rows = rowList(query.values).map((row) => normalizeRowValues({ ...row }));
  rows = await resolveNotificationRecipients(table, rows);
  rows = rows.filter((row) => !(table === "notifications" && !row.recipient_profile_id));

  if (!rows.length) {
    return [];
  }

  const columns = mutationColumns(table, rows);
  const params: unknown[] = [];
  const valuesSql = rows
    .map((row) => `(${columns.map((column) => {
      params.push(normalizeValue(row[column]));
      return `$${params.length}`;
    }).join(", ")})`)
    .join(", ");
  const conflictSql = query.action === "upsert" && query.onConflict
    ? buildUpsertConflict(table, query.onConflict, columns)
    : "";
  const sql = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES ${valuesSql}${conflictSql} RETURNING *`;
  if (shouldSyncAfterDbMutation(table)) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(sql, params);
      await afterDbMutation(client, table, result.rows);
      await client.query("COMMIT");
      return result.rows;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  const result = await pool.query(sql, params);
  return result.rows;
}

function buildUpsertConflict(table: TableName, onConflict: string, columns: string[]) {
  const conflictColumns = onConflict.split(",").map((column) => column.trim()).filter(Boolean);
  conflictColumns.forEach((column) => assertColumn(table, column));

  const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
  if (!updateColumns.length) {
    return ` ON CONFLICT (${conflictColumns.map(quoteIdent).join(", ")}) DO NOTHING`;
  }

  return ` ON CONFLICT (${conflictColumns.map(quoteIdent).join(", ")}) DO UPDATE SET ${updateColumns
    .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`)
    .join(", ")}`;
}

async function resolveNotificationRecipients(table: TableName, rows: Array<Record<string, unknown>>) {
  if (table !== "notifications") {
    return rows;
  }

  const resolvedRows: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const recipient = row.recipient_profile_id;
    if (!recipient) {
      continue;
    }

    const profile = await pool.query("SELECT id FROM profiles WHERE id = $1 LIMIT 1", [recipient]);
    if (profile.rows[0]) {
      resolvedRows.push(row);
      continue;
    }

    const employee = await pool.query("SELECT profile_id FROM employees WHERE id = $1 AND profile_id IS NOT NULL LIMIT 1", [recipient]);
    if (employee.rows[0]?.profile_id) {
      resolvedRows.push({ ...row, recipient_profile_id: employee.rows[0].profile_id });
    }
  }

  return resolvedRows;
}

async function executeUpdate(table: TableName, query: DbQueryRequest) {
  const values = Array.isArray(query.values) ? query.values[0] : query.values;
  if (!values) {
    return [];
  }

  const row = normalizeRowValues({ ...values });
  const columns = mutationColumns(table, [row]);
  if (!columns.length) {
    return [];
  }

  const params: unknown[] = [];
  const setSql = columns.map((column) => {
    params.push(normalizeValue(row[column]));
    return `${quoteIdent(column)} = $${params.length}`;
  });
  const where = buildWhere(table, query, params);
  const sql = `UPDATE ${quoteIdent(table)} SET ${setSql.join(", ")}${where} RETURNING *`;
  if (shouldSyncAfterDbMutation(table)) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(sql, params);
      await afterDbMutation(client, table, result.rows);
      await client.query("COMMIT");
      return result.rows;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  const result = await pool.query(sql, params);
  return result.rows;
}

async function executeDelete(table: TableName, query: DbQueryRequest) {
  const params: unknown[] = [];
  const where = buildWhere(table, query, params);
  if (!where) {
    throw new Error("Refusing to delete without a filter.");
  }

  const sql = `DELETE FROM ${quoteIdent(table)}${where} RETURNING *`;
  if (shouldSyncAfterDbMutation(table)) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(sql, params);
      await afterDbMutation(client, table, result.rows);
      await client.query("COMMIT");
      return result.rows;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  const result = await pool.query(sql, params);
  return result.rows;
}

function shouldSyncAfterDbMutation(table: TableName) {
  return table === "employees" || table === "profiles" || table === "leave_days";
}

async function afterDbMutation(client: PoolClient, table: TableName, rows: Array<Record<string, unknown>>) {
  if (!rows.length) {
    return;
  }

  if (table === "employees") {
    await syncEmployeeProfileData(client, rows);
    await refreshLeaveBalancesForEmployees(client, rows.map((row) => row.id).filter(Boolean).map(String));
  } else if (table === "profiles") {
    await syncProfileAuthData(client, rows);
  } else if (table === "leave_days") {
    await refreshLeaveBalancesForEmployees(client, rows.map((row) => row.employee_id).filter(Boolean).map(String));
  }
}

async function syncEmployeeProfileData(client: PoolClient, employeeRows: Array<Record<string, unknown>>) {
  for (const employee of employeeRows) {
    const profileId = employee.profile_id ? String(employee.profile_id) : "";
    if (!profileId) {
      continue;
    }

    const firstName = String(employee.first_name ?? "").trim();
    const lastName = String(employee.last_name ?? "").trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const email = employee.email ? String(employee.email).trim().toLowerCase() : "";

    await client.query(
      `
        UPDATE profiles
        SET
          full_name = COALESCE(NULLIF($2, ''), full_name),
          email = COALESCE(NULLIF($3, ''), email)
        WHERE id = $1
      `,
      [profileId, fullName, email],
    );

    if (email) {
      await client.query(
        `
          UPDATE local_auth_users
          SET email = $2
          WHERE profile_id = $1
        `,
        [profileId, email],
      );
    }
  }
}

async function syncProfileAuthData(client: PoolClient, profileRows: Array<Record<string, unknown>>) {
  for (const profile of profileRows) {
    const profileId = profile.id ? String(profile.id) : "";
    const email = profile.email ? String(profile.email).trim().toLowerCase() : "";
    if (!profileId || !email) {
      continue;
    }

    await client.query("UPDATE local_auth_users SET email = $2 WHERE profile_id = $1", [profileId, email]);
  }
}

async function refreshLeaveBalancesForEmployees(client: PoolClient, employeeIds: string[]) {
  const uniqueEmployeeIds = Array.from(new Set(employeeIds.filter(Boolean)));
  if (!uniqueEmployeeIds.length) {
    return;
  }

  await client.query(
    `
      WITH employee_years AS (
        SELECT id AS employee_id, EXTRACT(YEAR FROM CURRENT_DATE)::int AS year
        FROM employees
        WHERE id = ANY($1::uuid[])
        UNION
        SELECT employee_id, EXTRACT(YEAR FROM leave_date)::int AS year
        FROM leave_days
        WHERE employee_id = ANY($1::uuid[])
      ),
      recalculated AS (
        SELECT
          employee_years.employee_id,
          employee_years.year,
          employee.annual_leave_days::int AS total_days,
          COUNT(leave_day.id)::int AS used_days
        FROM employee_years
        INNER JOIN employees employee ON employee.id = employee_years.employee_id
        LEFT JOIN leave_days leave_day
          ON leave_day.employee_id = employee_years.employee_id
          AND leave_day.leave_type = 'paid'
          AND EXTRACT(YEAR FROM leave_day.leave_date)::int = employee_years.year
        GROUP BY employee_years.employee_id, employee_years.year, employee.annual_leave_days
      )
      INSERT INTO leave_balances (employee_id, year, total_days, used_days, remaining_days)
      SELECT
        employee_id,
        year,
        total_days,
        used_days,
        GREATEST(total_days - used_days, 0)
      FROM recalculated
      ON CONFLICT (employee_id, year) DO UPDATE
      SET
        total_days = EXCLUDED.total_days,
        used_days = EXCLUDED.used_days,
        remaining_days = EXCLUDED.remaining_days
    `,
    [uniqueEmployeeIds],
  );
}

async function normalizeRedundantData() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        UPDATE profiles profile
        SET full_name = COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', employee.first_name, employee.last_name)), ''), profile.full_name)
        FROM employees employee
        WHERE employee.profile_id = profile.id
      `,
    );
    await client.query(
      `
        UPDATE profiles profile
        SET email = LOWER(BTRIM(employee.email))
        FROM employees employee
        WHERE employee.profile_id = profile.id
          AND employee.email IS NOT NULL
          AND BTRIM(employee.email) <> ''
          AND LOWER(profile.email) IS DISTINCT FROM LOWER(BTRIM(employee.email))
          AND NOT EXISTS (
            SELECT 1
            FROM profiles other_profile
            WHERE other_profile.id <> profile.id
              AND LOWER(other_profile.email) = LOWER(BTRIM(employee.email))
          )
      `,
    );
    await client.query(
      `
        UPDATE local_auth_users auth_user
        SET email = LOWER(BTRIM(profile.email))
        FROM profiles profile
        WHERE auth_user.profile_id = profile.id
          AND profile.email IS NOT NULL
          AND BTRIM(profile.email) <> ''
          AND LOWER(auth_user.email) IS DISTINCT FROM LOWER(BTRIM(profile.email))
          AND NOT EXISTS (
            SELECT 1
            FROM local_auth_users other_auth_user
            WHERE other_auth_user.profile_id <> auth_user.profile_id
              AND LOWER(other_auth_user.email) = LOWER(BTRIM(profile.email))
          )
      `,
    );

    const { rows } = await client.query("SELECT id FROM employees");
    await refreshLeaveBalancesForEmployees(client, rows.map((row) => String(row.id)));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.warn("Could not normalize redundant data:", error);
  } finally {
    client.release();
  }
}

async function buildAppUser(profileId: string): Promise<AppUser | null> {
  const { rows } = await pool.query(
    `
      SELECT
        p.id AS profile_id,
        p.email AS profile_email,
        p.full_name,
        p.role AS profile_role,
        p.avatar_url,
        e.id AS employee_id,
        e.email AS employee_email,
        e.first_name,
        e.last_name,
        e.salary_gross,
        e.hire_date,
        e.manager_id,
        d.name AS department_name,
        EXISTS (SELECT 1 FROM employees direct_report WHERE direct_report.manager_id = e.id) AS has_direct_reports
      FROM profiles p
      LEFT JOIN LATERAL (
        SELECT employee.*
        FROM employees employee
        WHERE employee.profile_id = p.id OR lower(employee.email) = lower(p.email)
        ORDER BY CASE WHEN employee.profile_id = p.id THEN 0 ELSE 1 END
        LIMIT 1
      ) e ON true
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE p.id = $1
      LIMIT 1
    `,
    [profileId],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  const email = row.employee_email ?? row.profile_email;
  const fallbackName = String(email)
    .split("@")[0]
    .replace(".", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const profileRole = row.profile_role as AppUser["role"];
  const role = profileRole === "hr" ? "hr" : profileRole === "manager" || row.has_direct_reports ? "manager" : "employee";
  const hireDate = row.hire_date instanceof Date ? row.hire_date.toISOString().slice(0, 10) : row.hire_date ?? undefined;

  return {
    id: row.employee_id ?? row.profile_id,
    profileId: row.profile_id,
    name: row.full_name || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || fallbackName,
    email,
    role,
    department: row.department_name ?? (role === "hr" ? "Human Resources" : "Engineering"),
    salary: row.salary_gross == null ? undefined : Number(row.salary_gross),
    hireDate,
    managerId: row.manager_id ?? undefined,
    profilePicture: row.avatar_url ?? undefined,
  };
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
  }),
);
app.use(express.json({ limit: "25mb" }));
app.use("/api/files", async (req, res, next) => {
  if (req.method !== "GET") {
    next();
    return;
  }

  try {
    const user = await authenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication is required." });
      return;
    }

    const requestedPath = decodeURIComponent(req.path.replace(/^\/+/, ""));
    const absolutePath = path.resolve(uploadRoot, requestedPath);
    const relativePath = path.relative(uploadRoot, absolutePath);
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      res.status(400).json({ message: "Invalid file path." });
      return;
    }

    const normalizedPath = relativePath.replaceAll("\\", "/");
    if (!(await canAccessFile(user, normalizedPath))) {
      res.status(403).json({ message: "You do not have permission to access this file." });
      return;
    }

    res.sendFile(absolutePath);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not load file." });
  }
});

app.get("/health", async (_req, res) => {
  const result = await pool.query("SELECT 1 AS ok");
  res.json({ ok: result.rows[0]?.ok === 1 });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required." });
    return;
  }

  const { rows } = await pool.query(
    `
      SELECT id, profile_id, email, password_hash, password_salt
      FROM local_auth_users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email],
  );
  const authUser = rows[0];

  if (!authUser || !verifyPassword(password, authUser.password_salt, authUser.password_hash)) {
    res.status(401).json({ message: "Invalid email or password." });
    return;
  }

  const user = await buildAppUser(authUser.profile_id);
  if (!user) {
    res.status(404).json({ message: "Profile for this user no longer exists." });
    return;
  }

  const token = signToken(
    {
      sub: authUser.id,
      profileId: authUser.profile_id,
      email: authUser.email,
    },
    authSecret,
  );

  res.json({ token, user });
});

app.get("/api/auth/me", async (req, res) => {
  const token = authHeaderToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ message: "Missing auth token." });
    return;
  }

  const payload = verifyToken(token, authSecret);
  if (!payload) {
    res.status(401).json({ message: "Invalid or expired auth token." });
    return;
  }

  const user = await buildAppUser(payload.profileId);
  if (!user) {
    res.status(404).json({ message: "Profile for this user no longer exists." });
    return;
  }

  res.json({ user });
});

app.post("/api/auth/logout", (_req, res) => {
  res.status(204).send();
});

app.get("/api/hr/available-login-accounts", async (req, res) => {
  try {
    await requireHrUser(req);
    const { rows } = await pool.query(
      `
        SELECT p.id, p.full_name, p.email, p.role
        FROM profiles p
        INNER JOIN local_auth_users auth_user ON auth_user.profile_id = p.id
        LEFT JOIN employees employee ON employee.profile_id = p.id
        WHERE employee.id IS NULL
          AND p.role IN ('employee', 'manager')
        ORDER BY lower(p.full_name), lower(p.email)
      `,
    );

    res.json({ accounts: rows });
  } catch (error) {
    res.status(403).json({ message: error instanceof Error ? error.message : "Could not load login accounts." });
  }
});

app.post("/api/hr/employees", async (req, res) => {
  const client = await pool.connect();

  try {
    await requireHrUser(req);
    const input = req.body ?? {};
    const loginMode = String(input.loginMode ?? "none");
    let employeeEmail = String(input.email ?? "").trim().toLowerCase();
    const firstName = String(input.firstName ?? "").trim();
    const lastName = String(input.lastName ?? "").trim();
    const workNormHours = Number(input.workNormHours ?? 8);
    let profileId: string | null = null;

    if (!firstName || !lastName || !employeeEmail || !input.position || !input.hireDate) {
      throw new Error("First name, last name, email, position and hire date are required.");
    }
    if (!Number.isFinite(workNormHours) || workNormHours <= 0) {
      throw new Error("Work norm hours must be greater than 0.");
    }

    await client.query("BEGIN");

    if (loginMode === "attach") {
      const existingProfileId = String(input.existingProfileId ?? "");
      const { rows } = await client.query(
        `
          SELECT p.id, p.email
          FROM profiles p
          INNER JOIN local_auth_users auth_user ON auth_user.profile_id = p.id
          LEFT JOIN employees employee ON employee.profile_id = p.id
          WHERE p.id = $1
            AND employee.id IS NULL
            AND p.role IN ('employee', 'manager')
          LIMIT 1
        `,
        [existingProfileId],
      );

      if (!rows[0]) {
        throw new Error("The selected login account is no longer available.");
      }

      profileId = rows[0].id;
      employeeEmail = String(rows[0].email).trim().toLowerCase();
    } else if (loginMode === "create") {
      const temporaryPassword = String(input.temporaryPassword ?? "");
      if (temporaryPassword.length < 6) {
        throw new Error("The temporary password must contain at least 6 characters.");
      }

      profileId = randomUUID();
      const { passwordHash, passwordSalt } = hashPassword(temporaryPassword);
      await client.query(
        `
          INSERT INTO profiles (id, email, full_name, role)
          VALUES ($1, $2, $3, 'employee')
        `,
        [profileId, employeeEmail, `${firstName} ${lastName}`.trim()],
      );
      await client.query(
        `
          INSERT INTO local_auth_users (profile_id, email, password_hash, password_salt, password_reset_required)
          VALUES ($1, $2, $3, $4, true)
        `,
        [profileId, employeeEmail, passwordHash, passwordSalt],
      );
    } else if (loginMode !== "none") {
      throw new Error("Unsupported login account option.");
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext('employees_employee_code_generation'))");
    const codeResult = await client.query(
      `
        SELECT 'EMP' || lpad(
          (COALESCE(MAX(substring(employee_code FROM '^EMP([0-9]+)$')::integer), 0) + 1)::text,
          3,
          '0'
        ) AS employee_code
        FROM employees
      `,
    );
    const employeeCode = String(codeResult.rows[0].employee_code);

    const { rows } = await client.query(
      `
        INSERT INTO employees (
          employee_code, profile_id, first_name, last_name, email, cnp, phone, address,
          department_id, position, salary_gross, salary_net, hire_date,
          manager_id, status, work_norm_hours, annual_leave_days
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, 'active', $15, $16
        )
        RETURNING *
      `,
      [
        employeeCode,
        profileId,
        firstName,
        lastName,
        employeeEmail,
        input.cnp || null,
        input.phone || null,
        input.address || null,
        input.departmentId || null,
        String(input.position).trim(),
        Number(input.salaryGross),
        input.salaryNet == null ? null : Number(input.salaryNet),
        input.hireDate,
        input.managerId || null,
        workNormHours,
        Number(input.annualLeaveDays ?? 20),
      ],
    );

    await client.query(
      `
        INSERT INTO employee_work_schedules (employee_id)
        VALUES ($1)
        ON CONFLICT (employee_id) DO NOTHING
      `,
      [rows[0].id],
    );

    await afterDbMutation(client, "employees", rows);

    await client.query("COMMIT");
    res.json({ employee: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not create employee." });
  } finally {
    client.release();
  }
});

app.post("/api/hr/employees/:employeeId/login-account", async (req, res) => {
  const client = await pool.connect();

  try {
    await requireHrUser(req);
    const employeeId = String(req.params.employeeId ?? "");
    const input = req.body ?? {};
    const loginMode = String(input.loginMode ?? "none");

    if (loginMode !== "attach" && loginMode !== "create") {
      throw new Error("Unsupported login account option.");
    }

    await client.query("BEGIN");
    const employeeResult = await client.query(
      `
        SELECT id, profile_id, first_name, last_name, email
        FROM employees
        WHERE id = $1
        LIMIT 1
      `,
      [employeeId],
    );
    const employee = employeeResult.rows[0];
    if (!employee) {
      throw new Error("Employee not found.");
    }
    if (employee.profile_id) {
      throw new Error("This employee already has a login account.");
    }

    let profileId: string;
    let accountEmail = String(employee.email ?? "").trim().toLowerCase();
    const fullName = `${String(employee.first_name ?? "").trim()} ${String(employee.last_name ?? "").trim()}`.trim();

    if (loginMode === "attach") {
      const existingProfileId = String(input.existingProfileId ?? "");
      const { rows } = await client.query(
        `
          SELECT p.id, p.email
          FROM profiles p
          INNER JOIN local_auth_users auth_user ON auth_user.profile_id = p.id
          LEFT JOIN employees employee ON employee.profile_id = p.id
          WHERE p.id = $1
            AND employee.id IS NULL
            AND p.role IN ('employee', 'manager')
          LIMIT 1
        `,
        [existingProfileId],
      );

      if (!rows[0]) {
        throw new Error("The selected login account is no longer available.");
      }

      profileId = rows[0].id;
      accountEmail = String(rows[0].email).trim().toLowerCase();
    } else {
      const temporaryPassword = String(input.temporaryPassword ?? "");
      if (temporaryPassword.length < 6) {
        throw new Error("The temporary password must contain at least 6 characters.");
      }
      if (!accountEmail) {
        throw new Error("The employee must have an email before a login account can be created.");
      }

      profileId = randomUUID();
      const { passwordHash, passwordSalt } = hashPassword(temporaryPassword);
      await client.query(
        `
          INSERT INTO profiles (id, email, full_name, role)
          VALUES ($1, $2, $3, 'employee')
        `,
        [profileId, accountEmail, fullName],
      );
      await client.query(
        `
          INSERT INTO local_auth_users (profile_id, email, password_hash, password_salt, password_reset_required)
          VALUES ($1, $2, $3, $4, true)
        `,
        [profileId, accountEmail, passwordHash, passwordSalt],
      );
    }

    const updated = await client.query(
      `
        UPDATE employees
        SET profile_id = $2, email = $3
        WHERE id = $1
        RETURNING *
      `,
      [employeeId, profileId, accountEmail],
    );
    await afterDbMutation(client, "employees", updated.rows);

    await client.query("COMMIT");
    res.json({ employee: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not attach login account." });
  } finally {
    client.release();
  }
});

app.get("/api/hr/employee-schedules/:employeeId", async (req, res) => {
  try {
    await requireHrUser(req);
    const employeeId = String(req.params.employeeId ?? "");
    const { rows } = await pool.query(
      `
        SELECT employee_id, mode, weekly_schedule, shift_definitions, effective_from,
          rotation_anchor_date, rotation_work_days, rotation_off_days, rotation_start_time
        FROM employee_work_schedules
        WHERE employee_id = $1
        LIMIT 1
      `,
      [employeeId],
    );

    res.json({
      schedule: rows[0] ?? {
        employee_id: employeeId,
        mode: "fixed",
        weekly_schedule: defaultWeeklySchedule,
        shift_definitions: [],
      },
    });
  } catch (error) {
    res.status(403).json({ message: error instanceof Error ? error.message : "Could not load employee schedule." });
  }
});

app.put("/api/hr/employee-schedules/:employeeId", async (req, res) => {
  try {
    await requireHrUser(req);
    const employeeId = String(req.params.employeeId ?? "");
    const mode = String(req.body?.mode ?? "fixed");
    if (mode !== "fixed" && mode !== "shifts" && mode !== "rotating") {
      throw new Error("Unsupported employee schedule mode.");
    }

    const shifts = normalizedShiftDefinitions(req.body?.shiftDefinitions);
    const weeklySchedule = normalizedWeeklySchedule(req.body?.weeklySchedule);
    if (mode === "shifts") {
      const shiftsById = new Map(shifts.map((shift) => [shift.id, shift]));
      for (const entry of Object.values(weeklySchedule)) {
        const shift = entry.shiftId ? shiftsById.get(entry.shiftId) : null;
        if (!shift) {
          throw new Error("Every working day must reference one of the configured shifts.");
        }
        entry.startTime = shift.startTime;
      }
    }
    const rotationAnchorDate = String(req.body?.rotationAnchorDate ?? "");
    const rotationWorkDays = Number(req.body?.rotationWorkDays ?? 1);
    const rotationOffDays = Number(req.body?.rotationOffDays ?? 1);
    const rotationStartTime = String(req.body?.rotationStartTime ?? "09:00");
    if (
      mode === "rotating"
      && (
        !dateOnlyPattern.test(rotationAnchorDate)
        || !Number.isInteger(rotationWorkDays)
        || rotationWorkDays < 1
        || rotationWorkDays > 31
        || !Number.isInteger(rotationOffDays)
        || rotationOffDays < 1
        || rotationOffDays > 31
        || !timeOnlyPattern.test(rotationStartTime)
      )
    ) {
      throw new Error("Rotating schedules require a valid first workday, start time and a cycle between 1 and 31 days.");
    }

    const employee = await pool.query("SELECT id FROM employees WHERE id = $1 LIMIT 1", [employeeId]);
    if (!employee.rows[0]) {
      throw new Error("Employee not found.");
    }

    const { rows } = await pool.query(
      `
        INSERT INTO employee_work_schedules (
          employee_id, mode, weekly_schedule, shift_definitions,
          rotation_anchor_date, rotation_work_days, rotation_off_days, rotation_start_time
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)
        ON CONFLICT (employee_id)
        DO UPDATE SET
          mode = EXCLUDED.mode,
          weekly_schedule = EXCLUDED.weekly_schedule,
          shift_definitions = EXCLUDED.shift_definitions,
          rotation_anchor_date = EXCLUDED.rotation_anchor_date,
          rotation_work_days = EXCLUDED.rotation_work_days,
          rotation_off_days = EXCLUDED.rotation_off_days,
          rotation_start_time = EXCLUDED.rotation_start_time,
          effective_from = CURRENT_DATE,
          updated_at = CURRENT_TIMESTAMP
        RETURNING employee_id, mode, weekly_schedule, shift_definitions, effective_from,
          rotation_anchor_date, rotation_work_days, rotation_off_days, rotation_start_time
      `,
      [
        employeeId,
        mode,
        JSON.stringify(weeklySchedule),
        JSON.stringify(shifts),
        mode === "rotating" ? rotationAnchorDate : null,
        rotationWorkDays,
        rotationOffDays,
        rotationStartTime,
      ],
    );

    res.json({ schedule: rows[0] });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not save employee schedule." });
  }
});

app.post("/api/attendance/check-in", async (req, res) => {
  const client = await pool.connect();

  try {
    const user = await authenticatedUser(req);
    if (!user || user.role === "hr") {
      throw new Error("An employee account is required for attendance.");
    }

    await client.query("BEGIN");
    const now = new Date();
    const currentDate = localDateString(now);
    const activeSession = await client.query(
      `
        SELECT id
        FROM attendance_records
        WHERE employee_id = $1
          AND checkout_mode = 'automatic'
          AND scheduled_check_out_at > $2
        LIMIT 1
        FOR UPDATE
      `,
      [user.id, now],
    );
    if (activeSession.rows[0]) {
      throw new Error("You already have an active attendance session.");
    }

    let scheduledWindow = await scheduledWindowForMoment(client, user.id, now);
    if (scheduledWindow) {
      const approvedLeave = await client.query(
        "SELECT 1 FROM leave_days WHERE employee_id = $1 AND leave_date = $2 LIMIT 1",
        [user.id, scheduledWindow.attendanceDate],
      );
      if (approvedLeave.rows[0]) {
        scheduledWindow = undefined;
      }
    }

    const sessionType = scheduledWindow ? "normal" : "overtime";
    const attendanceDate = scheduledWindow?.attendanceDate ?? currentDate;
    const scheduledCheckOutAt = scheduledWindow?.end ?? nextLocalMidnight(currentDate);
    const plannedHours = hoursBetween(now, scheduledCheckOutAt);
    const result = await client.query(
      `
        INSERT INTO attendance_records (
          employee_id, attendance_date, check_in_at, scheduled_check_out_at,
          check_out_at, checkout_mode, session_type, worked_hours, overtime_hours,
          approval_status
        )
        VALUES ($1, $2, $3, $4, $4, 'automatic', $5, $6, $7, 'pending')
        RETURNING *
      `,
      [
        user.id,
        attendanceDate,
        now,
        scheduledCheckOutAt,
        sessionType,
        plannedHours,
        sessionType === "overtime" ? plannedHours : 0,
      ],
    );
    await client.query("COMMIT");
    res.json({ record: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const message = error instanceof Error ? error.message : "Could not check in.";
    res.status(400).json({
      message: message.includes("attendance_records_employee_normal_date_key")
        ? "Your normal attendance session for this workday was already recorded. Overtime can only start outside your scheduled working hours."
        : message,
    });
  } finally {
    client.release();
  }
});

app.post("/api/attendance/:recordId/check-out", async (req, res) => {
  const client = await pool.connect();

  try {
    const user = await authenticatedUser(req);
    if (!user || user.role === "hr") {
      throw new Error("An employee account is required for attendance.");
    }

    await client.query("BEGIN");
    const now = new Date();
    const result = await client.query(
      `
        SELECT *
        FROM attendance_records
        WHERE id = $1
          AND employee_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [req.params.recordId, user.id],
    );
    const record = result.rows[0];
    if (!record) {
      throw new Error("Attendance session not found.");
    }
    if (record.checkout_mode === "manual" || now >= new Date(record.scheduled_check_out_at)) {
      throw new Error("This attendance session was already checked out automatically.");
    }

    const workedHours = hoursBetween(new Date(record.check_in_at), now);
    const updated = await client.query(
      `
        UPDATE attendance_records
        SET
          check_out_at = $1,
          checkout_mode = 'manual',
          worked_hours = $2::numeric,
          overtime_hours = CASE WHEN session_type = 'overtime' THEN $2::numeric ELSE 0 END,
          approval_status = 'pending',
          approved_by_manager_id = NULL,
          approved_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `,
      [now, workedHours, record.id],
    );
    await client.query("COMMIT");
    res.json({ record: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not check out." });
  } finally {
    client.release();
  }
});

app.get("/api/hr/reports", async (req, res) => {
  try {
    await requireHrUser(req);
    const year = Number(req.query.year ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new Error("Invalid report year.");
    }

    const monthlyCte = `
      WITH months AS (
        SELECT
          generate_series(make_date($1, 1, 1), make_date($1, 12, 1), interval '1 month')::date AS month_start
      ),
      month_bounds AS (
        SELECT
          EXTRACT(MONTH FROM month_start)::int AS month,
          to_char(month_start, 'Mon') AS label,
          month_start,
          (month_start + interval '1 month - 1 day')::date AS month_end
        FROM months
      )
    `;

    const [
      monthlyNewHires,
      employeeEvolution,
      departmentDistribution,
      tenureDistribution,
      monthlySalaryCosts,
      averageSalaryByDepartment,
      salaryStats,
      leaveBalances,
      monthlyLeaveUsage,
      requestResolutionTime,
      busiestLeavePeriods,
      workedHoursByEmployee,
      workedHoursByDepartment,
      overtimeMonthly,
      absencesMonthly,
    ] = await Promise.all([
      pool.query(
        `
          ${monthlyCte}
          SELECT mb.month, mb.label, COUNT(e.id)::int AS hires
          FROM month_bounds mb
          LEFT JOIN employees e
            ON e.hire_date >= mb.month_start
           AND e.hire_date < mb.month_start + interval '1 month'
          GROUP BY mb.month, mb.label
          ORDER BY mb.month
        `,
        [year],
      ),
      pool.query(
        `
          ${monthlyCte}
          SELECT mb.month, mb.label, COUNT(e.id)::int AS total
          FROM month_bounds mb
          LEFT JOIN employees e
            ON e.hire_date <= mb.month_end
           AND (
             e.status <> 'fired'
             OR COALESCE(e.termination_date, e.updated_at::date) > mb.month_end
           )
          GROUP BY mb.month, mb.label
          ORDER BY mb.month
        `,
        [year],
      ),
      pool.query(
        `
          SELECT COALESCE(d.name, 'Unassigned') AS department, COUNT(e.id)::int AS employees
          FROM employees e
          LEFT JOIN departments d ON d.id = e.department_id
          WHERE e.status = 'active'
          GROUP BY COALESCE(d.name, 'Unassigned')
          ORDER BY employees DESC, department
        `,
      ),
      pool.query(
        `
          SELECT bucket, COUNT(*)::int AS employees
          FROM (
            SELECT CASE
              WHEN hire_date > CURRENT_DATE - interval '1 year' THEN 'underOneYear'
              WHEN hire_date > CURRENT_DATE - interval '3 years' THEN 'oneToThreeYears'
              ELSE 'overThreeYears'
            END AS bucket
            FROM employees
            WHERE status = 'active'
          ) tenure
          GROUP BY bucket
          ORDER BY CASE bucket
            WHEN 'underOneYear' THEN 1
            WHEN 'oneToThreeYears' THEN 2
            ELSE 3
          END
        `,
      ),
      pool.query(
        `
          ${monthlyCte}
          SELECT
            mb.month,
            mb.label,
            COALESCE(ROUND(SUM(COALESCE(latest.new_salary_gross, future.old_salary_gross, e.salary_gross))::numeric, 2), 0) AS gross,
            COALESCE(ROUND(SUM(COALESCE(
              latest.new_salary_net,
              future.old_salary_net,
              CASE
                WHEN e.salary_net IS NOT NULL AND e.salary_gross > 0 THEN
                  COALESCE(latest.new_salary_gross, future.old_salary_gross, e.salary_gross) * (e.salary_net / e.salary_gross)
                ELSE e.salary_net
              END,
              0
            ))::numeric, 2), 0) AS net
          FROM month_bounds mb
          LEFT JOIN employees e
            ON e.hire_date <= mb.month_end
           AND (
             e.status <> 'fired'
             OR COALESCE(e.termination_date, e.updated_at::date) > mb.month_end
           )
          LEFT JOIN LATERAL (
            SELECT sh.new_salary_gross, sh.new_salary_net
            FROM salary_history sh
            WHERE sh.employee_id = e.id
              AND sh.effective_date <= mb.month_end
            ORDER BY sh.effective_date DESC, sh.created_at DESC
            LIMIT 1
          ) latest ON true
          LEFT JOIN LATERAL (
            SELECT sh.old_salary_gross, sh.old_salary_net
            FROM salary_history sh
            WHERE sh.employee_id = e.id
              AND sh.effective_date > mb.month_end
            ORDER BY sh.effective_date ASC, sh.created_at ASC
            LIMIT 1
          ) future ON true
          GROUP BY mb.month, mb.label
          ORDER BY mb.month
        `,
        [year],
      ),
      pool.query(
        `
          SELECT
            COALESCE(d.name, 'Unassigned') AS department,
            ROUND(AVG(e.salary_gross)::numeric, 2) AS gross,
            ROUND(AVG(COALESCE(e.salary_net, 0))::numeric, 2) AS net
          FROM employees e
          LEFT JOIN departments d ON d.id = e.department_id
          WHERE e.status = 'active'
          GROUP BY COALESCE(d.name, 'Unassigned')
          ORDER BY department
        `,
      ),
      pool.query(
        `
          SELECT
            COALESCE(MIN(salary_gross), 0) AS min_gross,
            COALESCE(MAX(salary_gross), 0) AS max_gross,
            COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY salary_gross), 0) AS median_gross,
            COALESCE(MIN(salary_net), 0) AS min_net,
            COALESCE(MAX(salary_net), 0) AS max_net,
            COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY salary_net), 0) AS median_net
          FROM employees
          WHERE status = 'active'
        `,
      ),
      pool.query(
        `
          SELECT
            e.id,
            e.employee_code,
            CONCAT(e.first_name, ' ', e.last_name) AS employee,
            e.annual_leave_days::int AS total_days,
            COUNT(ld.id)::int AS used_days,
            GREATEST(e.annual_leave_days - COUNT(ld.id)::int, 0)::int AS remaining_days
          FROM employees e
          LEFT JOIN leave_days ld
            ON ld.employee_id = e.id
           AND ld.leave_type = 'paid'
           AND EXTRACT(YEAR FROM ld.leave_date)::int = $1
          WHERE e.status = 'active'
          GROUP BY e.id, e.employee_code, e.first_name, e.last_name, e.annual_leave_days
          ORDER BY remaining_days ASC, employee
        `,
        [year],
      ),
      pool.query(
        `
          ${monthlyCte}
          SELECT
            mb.month,
            mb.label,
            COUNT(ld.id) FILTER (WHERE ld.leave_type = 'paid')::int AS paid,
            COUNT(ld.id) FILTER (WHERE ld.leave_type = 'medical')::int AS medical,
            COUNT(ld.id)::int AS total
          FROM month_bounds mb
          LEFT JOIN leave_days ld
            ON ld.leave_date >= mb.month_start
           AND ld.leave_date < mb.month_start + interval '1 month'
          GROUP BY mb.month, mb.label
          ORDER BY mb.month
        `,
        [year],
      ),
      pool.query(
        `
          SELECT
            type,
            ROUND(AVG(EXTRACT(EPOCH FROM (decided_at - submitted_at)) / 86400)::numeric, 2) AS days,
            COUNT(*)::int AS resolved
          FROM requests
          WHERE decided_at IS NOT NULL
            AND EXTRACT(YEAR FROM decided_at)::int = $1
          GROUP BY type
          ORDER BY days DESC NULLS LAST
        `,
        [year],
      ),
      pool.query(
        `
          SELECT
            leave_date,
            COUNT(DISTINCT employee_id)::int AS employees,
            COUNT(*) FILTER (WHERE leave_type = 'paid')::int AS paid,
            COUNT(*) FILTER (WHERE leave_type = 'medical')::int AS medical
          FROM leave_days
          WHERE EXTRACT(YEAR FROM leave_date)::int = $1
          GROUP BY leave_date
          ORDER BY employees DESC, leave_date ASC
          LIMIT 12
        `,
        [year],
      ),
      pool.query(
        `
          SELECT
            e.id,
            e.employee_code,
            CONCAT(e.first_name, ' ', e.last_name) AS employee,
            COALESCE(d.name, 'Unassigned') AS department,
            ROUND(SUM(ar.worked_hours)::numeric, 2) AS hours
          FROM attendance_records ar
          INNER JOIN employees e ON e.id = ar.employee_id
          LEFT JOIN departments d ON d.id = e.department_id
          WHERE EXTRACT(YEAR FROM ar.attendance_date)::int = $1
          GROUP BY e.id, e.employee_code, e.first_name, e.last_name, COALESCE(d.name, 'Unassigned')
          ORDER BY hours DESC
          LIMIT 20
        `,
        [year],
      ),
      pool.query(
        `
          SELECT
            COALESCE(d.name, 'Unassigned') AS department,
            ROUND(SUM(ar.worked_hours)::numeric, 2) AS hours
          FROM attendance_records ar
          INNER JOIN employees e ON e.id = ar.employee_id
          LEFT JOIN departments d ON d.id = e.department_id
          WHERE EXTRACT(YEAR FROM ar.attendance_date)::int = $1
          GROUP BY COALESCE(d.name, 'Unassigned')
          ORDER BY hours DESC
        `,
        [year],
      ),
      pool.query(
        `
          ${monthlyCte}
          SELECT
            mb.month,
            mb.label,
            COALESCE(ROUND(SUM(ar.overtime_hours)::numeric, 2), 0) AS total,
            COALESCE(ROUND(SUM(ar.overtime_hours) FILTER (WHERE ar.approval_status = 'approved')::numeric, 2), 0) AS approved
          FROM month_bounds mb
          LEFT JOIN attendance_records ar
            ON ar.attendance_date >= mb.month_start
           AND ar.attendance_date < mb.month_start + interval '1 month'
           AND ar.session_type = 'overtime'
          GROUP BY mb.month, mb.label
          ORDER BY mb.month
        `,
        [year],
      ),
      pool.query(
        `
          ${monthlyCte}
          SELECT
            mb.month,
            mb.label,
            COUNT(wte.id)::int AS absences,
            COALESCE(ROUND(SUM(wte.hours)::numeric, 2), 0) AS hours
          FROM month_bounds mb
          LEFT JOIN work_time_exceptions wte
            ON wte.exception_date >= mb.month_start
           AND wte.exception_date < mb.month_start + interval '1 month'
           AND wte.type = 'unmotivated_absence'
          GROUP BY mb.month, mb.label
          ORDER BY mb.month
        `,
        [year],
      ),
    ]);

    res.json({
      year,
      monthlyNewHires: monthlyNewHires.rows,
      employeeEvolution: employeeEvolution.rows,
      departmentDistribution: departmentDistribution.rows,
      tenureDistribution: tenureDistribution.rows,
      monthlySalaryCosts: monthlySalaryCosts.rows,
      averageSalaryByDepartment: averageSalaryByDepartment.rows,
      salaryStats: salaryStats.rows[0],
      leaveBalances: leaveBalances.rows,
      monthlyLeaveUsage: monthlyLeaveUsage.rows,
      requestResolutionTime: requestResolutionTime.rows,
      busiestLeavePeriods: busiestLeavePeriods.rows,
      workedHoursByEmployee: workedHoursByEmployee.rows,
      workedHoursByDepartment: workedHoursByDepartment.rows,
      overtimeMonthly: overtimeMonthly.rows,
      absencesMonthly: absencesMonthly.rows,
    });
  } catch (error) {
    res.status(403).json({ message: error instanceof Error ? error.message : "Could not load HR reports." });
  }
});

app.get("/api/manager/attendance-overview", async (req, res) => {
  const client = await pool.connect();

  try {
    const user = await authenticatedUser(req);
    if (!user || user.role !== "manager") {
      throw new Error("Manager access is required.");
    }

    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    eachDate(from, to);
    const directReports = await client.query(
      `
        SELECT id
        FROM employees
        WHERE manager_id = $1
          AND status = 'active'
      `,
      [user.id],
    );
    const employeeIds = directReports.rows.map((row) => String(row.id));
    await syncAttendanceExceptions(client, employeeIds, from, to);

    if (!employeeIds.length) {
      res.json({ exceptions: [], schedules: [] });
      return;
    }

    const [exceptionResult, scheduleResult] = await Promise.all([
      client.query(
        `
          SELECT id, employee_id, type, exception_date, hours, reason, status
          FROM work_time_exceptions
          WHERE employee_id = ANY($1::uuid[])
            AND type IN ('unmotivated_absence', 'late_arrival')
          ORDER BY exception_date DESC, type
        `,
        [employeeIds],
      ),
      client.query(
        `
          SELECT employee_id, mode, weekly_schedule, shift_definitions, effective_from,
            rotation_anchor_date, rotation_work_days, rotation_off_days, rotation_start_time
          FROM employee_work_schedules
          WHERE employee_id = ANY($1::uuid[])
        `,
        [employeeIds],
      ),
    ]);

    res.json({ exceptions: exceptionResult.rows, schedules: scheduleResult.rows });
  } catch (error) {
    res.status(403).json({ message: error instanceof Error ? error.message : "Could not load team attendance overview." });
  } finally {
    client.release();
  }
});

const managerReportDefinitions = {
  "team-attendance": {
    title: "Team attendance",
    filename: "raport-pontaj-echipa",
    columns: [
      { key: "employee_code", header: "Cod angajat" },
      { key: "employee", header: "Angajat" },
      { key: "department", header: "Departament" },
      { key: "attendance_date", header: "Data" },
      { key: "session_type", header: "Tip sesiune" },
      { key: "check_in", header: "Check-in" },
      { key: "check_out", header: "Check-out" },
      { key: "worked_hours", header: "Ore lucrate" },
      { key: "overtime_hours", header: "Ore suplimentare" },
      { key: "approval_status", header: "Status validare" },
    ],
  },
  overtime: {
    title: "Overtime",
    filename: "raport-ore-suplimentare",
    columns: [
      { key: "employee_code", header: "Cod angajat" },
      { key: "employee", header: "Angajat" },
      { key: "attendance_date", header: "Data" },
      { key: "check_in", header: "Check-in" },
      { key: "check_out", header: "Check-out" },
      { key: "overtime_hours", header: "Ore suplimentare" },
      { key: "approval_status", header: "Status validare" },
    ],
  },
  "late-absences": {
    title: "Late arrivals and absences",
    filename: "raport-intarzieri-absente",
    columns: [
      { key: "employee_code", header: "Cod angajat" },
      { key: "employee", header: "Angajat" },
      { key: "exception_date", header: "Data" },
      { key: "type", header: "Tip" },
      { key: "hours", header: "Ore" },
      { key: "reason", header: "Motiv" },
      { key: "status", header: "Status" },
    ],
  },
  "team-leaves": {
    title: "Team leaves",
    filename: "raport-concedii-echipa",
    columns: [
      { key: "employee_code", header: "Cod angajat" },
      { key: "employee", header: "Angajat" },
      { key: "leave_date", header: "Data" },
      { key: "leave_type", header: "Tip concediu" },
      { key: "request_status", header: "Status cerere" },
    ],
  },
  "resolved-requests": {
    title: "Resolved requests",
    filename: "raport-cereri-solutionate",
    columns: [
      { key: "employee_code", header: "Cod angajat" },
      { key: "employee", header: "Angajat" },
      { key: "type", header: "Tip cerere" },
      { key: "status", header: "Status" },
      { key: "submitted_at", header: "Trimisă la" },
      { key: "decided_at", header: "Soluționată la" },
      { key: "resolution_hours", header: "Timp soluționare (ore)" },
      { key: "decided_by", header: "Soluționată de" },
    ],
  },
  availability: {
    title: "Team availability",
    filename: "raport-disponibilitate-echipa",
    columns: [
      { key: "date", header: "Data" },
      { key: "team_size", header: "Total echipă" },
      { key: "present", header: "Prezenți" },
      { key: "paid_leave", header: "Concediu de odihnă" },
      { key: "medical_leave", header: "Concediu medical" },
      { key: "absences", header: "Absențe" },
      { key: "available", header: "Disponibili estimați" },
    ],
  },
} as const;

type ManagerReportType = keyof typeof managerReportDefinitions;
type ManagerReportRow = Record<string, string | number | null>;

function assertManagerReportType(value: string): ManagerReportType {
  if (value in managerReportDefinitions) {
    return value as ManagerReportType;
  }
  throw new Error("Invalid manager report type.");
}

function sqlDateOnly(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
}

function sqlDateTime(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().replace("T", " ").slice(0, 16);
}

function sqlTimeOnly(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(11, 16);
}

function reportStatusLabel(value: unknown) {
  const status = String(value ?? "");
  if (status === "approved") return "Aprobat";
  if (status === "rejected") return "Respins";
  if (status === "pending") return "În așteptare";
  if (status === "in_review") return "În analiză";
  if (status === "closed") return "Închis";
  return status;
}

function reportTypeLabel(value: unknown) {
  const type = String(value ?? "");
  if (type === "paid_leave") return "Concediu de odihnă";
  if (type === "medical_leave") return "Concediu medical";
  if (type === "salary_raise") return "Mărire salarială";
  if (type === "hr_message") return "Mesaj către HR";
  if (type === "late_arrival") return "Întârziere";
  if (type === "unmotivated_absence") return "Absență nemotivată";
  if (type === "normal") return "Program normal";
  if (type === "overtime") return "Ore suplimentare";
  return type;
}

async function getManagerReportEmployeeIds(managerEmployeeId: string, employeeId?: string) {
  const { rows } = await pool.query(
    `
      SELECT id
      FROM employees
      WHERE manager_id = $1
        AND status = 'active'
        ${employeeId ? "AND id = $2" : ""}
    `,
    employeeId ? [managerEmployeeId, employeeId] : [managerEmployeeId],
  );
  return rows.map((row) => String(row.id));
}

async function loadManagerReportRows(
  reportType: ManagerReportType,
  managerEmployeeId: string,
  from: string,
  to: string,
  employeeId?: string,
): Promise<ManagerReportRow[]> {
  const employeeIds = await getManagerReportEmployeeIds(managerEmployeeId, employeeId);
  const client = await pool.connect();
  try {
    await syncAttendanceExceptions(client, employeeIds, from, to);
  } finally {
    client.release();
  }

  if (!employeeIds.length) {
    return [];
  }

  if (reportType === "team-attendance" || reportType === "overtime") {
    const overtimeOnly = reportType === "overtime";
    const { rows } = await pool.query(
      `
        SELECT
          e.employee_code,
          CONCAT(e.first_name, ' ', e.last_name) AS employee,
          COALESCE(d.name, 'Fără departament') AS department,
          ar.attendance_date,
          ar.session_type,
          ar.check_in_at,
          ar.check_out_at,
          ROUND(ar.worked_hours::numeric, 2) AS worked_hours,
          ROUND(ar.overtime_hours::numeric, 2) AS overtime_hours,
          ar.approval_status
        FROM attendance_records ar
        INNER JOIN employees e ON e.id = ar.employee_id
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE ar.employee_id = ANY($1::uuid[])
          AND ar.attendance_date BETWEEN $2 AND $3
          ${overtimeOnly ? "AND ar.session_type = 'overtime'" : ""}
        ORDER BY ar.attendance_date DESC, employee, ar.check_in_at
      `,
      [employeeIds, from, to],
    );

    return rows.map((row) => ({
      employee_code: row.employee_code ?? "",
      employee: row.employee,
      department: row.department,
      attendance_date: sqlDateOnly(row.attendance_date),
      session_type: reportTypeLabel(row.session_type),
      check_in: sqlTimeOnly(row.check_in_at),
      check_out: sqlTimeOnly(row.check_out_at),
      worked_hours: Number(row.worked_hours ?? 0),
      overtime_hours: Number(row.overtime_hours ?? 0),
      approval_status: reportStatusLabel(row.approval_status),
    }));
  }

  if (reportType === "late-absences") {
    const { rows } = await pool.query(
      `
        SELECT
          e.employee_code,
          CONCAT(e.first_name, ' ', e.last_name) AS employee,
          wte.exception_date,
          wte.type,
          ROUND(wte.hours::numeric, 2) AS hours,
          REGEXP_REPLACE(COALESCE(wte.reason, ''), '^\\[AUTO\\]\\s*', '') AS reason,
          wte.status
        FROM work_time_exceptions wte
        INNER JOIN employees e ON e.id = wte.employee_id
        WHERE wte.employee_id = ANY($1::uuid[])
          AND wte.exception_date BETWEEN $2 AND $3
          AND wte.type IN ('unmotivated_absence', 'late_arrival')
        ORDER BY wte.exception_date DESC, employee, wte.type
      `,
      [employeeIds, from, to],
    );

    return rows.map((row) => ({
      employee_code: row.employee_code ?? "",
      employee: row.employee,
      exception_date: sqlDateOnly(row.exception_date),
      type: reportTypeLabel(row.type),
      hours: Number(row.hours ?? 0),
      reason: row.reason ?? "",
      status: reportStatusLabel(row.status),
    }));
  }

  if (reportType === "team-leaves") {
    const { rows } = await pool.query(
      `
        SELECT
          e.employee_code,
          CONCAT(e.first_name, ' ', e.last_name) AS employee,
          ld.leave_date,
          ld.leave_type,
          r.status AS request_status
        FROM leave_days ld
        INNER JOIN employees e ON e.id = ld.employee_id
        LEFT JOIN requests r ON r.id = ld.request_id
        WHERE ld.employee_id = ANY($1::uuid[])
          AND ld.leave_date BETWEEN $2 AND $3
        ORDER BY ld.leave_date DESC, employee, ld.leave_type
      `,
      [employeeIds, from, to],
    );

    return rows.map((row) => ({
      employee_code: row.employee_code ?? "",
      employee: row.employee,
      leave_date: sqlDateOnly(row.leave_date),
      leave_type: reportTypeLabel(row.leave_type === "paid" ? "paid_leave" : "medical_leave"),
      request_status: reportStatusLabel(row.request_status),
    }));
  }

  if (reportType === "resolved-requests") {
    const { rows } = await pool.query(
      `
        SELECT
          e.employee_code,
          CONCAT(e.first_name, ' ', e.last_name) AS employee,
          r.type,
          r.status,
          r.submitted_at,
          r.decided_at,
          ROUND((EXTRACT(EPOCH FROM (r.decided_at - r.submitted_at)) / 3600)::numeric, 2) AS resolution_hours,
          COALESCE(p.full_name, '') AS decided_by
        FROM requests r
        INNER JOIN employees e ON e.id = r.employee_id
        LEFT JOIN profiles p ON p.id = r.decided_by
        WHERE r.employee_id = ANY($1::uuid[])
          AND r.decided_at IS NOT NULL
          AND r.decided_at::date BETWEEN $2 AND $3
        ORDER BY r.decided_at DESC, employee
      `,
      [employeeIds, from, to],
    );

    return rows.map((row) => ({
      employee_code: row.employee_code ?? "",
      employee: row.employee,
      type: reportTypeLabel(row.type),
      status: reportStatusLabel(row.status),
      submitted_at: sqlDateTime(row.submitted_at),
      decided_at: sqlDateTime(row.decided_at),
      resolution_hours: Number(row.resolution_hours ?? 0),
      decided_by: row.decided_by ?? "",
    }));
  }

  const { rows } = await pool.query(
    `
      WITH days AS (
        SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
      ),
      team_size AS (
        SELECT COUNT(*)::int AS total
        FROM employees
        WHERE id = ANY($1::uuid[])
      )
      SELECT
        days.day AS date,
        team_size.total AS team_size,
        COUNT(DISTINCT ar.employee_id) FILTER (WHERE ar.session_type = 'normal')::int AS present,
        COUNT(DISTINCT ld.employee_id) FILTER (WHERE ld.leave_type = 'paid')::int AS paid_leave,
        COUNT(DISTINCT ld.employee_id) FILTER (WHERE ld.leave_type = 'medical')::int AS medical_leave,
        COUNT(DISTINCT wte.employee_id) FILTER (WHERE wte.type = 'unmotivated_absence')::int AS absences
      FROM days
      CROSS JOIN team_size
      LEFT JOIN attendance_records ar
        ON ar.attendance_date = days.day
       AND ar.employee_id = ANY($1::uuid[])
      LEFT JOIN leave_days ld
        ON ld.leave_date = days.day
       AND ld.employee_id = ANY($1::uuid[])
      LEFT JOIN work_time_exceptions wte
        ON wte.exception_date = days.day
       AND wte.employee_id = ANY($1::uuid[])
      GROUP BY days.day, team_size.total
      ORDER BY days.day DESC
    `,
    [employeeIds, from, to],
  );

  return rows.map((row) => {
    const paidLeave = Number(row.paid_leave ?? 0);
    const medicalLeave = Number(row.medical_leave ?? 0);
    const absences = Number(row.absences ?? 0);
    const teamSize = Number(row.team_size ?? 0);
    return {
      date: sqlDateOnly(row.date),
      team_size: teamSize,
      present: Number(row.present ?? 0),
      paid_leave: paidLeave,
      medical_leave: medicalLeave,
      absences,
      available: Math.max(teamSize - paidLeave - medicalLeave - absences, 0),
    };
  });
}

async function buildManagerReportWorkbook(
  reportType: ManagerReportType,
  from: string,
  to: string,
  rows: ManagerReportRow[],
) {
  const definition = managerReportDefinitions[reportType];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BilateralHR";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(definition.title);

  sheet.addRow([definition.title]);
  sheet.addRow([`${from} - ${to}`]);
  sheet.addRow([]);
  sheet.addRow(definition.columns.map((column) => column.header));
  rows.forEach((row) => {
    sheet.addRow(definition.columns.map((column) => row[column.key] ?? ""));
  });

  sheet.mergeCells(1, 1, 1, definition.columns.length);
  sheet.mergeCells(2, 1, 2, definition.columns.length);
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF075985" } };
  sheet.getRow(2).font = { bold: true, color: { argb: "FF0E7490" } };
  sheet.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0284C7" } };
  sheet.getRow(4).alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 4 }];

  definition.columns.forEach((column, index) => {
    const values = rows.map((row) => String(row[column.key] ?? ""));
    sheet.getColumn(index + 1).width = Math.min(
      Math.max(column.header.length + 4, ...values.map((value) => value.length + 2), 12),
      42,
    );
  });

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber >= 4) {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFD7F3FF" } },
          bottom: { style: "thin", color: { argb: "FFD7F3FF" } },
        };
      });
    }
  });

  return workbook;
}

app.get("/api/manager/reports/:reportType", async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user || user.role !== "manager") {
      throw new Error("Manager access is required.");
    }

    const reportType = assertManagerReportType(String(req.params.reportType ?? ""));
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
    eachDate(from, to);

    const rows = await loadManagerReportRows(reportType, user.id, from, to, employeeId);
    res.json({
      reportType,
      from,
      to,
      columns: managerReportDefinitions[reportType].columns,
      rows,
    });
  } catch (error) {
    res.status(403).json({ message: error instanceof Error ? error.message : "Could not load manager report." });
  }
});

app.get("/api/manager/reports/:reportType/export", async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user || user.role !== "manager") {
      throw new Error("Manager access is required.");
    }

    const reportType = assertManagerReportType(String(req.params.reportType ?? ""));
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
    eachDate(from, to);

    const rows = await loadManagerReportRows(reportType, user.id, from, to, employeeId);
    const workbook = await buildManagerReportWorkbook(reportType, from, to, rows);
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${managerReportDefinitions[reportType].filename}-${from}-${to}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(403).json({ message: error instanceof Error ? error.message : "Could not export manager report." });
  }
});

app.get("/api/hr/employees/:employeeId/documents", async (req, res) => {
  try {
    await requireHrUser(req);
    const employeeId = String(req.params.employeeId);
    const employee = await pool.query("SELECT id FROM employees WHERE id = $1 LIMIT 1", [employeeId]);
    if (!employee.rows[0]) {
      res.status(404).json({ message: "Employee not found." });
      return;
    }

    const [employeeDocuments, medicalDocuments, contractDocuments] = await Promise.all([
      pool.query(
        `
          SELECT id, title, category, file_name, file_path, mime_type, created_at
          FROM employee_documents
          WHERE employee_id = $1
          ORDER BY created_at DESC
        `,
        [employeeId],
      ),
      pool.query(
        `
          SELECT ra.id, ra.file_name, ra.file_path, ra.mime_type, ra.created_at, r.id AS request_id
          FROM request_attachments ra
          INNER JOIN requests r ON r.id = ra.request_id
          WHERE r.employee_id = $1
            AND r.type = 'medical_leave'
          ORDER BY ra.created_at DESC
        `,
        [employeeId],
      ),
      pool.query(
        `
          SELECT id, contract_number, document_path, created_at
          FROM employment_contracts
          WHERE employee_id = $1
            AND document_path IS NOT NULL
          ORDER BY created_at DESC
        `,
        [employeeId],
      ),
    ]);

    res.json({
      documents: [
        ...employeeDocuments.rows.map((document) => ({
          id: document.id,
          source: "employee_document",
          category: document.category === "contract" ? "contract" : "other",
          title: document.title,
          fileName: document.file_name,
          filePath: document.file_path,
          mimeType: document.mime_type,
          createdAt: document.created_at,
        })),
        ...medicalDocuments.rows.map((document) => ({
          id: document.id,
          source: "request_attachment",
          category: "medical",
          title: document.file_name,
          fileName: document.file_name,
          filePath: document.file_path,
          mimeType: document.mime_type,
          createdAt: document.created_at,
          relatedRequestId: document.request_id,
        })),
        ...contractDocuments.rows.map((document) => ({
          id: document.id,
          source: "employment_contract",
          category: "contract",
          title: `Contract ${document.contract_number}`,
          fileName: path.basename(document.document_path),
          filePath: document.document_path,
          mimeType: "application/pdf",
          createdAt: document.created_at,
        })),
      ],
    });
  } catch (error) {
    res.status(403).json({ message: error instanceof Error ? error.message : "Could not load employee documents." });
  }
});

app.post("/api/hr/employees/:employeeId/documents", async (req, res) => {
  try {
    const user = await requireHrUser(req);
    const employeeId = String(req.params.employeeId);
    const category = req.body?.category === "contract" ? "contract" : req.body?.category === "other" ? "general" : null;
    const files = Array.isArray(req.body?.files) ? (req.body.files as UploadFileInput[]) : [];

    if (!category) {
      res.status(400).json({ message: "Document category must be contract or other." });
      return;
    }
    if (!files.length) {
      res.status(400).json({ message: "No files were provided." });
      return;
    }

    const employee = await pool.query("SELECT id FROM employees WHERE id = $1 LIMIT 1", [employeeId]);
    if (!employee.rows[0]) {
      res.status(404).json({ message: "Employee not found." });
      return;
    }

    const uploadedFiles = await storeUploadedFiles(`employees/${employeeId}/${category}`, files);
    const inserted = [];
    for (const file of uploadedFiles) {
      const result = await pool.query(
        `
          INSERT INTO employee_documents (employee_id, uploaded_by, title, category, file_name, file_path, mime_type)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, title, category, file_name, file_path, mime_type, created_at
        `,
        [employeeId, user.profileId, file.fileName, category, file.fileName, file.filePath, file.mimeType],
      );
      inserted.push(result.rows[0]);
    }

    res.json({ documents: inserted });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not upload employee documents." });
  }
});

app.delete("/api/hr/employees/:employeeId/documents/:source/:documentId", async (req, res) => {
  try {
    await requireHrUser(req);
    const employeeId = String(req.params.employeeId);
    const documentId = String(req.params.documentId);
    const source = String(req.params.source);
    let deleted;

    if (source === "employee_document") {
      deleted = await pool.query(
        "DELETE FROM employee_documents WHERE id = $1 AND employee_id = $2 RETURNING file_path",
        [documentId, employeeId],
      );
    } else if (source === "request_attachment") {
      deleted = await pool.query(
        `
          DELETE FROM request_attachments attachment
          USING requests request
          WHERE attachment.id = $1
            AND attachment.request_id = request.id
            AND request.employee_id = $2
            AND request.type = 'medical_leave'
          RETURNING attachment.file_path
        `,
        [documentId, employeeId],
      );
    } else if (source === "employment_contract") {
      deleted = await pool.query(
        `
          WITH target AS (
            SELECT id, document_path
            FROM employment_contracts
            WHERE id = $1
              AND employee_id = $2
          )
          UPDATE employment_contracts contract
          SET document_path = NULL, updated_at = CURRENT_TIMESTAMP
          FROM target
          WHERE contract.id = target.id
          RETURNING target.document_path AS file_path
        `,
        [documentId, employeeId],
      );
    } else {
      res.status(400).json({ message: "Invalid document source." });
      return;
    }

    if (!deleted.rows[0]) {
      res.status(404).json({ message: "Document not found." });
      return;
    }

    await deleteUploadedFile(deleted.rows[0].file_path);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not delete employee document." });
  }
});

app.post("/api/files/upload", async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication is required." });
      return;
    }

    const files = Array.isArray(req.body?.files) ? (req.body.files as UploadFileInput[]) : [];
    const folder = sanitizeFolder(req.body?.folder);

    if (!files.length) {
      res.status(400).json({ message: "No files were provided." });
      return;
    }

    const uploadedFiles = await storeUploadedFiles(folder, files);

    res.json({ files: uploadedFiles });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not upload files." });
  }
});

app.get("/api/profile-routing/hr", async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication is required." });
      return;
    }

    const { rows } = await pool.query(
      `
        SELECT id
        FROM profiles
        WHERE role = 'hr'
      `,
    );
    res.json({ profileIds: rows.map((row) => String(row.id)) });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not load HR recipients." });
  }
});

app.get("/api/profile-routing/employees/:employeeId", async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) {
      res.status(401).json({ message: "Authentication is required." });
      return;
    }

    const { rows } = await pool.query(
      `
        SELECT id, manager_id, profile_id
        FROM employees
        WHERE id = $1
        LIMIT 1
      `,
      [req.params.employeeId],
    );
    const employee = rows[0];
    if (!employee) {
      res.status(404).json({ message: "Employee was not found." });
      return;
    }

    const employeeId = String(employee.id);
    const managerId = employee.manager_id ? String(employee.manager_id) : undefined;
    const canReadProfileId = user.role === "hr"
      || employeeId === user.id
      || employeeId === user.managerId
      || managerId === user.id;

    if (!canReadProfileId) {
      res.status(403).json({ message: "You do not have permission to access this profile reference." });
      return;
    }

    res.json({ profileId: employee.profile_id ? String(employee.profile_id) : undefined });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not load employee profile reference." });
  }
});

app.post("/api/db/:table/query", async (req, res) => {
  try {
    const table = req.params.table;
    assertTable(table);

    const query = await authorizeDbQuery(req, table, req.body as DbQueryRequest);
    let data: unknown;

    if (query.action === "select") {
      data = await executeSelect(table, query);
    } else if (query.action === "insert" || query.action === "upsert") {
      data = await executeInsert(table, query);
    } else if (query.action === "update") {
      data = await executeUpdate(table, query);
    } else if (query.action === "delete") {
      data = await executeDelete(table, query);
    } else {
      throw new Error(`Unsupported action: ${String(query.action)}`);
    }

    res.json({ data, error: null });
  } catch (error) {
    res.status(400).json({ data: null, error: { message: error instanceof Error ? error.message : "Unknown database error." } });
  }
});

async function ensureLocalSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "request_messages" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "request_id" UUID NOT NULL,
      "sender_profile_id" UUID,
      "body" TEXT NOT NULL,
      "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
      CONSTRAINT "request_messages_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "request_messages_request_id_fkey"
        FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "request_messages_sender_profile_id_fkey"
        FOREIGN KEY ("sender_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE INDEX IF NOT EXISTS "idx_request_messages_request_created"
      ON "request_messages"("request_id", "created_at");
  `);
  await normalizeRedundantData();
}

await ensureLocalSchema();

app.listen(port, () => {
  console.log(`Backend API running on http://localhost:${port}`);
});
