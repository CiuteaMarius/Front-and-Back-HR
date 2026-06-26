import { formatDistanceToNowStrict } from 'date-fns';
import { createClient } from '@/src/lib/local-api/client';
import type { Announcement, AttendanceRecord, Department, Employee, EmployeeDocument, EmployeeStatus, EmployeeWorkSchedule, HRReports, LeaveDay, ManagerAttendanceOverview, ManagerReport, ManagerReportType, Notification, Request, RequestMessage, WorkTimeException } from '../types';
import { findLeaveDateOverlap, getLeaveDateRange, getLeaveDates } from './leaveRules';
import { resolveProfilePicture } from './profilePictures';

type RequestInput = {
  employeeId: string;
  employeeName: string;
  managerId?: string;
  type: Request['type'];
  details: string;
  documents?: string[];
  documentFiles?: File[];
  startDate?: string;
  endDate?: string;
  requestedDates?: string[];
  requestedSalaryNetIncrease?: number;
};

type DbRequestType = 'medical_leave' | 'paid_leave' | 'salary_raise' | 'complaint' | 'other';
type DbRequestStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'closed';

type AnnouncementInput = {
  title: string;
  content: string;
  targetAudience: Announcement['targetAudience'];
  targetIds?: string[];
  departmentId?: string;
  departmentName?: string;
};

type EmployeeInput = {
  firstName: string;
  lastName: string;
  email: string;
  profileId?: string;
  cnp?: string;
  phone?: string;
  address?: string;
  departmentId?: string | null;
  position?: string;
  salaryGross: number;
  salaryNet?: number;
  workNormHours?: number;
  hireDate: string;
  managerId?: string;
  status?: EmployeeStatus;
  annualLeaveDays?: number;
  loginMode?: 'none' | 'attach' | 'create';
  existingProfileId?: string;
  temporaryPassword?: string;
};

type EmployeeUpdateInput = Partial<EmployeeInput>;
export type AvailableLoginAccount = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};
export type EmployeeLoginAccountInput =
  | { loginMode: 'attach'; existingProfileId: string }
  | { loginMode: 'create'; temporaryPassword: string };
type NotificationInput = {
  title: string;
  body: string;
  recipientProfileId?: string;
  relatedRequestId?: string;
};

type SalaryReview = NonNullable<Request['salaryReview']>;
type UploadedAttachment = {
  fileName: string;
  filePath: string;
  mimeType: string;
};

const SALARY_REVIEW_PREFIX = 'SALARY_REVIEW_JSON:';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
const AUTH_TOKEN_KEY = 'bilateralhr_auth_token';

const localApi = createClient();
const DATA_EVENT = 'hr-data-changed';
const DATA_POLL_INTERVAL_MS = 5000;
const storageKeys = {
  announcements: 'hr-local-announcements',
  notifications: 'hr-local-notifications',
  requests: 'hr-local-requests',
  employeeUpdatedAt: 'hr-local-employee-updated-at',
} as const;

async function authenticatedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = inBrowser() ? window.localStorage.getItem(AUTH_TOKEN_KEY) : null;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || 'Local API request failed.');
  }
  return payload as T;
}

function announcementReadStorageKey(userId?: string) {
  return `hr-read-announcement-notifications:${userId ?? 'global'}`;
}

function notificationReadStorageKey(userId?: string) {
  return `hr-read-notifications:${userId ?? 'global'}`;
}

function inBrowser() {
  return typeof window !== 'undefined';
}

function emitDataChange() {
  if (inBrowser()) {
    window.dispatchEvent(new Event(DATA_EVENT));
  }
}

export function subscribeToDataChanges(callback: () => void) {
  if (!inBrowser()) {
    return () => undefined;
  }

  const intervalId = window.setInterval(callback, DATA_POLL_INTERVAL_MS);
  window.addEventListener(DATA_EVENT, callback);
  window.addEventListener('storage', callback);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener(DATA_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function readStorage<T>(key: string, fallback: T): T {
  if (!inBrowser()) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (!inBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readAnnouncementReadIds(userId?: string) {
  return readStorage<string[]>(announcementReadStorageKey(userId), []);
}

function writeAnnouncementReadIds(userId: string | undefined, ids: string[]) {
  writeStorage(announcementReadStorageKey(userId), Array.from(new Set(ids)));
}

function readNotificationReadIds(userId?: string) {
  return readStorage<string[]>(notificationReadStorageKey(userId), []);
}

function rememberNotificationReadIds(userId: string | undefined, ids: string[]) {
  if (ids.length === 0) return;
  writeStorage(notificationReadStorageKey(userId), Array.from(new Set([...readNotificationReadIds(userId), ...ids])));
}

function readEmployeeUpdatedAt(employeeId: string) {
  return readStorage<Record<string, string>>(storageKeys.employeeUpdatedAt, {})[employeeId];
}

function writeEmployeeUpdatedAt(employeeId: string, updatedAt: string) {
  const items = readStorage<Record<string, string>>(storageKeys.employeeUpdatedAt, {});
  writeStorage(storageKeys.employeeUpdatedAt, { ...items, [employeeId]: updatedAt });
}

function safeIsoDate(value: unknown) {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function safeDateOnly(value: unknown) {
  if (!value) return undefined;

  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
}

function localDateOnly(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function roundHours(milliseconds: number) {
  return Math.round(Math.max(0, milliseconds) / 36_000) / 100;
}

function parseSalaryReview(value: unknown): SalaryReview | undefined {
  const text = String(value ?? '');
  if (!text.startsWith(SALARY_REVIEW_PREFIX)) return undefined;

  try {
    const parsed = JSON.parse(text.slice(SALARY_REVIEW_PREFIX.length)) as SalaryReview;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function serializeSalaryReview(review: SalaryReview) {
  return `${SALARY_REVIEW_PREFIX}${JSON.stringify(review)}`;
}

function displayDecisionComment(value: unknown) {
  const text = String(value ?? '');
  return text.startsWith(SALARY_REVIEW_PREFIX) ? undefined : text || undefined;
}

function mimeTypeForFileName(fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lowerName.endsWith('.doc')) return 'application/msword';
  return 'application/pdf';
}

function authFileQuery() {
  if (!inBrowser()) return '';

  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? `?token=${encodeURIComponent(token)}` : '';
}

export function requestAttachmentUrl(attachment: NonNullable<Request['attachments']>[number]) {
  if (!attachment.filePath) return undefined;
  const safePath = attachment.filePath.split('/').map(encodeURIComponent).join('/');
  return `${API_URL}/api/files/${safePath}${authFileQuery()}`;
}

export function employeeDocumentUrl(document: EmployeeDocument) {
  if (/^https?:\/\//i.test(document.filePath)) return document.filePath;
  const safePath = document.filePath.split('/').map(encodeURIComponent).join('/');
  return `${API_URL}/api/files/${safePath}${authFileQuery()}`;
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

async function uploadRequestFiles(requestId: string, files: File[] = []): Promise<UploadedAttachment[]> {
  if (!files.length || !inBrowser()) return [];

  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  const response = await fetch(`${API_URL}/api/files/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      folder: `requests/${requestId}`,
      files: await Promise.all(files.map(async (file) => ({
        name: file.name,
        type: file.type || mimeTypeForFileName(file.name),
        contentBase64: await fileToBase64(file),
      }))),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || 'Could not upload request documents.');
  }

  return Array.isArray(payload.files) ? payload.files as UploadedAttachment[] : [];
}

export async function fetchEmployeeDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  const payload = await authenticatedRequest<{ documents?: EmployeeDocument[] }>(
    `/api/hr/employees/${encodeURIComponent(employeeId)}/documents`,
  );
  return payload.documents ?? [];
}

export async function uploadEmployeeDocuments(employeeId: string, category: 'contract' | 'other', files: File[]) {
  if (!files.length) return;

  await authenticatedRequest(`/api/hr/employees/${encodeURIComponent(employeeId)}/documents`, {
    method: 'POST',
    body: JSON.stringify({
      category,
      files: await Promise.all(files.map(async (file) => ({
        name: file.name,
        type: file.type || 'application/octet-stream',
        contentBase64: await fileToBase64(file),
      }))),
    }),
  });
  emitDataChange();
}

export async function deleteEmployeeDocument(employeeId: string, document: EmployeeDocument) {
  await authenticatedRequest(
    `/api/hr/employees/${encodeURIComponent(employeeId)}/documents/${encodeURIComponent(document.source)}/${encodeURIComponent(document.id)}`,
    { method: 'DELETE' },
  );
  emitDataChange();
}

function formatRelativeTime(date: string) {
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return '';
  return `${formatDistanceToNowStrict(parsedDate, { addSuffix: true })}`;
}

function appRequestTypeToDb(type: Request['type']): DbRequestType {
  const typeMap: Record<Request['type'], DbRequestType> = {
    'medical-leave': 'medical_leave',
    'paid-leave': 'paid_leave',
    'salary-raise': 'salary_raise',
    'hr-message': 'other',
  };

  return typeMap[type];
}

function dbRequestTypeToApp(type: unknown): Request['type'] {
  const typeMap: Record<DbRequestType, Request['type']> = {
    medical_leave: 'medical-leave',
    paid_leave: 'paid-leave',
    salary_raise: 'salary-raise',
    complaint: 'hr-message',
    other: 'hr-message',
  };

  return typeMap[String(type) as DbRequestType] ?? 'paid-leave';
}

function normalizeRequestStatus(status: unknown): Request['status'] {
  const value = String(status ?? 'pending') as DbRequestStatus;
  return ['pending', 'in_review', 'approved', 'rejected', 'closed'].includes(value) ? value : 'pending';
}

const getDateRange = getLeaveDateRange;

function leaveOverlapError(overlapDate: string, overlapRequest: Request) {
  return `This leave overlaps with an existing ${overlapRequest.type.replaceAll('-', ' ')} request on ${overlapDate}.`;
}

function assertNoLeaveDateOverlap(
  requests: Request[],
  employeeId: string,
  dates: string[],
  excludeRequestId?: string,
) {
  const overlap = findLeaveDateOverlap(requests, employeeId, dates, excludeRequestId);

  if (overlap) {
    throw new Error(leaveOverlapError(overlap.date, overlap.request));
  }
}

export function defaultEmployeeAvatar() {
  return undefined;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

async function fetchProfiles(): Promise<Array<Record<string, any>>> {
  const { data, error } = await localApi
    .from('profiles')
    .select('id, email, full_name, role, avatar_url');

  if (error) return [];
  return (data ?? []) as Array<Record<string, any>>;
}

async function fetchEmployeeRows(): Promise<Array<Record<string, any>>> {
  const { data, error } = await localApi
    .from('employees')
    .select('id, employee_code, profile_id, first_name, last_name, email, cnp, phone, address, position, salary_gross, salary_net, hire_date, contract_type, work_norm_hours, annual_leave_days, manager_id, department_id, status');

  if (error) {
    return [];
  }

  return (data ?? []) as Array<Record<string, any>>;
}

async function fetchProfileIdForEmployee(employeeId?: string) {
  if (!employeeId) return undefined;

  const payload = await authenticatedRequest<{ profileId?: string }>(
    `/api/profile-routing/employees/${encodeURIComponent(employeeId)}`,
  );
  return payload.profileId;
}

export async function fetchDepartments(): Promise<Department[]> {
  const [{ data: departments, error: departmentsError }, employeeRows] = await Promise.all([
    localApi.from('departments').select('id, name, icon_key').order('name'),
    fetchEmployeeRows(),
  ]);

  if (departmentsError || !departments) {
    return [];
  }

  return departments.map((department) => ({
    id: String(department.id),
    name: department.name,
    iconKey: String(department.icon_key ?? 'community-garden'),
    employeeCount: employeeRows.filter((employee) => {
      const status = String(employee.status ?? 'active').toLowerCase();
      return String(employee.department_id) === String(department.id) && status !== 'fired';
    }).length,
  }));
}

export async function fetchEmployees(): Promise<Employee[]> {
  const [employeeRows, profiles, departments] = await Promise.all([
    fetchEmployeeRows(),
    fetchProfiles(),
    fetchDepartments(),
  ]);

  const profilesById = new Map(profiles.map((profile) => [String(profile.id), profile]));
  const departmentsById = new Map(departments.map((department) => [department.id, department.name]));
  const employeeNamesById = new Map(
    employeeRows.map((employee) => [
      String(employee.id),
      `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() || employee.email,
    ]),
  );

  return employeeRows.map((employee) => {
    const profile = employee.profile_id ? profilesById.get(String(employee.profile_id)) : undefined;
    const fullName = `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() || profile?.full_name || employee.email;

    return {
      id: String(employee.id),
      employeeCode: employee.employee_code ? String(employee.employee_code) : undefined,
      name: fullName,
      email: employee.email,
      cnp: employee.cnp ? String(employee.cnp) : undefined,
      phone: employee.phone ? String(employee.phone) : undefined,
      address: employee.address ? String(employee.address) : undefined,
      departmentId: employee.department_id ? String(employee.department_id) : undefined,
      department: departmentsById.get(String(employee.department_id)) || 'Unassigned',
      position: employee.position ? String(employee.position) : undefined,
      salary: Number(employee.salary_gross ?? 0),
      salaryNet: employee.salary_net === null || employee.salary_net === undefined ? undefined : Number(employee.salary_net),
      hireDate: employee.hire_date,
      updatedAt: readEmployeeUpdatedAt(String(employee.id)) || employee.hire_date,
      contractType: employee.contract_type ? String(employee.contract_type) : undefined,
      workNormHours: employee.work_norm_hours === null || employee.work_norm_hours === undefined ? undefined : Number(employee.work_norm_hours),
      annualLeaveDays: employee.annual_leave_days === null || employee.annual_leave_days === undefined ? undefined : Number(employee.annual_leave_days),
      managerId: employee.manager_id ? String(employee.manager_id) : undefined,
      managerName: employee.manager_id ? employeeNamesById.get(String(employee.manager_id)) : undefined,
      profileId: employee.profile_id ? String(employee.profile_id) : undefined,
      avatarUrl: resolveProfilePicture(profile?.avatar_url, String(employee.id), employee.profile_id ? String(employee.profile_id) : undefined),
      role: profile?.role,
      status: (['default', 'active', 'fired', 'suspended'].includes(String(employee.status ?? 'default').toLowerCase())
        ? String(employee.status ?? 'default').toLowerCase()
        : 'default') as EmployeeStatus,
    };
  });
}

function mapAttendanceRecord(record: Record<string, unknown>): AttendanceRecord {
  return {
    id: String(record.id),
    employeeId: String(record.employee_id),
    attendanceDate: safeDateOnly(record.attendance_date) ?? '',
    checkInAt: safeIsoDate(record.check_in_at),
    scheduledCheckOutAt: safeIsoDate(record.scheduled_check_out_at),
    checkOutAt: safeIsoDate(record.check_out_at),
    checkoutMode: record.checkout_mode === 'manual' ? 'manual' : 'automatic',
    sessionType: record.session_type === 'overtime' ? 'overtime' : 'normal',
    workedHours: Number(record.worked_hours ?? 0),
    overtimeHours: Number(record.overtime_hours ?? 0),
    approvalStatus: record.approval_status === 'approved' ? 'approved' : 'pending',
    approvedByManagerId: record.approved_by_manager_id ? String(record.approved_by_manager_id) : undefined,
    approvedAt: record.approved_at ? safeIsoDate(record.approved_at) : undefined,
  };
}

export async function fetchAttendanceRecords(employeeIds?: string | string[]): Promise<AttendanceRecord[]> {
  if (Array.isArray(employeeIds) && employeeIds.length === 0) return [];

  const query = localApi
    .from('attendance_records')
    .select('*')
    .order('attendance_date', { ascending: false });
  if (Array.isArray(employeeIds)) {
    query.in('employee_id', employeeIds);
  } else if (employeeIds) {
    query.eq('employee_id', employeeIds);
  }
  const { data, error } = await query;

  if (error || !data) return [];
  return data.map((record: Record<string, unknown>) => mapAttendanceRecord(record));
}

export function isAttendanceStillRunning(record: AttendanceRecord, now = new Date()) {
  return record.checkoutMode === 'automatic' && now.getTime() < new Date(record.scheduledCheckOutAt).getTime();
}

export function attendanceWorkedHours(record: AttendanceRecord, now = new Date()) {
  if (!isAttendanceStillRunning(record, now)) return record.workedHours;
  return roundHours(now.getTime() - new Date(record.checkInAt).getTime());
}

export async function checkInEmployee() {
  await authenticatedRequest('/api/attendance/check-in', { method: 'POST' });
  emitDataChange();
}

export async function checkOutEmployee(record: AttendanceRecord) {
  await authenticatedRequest(`/api/attendance/${encodeURIComponent(record.id)}/check-out`, { method: 'POST' });
  emitDataChange();
}

export async function approveAttendanceRecord(record: AttendanceRecord, managerEmployeeId: string) {
  if (isAttendanceStillRunning(record)) {
    throw new Error('Attendance cannot be approved while the employee is still working.');
  }

  const employees = await fetchEmployees();
  const employee = employees.find((item) => item.id === record.employeeId);
  if (!employee || employee.managerId !== managerEmployeeId) {
    throw new Error('You can only approve attendance for your direct reports.');
  }

  const { error } = await localApi
    .from('attendance_records')
    .update({
      approval_status: 'approved',
      approved_by_manager_id: managerEmployeeId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', record.id);

  if (error) throw new Error(error.message);
  emitDataChange();
}

function mapEmployeeWorkSchedule(record: Record<string, unknown>): EmployeeWorkSchedule {
  return {
    employeeId: String(record.employee_id ?? ''),
    mode: record.mode === 'shifts' || record.mode === 'rotating' ? record.mode : 'fixed',
    weeklySchedule: (record.weekly_schedule ?? {}) as EmployeeWorkSchedule['weeklySchedule'],
    shiftDefinitions: Array.isArray(record.shift_definitions)
      ? record.shift_definitions as EmployeeWorkSchedule['shiftDefinitions']
      : [],
    effectiveFrom: safeDateOnly(record.effective_from),
    rotationAnchorDate: safeDateOnly(record.rotation_anchor_date),
    rotationWorkDays: Number(record.rotation_work_days ?? 1),
    rotationOffDays: Number(record.rotation_off_days ?? 1),
    rotationStartTime: String(record.rotation_start_time ?? '09:00'),
  };
}

function mapWorkTimeException(record: Record<string, unknown>): WorkTimeException {
  return {
    id: String(record.id),
    employeeId: String(record.employee_id),
    type: record.type === 'late_arrival' ? 'late_arrival' : 'unmotivated_absence',
    exceptionDate: safeDateOnly(record.exception_date) ?? '',
    hours: Number(record.hours ?? 0),
    reason: record.reason ? String(record.reason).replace(/^\[AUTO\]\s*/, '') : undefined,
    status: String(record.status ?? 'closed'),
  };
}

export async function fetchEmployeeWorkSchedule(employeeId: string) {
  const payload = await authenticatedRequest<{ schedule: Record<string, unknown> }>(
    `/api/hr/employee-schedules/${encodeURIComponent(employeeId)}`,
  );
  return mapEmployeeWorkSchedule(payload.schedule);
}

export async function saveEmployeeWorkSchedule(schedule: EmployeeWorkSchedule) {
  const payload = await authenticatedRequest<{ schedule: Record<string, unknown> }>(
    `/api/hr/employee-schedules/${encodeURIComponent(schedule.employeeId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        mode: schedule.mode,
        weeklySchedule: schedule.weeklySchedule,
        shiftDefinitions: schedule.shiftDefinitions,
        rotationAnchorDate: schedule.rotationAnchorDate,
        rotationWorkDays: schedule.rotationWorkDays,
        rotationOffDays: schedule.rotationOffDays,
        rotationStartTime: schedule.rotationStartTime,
      }),
    },
  );
  emitDataChange();
  return mapEmployeeWorkSchedule(payload.schedule);
}

export async function fetchManagerAttendanceOverview(from: string, to: string): Promise<ManagerAttendanceOverview> {
  const payload = await authenticatedRequest<{ exceptions?: Array<Record<string, unknown>>; schedules?: Array<Record<string, unknown>> }>(
    `/api/manager/attendance-overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  return {
    exceptions: (payload.exceptions ?? []).map(mapWorkTimeException),
    schedules: (payload.schedules ?? []).map(mapEmployeeWorkSchedule),
  };
}

export async function fetchManagerReport(
  reportType: ManagerReportType,
  filters: { from: string; to: string; employeeId?: string },
): Promise<ManagerReport> {
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
  });
  const payload = await authenticatedRequest<ManagerReport>(
    `/api/manager/reports/${encodeURIComponent(reportType)}?${params.toString()}`,
  );

  return {
    reportType,
    from: String(payload.from ?? filters.from),
    to: String(payload.to ?? filters.to),
    columns: payload.columns ?? [],
    rows: payload.rows ?? [],
  };
}

export async function downloadManagerReport(
  reportType: ManagerReportType,
  filters: { from: string; to: string; employeeId?: string },
) {
  const token = inBrowser() ? window.localStorage.getItem(AUTH_TOKEN_KEY) : null;
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
  });
  const response = await fetch(`${API_URL}/api/manager/reports/${encodeURIComponent(reportType)}/export?${params.toString()}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message || 'Report could not be exported.');
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `manager-report-${reportType}.xlsx`;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

const toNumber = (value: unknown) => Number(value ?? 0) || 0;
const toOptionalString = (value: unknown) => value ? String(value) : undefined;

export async function fetchHrReports(year: number): Promise<HRReports> {
  const payload = await authenticatedRequest<Record<string, any>>(`/api/hr/reports?year=${encodeURIComponent(year)}`);

  return {
    year: Number(payload.year ?? year),
    monthlyNewHires: (payload.monthlyNewHires ?? []).map((row: Record<string, unknown>) => ({
      month: toNumber(row.month),
      label: String(row.label ?? ''),
      hires: toNumber(row.hires),
    })),
    employeeEvolution: (payload.employeeEvolution ?? []).map((row: Record<string, unknown>) => ({
      month: toNumber(row.month),
      label: String(row.label ?? ''),
      total: toNumber(row.total),
    })),
    departmentDistribution: (payload.departmentDistribution ?? []).map((row: Record<string, unknown>) => ({
      department: String(row.department ?? ''),
      employees: toNumber(row.employees),
    })),
    tenureDistribution: (payload.tenureDistribution ?? []).map((row: Record<string, unknown>) => ({
      bucket: String(row.bucket ?? ''),
      employees: toNumber(row.employees),
    })),
    monthlySalaryCosts: (payload.monthlySalaryCosts ?? []).map((row: Record<string, unknown>) => ({
      month: toNumber(row.month),
      label: String(row.label ?? ''),
      gross: toNumber(row.gross),
      net: toNumber(row.net),
    })),
    averageSalaryByDepartment: (payload.averageSalaryByDepartment ?? []).map((row: Record<string, unknown>) => ({
      department: String(row.department ?? ''),
      gross: toNumber(row.gross),
      net: toNumber(row.net),
    })),
    salaryStats: {
      minGross: toNumber(payload.salaryStats?.min_gross),
      maxGross: toNumber(payload.salaryStats?.max_gross),
      medianGross: toNumber(payload.salaryStats?.median_gross),
      minNet: toNumber(payload.salaryStats?.min_net),
      maxNet: toNumber(payload.salaryStats?.max_net),
      medianNet: toNumber(payload.salaryStats?.median_net),
    },
    leaveBalances: (payload.leaveBalances ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      employeeCode: toOptionalString(row.employee_code),
      employee: String(row.employee ?? ''),
      totalDays: toNumber(row.total_days),
      usedDays: toNumber(row.used_days),
      remainingDays: toNumber(row.remaining_days),
    })),
    monthlyLeaveUsage: (payload.monthlyLeaveUsage ?? []).map((row: Record<string, unknown>) => ({
      month: toNumber(row.month),
      label: String(row.label ?? ''),
      paid: toNumber(row.paid),
      medical: toNumber(row.medical),
      total: toNumber(row.total),
    })),
    requestResolutionTime: (payload.requestResolutionTime ?? []).map((row: Record<string, unknown>) => ({
      type: String(row.type ?? ''),
      days: toNumber(row.days),
      resolved: toNumber(row.resolved),
    })),
    busiestLeavePeriods: (payload.busiestLeavePeriods ?? []).map((row: Record<string, unknown>) => ({
      date: safeDateOnly(row.leave_date) ?? '',
      employees: toNumber(row.employees),
      paid: toNumber(row.paid),
      medical: toNumber(row.medical),
    })),
    workedHoursByEmployee: (payload.workedHoursByEmployee ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      employeeCode: toOptionalString(row.employee_code),
      employee: String(row.employee ?? ''),
      department: String(row.department ?? ''),
      hours: toNumber(row.hours),
    })),
    workedHoursByDepartment: (payload.workedHoursByDepartment ?? []).map((row: Record<string, unknown>) => ({
      department: String(row.department ?? ''),
      hours: toNumber(row.hours),
    })),
    overtimeMonthly: (payload.overtimeMonthly ?? []).map((row: Record<string, unknown>) => ({
      month: toNumber(row.month),
      label: String(row.label ?? ''),
      total: toNumber(row.total),
      approved: toNumber(row.approved),
    })),
    absencesMonthly: (payload.absencesMonthly ?? []).map((row: Record<string, unknown>) => ({
      month: toNumber(row.month),
      label: String(row.label ?? ''),
      absences: toNumber(row.absences),
      hours: toNumber(row.hours),
    })),
  };
}

export async function addEmployee(input: EmployeeInput) {
  const token = inBrowser() ? window.localStorage.getItem(AUTH_TOKEN_KEY) : null;
  const response = await fetch(`${API_URL}/api/hr/employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      cnp: input.cnp || null,
      phone: input.phone || null,
      address: input.address || null,
      departmentId: input.departmentId || null,
      position: input.position || null,
      salaryGross: input.salaryGross,
      salaryNet: input.salaryNet ?? null,
      workNormHours: input.workNormHours ?? 8,
      hireDate: input.hireDate,
      managerId: input.managerId || null,
      annualLeaveDays: input.annualLeaveDays ?? 20,
      loginMode: input.loginMode ?? 'none',
      existingProfileId: input.existingProfileId || null,
      temporaryPassword: input.temporaryPassword || null,
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Employee could not be added.');
  }

  emitDataChange();
  return payload.employee as { id: string } | undefined;
}

export async function fetchAvailableLoginAccounts(): Promise<AvailableLoginAccount[]> {
  const token = inBrowser() ? window.localStorage.getItem(AUTH_TOKEN_KEY) : null;
  let response: Response;

  try {
    response = await fetch(`${API_URL}/api/hr/available-login-accounts`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    return [];
  }

  if (!response.ok) {
    return [];
  }

  const payload = await response.json().catch(() => ({}));
  return (payload.accounts ?? []).map((account: Record<string, unknown>) => ({
    id: String(account.id),
    fullName: String(account.full_name ?? ''),
    email: String(account.email ?? ''),
    role: String(account.role ?? 'employee'),
  }));
}

export async function attachEmployeeLoginAccount(employeeId: string, input: EmployeeLoginAccountInput) {
  await authenticatedRequest(`/api/hr/employees/${employeeId}/login-account`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  writeEmployeeUpdatedAt(employeeId, new Date().toISOString());
  emitDataChange();
}

export async function updateEmployee(employeeId: string, input: EmployeeUpdateInput) {
  const payload: Record<string, string | number | null> = {};

  if (input.firstName !== undefined) payload.first_name = input.firstName;
  if (input.lastName !== undefined) payload.last_name = input.lastName;
  if (input.email !== undefined) payload.email = input.email;
  if (input.profileId !== undefined) payload.profile_id = input.profileId || null;
  if (input.cnp !== undefined) payload.cnp = input.cnp || null;
  if (input.phone !== undefined) payload.phone = input.phone || null;
  if (input.address !== undefined) payload.address = input.address || null;
  if (input.departmentId !== undefined) payload.department_id = input.departmentId;
  if (input.position !== undefined) payload.position = input.position || null;
  if (input.salaryGross !== undefined) payload.salary_gross = input.salaryGross;
  if (input.salaryNet !== undefined) payload.salary_net = input.salaryNet;
  if (input.workNormHours !== undefined) payload.work_norm_hours = input.workNormHours;
  if (input.hireDate !== undefined) payload.hire_date = input.hireDate;
  if (input.managerId !== undefined) payload.manager_id = input.managerId || null;
  if (input.status !== undefined) {
    payload.status = input.status;
    payload.termination_date = input.status === 'fired' ? localDateOnly() : null;
  }
  if (input.annualLeaveDays !== undefined) payload.annual_leave_days = input.annualLeaveDays;

  const { error } = await localApi
    .from('employees')
    .update(payload)
    .eq('id', employeeId);

  if (error) {
    throw new Error(error.message);
  }

  writeEmployeeUpdatedAt(employeeId, new Date().toISOString());
  emitDataChange();
}

export async function updateProfilePicture(avatarUrl: string | null) {
  await authenticatedRequest('/api/profile-picture', {
    method: 'PATCH',
    body: JSON.stringify({ avatarUrl }),
  });
  emitDataChange();
}

export async function terminateEmployee(employeeId: string) {
  const { error } = await localApi
    .from('employees')
    .update({ status: 'fired', termination_date: localDateOnly() })
    .eq('id', employeeId);

  if (error) {
    throw new Error(error.message);
  }

  writeEmployeeUpdatedAt(employeeId, new Date().toISOString());
  emitDataChange();
}

export async function addDepartment(name: string, iconKey = 'community-garden') {
  const { error } = await localApi.from('departments').insert({ name, icon_key: iconKey });

  if (error) {
    throw new Error(error.message);
  }

  emitDataChange();
}

export async function updateDepartmentIcon(departmentId: string, iconKey: string) {
  const { error } = await localApi.from('departments').update({ icon_key: iconKey }).eq('id', departmentId);

  if (error) {
    throw new Error(error.message);
  }

  emitDataChange();
}

export async function deleteDepartment(departmentId: string) {
  const { error } = await localApi.from('departments').delete().eq('id', departmentId);

  if (error) {
    throw new Error(error.message);
  }

  emitDataChange();
}

function mapRequestRecord(record: Record<string, unknown>, employeesById: Map<string, Employee>): Request {
  const employeeId = String(record.employee_id ?? record.employeeId ?? '');
  const employee = employeesById.get(employeeId);
  const type = dbRequestTypeToApp(record.type);
  const assignedToEmployeeId = String(record.assigned_to_employee_id ?? '') || undefined;
  const routedToRole = String(
    record.routed_to_role ?? (type === 'paid-leave' && assignedToEmployeeId ? 'manager' : 'hr'),
  ) === 'manager'
    ? 'manager'
    : 'hr';
  const approvedDateRows = Array.isArray(record.request_approved_dates)
    ? (record.request_approved_dates as Array<Record<string, unknown>>)
    : [];
  const attachmentRows = Array.isArray(record.request_attachments)
    ? (record.request_attachments as Array<Record<string, unknown>>)
    : [];
  const attachments = attachmentRows.map((attachment) => ({
    fileName: String(attachment.file_name ?? ''),
    filePath: attachment.file_path ? String(attachment.file_path) : undefined,
    mimeType: attachment.mime_type ? String(attachment.mime_type) : undefined,
  })).filter((attachment) => attachment.fileName);

  return {
    id: String(record.id),
    employeeId,
    employeeName:
      String(record.employee_name ?? record.employeeName ?? employee?.name ?? 'Unknown employee'),
    managerId: assignedToEmployeeId ?? employee?.managerId,
    type,
    status: normalizeRequestStatus(record.status),
    submittedDate: safeIsoDate(record.submitted_at ?? record.submitted_date ?? record.submittedDate ?? record.created_at),
    details: String(record.details ?? record.reason ?? ''),
    documents: attachments.length > 0
      ? attachments.map((attachment) => attachment.fileName)
      : Array.isArray(record.documents)
      ? (record.documents as string[])
      : [],
    attachments,
    rejectionReason: record.rejection_reason ? String(record.rejection_reason) : record.rejectionReason ? String(record.rejectionReason) : undefined,
    decisionComment: displayDecisionComment(record.decision_comment),
    requestedSalaryNetIncrease: record.requested_salary_gross === null || record.requested_salary_gross === undefined
      ? undefined
      : Number(record.requested_salary_gross),
    salaryReview: parseSalaryReview(record.decision_comment),
    approvedDates: approvedDateRows.length > 0
      ? approvedDateRows.map((dateRow) => safeDateOnly(dateRow.approved_date)).filter(Boolean) as string[]
      : Array.isArray(record.approved_dates)
      ? (record.approved_dates as unknown[]).map(safeDateOnly).filter(Boolean) as string[]
      : Array.isArray(record.approvedDates)
      ? (record.approvedDates as unknown[]).map(safeDateOnly).filter(Boolean) as string[]
      : undefined,
    startDate: safeDateOnly(record.start_date ?? record.startDate),
    endDate: safeDateOnly(record.end_date ?? record.endDate),
    routedToRole,
  };
}

export async function fetchRequests(): Promise<Request[]> {
  const employees = await fetchEmployees();
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const { data, error } = await localApi
    .from('requests')
    .select('*, request_approved_dates(approved_date), request_attachments(file_name, file_path, mime_type)')
    .order('submitted_at', { ascending: false });

  if (error || !data) {
    return readStorage<Request[]>(storageKeys.requests, []);
  }

  return data.map((record) => mapRequestRecord(record as Record<string, unknown>, employeesById));
}

function mapRequestMessageRecord(record: Record<string, unknown>): RequestMessage {
  return {
    id: String(record.id),
    requestId: String(record.request_id ?? ''),
    senderProfileId: record.sender_profile_id ? String(record.sender_profile_id) : undefined,
    body: String(record.body ?? ''),
    createdAt: safeIsoDate(record.created_at),
  };
}

export async function fetchRequestMessages(requestId: string): Promise<RequestMessage[]> {
  const { data, error } = await localApi
    .from('request_messages')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data.map((record) => mapRequestMessageRecord(record as Record<string, unknown>));
}

async function persistRequestNotification(input: NotificationInput) {
  if (!input.recipientProfileId) return;

  await addNotification({
    id: crypto.randomUUID(),
    title: input.title,
    body: input.body,
    message: input.body,
    date: new Date().toISOString(),
    unread: true,
    userId: input.recipientProfileId,
    relatedRequestId: input.relatedRequestId,
  });
}

async function fetchHrNotificationRecipientIds() {
  const payload = await authenticatedRequest<{ profileIds?: string[] }>('/api/profile-routing/hr');
  return payload.profileIds ?? [];
}

async function persistRequestNotifications(input: Omit<NotificationInput, 'recipientProfileId'> & { recipientProfileIds: Array<string | undefined> }) {
  const recipients = Array.from(new Set(input.recipientProfileIds.filter(Boolean))) as string[];
  await Promise.all(recipients.map((recipientProfileId) => persistRequestNotification({ ...input, recipientProfileId })));
}

export async function createHrMessageRequest(input: { employeeId: string; employeeName: string; subject: string; message: string }) {
  const subject = input.subject.trim();
  const message = input.message.trim();
  if (!subject || !message) {
    throw new Error('Subject and message are required.');
  }

  const requestId = crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  const { error } = await localApi.from('requests').insert({
    id: requestId,
    employee_id: input.employeeId,
    type: 'other',
    status: 'pending',
    details: subject,
    routed_to_role: 'hr',
    assigned_to_employee_id: null,
    submitted_at: submittedAt,
  });

  if (error) {
    throw new Error(error.message);
  }

  const messageInsert = await localApi.from('request_messages').insert({
    request_id: requestId,
    body: message,
  });

  if (messageInsert.error) {
    throw new Error(messageInsert.error.message);
  }

  await persistRequestNotifications({
    title: 'New HR message',
    body: `${input.employeeName}: ${subject}`,
    relatedRequestId: requestId,
    recipientProfileIds: await fetchHrNotificationRecipientIds(),
  });

  emitDataChange();
  return requestId;
}

export async function replyToHrMessageRequest(requestId: string, body: string) {
  const messageBody = body.trim();
  if (!messageBody) {
    throw new Error('Message is required.');
  }

  const [currentRequests, authPayload] = await Promise.all([
    fetchRequests(),
    authenticatedRequest<{ user?: { role?: string; profileId?: string; id?: string; name?: string } }>('/api/auth/me'),
  ]);
  const request = currentRequests.find((item) => item.id === requestId);
  if (!request || request.type !== 'hr-message') {
    throw new Error('Conversation not found.');
  }

  const isHr = authPayload.user?.role === 'hr';
  const insert = await localApi.from('request_messages').insert({
    request_id: requestId,
    body: messageBody,
  });

  if (insert.error) {
    throw new Error(insert.error.message);
  }

  const { error } = await localApi
    .from('requests')
    .update({
      status: isHr ? 'in_review' : 'pending',
      decided_by: isHr ? authPayload.user?.profileId ?? authPayload.user?.id ?? null : null,
      decided_at: isHr ? new Date().toISOString() : null,
    })
    .eq('id', requestId);

  if (error) {
    throw new Error(error.message);
  }

  if (isHr) {
    await persistRequestNotification({
      recipientProfileId: await fetchProfileIdForEmployee(request.employeeId),
      title: 'HR replied',
      body: `HR replied to: ${request.details}`,
      relatedRequestId: requestId,
    });
  } else {
    await persistRequestNotifications({
      title: 'HR conversation updated',
      body: `${request.employeeName}: ${request.details}`,
      relatedRequestId: requestId,
      recipientProfileIds: await fetchHrNotificationRecipientIds(),
    });
  }

  emitDataChange();
}

export async function closeHrMessageRequest(requestId: string) {
  const currentRequests = await fetchRequests();
  const request = currentRequests.find((item) => item.id === requestId);
  if (!request || request.type !== 'hr-message') {
    throw new Error('Conversation not found.');
  }

  const { data: authData } = await localApi.auth.getUser();
  await markRequestNotificationsAsRead(requestId);

  const { error } = await localApi
    .from('requests')
    .update({
      status: 'closed',
      decided_by: authData.user?.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) {
    throw new Error(error.message);
  }

  await persistRequestNotification({
    recipientProfileId: await fetchProfileIdForEmployee(request.employeeId),
    title: 'HR conversation closed',
    body: `Your conversation "${request.details}" was closed by HR.`,
    relatedRequestId: requestId,
  });

  emitDataChange();
}

export async function createRequest(input: RequestInput) {
  const dbType = appRequestTypeToDb(input.type);
  if (input.type === 'medical-leave' && !input.documentFiles?.length && !input.documents?.length) {
    throw new Error('medicalDocumentRequired');
  }
  if (input.type === 'medical-leave' || input.type === 'paid-leave') {
    const currentRequests = await fetchRequests();
    const requestedDates = input.requestedDates?.length
      ? input.requestedDates
      : getDateRange(input.startDate, input.endDate);
    assertNoLeaveDateOverlap(currentRequests, input.employeeId, requestedDates);
    if (input.type === 'paid-leave') {
      await assertEnoughAnnualLeaveDays(input.employeeId, requestedDates);
    }
  }

  const [managerProfileId, hrRecipientIds] = await Promise.all([
    input.type === 'paid-leave' && input.managerId ? fetchProfileIdForEmployee(input.managerId) : Promise.resolve(undefined),
    fetchHrNotificationRecipientIds(),
  ]);
  const routedToRole = input.type === 'paid-leave' && input.managerId && managerProfileId ? 'manager' : 'hr';
  const assignedToEmployeeId = routedToRole === 'manager' ? input.managerId ?? null : null;
  const request: Request = {
    id: crypto.randomUUID(),
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    managerId: assignedToEmployeeId ?? input.managerId,
    routedToRole,
    type: input.type,
    status: 'pending',
    submittedDate: new Date().toISOString(),
    details: input.details,
    documents: input.documents ?? [],
    startDate: input.startDate,
    endDate: input.endDate,
    approvedDates: input.requestedDates,
    requestedSalaryNetIncrease: input.requestedSalaryNetIncrease,
  };

  const { error } = await localApi.from('requests').insert({
    id: request.id,
    employee_id: request.employeeId,
    type: dbType,
    status: request.status,
    details: request.details,
    start_date: request.startDate ?? null,
    end_date: request.endDate ?? null,
    requested_salary_gross: input.type === 'salary-raise' ? input.requestedSalaryNetIncrease ?? null : null,
    routed_to_role: routedToRole,
    assigned_to_employee_id: assignedToEmployeeId,
    submitted_at: request.submittedDate,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (input.requestedDates?.length) {
    await replaceRequestDates(request.id, input.requestedDates);
  }

  const uploadedAttachments = await uploadRequestFiles(request.id, input.documentFiles);
  const attachmentRows = uploadedAttachments.length > 0
    ? uploadedAttachments
    : (request.documents ?? []).map((fileName) => ({
      fileName,
      filePath: `requests/${request.id}/${fileName}`,
      mimeType: mimeTypeForFileName(fileName),
    }));

  if (attachmentRows.length > 0) {
    const { data: authData } = await localApi.auth.getUser();
    await localApi.from('request_attachments').insert(
      attachmentRows.map((attachment) => ({
        request_id: request.id,
        uploaded_by: authData.user?.id ?? null,
        file_name: attachment.fileName,
        file_path: attachment.filePath,
        mime_type: attachment.mimeType,
      })),
    );
  }

  await persistRequestNotifications({
    title: 'New request received',
    body: `New ${request.type.replaceAll('-', ' ')} request from ${request.employeeName}`,
    relatedRequestId: request.id,
    recipientProfileIds: routedToRole === 'manager' ? [managerProfileId] : hrRecipientIds,
  });
  emitDataChange();
}

export async function updateRequestStatus(
  requestId: string,
  status: Request['status'],
  options?: { rejectionReason?: string; approvedDates?: string[]; suppressEmployeeNotification?: boolean },
) {
  const currentRequests = await fetchRequests();
  const currentRequest = currentRequests.find((request) => request.id === requestId);

  if (!currentRequest) {
    throw new Error('Request not found.');
  }

  const approvedDates = options?.approvedDates?.length
    ? options.approvedDates
    : status === 'approved'
    ? getDateRange(currentRequest.startDate, currentRequest.endDate)
    : [];

  if (status === 'approved' && (currentRequest.type === 'medical-leave' || currentRequest.type === 'paid-leave')) {
    assertNoLeaveDateOverlap(currentRequests, currentRequest.employeeId, approvedDates, currentRequest.id);
    if (currentRequest.type === 'paid-leave') {
      await assertEnoughAnnualLeaveDays(currentRequest.employeeId, approvedDates);
    }
  }

  const { data: authData } = await localApi.auth.getUser();
  await markRequestNotificationsAsRead(requestId);

  const { error } = await localApi
    .from('requests')
    .update({
      status,
      decided_by: authData.user?.id ?? null,
      decided_at: new Date().toISOString(),
      decision_comment: options?.rejectionReason ?? null,
      rejection_reason: options?.rejectionReason ?? null,
    })
    .eq('id', requestId);

  if (error) {
    throw new Error(error.message);
  }

  await replaceRequestDates(requestId, approvedDates);
  await localApi.from('leave_days').delete().eq('request_id', requestId);

  if (status === 'approved') {
    await persistApprovedLeaveDays(currentRequest, approvedDates);
  }

  if (!options?.suppressEmployeeNotification) {
    const statusLabel = status === 'approved' ? 'approved' : 'rejected';
    const employeeProfileId = await fetchProfileIdForEmployee(currentRequest.employeeId);
    await persistRequestNotification({
      recipientProfileId: employeeProfileId,
      title: `Request ${statusLabel}`,
      body: `Your ${currentRequest.type.replaceAll('-', ' ')} request was ${statusLabel}.`,
      relatedRequestId: requestId,
    });
  }
  emitDataChange();
}

async function replaceRequestDates(requestId: string, dates: string[]) {
  await localApi.from('request_approved_dates').delete().eq('request_id', requestId);

  const uniqueDates = Array.from(new Set(dates)).sort();
  if (uniqueDates.length === 0) return;

  const { error } = await localApi.from('request_approved_dates').insert(
    uniqueDates.map((approvedDate) => ({
      request_id: requestId,
      approved_date: approvedDate,
    })),
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function persistApprovedLeaveDays(request: Request, dates: string[]) {
  if (request.type !== 'medical-leave' && request.type !== 'paid-leave') return;

  const uniqueDates = Array.from(new Set(dates)).sort();
  if (uniqueDates.length === 0) return;

  const { error } = await localApi.from('leave_days').upsert(
    uniqueDates.map((approvedDate) => ({
      employee_id: request.employeeId,
      request_id: request.id,
      leave_type: request.type === 'medical-leave' ? 'medical' : 'paid',
      leave_date: approvedDate,
    })),
    { onConflict: 'employee_id,leave_date' },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function proposeRequestDates(
  requestId: string,
  proposedDates: string[],
  comment: string,
) {
  const currentRequests = await fetchRequests();
  const currentRequest = currentRequests.find((request) => request.id === requestId);

  if (!currentRequest) {
    throw new Error('Request not found.');
  }

  const { data: authData } = await localApi.auth.getUser();
  const uniqueDates = Array.from(new Set(proposedDates)).sort();
  assertNoLeaveDateOverlap(currentRequests, currentRequest.employeeId, uniqueDates, currentRequest.id);
  if (currentRequest.type === 'paid-leave') {
    await assertEnoughAnnualLeaveDays(currentRequest.employeeId, uniqueDates);
  }

  const { error } = await localApi
    .from('requests')
    .update({
      status: 'in_review',
      decided_by: authData.user?.id ?? null,
      decided_at: new Date().toISOString(),
      decision_comment: comment || null,
      rejection_reason: null,
    })
    .eq('id', requestId);

  if (error) {
    throw new Error(error.message);
  }

  await replaceRequestDates(requestId, uniqueDates);
  await localApi.from('leave_days').delete().eq('request_id', requestId);

  const employeeProfileId = await fetchProfileIdForEmployee(currentRequest.employeeId);
  await persistRequestNotification({
    recipientProfileId: employeeProfileId,
    title: 'New leave proposal',
    body: comment
      ? `Your manager proposed ${uniqueDates.length} leave day(s): ${comment}`
      : `Your manager proposed ${uniqueDates.length} leave day(s).`,
    relatedRequestId: requestId,
  });

  emitDataChange();
}

export async function acceptRequestProposal(requestId: string) {
  const currentRequests = await fetchRequests();
  const currentRequest = currentRequests.find((request) => request.id === requestId);

  if (!currentRequest) {
    throw new Error('Request not found.');
  }

  const dates = currentRequest.approvedDates?.length
    ? currentRequest.approvedDates
    : getDateRange(currentRequest.startDate, currentRequest.endDate);

  await updateRequestStatus(requestId, 'approved', {
    approvedDates: dates,
    suppressEmployeeNotification: true,
  });

  const managerProfileId = await fetchProfileIdForEmployee(currentRequest.managerId);
  await persistRequestNotification({
    recipientProfileId: managerProfileId,
    title: 'Proposal accepted',
    body: `${currentRequest.employeeName} accepted the proposed leave dates.`,
    relatedRequestId: requestId,
  });
}

export async function rejectRequestProposal(requestId: string) {
  const currentRequests = await fetchRequests();
  const currentRequest = currentRequests.find((request) => request.id === requestId);

  if (!currentRequest) {
    throw new Error('Request not found.');
  }

  await updateRequestStatus(requestId, 'rejected', {
    rejectionReason: 'Employee rejected the manager proposal.',
    suppressEmployeeNotification: true,
  });

  const managerProfileId = await fetchProfileIdForEmployee(currentRequest.managerId);
  await persistRequestNotification({
    recipientProfileId: managerProfileId,
    title: 'Proposal rejected',
    body: `${currentRequest.employeeName} rejected the proposed leave dates.`,
    relatedRequestId: requestId,
  });
}

export async function requestSalaryRaiseManagerReview(requestId: string) {
  const currentRequests = await fetchRequests();
  const currentRequest = currentRequests.find((request) => request.id === requestId);

  if (!currentRequest || currentRequest.type !== 'salary-raise') {
    throw new Error('Salary raise request not found.');
  }

  if (!currentRequest.managerId) {
    throw new Error('This employee does not have a manager assigned.');
  }

  const managerProfileId = await fetchProfileIdForEmployee(currentRequest.managerId);
  if (!managerProfileId) {
    throw new Error('The assigned manager does not have a login profile.');
  }

  const salaryReview: SalaryReview = {
    requested: true,
  };

  const { error } = await localApi
    .from('requests')
    .update({ decision_comment: serializeSalaryReview(salaryReview) })
    .eq('id', requestId);

  if (error) {
    throw new Error(error.message);
  }

  await persistRequestNotification({
    recipientProfileId: managerProfileId,
    title: 'Salary raise review requested',
    body: `HR asks for your recommendation about ${currentRequest.employeeName}'s salary raise request.`,
    relatedRequestId: requestId,
  });

  emitDataChange();
}

export async function respondToSalaryRaiseReview(
  requestId: string,
  recommendation: 'yes' | 'no',
  comment: string,
) {
  const currentRequests = await fetchRequests();
  const currentRequest = currentRequests.find((request) => request.id === requestId);

  if (!currentRequest || currentRequest.type !== 'salary-raise') {
    throw new Error('Salary raise request not found.');
  }

  const salaryReview: SalaryReview = {
    ...currentRequest.salaryReview,
    requested: true,
    recommendation,
    comment,
    respondedAt: new Date().toISOString(),
  };

  const { error } = await localApi
    .from('requests')
    .update({ decision_comment: serializeSalaryReview(salaryReview) })
    .eq('id', requestId);

  if (error) {
    throw new Error(error.message);
  }

  const hrRecipientIds = await fetchHrNotificationRecipientIds();
  await persistRequestNotifications({
    recipientProfileIds: hrRecipientIds,
    title: 'Manager answered salary raise review',
    body: `${currentRequest.employeeName}'s manager answered ${recommendation === 'yes' ? 'yes' : 'no'} for the salary raise request.`,
    relatedRequestId: requestId,
  });

  emitDataChange();
}

export async function resolveSalaryRaiseRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  options?: { approvedNetIncrease?: number; rejectionReason?: string },
) {
  const currentRequests = await fetchRequests();
  const currentRequest = currentRequests.find((request) => request.id === requestId);

  if (!currentRequest || currentRequest.type !== 'salary-raise') {
    throw new Error('Salary raise request not found.');
  }

  const employees = await fetchEmployees();
  const employee = employees.find((item) => item.id === currentRequest.employeeId);
  if (!employee) {
    throw new Error('Employee not found.');
  }

  const { data: authData } = await localApi.auth.getUser();
  await markRequestNotificationsAsRead(requestId);
  const employeeProfileId = await fetchProfileIdForEmployee(currentRequest.employeeId);

  if (decision === 'rejected') {
    const rejectionReason = options?.rejectionReason?.trim();
    if (!rejectionReason) {
      throw new Error('A rejection reason is required.');
    }

    const { error } = await localApi
      .from('requests')
      .update({
        status: 'rejected',
        decided_by: authData.user?.id ?? null,
        decided_at: new Date().toISOString(),
        decision_comment: rejectionReason,
        rejection_reason: rejectionReason,
      })
      .eq('id', requestId);

    if (error) {
      throw new Error(error.message);
    }

    await persistRequestNotification({
      recipientProfileId: employeeProfileId,
      title: 'Salary raise rejected',
      body: `Your salary raise request was rejected. Reason: ${rejectionReason}`,
      relatedRequestId: requestId,
    });

    emitDataChange();
    return;
  }

  const approvedNetIncrease = Number(options?.approvedNetIncrease ?? currentRequest.requestedSalaryNetIncrease ?? 0);
  if (!Number.isFinite(approvedNetIncrease) || approvedNetIncrease <= 0) {
    throw new Error('Approved net increase must be greater than zero.');
  }

  const oldGrossSalary = Number(employee.salary ?? 0);
  const oldNetSalary = Number(employee.salaryNet ?? 0);
  const currentNetSalary = oldNetSalary > 0 ? oldNetSalary : oldGrossSalary;
  const newNetSalary = Math.round((currentNetSalary + approvedNetIncrease) * 100) / 100;
  const grossToNetRatio = oldNetSalary > 0 && oldGrossSalary > 0 ? oldGrossSalary / oldNetSalary : 1;
  const newGrossSalary = Math.round(newNetSalary * grossToNetRatio * 100) / 100;

  const employeeUpdate = await localApi
    .from('employees')
    .update({
      salary_gross: newGrossSalary,
      salary_net: newNetSalary,
    })
    .eq('id', employee.id);

  if (employeeUpdate.error) {
    throw new Error(employeeUpdate.error.message);
  }

  const today = new Date().toISOString().slice(0, 10);
  await localApi.from('salary_history').insert({
    employee_id: employee.id,
    old_salary_gross: oldGrossSalary,
    new_salary_gross: newGrossSalary,
    old_salary_net: oldNetSalary,
    new_salary_net: newNetSalary,
    reason: `Salary raise approved. Net increase: ${approvedNetIncrease}.`,
    changed_by: authData.user?.id ?? null,
    effective_date: today,
  });

  const { error } = await localApi
    .from('requests')
    .update({
      status: 'approved',
      decided_by: authData.user?.id ?? null,
      decided_at: new Date().toISOString(),
      decision_comment: `Approved net increase: ${approvedNetIncrease}. New net salary: ${newNetSalary}.`,
      rejection_reason: null,
    })
    .eq('id', requestId);

  if (error) {
    throw new Error(error.message);
  }

  await persistRequestNotification({
    recipientProfileId: employeeProfileId,
    title: 'Salary raise approved',
    body: `Your salary raise was approved. Net increase: ${approvedNetIncrease}. New net salary: ${newNetSalary}.`,
    relatedRequestId: requestId,
  });

  writeEmployeeUpdatedAt(employee.id, new Date().toISOString());
  emitDataChange();
}

function mapAnnouncementRecord(record: Record<string, unknown>): Announcement {
  const target = String(record.target ?? record.target_audience ?? record.targetAudience ?? 'all');

  return {
    id: String(record.id),
    authorId: record.author_id ? String(record.author_id) : undefined,
    title: String(record.title ?? ''),
    content: String(record.content ?? ''),
    date: String(record.created_at ?? record.date ?? new Date().toISOString()),
    targetAudience: (target === 'employees' ? 'specific' : target) as Announcement['targetAudience'],
    targetIds: Array.isArray(record.target_ids)
      ? (record.target_ids as string[])
      : Array.isArray(record.targetIds)
      ? (record.targetIds as string[])
      : undefined,
    departmentName: record.department_name ? String(record.department_name) : undefined,
  };
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await localApi.from('announcements').select('*').order('created_at', { ascending: false });

  if (error || !data) {
    return readStorage<Announcement[]>(storageKeys.announcements, []);
  }

  return data.map((record) => mapAnnouncementRecord(record as Record<string, unknown>));
}

export async function createAnnouncement(input: AnnouncementInput) {
  const { data: authData } = await localApi.auth.getUser();
  const announcement: Announcement = {
    id: crypto.randomUUID(),
    authorId: authData.user?.id ?? undefined,
    title: input.title,
    content: input.content,
    date: new Date().toISOString(),
    targetAudience: input.targetAudience,
    targetIds: input.targetIds,
    departmentName: input.departmentName,
  };

  const { error } = await localApi.from('announcements').insert({
    id: announcement.id,
    author_id: authData.user?.id ?? null,
    title: announcement.title,
    content: announcement.content,
    created_at: announcement.date,
    target: announcement.targetAudience === 'specific' ? 'employees' : announcement.targetAudience,
  });

  if (error) {
    const announcements = readStorage<Announcement[]>(storageKeys.announcements, []);
    writeStorage(storageKeys.announcements, [announcement, ...announcements]);
  } else {
    const targetRows =
      input.targetAudience === 'department' && input.departmentId
        ? [{ announcement_id: announcement.id, department_id: input.departmentId, employee_id: null }]
        : input.targetAudience === 'specific'
        ? (input.targetIds ?? []).map((employeeId) => ({ announcement_id: announcement.id, department_id: null, employee_id: employeeId }))
        : [];

    if (targetRows.length > 0) {
      await localApi.from('announcement_targets').insert(targetRows);
    }
  }

  const employees = await fetchEmployees();
  const authorProfileId = authData.user?.id;
  const targetEmployees = input.targetAudience === 'all'
    ? employees
    : input.targetAudience === 'department'
    ? employees.filter((employee) => employee.departmentId === input.departmentId)
    : employees.filter((employee) => (input.targetIds ?? []).includes(employee.id));

  await Promise.all(targetEmployees.map((employee) =>
    employee.profileId && employee.profileId !== authorProfileId
      ? addNotification({
        id: crypto.randomUUID(),
        title: announcement.title,
        body: announcement.content,
        message: announcement.content,
        date: announcement.date,
        unread: true,
        userId: employee.profileId,
      })
      : Promise.resolve(),
  ));
  emitDataChange();
}

export async function deleteAnnouncement(announcementId: string) {
  await localApi.from('announcement_targets').delete().eq('announcement_id', announcementId);
  const { error } = await localApi.from('announcements').delete().eq('id', announcementId);

  if (error) {
    const announcements = readStorage<Announcement[]>(storageKeys.announcements, []);
    writeStorage(storageKeys.announcements, announcements.filter((announcement) => announcement.id !== announcementId));
  }

  emitDataChange();
}

export async function deleteAllAnnouncements() {
  const announcements = await fetchAnnouncements();
  const announcementIds = announcements.map((announcement) => announcement.id);

  if (announcementIds.length > 0) {
    await localApi.from('announcement_targets').delete().in('announcement_id', announcementIds);
    const { error } = await localApi.from('announcements').delete().in('id', announcementIds);

    if (error) {
      writeStorage(storageKeys.announcements, []);
    }
  }

  emitDataChange();
}

function mapNotificationRecord(record: Record<string, unknown>): Notification {
  const date = safeIsoDate(record.created_at ?? record.date);
  const title = String(record.title ?? '');
  const body = String(record.body ?? record.message ?? '');

  return {
    id: String(record.id),
    title,
    body,
    message: body || title,
    date,
    time: formatRelativeTime(date),
    unread: !record.read_at,
    userId: record.recipient_profile_id ? String(record.recipient_profile_id) : record.user_id ? String(record.user_id) : record.userId ? String(record.userId) : undefined,
    relatedRequestId: record.related_request_id ? String(record.related_request_id) : undefined,
  };
}

async function addNotification(notification: Notification) {
  const { error } = await localApi.from('notifications').insert({
    id: notification.id,
    recipient_profile_id: notification.userId,
    title: notification.title || 'Notification',
    body: notification.body || notification.message,
    related_request_id: notification.relatedRequestId ?? null,
    created_at: notification.date,
  });

  if (error) {
    const notifications = readStorage<Notification[]>(storageKeys.notifications, []);
    writeStorage(storageKeys.notifications, [notification, ...notifications]);
  }
}

export async function fetchNotifications(userId?: string): Promise<Notification[]> {
  const { data, error } = await localApi
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false });

  const notifications = error || !data
    ? readStorage<Notification[]>(storageKeys.notifications, [])
    : data.map((record) => mapNotificationRecord(record as Record<string, unknown>));
  const readNotificationIds = new Set(readNotificationReadIds(userId));

  const announcements = await fetchAnnouncementsForNotifications(userId);
  const announcementByTitle = new Map(announcements.map((announcement) => [announcement.title, announcement]));
  const legacyAnnouncementTitle = (notification: Notification) => {
    const text = notification.message || notification.body || notification.title || '';
    const match = text.match(/^Announcement:\s*(.+)$/);
    return match?.[1];
  };

  const directNotifications = notifications
    .filter((notification) => !notification.userId || notification.userId === userId)
    .map((notification) => ({
      ...notification,
      time: formatRelativeTime(notification.date),
      unread: notification.unread && !readNotificationIds.has(notification.id),
    }))
    .filter((notification) => {
      const title = legacyAnnouncementTitle(notification) || notification.title;
      const announcement = title ? announcementByTitle.get(title) : undefined;
      return !announcement || announcement.authorId !== userId;
    })
    .map((notification) => {
      const title = legacyAnnouncementTitle(notification) || notification.title;
      const announcement = title ? announcementByTitle.get(title) : undefined;
      return announcement
        ? {
          ...notification,
          title: announcement.title,
          body: announcement.content,
          message: announcement.content,
        }
        : notification;
    });

  const directAnnouncementTitles = new Set(
    directNotifications
      .map((notification) => notification.title)
      .filter(Boolean),
  );
  const readAnnouncementIds = readAnnouncementReadIds(userId);
  const announcementNotifications = announcements
    .filter((announcement) => announcement.authorId !== userId)
    .filter((announcement) => !directAnnouncementTitles.has(announcement.title))
    .map((announcement) => ({
      id: `announcement-${announcement.id}`,
      title: announcement.title,
      body: announcement.content,
      message: announcement.content,
      date: announcement.date,
      time: formatRelativeTime(announcement.date),
      unread: !readAnnouncementIds.includes(announcement.id),
      userId,
    }));

  return [...directNotifications, ...announcementNotifications]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function markNotificationsAsRead(userId?: string) {
  const notifications = await fetchNotifications(userId);
  const unreadIds = notifications.filter((notification) => notification.unread).map((notification) => notification.id);
  const unreadAnnouncementIds = unreadIds
    .filter((id) => id.startsWith('announcement-'))
    .map((id) => id.replace('announcement-', ''));

  if (unreadIds.length === 0) {
    return;
  }

  if (unreadAnnouncementIds.length > 0) {
    writeAnnouncementReadIds(userId, [...readAnnouncementReadIds(userId), ...unreadAnnouncementIds]);
  }

  const databaseUnreadIds = unreadIds.filter((id) => !id.startsWith('announcement-'));
  rememberNotificationReadIds(userId, databaseUnreadIds);
  const { error } = databaseUnreadIds.length > 0
    ? await localApi.from('notifications').update({ read_at: new Date().toISOString() }).in('id', databaseUnreadIds)
    : { error: null };

  if (error) {
    const allNotifications = readStorage<Notification[]>(storageKeys.notifications, []);
    writeStorage(
      storageKeys.notifications,
      allNotifications.map((notification) =>
        unreadIds.includes(notification.id) ? { ...notification, unread: false } : notification,
      ),
    );
  }

  emitDataChange();
}

export async function markNotificationAsRead(notificationId: string, userId?: string) {
  if (notificationId.startsWith('announcement-')) {
    const announcementId = notificationId.replace('announcement-', '');
    writeAnnouncementReadIds(userId, [...readAnnouncementReadIds(userId), announcementId]);
    emitDataChange();
    return;
  }

  rememberNotificationReadIds(userId, [notificationId]);
  const { error } = await localApi
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (error) {
    const allNotifications = readStorage<Notification[]>(storageKeys.notifications, []);
    writeStorage(
      storageKeys.notifications,
      allNotifications.map((notification) =>
        notification.id === notificationId ? { ...notification, unread: false } : notification,
      ),
    );
  }

  emitDataChange();
}

export async function markRequestNotificationsAsRead(requestId: string) {
  const { data: authData } = await localApi.auth.getUser();
  const profileId = authData.user?.id;

  if (profileId) {
    const currentNotifications = await fetchNotifications(profileId);
    rememberNotificationReadIds(
      profileId,
      currentNotifications
        .filter((notification) => notification.relatedRequestId === requestId)
        .map((notification) => notification.id),
    );
  }

  const { error } = await localApi
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('related_request_id', requestId);

  if (error) {
    const allNotifications = readStorage<Notification[]>(storageKeys.notifications, []);
    writeStorage(
      storageKeys.notifications,
      allNotifications.map((notification) =>
        notification.relatedRequestId === requestId
          ? { ...notification, unread: false }
          : notification,
      ),
    );
  }

  emitDataChange();
}

async function fetchAnnouncementsForNotifications(userId?: string): Promise<Announcement[]> {
  const announcements = await fetchAnnouncements();

  if (!userId) {
    return announcements.filter((announcement) => announcement.targetAudience === 'all');
  }

  const employees = await fetchEmployees();
  const currentEmployee = employees.find((employee) => employee.id === userId || employee.profileId === userId);
  const { data: targets } = await localApi
    .from('announcement_targets')
    .select('announcement_id, department_id, employee_id');

  const targetsByAnnouncement = new Map<string, Array<Record<string, unknown>>>();
  (targets ?? []).forEach((target) => {
    const announcementId = String(target.announcement_id ?? '');
    targetsByAnnouncement.set(announcementId, [
      ...(targetsByAnnouncement.get(announcementId) ?? []),
      target as Record<string, unknown>,
    ]);
  });

  return announcements.filter((announcement) => {
    if (announcement.targetAudience === 'all') return true;

    const announcementTargets = targetsByAnnouncement.get(announcement.id) ?? [];

    if (announcement.targetAudience === 'specific') {
      return announcementTargets.some((target) => {
        const targetEmployeeId = String(target.employee_id ?? '');
        return targetEmployeeId === userId || targetEmployeeId === currentEmployee?.id;
      });
    }

    if (announcement.targetAudience === 'department') {
      return announcementTargets.some((target) =>
        currentEmployee?.departmentId && String(target.department_id ?? '') === currentEmployee.departmentId,
      );
    }

    return false;
  });
}

export async function fetchLeaveDays(): Promise<LeaveDay[]> {
  const addLeaveDayToMap = (
    leaveDayMap: Map<string, LeaveDay>,
    date: string,
    type: LeaveDay['type'],
    employeeId: string,
  ) => {
    if (!date || !employeeId) return;

    const key = `${date}:${type}`;
    const current = leaveDayMap.get(key) ?? {
      date,
      employeeIds: [],
      type,
    };

    if (!current.employeeIds.includes(employeeId)) {
      current.employeeIds.push(employeeId);
    }

    leaveDayMap.set(key, current);
  };

  const mergeApprovedRequests = async (leaveDayMap: Map<string, LeaveDay>) => {
    const requests = await fetchRequests();

    requests
      .filter((request) => request.status === 'approved' && (request.type === 'medical-leave' || request.type === 'paid-leave'))
      .forEach((request) => {
        const dates = getLeaveDates(request);
        const type = request.type === 'medical-leave' ? 'medical' : 'paid';

        dates.forEach((date) => addLeaveDayToMap(leaveDayMap, date, type, request.employeeId));
      });
  };

  const { data, error } = await localApi
    .from('leave_days')
    .select('employee_id, leave_date, leave_type')
    .order('leave_date', { ascending: true });

  if (!error && data) {
    const leaveDayMap = new Map<string, LeaveDay>();

    data.forEach((row) => {
      const date = safeDateOnly(row.leave_date);
      const type = String(row.leave_type ?? 'paid') === 'medical' ? 'medical' : 'paid';
      const employeeId = String(row.employee_id ?? '');

      if (!date || !employeeId) return;

      addLeaveDayToMap(leaveDayMap, date, type, employeeId);
    });

    await mergeApprovedRequests(leaveDayMap);
    return Array.from(leaveDayMap.values());
  }

  const requests = await fetchRequests();
  const leaveDayMap = new Map<string, LeaveDay>();

  requests
    .filter((request) => request.status === 'approved' && (request.type === 'medical-leave' || request.type === 'paid-leave'))
    .forEach((request) => {
      const dates = getLeaveDates(request);

      dates.forEach((date) => {
        const type = request.type === 'medical-leave' ? 'medical' : 'paid';
        addLeaveDayToMap(leaveDayMap, date, type, request.employeeId);
      });
    });

  return Array.from(leaveDayMap.values());
}

export type AnnualLeaveBalance = {
  totalDays: number;
  usedDays: number;
  remainingDays: number;
};

export async function fetchAnnualLeaveBalance(
  employeeId: string,
  year = new Date().getFullYear(),
): Promise<AnnualLeaveBalance> {
  const [employees, requests] = await Promise.all([fetchEmployees(), fetchRequests()]);
  const employee = employees.find((item) => item.id === employeeId);
  const totalDays = employee?.annualLeaveDays ?? 20;
  const usedDays = new Set(
    requests
      .filter((request) =>
        request.employeeId === employeeId &&
        request.type === 'paid-leave' &&
        request.status === 'approved',
      )
      .flatMap((request) => getLeaveDates(request))
      .filter((date) => date.startsWith(`${year}-`)),
  ).size;

  return {
    totalDays,
    usedDays,
    remainingDays: Math.max(0, totalDays - usedDays),
  };
}

async function assertEnoughAnnualLeaveDays(employeeId: string, dates: string[]) {
  const datesByYear = new Map<number, string[]>();

  Array.from(new Set(dates)).forEach((date) => {
    const year = Number(date.slice(0, 4));
    if (!Number.isFinite(year)) return;
    datesByYear.set(year, [...(datesByYear.get(year) ?? []), date]);
  });

  for (const [year, requestedDates] of datesByYear) {
    const balance = await fetchAnnualLeaveBalance(employeeId, year);
    if (requestedDates.length > balance.remainingDays) {
      throw new Error(
        `You selected ${requestedDates.length} day(s), but only ${balance.remainingDays} annual leave day(s) are available for ${year}.`,
      );
    }
  }
}

export async function buildOrgTreeEmployees() {
  const employees = await fetchEmployees();
  return employees.filter((employee) => employee.status === 'active');
}

export function splitEmployeeName(fullName: string) {
  return splitName(fullName);
}

