import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, History, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import { mondayFirstLeadingDays, mondayFirstWeekdayKeys } from '../../utils/calendar';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  approveAttendanceRecord,
  attendanceWorkedHours,
  fetchAttendanceRecords,
  fetchEmployees,
  fetchManagerAttendanceOverview,
  isAttendanceStillRunning,
  subscribeToDataChanges,
} from '../../utils/data';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import type { AttendanceRecord, Employee, EmployeeWorkSchedule, WorkTimeException } from '../../types';

function durationLabel(hours: number) {
  const totalMinutes = Math.round(Math.max(0, hours) * 60);
  return `${Math.floor(totalMinutes / 60)} h ${totalMinutes % 60} min`;
}

export function ManagerAttendance() {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [exceptions, setExceptions] = useState<WorkTimeException[]>([]);
  const [schedules, setSchedules] = useState<EmployeeWorkSchedule[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [absenceEmployee, setAbsenceEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      const employeeItems = await fetchEmployees();
      const directReports = employeeItems.filter((employee) => employee.status === 'active' && employee.managerId === user.id);
      const [attendanceItems, overview] = await Promise.all([
        fetchAttendanceRecords(directReports.map((employee) => employee.id)),
        fetchManagerAttendanceOverview(
          format(startOfMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)), 'yyyy-MM-dd'),
          format(endOfMonth(currentMonth), 'yyyy-MM-dd'),
        ),
      ]);
      setRecords(attendanceItems);
      setEmployees(directReports);
      setExceptions(overview.exceptions);
      setSchedules(overview.schedules);
    };

    loadData();
    const unsubscribe = subscribeToDataChanges(loadData);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [user, currentMonth]);

  const employeesById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const selectedRecords = useMemo(
    () => records.filter((record) => record.attendanceDate === selectedDate),
    [records, selectedDate],
  );
  const recordsByEmployeeId = useMemo(
    () => new Map(selectedRecords.filter((record) => record.sessionType === 'normal').map((record) => [record.employeeId, record])),
    [selectedRecords],
  );
  const overtimeRecordsByEmployeeId = useMemo(() => {
    const grouped = new Map<string, AttendanceRecord[]>();
    selectedRecords.filter((record) => record.sessionType === 'overtime').forEach((record) => {
      grouped.set(record.employeeId, [...(grouped.get(record.employeeId) ?? []), record]);
    });
    return grouped;
  }, [selectedRecords]);
  const schedulesByEmployeeId = useMemo(() => new Map(schedules.map((schedule) => [schedule.employeeId, schedule])), [schedules]);
  const selectedExceptions = useMemo(
    () => exceptions.filter((exception) => exception.exceptionDate === selectedDate),
    [exceptions, selectedDate],
  );
  const absenceCount = selectedExceptions.filter((exception) => exception.type === 'unmotivated_absence').length;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredEmployees = employees.filter((employee) =>
    !normalizedSearch
    || employee.name.toLowerCase().includes(normalizedSearch)
    || employee.employeeCode?.toLowerCase().includes(normalizedSearch),
  );
  const departmentLabel = (employee: Employee) => employee.departmentId ? employee.department : t('noDepartment');
  const pendingRecords = selectedRecords.filter((record) => record.approvalStatus === 'pending');
  const pendingNames = pendingRecords.map((record) => employeesById.get(record.employeeId)?.name).filter(Boolean) as string[];
  const pendingNamesLabel = `${pendingNames.slice(0, 3).join(', ')}${pendingNames.length > 3 ? ` ${t('andOthers')}` : ''}`;
  const selectedDateLabel = formatDate(new Date(`${selectedDate}T00:00:00`), { day: 'numeric', month: 'long', year: 'numeric' });
  const today = format(new Date(), 'yyyy-MM-dd');
  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const leadingDays = mondayFirstLeadingDays(currentMonth);

  const recordsForDate = (date: string) => records.filter((record) => record.attendanceDate === date);
  const exceptionsForDate = (date: string) => exceptions.filter((exception) => exception.exceptionDate === date);
  const exceptionForEmployee = (employeeId: string, type: WorkTimeException['type']) =>
    selectedExceptions.find((exception) => exception.employeeId === employeeId && exception.type === type);
  const calendarDayDifference = (from: string, to: string) => {
    const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
    const [toYear, toMonth, toDay] = to.split('-').map(Number);
    return Math.floor((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86_400_000);
  };
  const isScheduledWorkday = (employeeId: string, date: string) => {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const dayKey = weekday === 0 ? '7' : String(weekday);
    const schedule = schedulesByEmployeeId.get(employeeId);
    if (schedule?.mode === 'rotating') {
      if (!schedule.rotationAnchorDate || date < schedule.rotationAnchorDate) return false;
      const cycleLength = schedule.rotationWorkDays + schedule.rotationOffDays;
      return calendarDayDifference(schedule.rotationAnchorDate, date) % cycleLength < schedule.rotationWorkDays;
    }
    return schedule ? Boolean(schedule.weeklySchedule[dayKey]) : weekday >= 1 && weekday <= 5;
  };

  const handleApprove = async (record: AttendanceRecord) => {
    if (!user) return;
    setApprovingId(record.id);
    setError('');
    try {
      await approveAttendanceRecord(record, user.id);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Could not approve attendance.');
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 bg-clip-text text-3xl font-black text-transparent dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400">
          {t('teamAttendance')}
        </h1>
        <p className="mt-1 font-semibold text-cyan-700 dark:text-cyan-300">{t('attendanceApproval')}</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px] xl:items-start">
        <section className="overflow-hidden rounded-2xl border border-white/60 bg-white/40 shadow-xl shadow-cyan-500/20 backdrop-blur-xl dark:border-cyan-400/25 dark:bg-cyan-950/25">
          <div className="border-b border-cyan-300/30 bg-gradient-to-r from-cyan-50/80 via-blue-50/70 to-emerald-50/60 p-4 dark:border-cyan-500/20 dark:from-cyan-900/35 dark:via-blue-900/25 dark:to-emerald-900/20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-white/70 bg-gradient-to-b from-cyan-300 via-sky-500 to-blue-700 text-white shadow-lg shadow-cyan-500/35">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-black text-cyan-900 dark:text-cyan-100">{t('attendanceForDate', { date: selectedDateLabel })}</h2>
                  <p className="text-xs font-bold text-cyan-700 dark:text-cyan-300">{t('employeesCount', { count: filteredEmployees.length })}</p>
                </div>
              </div>
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-600" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('searchEmployee')} className="w-full rounded-xl border border-cyan-300/60 bg-white/75 py-2.5 pl-10 pr-4 text-sm font-bold text-cyan-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-300/50 dark:bg-cyan-950/55 dark:text-cyan-100 sm:w-60" />
              </label>
            </div>
          </div>

          <div className="space-y-3 p-4">
            {error && <p className="rounded-xl border border-rose-300/60 bg-rose-50/80 px-4 py-3 text-sm font-bold text-rose-700 dark:bg-rose-950/35 dark:text-rose-200">{error}</p>}
            {absenceCount > 0 ? (
              <p className="rounded-xl border border-rose-300/70 bg-rose-50/80 px-4 py-3 text-sm font-bold text-rose-700 shadow-sm dark:bg-rose-950/35 dark:text-rose-200">{t('recordedAbsencesForDate', { count: absenceCount })}</p>
            ) : selectedRecords.length === 0 ? (
              <p className="rounded-xl border border-sky-300/60 bg-sky-50/75 px-4 py-3 text-sm font-bold text-sky-700 shadow-sm dark:bg-sky-950/35 dark:text-sky-200">{t('noEmployeeCheckIns')}</p>
            ) : pendingRecords.length > 0 ? (
              <p className="rounded-xl border border-orange-300/70 bg-orange-50/80 px-4 py-3 text-sm font-bold text-orange-700 shadow-sm dark:bg-orange-950/35 dark:text-orange-200">
                {t('employeesAwaitingAttendanceApproval', { employees: pendingNamesLabel })}
              </p>
            ) : (
              <p className="rounded-xl border border-emerald-300/60 bg-emerald-50/75 px-4 py-3 text-sm font-bold text-emerald-700 shadow-sm dark:bg-emerald-950/30 dark:text-emerald-200">
                {selectedDate === today ? t('allAttendanceApprovedToday') : t('allAttendanceApprovedForDate', { date: selectedDateLabel })}
              </p>
            )}

            {filteredEmployees.map((employee) => {
              const record = recordsByEmployeeId.get(employee.id);
              const overtimeRecords = overtimeRecordsByEmployeeId.get(employee.id) ?? [];
              const running = record ? isAttendanceStillRunning(record, now) : false;
              const absence = exceptionForEmployee(employee.id, 'unmotivated_absence');
              const lateArrival = exceptionForEmployee(employee.id, 'late_arrival');
              const scheduledWorkday = isScheduledWorkday(employee.id, selectedDate);
              return (
                <article key={employee.id} className="rounded-xl border border-cyan-200/60 bg-white/55 p-3 shadow-sm transition hover:border-cyan-400/70 hover:shadow-md hover:shadow-cyan-500/15 dark:border-cyan-500/25 dark:bg-cyan-950/30">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-2.5">
                      <ProfileAvatar name={employee.name} className="h-9 w-9 rounded-lg text-[10px] ring-cyan-300/60" />
                      <div>
                        <p className="text-sm font-black text-cyan-900 dark:text-cyan-100">{employee.name}</p>
                        <p className="text-[11px] font-bold text-cyan-600 dark:text-cyan-300">{employee.employeeCode || t('noCode')} - {departmentLabel(employee)}</p>
                      </div>
                    </div>

                    {!record ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`rounded-full border px-3 py-1 text-xs font-bold ${
                          absence
                            ? 'border-rose-300/70 bg-rose-50/80 text-rose-700 dark:bg-rose-950/35 dark:text-rose-200'
                            : 'border-slate-300/60 bg-slate-100/70 text-slate-600 dark:border-slate-600/50 dark:bg-slate-900/35 dark:text-slate-300'
                        }`}>
                          {absence ? t('unmotivatedAbsence') : scheduledWorkday ? t('noAttendanceRecorded') : t('scheduledDayOff')}
                        </p>
                        <button type="button" onClick={() => setAbsenceEmployee(employee)} className="flex items-center gap-1 rounded-lg border border-rose-300/60 bg-rose-50/70 px-2.5 py-1 text-xs font-black text-rose-700 transition hover:scale-105 dark:bg-rose-950/30 dark:text-rose-200"><History className="h-3.5 w-3.5" />{t('viewAbsences')}</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-lg border border-cyan-200/60 bg-white/60 px-2.5 py-1.5 dark:border-cyan-600/30 dark:bg-cyan-950/45">
                          <p className="text-[9px] font-black uppercase text-cyan-600 dark:text-cyan-300">{t('checkInTime')}</p>
                          <p className="text-xs font-black text-cyan-900 dark:text-cyan-100">{format(new Date(record.checkInAt), 'HH:mm')}</p>
                        </div>
                        {lateArrival ? (
                          <p className="rounded-full border border-amber-300/70 bg-amber-50/80 px-2.5 py-1.5 text-xs font-black text-amber-700 dark:bg-amber-950/35 dark:text-amber-200">
                            {t('lateBy', { duration: durationLabel(lateArrival.hours) })}
                          </p>
                        ) : null}
                        <div className="rounded-lg border border-cyan-200/60 bg-white/60 px-2.5 py-1.5 dark:border-cyan-600/30 dark:bg-cyan-950/45">
                          <p className="text-[9px] font-black uppercase text-cyan-600 dark:text-cyan-300">{t('workedHours')}</p>
                          <p className="text-xs font-black text-cyan-900 dark:text-cyan-100">{durationLabel(attendanceWorkedHours(record, now))}</p>
                        </div>
                        {running ? (
                          <p className="rounded-full border border-cyan-300/60 bg-cyan-50/70 px-2.5 py-1.5 text-xs font-black text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-200"><span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{t('workingNow')}</span></p>
                        ) : record.approvalStatus === 'approved' ? (
                          <p className="rounded-full border border-emerald-300/60 bg-emerald-50/70 px-2.5 py-1.5 text-xs font-black text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-200"><span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />{t('attendanceApproved')}</span></p>
                        ) : (
                          <button type="button" disabled={approvingId === record.id} onClick={() => handleApprove(record)} className="cursor-pointer rounded-lg border-2 border-white/70 bg-gradient-to-b from-lime-300 via-emerald-400 to-teal-700 px-3 py-1.5 text-xs font-black text-white shadow-md shadow-emerald-500/30 transition hover:scale-105 disabled:opacity-60">
                            {t('approveAttendance')}
                          </button>
                        )}
                        <button type="button" onClick={() => setAbsenceEmployee(employee)} className="flex items-center gap-1 rounded-lg border border-rose-300/60 bg-rose-50/70 px-2.5 py-1.5 text-xs font-black text-rose-700 transition hover:scale-105 dark:bg-rose-950/30 dark:text-rose-200"><History className="h-3.5 w-3.5" />{t('viewAbsences')}</button>
                      </div>
                    )}
                  </div>
                  {overtimeRecords.length > 0 ? (
                    <div className="mt-3 border-t border-orange-200/70 pt-3 dark:border-orange-700/35">
                      <p className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-orange-700 dark:text-orange-200"><Sparkles className="h-3.5 w-3.5" />{t('overtimeSessions')}</p>
                      <div className="grid gap-2 lg:grid-cols-2">
                        {overtimeRecords.map((overtimeRecord) => {
                          const overtimeRunning = isAttendanceStillRunning(overtimeRecord, now);
                          return (
                            <div key={overtimeRecord.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200/70 bg-orange-50/65 px-3 py-2 dark:border-orange-700/35 dark:bg-orange-950/25">
                              <div>
                                <p className="text-xs font-black text-orange-800 dark:text-orange-100">{format(new Date(overtimeRecord.checkInAt), 'HH:mm')} - {format(new Date(overtimeRecord.checkOutAt), 'HH:mm')}</p>
                                <p className="mt-0.5 text-[11px] font-bold text-orange-700 dark:text-orange-200">{durationLabel(attendanceWorkedHours(overtimeRecord, now))}</p>
                              </div>
                              {overtimeRunning ? (
                                <p className="rounded-full border border-orange-300/60 bg-orange-100/70 px-2 py-1 text-[11px] font-black text-orange-700 dark:bg-orange-950/45 dark:text-orange-200">{t('workingNow')}</p>
                              ) : overtimeRecord.approvalStatus === 'approved' ? (
                                <p className="rounded-full border border-emerald-300/60 bg-emerald-50/70 px-2 py-1 text-[11px] font-black text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-200">{t('approved')}</p>
                              ) : (
                                <button type="button" disabled={approvingId === overtimeRecord.id} onClick={() => handleApprove(overtimeRecord)} className="rounded-lg border-2 border-white/70 bg-gradient-to-b from-orange-300 via-orange-400 to-rose-600 px-2.5 py-1 text-[11px] font-black text-white shadow-md shadow-orange-500/25 transition hover:scale-105 disabled:opacity-60">{t('approveAttendance')}</button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <aside className="rounded-2xl border border-white/60 bg-white/45 p-4 shadow-xl shadow-cyan-500/20 backdrop-blur-xl dark:border-cyan-400/25 dark:bg-cyan-950/30 xl:sticky xl:top-20">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
              <h2 className="text-sm font-black capitalize text-cyan-900 dark:text-cyan-100">{formatDate(currentMonth, { month: 'long', year: 'numeric' })}</h2>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="cursor-pointer rounded-lg border border-white/60 bg-gradient-to-b from-slate-200 to-slate-400 p-1.5 text-white shadow-sm transition hover:scale-105"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="cursor-pointer rounded-lg border border-white/60 bg-gradient-to-b from-slate-200 to-slate-400 p-1.5 text-white shadow-sm transition hover:scale-105"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2 rounded-lg border border-orange-200/70 bg-orange-50/65 px-2 py-1.5 dark:border-orange-500/30 dark:bg-orange-950/25">
            <span className="h-2 w-5 rounded-sm bg-gradient-to-r from-amber-300 to-orange-500 shadow-sm shadow-orange-500/40" />
            <span className="text-[10px] font-black text-orange-700 dark:text-orange-200">{t('attendanceAwaitingValidation')}</span>
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-200/70 bg-rose-50/65 px-2 py-1.5 dark:border-rose-500/30 dark:bg-rose-950/25">
            <span className="h-2 w-5 rounded-sm bg-gradient-to-r from-rose-400 to-red-600 shadow-sm shadow-rose-500/40" />
            <span className="text-[10px] font-black text-rose-700 dark:text-rose-200">{t('absenceCalendarMark')}</span>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {mondayFirstWeekdayKeys.map((day) => (
              <div key={day} className="py-1 text-center text-[10px] font-black text-cyan-700 dark:text-cyan-300">{t(day)}</div>
            ))}
            {leadingDays.map((_, index) => <div key={`empty-${index}`} />)}
            {days.map((day) => {
              const date = format(day, 'yyyy-MM-dd');
              const dayRecords = recordsForDate(date);
              const dayExceptions = exceptionsForDate(date);
              const dayAbsences = dayExceptions.filter((exception) => exception.type === 'unmotivated_absence');
              const validatedCount = dayRecords.filter((record) => record.approvalStatus === 'approved').length;
              const hasPending = dayRecords.some((record) => record.approvalStatus === 'pending');
              const isSelected = date === selectedDate;
              const isToday = date === today;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  onMouseEnter={() => setHoveredDate(date)}
                  onMouseLeave={() => setHoveredDate(null)}
                  className={`relative flex aspect-square cursor-pointer items-center justify-center rounded-lg border text-xs font-black transition hover:scale-110 ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-100 text-cyan-900 ring-2 ring-cyan-300/70 dark:bg-cyan-700/65 dark:text-white'
                      : isToday
                        ? 'border-cyan-300 bg-cyan-50/80 text-cyan-800 dark:border-cyan-500/50 dark:bg-cyan-900/55 dark:text-cyan-100'
                        : 'border-cyan-200/45 bg-white/40 text-cyan-700 dark:border-cyan-700/35 dark:bg-cyan-950/20 dark:text-cyan-200'
                  }`}
                >
                  {format(day, 'd')}
                  {hasPending && <span className="absolute bottom-0.5 h-1 w-4 rounded-sm bg-gradient-to-r from-amber-300 to-orange-500 shadow-sm shadow-orange-500/50" />}
                  {dayAbsences.length > 0 && <span className="absolute top-0.5 h-1 w-4 rounded-sm bg-gradient-to-r from-rose-400 to-red-600 shadow-sm shadow-rose-500/50" />}
                  {hoveredDate === date && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-36 -translate-x-1/2 rounded-xl border border-cyan-200/80 bg-white/95 p-2 text-left text-[10px] font-black text-cyan-800 shadow-xl backdrop-blur dark:border-cyan-500/40 dark:bg-cyan-950/95 dark:text-cyan-100">
                      <span className="block">{t('checkInsCount', { count: dayRecords.length })}</span>
                      <span className="mt-1 block text-emerald-600 dark:text-emerald-300">{t('validatedCount', { count: validatedCount })}</span>
                      <span className="mt-1 block text-rose-600 dark:text-rose-300">{t('absencesCount', { count: dayAbsences.length })}</span>
                      {dayAbsences.slice(0, 3).map((absence) => <span key={absence.id} className="mt-0.5 block truncate text-rose-600 dark:text-rose-300">{employeesById.get(absence.employeeId)?.name}</span>)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
      {absenceEmployee ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-cyan-950/40 px-4 py-8 backdrop-blur-sm" onMouseDown={() => setAbsenceEmployee(null)}>
          <section className="aero-glass max-h-[calc(100vh-4rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border-2 border-white/60 p-6 shadow-2xl shadow-cyan-950/35" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white/70 bg-gradient-to-b from-rose-300 to-red-700 text-white shadow-lg shadow-rose-500/35"><AlertTriangle className="h-5 w-5" /></div>
                <div>
                  <h2 className="text-xl font-black text-cyan-950 dark:text-cyan-100">{t('absenceHistory')}</h2>
                  <p className="text-sm font-bold text-cyan-700 dark:text-cyan-300">{absenceEmployee.name}</p>
                </div>
              </div>
              <button type="button" onClick={() => setAbsenceEmployee(null)} className="rounded-xl border border-cyan-300/50 bg-white/65 p-2 text-cyan-800 shadow-md transition hover:scale-105 dark:border-cyan-500/30 dark:bg-cyan-950/50 dark:text-cyan-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 space-y-2">
              {exceptions.filter((exception) => exception.employeeId === absenceEmployee.id && exception.type === 'unmotivated_absence').length > 0
                ? exceptions.filter((exception) => exception.employeeId === absenceEmployee.id && exception.type === 'unmotivated_absence').map((absence) => (
                  <div key={absence.id} className="rounded-xl border border-rose-200/70 bg-rose-50/70 px-4 py-3 dark:border-rose-700/40 dark:bg-rose-950/25">
                    <p className="font-black text-rose-800 dark:text-rose-100">{formatDate(new Date(`${absence.exceptionDate}T00:00:00`), { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p className="mt-1 text-sm font-bold text-rose-700 dark:text-rose-200">{t('unmotivatedAbsence')} - {durationLabel(absence.hours)}</p>
                    {absence.reason ? <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-300">{absence.reason}</p> : null}
                  </div>
                ))
                : <p className="rounded-xl border border-cyan-200/70 bg-white/55 px-4 py-3 text-sm font-bold text-cyan-700 dark:border-cyan-700/40 dark:bg-cyan-950/30 dark:text-cyan-300">{t('noAbsences')}</p>}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
