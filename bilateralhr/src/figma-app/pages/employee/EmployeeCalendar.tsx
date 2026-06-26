import { useEffect, useState, type MouseEvent } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, UserRound, UsersRound } from 'lucide-react';
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import { mondayFirstLeadingDays, mondayFirstWeekdayKeys } from '../../utils/calendar';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { fetchEmployees, fetchLeaveDays, fetchRequests, subscribeToDataChanges } from '../../utils/data';
import { getLeaveDates } from '../../utils/leaveRules';
import type { Employee, LeaveDay, Request } from '../../types';
import { PageInfoButton } from '../../components/PageInfoButton';
import { AeroIcon } from '../../components/AeroIcon';

type LeaveCalendarItem = {
  requestId: string;
  type: 'medical' | 'paid';
  status: 'approved' | 'pending' | 'in_review';
  employeeName?: string;
};

export function EmployeeCalendar() {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const [requests, setRequests] = useState<Request[]>([]);
  const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [calendarView, setCalendarView] = useState<'mine' | 'team'>('mine');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [hoveredPosition, setHoveredPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const loadData = async () => {
      const [requestItems, leaveDayItems, employeeItems] = await Promise.all([
        fetchRequests(),
        fetchLeaveDays(),
        fetchEmployees(),
      ]);
      setRequests(requestItems);
      setLeaveDays(leaveDayItems);
      setEmployees(employeeItems);
    };

    loadData();
    return subscribeToDataChanges(loadData);
  }, []);

  if (!user) return null;

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingDays = mondayFirstLeadingDays(currentMonth);
  const isTeamView = user.role === 'manager' && calendarView === 'team';
  const pageTitle = user.role === 'manager' ? t('calendar') : t('myCalendar');
  const directReportIds = new Set(
    employees
      .filter((employee) => employee.managerId === user.id)
      .map((employee) => employee.id),
  );

  const ownLeaveRequests = requests.filter((request) =>
    request.employeeId === user.id
    && (request.type === 'medical-leave' || request.type === 'paid-leave')
    && ['pending', 'in_review', 'approved'].includes(request.status),
  );

  const getItemsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');

    if (isTeamView) {
      return leaveDays
        .filter((leaveDay) => leaveDay.date === dateStr)
        .flatMap((leaveDay) =>
          leaveDay.employeeIds
            .filter((employeeId) => directReportIds.has(employeeId))
            .map((employeeId) => ({
              requestId: `${employeeId}-${leaveDay.type}-${dateStr}`,
              type: leaveDay.type,
              status: 'approved' as const,
              employeeName: employees.find((employee) => employee.id === employeeId)?.name ?? t('unknown'),
            })),
        );
    }

    const items: LeaveCalendarItem[] = [];

    ownLeaveRequests.forEach((request) => {
      const dates = getLeaveDates(request);

      if (!dates.includes(dateStr)) return;

      items.push({
        requestId: request.id,
        type: request.type === 'medical-leave' ? 'medical' : 'paid',
        status: request.status === 'approved' ? 'approved' : request.status === 'in_review' ? 'in_review' : 'pending',
      });
    });

    return items;
  };

  const statusLabel = (status: LeaveCalendarItem['status']) => {
    if (status === 'approved') return t('approved');
    if (status === 'in_review') return t('inReview');
    return t('pending');
  };

  const typeLabel = (type: LeaveCalendarItem['type']) =>
    type === 'medical' ? t('medicalLeave') : t('paidLeave');

  const dotClass = (item: LeaveCalendarItem) => {
    if (item.status !== 'approved') {
      return item.type === 'medical'
        ? 'border-amber-100 bg-gradient-to-b from-amber-300 to-orange-500 shadow-amber-500/35'
        : 'border-sky-100 bg-gradient-to-b from-sky-300 to-cyan-600 shadow-cyan-500/35';
    }

    return item.type === 'medical'
      ? 'border-red-100 bg-gradient-to-b from-red-300 to-red-600 shadow-red-500/35'
      : 'border-emerald-100 bg-gradient-to-b from-emerald-300 to-emerald-600 shadow-emerald-500/35';
  };

  const handleMouseEnter = (date: string, event: MouseEvent<HTMLDivElement>) => {
    setHoveredDate(date);
    const rect = event.currentTarget.getBoundingClientRect();
    setHoveredPosition({ x: rect.left + rect.width / 2, y: rect.top });
  };

  return (
    <div className="relative space-y-6 pt-14">
      <PageInfoButton title={pageTitle} description={user.role === 'manager' ? t('managerCalendarInfo') : t('myCalendarInfo')} />
      <div>
        {user.role === 'manager' && (
          <div className="mt-4 inline-flex rounded-2xl border-2 border-white/65 bg-white/45 p-1.5 shadow-xl shadow-cyan-500/20 backdrop-blur-xl dark:border-cyan-400/25 dark:bg-cyan-950/45">
            {[
              { id: 'mine' as const, label: t('myLeave'), icon: UserRound },
              { id: 'team' as const, label: t('teamLeave'), icon: UsersRound },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCalendarView(id)}
                className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition-all ${
                  calendarView === id
                    ? 'border border-white/70 bg-gradient-to-b from-cyan-300 to-blue-600 text-white shadow-lg shadow-cyan-500/35'
                    : 'text-cyan-800 hover:bg-white/65 dark:text-cyan-100 dark:hover:bg-cyan-900/55'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="aero-glass overflow-hidden rounded-2xl">
        <div className="border-b border-cyan-300/30 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 p-6 dark:border-cyan-500/20 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <AeroIcon icon={CalendarIcon} variant="cyan" />
              <div>
                <h2 className="bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-xl font-bold text-transparent dark:from-cyan-300 dark:to-blue-300">
                  {formatDate(currentMonth, { month: 'long', year: 'numeric' })}
                </h2>
                <p className="text-sm font-bold text-cyan-700 dark:text-cyan-300">
                  {isTeamView ? t('teamLeaveCalendar') : t('myLeaveCalendar')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                className="rounded-xl border-2 border-white/40 border-t-white/60 bg-gradient-to-b from-slate-300 to-slate-500 p-3 text-white shadow-xl shadow-slate-500/40 transition hover:scale-110"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date())}
                className="rounded-xl border-2 border-white/40 border-t-white/60 bg-gradient-to-b from-cyan-400 to-blue-600 px-4 py-3 font-black text-white shadow-xl shadow-cyan-500/45 transition hover:scale-110"
              >
                {t('today')}
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                className="rounded-xl border-2 border-white/40 border-t-white/60 bg-gradient-to-b from-slate-300 to-slate-500 p-3 text-white shadow-xl shadow-slate-500/40 transition hover:scale-110"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-cyan-300/30 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 p-4 dark:border-cyan-500/20 dark:from-cyan-900/20 dark:to-blue-900/20 sm:grid-cols-2 lg:grid-cols-4">
            {(isTeamView
              ? [
                  { label: t('paidLeave'), className: 'from-emerald-300 to-emerald-600' },
                  { label: t('medicalLeave'), className: 'from-red-300 to-red-600' },
                ]
              : [
                  { label: `${t('paidLeave')} - ${t('pending')}`, className: 'from-sky-300 to-cyan-600' },
                  { label: `${t('medicalLeave')} - ${t('pending')}`, className: 'from-amber-300 to-orange-500' },
                  { label: `${t('paidLeave')} - ${t('approved')}`, className: 'from-emerald-300 to-emerald-600' },
                  { label: `${t('medicalLeave')} - ${t('approved')}`, className: 'from-red-300 to-red-600' },
                ]
            ).map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={`h-5 w-5 rounded-full border border-white/70 bg-gradient-to-b ${item.className} shadow-lg`} />
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-3">
            {mondayFirstWeekdayKeys.map((day) => (
              <div key={day} className="border-b-2 border-cyan-300/30 py-3 text-center font-bold text-cyan-800 dark:border-cyan-500/20 dark:text-cyan-200">
                {t(day)}
              </div>
            ))}
            {leadingDays.map((_, index) => <div key={`empty-${index}`} />)}
            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const items = getItemsForDate(day);
              const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');

              return (
                <div
                  key={dateStr}
                  onMouseEnter={(event) => items.length > 0 && handleMouseEnter(dateStr, event)}
                  onMouseLeave={() => setHoveredDate(null)}
                  className={`aero-glass min-h-28 rounded-xl border-2 border-cyan-300/30 p-3 transition-all dark:border-cyan-500/20 ${
                    isToday ? 'ring-2 ring-cyan-500 shadow-xl shadow-cyan-500/45' : ''
                  } ${items.length > 0 ? 'hover:scale-[1.02]' : ''}`}
                >
                  <div className="mb-2 text-lg font-black text-cyan-800 dark:text-cyan-100">{format(day, 'd')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((item) => (
                      <span
                        key={`${item.requestId}-${item.type}-${item.status}`}
                        className={`h-3.5 w-3.5 rounded-full border shadow-lg ${dotClass(item)}`}
                        aria-label={`${typeLabel(item.type)} - ${statusLabel(item.status)}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {hoveredDate && (
        <div
          className="fixed z-50 max-w-xs -translate-x-1/2 -translate-y-full rounded-2xl border-2 border-cyan-300/30 px-4 py-3 shadow-2xl aero-glass dark:border-cyan-500/20"
          style={{ left: hoveredPosition.x, top: hoveredPosition.y - 8 }}
        >
          <p className="mb-2 font-black text-cyan-800 dark:text-cyan-100">{formatDate(new Date(`${hoveredDate}T00:00:00`))}</p>
          <div className="space-y-2">
            {getItemsForDate(new Date(`${hoveredDate}T00:00:00`)).map((item) => (
              <div key={`${item.requestId}-${item.type}-${item.status}-tooltip`} className="text-sm font-bold text-cyan-800 dark:text-cyan-100">
                {item.employeeName ? `${item.employeeName} - ` : ''}{typeLabel(item.type)} - {statusLabel(item.status)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
