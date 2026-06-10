export type UserRole = 'hr' | 'employee' | 'manager';
export type EmployeeStatus = 'default' | 'active' | 'fired' | 'suspended';

export interface User {
  id: string;
  profileId?: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  salary?: number;
  hireDate?: string;
  profilePicture?: string;
  managerId?: string;
}

export interface Employee {
  id: string;
  employeeCode?: string;
  name: string;
  email: string;
  cnp?: string;
  phone?: string;
  address?: string;
  departmentId?: string;
  department: string;
  position?: string;
  salary: number;
  salaryNet?: number;
  hireDate: string;
  updatedAt?: string;
  contractType?: string;
  workNormHours?: number;
  annualLeaveDays?: number;
  managerId?: string;
  managerName?: string;
  profileId?: string;
  avatarUrl?: string;
  role?: UserRole;
  status: EmployeeStatus;
}

export interface EmployeeDocument {
  id: string;
  source: 'employee_document' | 'request_attachment' | 'employment_contract';
  category: 'contract' | 'medical' | 'other';
  title: string;
  fileName: string;
  filePath: string;
  mimeType?: string;
  createdAt: string;
  relatedRequestId?: string;
}

export interface Department {
  id: string;
  name: string;
  employeeCount: number;
  iconKey: string;
}

export interface Request {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'medical-leave' | 'paid-leave' | 'salary-raise' | 'hr-message';
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'closed';
  submittedDate: string;
  details?: string;
  documents?: string[];
  attachments?: Array<{
    fileName: string;
    filePath?: string;
    mimeType?: string;
  }>;
  rejectionReason?: string;
  approvedDates?: string[];
  startDate?: string;
  endDate?: string;
  managerId?: string;
  routedToRole?: 'manager' | 'hr';
  decisionComment?: string;
  requestedSalaryNetIncrease?: number;
  salaryReview?: {
    requested?: boolean;
    recommendation?: 'yes' | 'no';
    comment?: string;
    respondedAt?: string;
  };
}

export interface RequestMessage {
  id: string;
  requestId: string;
  senderProfileId?: string;
  body: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  authorId?: string;
  title: string;
  content: string;
  date: string;
  targetAudience: 'all' | 'specific' | 'department';
  targetIds?: string[];
  departmentName?: string;
}

export interface LeaveDay {
  date: string;
  employeeIds: string[];
  type: 'medical' | 'paid';
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  attendanceDate: string;
  checkInAt: string;
  scheduledCheckOutAt: string;
  checkOutAt: string;
  checkoutMode: 'automatic' | 'manual';
  sessionType: 'normal' | 'overtime';
  workedHours: number;
  overtimeHours: number;
  approvalStatus: 'pending' | 'approved';
  approvedByManagerId?: string;
  approvedAt?: string;
}

export type WorkScheduleMode = 'fixed' | 'shifts' | 'rotating';

export interface WorkScheduleDay {
  startTime: string;
  shiftId?: string;
}

export interface WorkShift {
  id: string;
  name: string;
  startTime: string;
}

export interface EmployeeWorkSchedule {
  employeeId: string;
  mode: WorkScheduleMode;
  weeklySchedule: Record<string, WorkScheduleDay>;
  shiftDefinitions: WorkShift[];
  effectiveFrom?: string;
  rotationAnchorDate?: string;
  rotationWorkDays: number;
  rotationOffDays: number;
  rotationStartTime: string;
}

export interface WorkTimeException {
  id: string;
  employeeId: string;
  type: 'unmotivated_absence' | 'late_arrival';
  exceptionDate: string;
  hours: number;
  reason?: string;
  status: string;
}

export interface ManagerAttendanceOverview {
  exceptions: WorkTimeException[];
  schedules: EmployeeWorkSchedule[];
}

export type ManagerReportType =
  | 'team-attendance'
  | 'overtime'
  | 'late-absences'
  | 'team-leaves'
  | 'resolved-requests'
  | 'availability';

export interface ManagerReportColumn {
  key: string;
  header: string;
}

export interface ManagerReport {
  reportType: ManagerReportType;
  from: string;
  to: string;
  columns: ManagerReportColumn[];
  rows: Array<Record<string, string | number | null>>;
}

export interface HRReports {
  year: number;
  monthlyNewHires: Array<{ month: number; label: string; hires: number }>;
  employeeEvolution: Array<{ month: number; label: string; total: number }>;
  departmentDistribution: Array<{ department: string; employees: number }>;
  tenureDistribution: Array<{ bucket: string; employees: number }>;
  monthlySalaryCosts: Array<{ month: number; label: string; gross: number; net: number }>;
  averageSalaryByDepartment: Array<{ department: string; gross: number; net: number }>;
  salaryStats: {
    minGross: number;
    maxGross: number;
    medianGross: number;
    minNet: number;
    maxNet: number;
    medianNet: number;
  };
  leaveBalances: Array<{
    id: string;
    employeeCode?: string;
    employee: string;
    totalDays: number;
    usedDays: number;
    remainingDays: number;
  }>;
  monthlyLeaveUsage: Array<{ month: number; label: string; paid: number; medical: number; total: number }>;
  requestResolutionTime: Array<{ type: string; days: number; resolved: number }>;
  busiestLeavePeriods: Array<{ date: string; employees: number; paid: number; medical: number }>;
  workedHoursByEmployee: Array<{ id: string; employeeCode?: string; employee: string; department: string; hours: number }>;
  workedHoursByDepartment: Array<{ department: string; hours: number }>;
  overtimeMonthly: Array<{ month: number; label: string; total: number; approved: number }>;
  absencesMonthly: Array<{ month: number; label: string; absences: number; hours: number }>;
}

export interface Notification {
  id: string;
  message: string;
  title?: string;
  body?: string;
  time?: string;
  date: string;
  unread: boolean;
  userId?: string;
  relatedRequestId?: string;
}

export type Language = 'en' | 'ro' | 'es';
export type TranslationValues = Record<string, string | number>;

export interface Translations {
  [key: string]: {
    en: string;
    ro: string;
    es: string;
  };
}
