import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, LogIn, LogOut, Sparkles } from 'lucide-react';
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import { mondayFirstLeadingDays, mondayFirstWeekdayKeys } from '../../utils/calendar';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  attendanceWorkedHours,
  checkInEmployee,
  checkOutEmployee,
  fetchAttendanceRecords,
  fetchEmployees,
  isAttendanceStillRunning,
  subscribeToDataChanges,
} from '../../utils/data';
import type { AttendanceRecord, Employee } from '../../types';
import { PageInfoButton } from '../../components/PageInfoButton';
import { AeroIcon } from '../../components/AeroIcon';

function localDateOnly(date = new Date()) {
  return format(date, 'yyyy-MM-dd');
}

function durationLabel(hours: number) {
  const totalMinutes = Math.round(Math.max(0, hours) * 60);
  return `${Math.floor(totalMinutes / 60)} h ${totalMinutes % 60} min`;
}

function sessionDuration(record: AttendanceRecord, now: Date) {
  return attendanceWorkedHours(record, now);
}

function localizedAttendanceError(error: unknown, t: (key: string) => string, fallbackKey: string) {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('already have an active attendance session')) return t('attendanceAlreadyActive');
  if (normalized.includes('employee account is required for attendance')) return t('attendanceEmployeeRequired');
  if (normalized.includes('normal attendance session') && normalized.includes('already recorded')) return t('attendanceNormalAlreadyRecorded');
  if (normalized.includes('attendance session not found')) return t('attendanceSessionNotFound');
  if (normalized.includes('already checked out automatically')) return t('attendanceAlreadyCheckedOutAutomatically');
  if (normalized.includes('could not check in')) return t('attendanceCheckInFailed');
  if (normalized.includes('could not check out')) return t('attendanceCheckOutFailed');

  return message || t(fallbackKey);
}

export function EmployeeAttendance() {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      const [attendanceItems, employees] = await Promise.all([
        fetchAttendanceRecords(user.id),
        fetchEmployees(),
      ]);
      setRecords(attendanceItems);
      setEmployee(employees.find((item) => item.id === user.id) ?? null);
    };

    loadData();
    const unsubscribe = subscribeToDataChanges(loadData);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [user]);

  const recordsByDate = useMemo(() => {
    const grouped = new Map<string, AttendanceRecord[]>();
    records.forEach((record) => grouped.set(record.attendanceDate, [...(grouped.get(record.attendanceDate) ?? []), record]));
    return grouped;
  }, [records]);

  if (!user || !employee) return null;

  const today = localDateOnly(now);
  const todayRecords = recordsByDate.get(today) ?? [];
  const normalRecord = todayRecords.find((record) => record.sessionType === 'normal');
  const overtimeRecords = todayRecords.filter((record) => record.sessionType === 'overtime');
  const activeRecord = records.find((record) => isAttendanceStillRunning(record, now));
  const overtimeTotal = overtimeRecords.reduce((total, record) => total + sessionDuration(record, now), 0);
  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const leadingDays = mondayFirstLeadingDays(currentMonth);

  const handleCheckIn = async () => {
    setIsSubmitting(true);
    setMessage('');
    try {
      await checkInEmployee();
    } catch (error) {
      setMessage(localizedAttendanceError(error, t, 'attendanceCheckInFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckOut = async () => {
    if (!activeRecord) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      await checkOutEmployee(activeRecord);
    } catch (error) {
      setMessage(localizedAttendanceError(error, t, 'attendanceCheckOutFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative space-y-6 pt-14">
      <PageInfoButton title={t('myAttendance')} description={t('myAttendanceInfo')} />

      <section className="overflow-hidden rounded-2xl border border-white/60 bg-white/40 shadow-xl shadow-cyan-500/20 backdrop-blur-xl dark:border-cyan-400/25 dark:bg-cyan-950/25">
        <div className="border-b border-cyan-300/30 bg-gradient-to-r from-cyan-50/80 via-blue-50/70 to-emerald-50/60 p-6 dark:border-cyan-500/20 dark:from-cyan-900/35 dark:via-blue-900/25 dark:to-emerald-900/20">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <AeroIcon icon={Clock3} size="large" variant="cyan" />
              <div>
                <h2 className="text-xl font-black text-cyan-900 dark:text-cyan-100">{t('attendanceToday')} - {formatDate(now, { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
                <p className="mt-1 text-sm font-bold text-cyan-700 dark:text-cyan-300">{t('workNorm')}: {t('hoursShort', { count: employee.workNormHours ?? 8 })}</p>
              </div>
            </div>

            {activeRecord ? (
              <button type="button" disabled={isSubmitting} onClick={handleCheckOut} className="cursor-pointer rounded-xl border-2 border-white/70 bg-gradient-to-b from-amber-300 via-orange-400 to-rose-600 px-5 py-3 font-black text-white shadow-xl shadow-orange-500/35 transition hover:scale-105 disabled:opacity-60">
                <span className="flex items-center gap-2"><LogOut className="h-5 w-5" />{t('checkOut')}</span>
              </button>
            ) : (
              <button type="button" disabled={isSubmitting} onClick={handleCheckIn} className="cursor-pointer rounded-xl border-2 border-white/70 bg-gradient-to-b from-lime-300 via-emerald-400 to-teal-700 px-5 py-3 font-black text-white shadow-xl shadow-emerald-500/40 transition hover:scale-105 disabled:opacity-60">
                <span className="flex items-center gap-2"><LogIn className="h-5 w-5" />{normalRecord ? t('checkInOvertime') : t('checkIn')}</span>
              </button>
            )}
          </div>

          {message ? <p className="mt-4 rounded-xl border border-rose-300/60 bg-rose-50/80 px-4 py-3 text-sm font-bold text-rose-700 dark:bg-rose-950/35 dark:text-rose-200">{message}</p> : null}

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <SummaryCard label={t('normalWorkSession')} value={normalRecord ? durationLabel(sessionDuration(normalRecord, now)) : '-'} detail={normalRecord ? `${format(new Date(normalRecord.checkInAt), 'HH:mm')} - ${format(new Date(normalRecord.checkOutAt), 'HH:mm')}` : t('noAttendanceToday')} />
            <SummaryCard label={t('overtimeHours')} value={durationLabel(overtimeTotal)} detail={t('overtimeSessions') + `: ${overtimeRecords.length}`} accent="orange" />
            <SummaryCard label={t('status')} value={activeRecord ? t('workingNow') : normalRecord ? t('checkedOutAutomatically') : t('noAttendanceToday')} detail={activeRecord?.sessionType === 'overtime' ? t('automaticCheckoutAtMidnight') : undefined} />
          </div>

          <div className="mt-5 rounded-2xl border border-orange-200/70 bg-orange-50/55 p-4 dark:border-orange-600/35 dark:bg-orange-950/20">
            <h3 className="flex items-center gap-2 font-black text-orange-800 dark:text-orange-100">
              <AeroIcon icon={Sparkles} size="small" variant="cyan" />
              {t('overtimeSessions')}
            </h3>
            {overtimeRecords.length ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {overtimeRecords.map((record) => <SessionRow key={record.id} record={record} now={now} t={t} />)}
              </div>
            ) : <p className="mt-2 text-sm font-bold text-orange-700 dark:text-orange-200">{t('noOvertimeSessions')}</p>}
          </div>
        </div>

        <div className="p-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-black text-cyan-900 dark:text-cyan-100">{formatDate(currentMonth, { month: 'long', year: 'numeric' })}</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="rounded-xl border-2 border-white/60 bg-gradient-to-b from-slate-300 to-slate-500 p-3 text-white shadow-lg transition hover:scale-105"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => setCurrentMonth(new Date())} className="rounded-xl border-2 border-white/60 bg-gradient-to-b from-cyan-300 to-blue-600 px-4 py-3 font-black text-white shadow-lg transition hover:scale-105">{t('today')}</button>
              <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="rounded-xl border-2 border-white/60 bg-gradient-to-b from-slate-300 to-slate-500 p-3 text-white shadow-lg transition hover:scale-105"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {mondayFirstWeekdayKeys.map((day) => <div key={day} className="border-b border-cyan-300/40 py-2 text-center text-xs font-black text-cyan-700 dark:text-cyan-300">{t(day)}</div>)}
            {leadingDays.map((_, index) => <div key={`empty-${index}`} />)}
            {days.map((day) => {
              const date = localDateOnly(day);
              const dayRecords = recordsByDate.get(date) ?? [];
              const normal = dayRecords.find((record) => record.sessionType === 'normal');
              const overtime = dayRecords.filter((record) => record.sessionType === 'overtime');
              const isToday = date === today;
              return (
                <div key={date} onMouseEnter={() => setHoveredDate(date)} onMouseLeave={() => setHoveredDate(null)} className={`relative min-h-24 cursor-pointer rounded-xl border p-2 shadow-sm ${dayRecords.length ? 'border-cyan-300/70 bg-gradient-to-b from-white/75 to-cyan-50/65 dark:border-cyan-500/35 dark:from-cyan-900/40 dark:to-blue-950/30' : 'border-cyan-200/35 bg-white/25 dark:border-cyan-700/25 dark:bg-cyan-950/15'} ${isToday ? 'ring-2 ring-cyan-500 shadow-lg shadow-cyan-500/40 dark:border-cyan-100 dark:bg-cyan-700/45 dark:ring-cyan-200 dark:shadow-cyan-300/60' : ''}`}>
                  <p className={`font-black ${isToday ? 'text-cyan-900 dark:text-white' : 'text-cyan-800 dark:text-cyan-100'}`}>{format(day, 'd')}</p>
                  {normal ? <p className="mt-2 text-[11px] font-black text-cyan-700 dark:text-cyan-200">{durationLabel(sessionDuration(normal, now))}</p> : null}
                  {overtime.length ? (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-black text-orange-600 dark:text-orange-300">
                      <AeroIcon icon={Sparkles} size="small" variant="amber" className="!h-7 !w-7" />
                      {overtime.length} / {durationLabel(overtime.reduce((total, record) => total + sessionDuration(record, now), 0))}
                    </p>
                  ) : null}
                  {hoveredDate === date ? <DayTooltip day={day} records={dayRecords} now={now} formatDate={formatDate} t={t} /> : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, detail, accent = 'cyan' }: { label: string; value: string; detail?: string; accent?: 'cyan' | 'orange' }) {
  return <div className={`rounded-xl border p-3 ${accent === 'orange' ? 'border-orange-200/70 bg-orange-50/60 dark:border-orange-600/30 dark:bg-orange-950/25' : 'border-cyan-200/70 bg-white/55 dark:border-cyan-500/25 dark:bg-cyan-950/35'}`}>
    <p className={`text-xs font-black uppercase tracking-wide ${accent === 'orange' ? 'text-orange-600 dark:text-orange-300' : 'text-cyan-600 dark:text-cyan-300'}`}>{label}</p>
    <p className="mt-1 font-black text-cyan-900 dark:text-cyan-100">{value}</p>
    {detail ? <p className="mt-1 text-xs font-bold text-cyan-700 dark:text-cyan-300">{detail}</p> : null}
  </div>;
}

function SessionRow({ record, now, t }: { record: AttendanceRecord; now: Date; t: (key: string) => string }) {
  const running = isAttendanceStillRunning(record, now);
  return <div className="rounded-xl border border-orange-200/70 bg-white/65 px-3 py-2 dark:border-orange-700/40 dark:bg-orange-950/25">
    <p className="text-xs font-black text-orange-800 dark:text-orange-100">{format(new Date(record.checkInAt), 'HH:mm')} - {format(new Date(record.checkOutAt), 'HH:mm')}</p>
    <p className="mt-1 text-xs font-bold text-orange-700 dark:text-orange-200">{durationLabel(sessionDuration(record, now))} - {running ? t('workingNow') : record.approvalStatus === 'approved' ? t('approved') : t('pending')}</p>
  </div>;
}

function DayTooltip({ day, records, now, formatDate, t }: { day: Date; records: AttendanceRecord[]; now: Date; formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string; t: (key: string) => string }) {
  return <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-xl border border-cyan-200/80 bg-white/95 p-3 text-left text-xs font-bold text-cyan-800 shadow-xl backdrop-blur dark:border-cyan-500/40 dark:bg-cyan-950/95 dark:text-cyan-100">
    <p className="mb-2 font-black">{formatDate(day, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    {records.length ? records.map((record) => <div key={record.id} className="mt-2 border-t border-cyan-200/60 pt-2 first:mt-0 first:border-0 first:pt-0 dark:border-cyan-700/45">
      <p className={record.sessionType === 'overtime' ? 'text-orange-600 dark:text-orange-300' : 'text-cyan-700 dark:text-cyan-200'}>{record.sessionType === 'overtime' ? t('overtimeSession') : t('normalWorkSession')}</p>
      <p>{format(new Date(record.checkInAt), 'HH:mm')} - {format(new Date(record.checkOutAt), 'HH:mm')}</p>
      <p>{t('workedHours')}: {durationLabel(sessionDuration(record, now))}</p>
    </div>) : <p>{t('notAtWork')}</p>}
  </div>;
}
