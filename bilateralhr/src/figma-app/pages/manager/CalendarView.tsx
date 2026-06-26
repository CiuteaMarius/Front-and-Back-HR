import { useEffect, useState, type MouseEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { mondayFirstLeadingDays, mondayFirstWeekdayKeys } from '../../utils/calendar';
import { fetchEmployees, fetchLeaveDays, subscribeToDataChanges } from '../../utils/data';
import type { Employee, LeaveDay } from '../../types';
import { PageInfoButton } from '../../components/PageInfoButton';
import { AeroIcon } from '../../components/AeroIcon';

export function CalendarView() {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [hoveredPosition, setHoveredPosition] = useState({ x: 0, y: 0 });
  const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const [leaveDayItems, employeeItems] = await Promise.all([
        fetchLeaveDays(),
        fetchEmployees(),
      ]);

      setLeaveDays(leaveDayItems);
      setEmployees(employeeItems);
    };

    loadData();
    return subscribeToDataChanges(loadData);
  }, []);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingDays = mondayFirstLeadingDays(currentMonth);
  const visibleEmployeeIds = new Set(
    user?.role === 'manager'
      ? employees.filter((employee) => employee.managerId === user.id).map((employee) => employee.id)
      : employees.map((employee) => employee.id),
  );

  const getEmployeesOnLeave = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return leaveDays
      .filter(ld => ld.date === dateStr)
      .map((leave) => ({
        ...leave,
        employeeIds: leave.employeeIds.filter((employeeId) => visibleEmployeeIds.has(employeeId)),
      }))
      .filter((leave) => leave.employeeIds.length > 0)
      .flatMap((leave) =>
        leave.employeeIds.map(empId => {
          const employee = employees.find(e => e.id === empId);
          return {
            name: employee?.name || t('unknown'),
            type: leave.type,
          };
        }),
      );
  };

  const handleMouseEnter = (date: string, event: MouseEvent<HTMLDivElement>) => {
    setHoveredDate(date);
    const rect = event.currentTarget.getBoundingClientRect();
    setHoveredPosition({ x: rect.left + rect.width / 2, y: rect.top });
  };

  return (
    <div className="relative space-y-6 pt-14">
      <PageInfoButton
        title={t('calendar')}
        description={user?.role === 'hr' ? t('hrCalendarInfo') : t('teamCalendarInfo')}
      />

      <div className="aero-glass overflow-hidden">
        <div className="p-6 border-b border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AeroIcon icon={CalendarIcon} variant="cyan" />
              <div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent">
                  {formatDate(currentMonth, { month: 'long', year: 'numeric' })}
                </h2>
                <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">
                  {user?.role === 'hr' ? t('companyLeaveCalendar') : t('teamLeaveCalendar')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                className="relative p-3 rounded-xl bg-gradient-to-b from-slate-300 to-slate-500 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-slate-500/50 hover:scale-110 transition-all overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                <ChevronLeft className="w-5 h-5 relative z-10" />
              </button>
              <button
                onClick={() => setCurrentMonth(new Date())}
                className="relative px-4 py-3 rounded-xl bg-gradient-to-b from-cyan-400 to-blue-600 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-cyan-500/50 hover:scale-110 transition-all overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                <span className="relative z-10">{t('today')}</span>
              </button>
              <button
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                className="relative p-3 rounded-xl bg-gradient-to-b from-slate-300 to-slate-500 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-slate-500/50 hover:scale-110 transition-all overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                <ChevronRight className="w-5 h-5 relative z-10" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Legend */}
          <div className="flex items-center gap-6 mb-6 p-4 rounded-xl bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20 border border-cyan-300/30 dark:border-cyan-500/20">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full border border-white/70 bg-gradient-to-b from-emerald-200 to-emerald-600 shadow-lg shadow-emerald-500/40"></div>
              <span className="text-sm text-cyan-800 dark:text-cyan-200 font-bold">{t('paidLeave')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full border border-white/70 bg-gradient-to-b from-red-200 to-red-600 shadow-lg shadow-red-500/40"></div>
              <span className="text-sm text-cyan-800 dark:text-cyan-200 font-bold">{t('medicalLeave')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-r from-slate-300 to-slate-500 shadow-lg shadow-slate-500/50"></div>
              <span className="text-sm text-cyan-800 dark:text-cyan-200 font-bold">{t('noLeaves')}</span>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-3">
            {mondayFirstWeekdayKeys.map(day => (
              <div key={day} className="text-center font-bold text-cyan-800 dark:text-cyan-200 py-3 border-b-2 border-cyan-300/30 dark:border-cyan-500/20">
                {t(day)}
              </div>
            ))}
            {leadingDays.map((_, index) => <div key={`empty-${index}`} />)}
            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const employeesOnLeave = getEmployeesOnLeave(day);
              const paidLeaveCount = employeesOnLeave.filter(e => e.type === 'paid').length;
              const medicalLeaveCount = employeesOnLeave.filter(e => e.type === 'medical').length;
              const hasMedicalLeave = medicalLeaveCount > 0;
              const isPast = day < new Date();
              const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

              return (
                <div
                  key={dateStr}
                  onMouseEnter={(e) => employeesOnLeave.length > 0 && handleMouseEnter(dateStr, e)}
                  onMouseLeave={() => setHoveredDate(null)}
                  className={`relative min-h-24 p-4 rounded-xl transition-all cursor-pointer aero-glass ${
                    isToday
                      ? 'ring-2 ring-cyan-500 shadow-xl shadow-cyan-500/50'
                      : ''
                  } ${
                    isPast
                      ? 'opacity-50'
                      : ''
                  } ${
                    employeesOnLeave.length > 0
                      ? hasMedicalLeave
                        ? 'border-2 border-red-400 shadow-xl shadow-red-500/50 hover:scale-105'
                        : 'border-2 border-emerald-400 shadow-xl shadow-emerald-500/40 hover:scale-105'
                      : 'border-2 border-cyan-300/30 dark:border-cyan-500/20'
                  }`}
                >
                  <div className="text-lg font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                    {format(day, 'd')}
                  </div>
                  {paidLeaveCount > 0 && (
                    <div className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/75 bg-gradient-to-b from-emerald-200 via-green-400 to-emerald-700 text-sm font-black text-white shadow-xl shadow-emerald-500/40 ring-2 ring-emerald-100/70">
                      {paidLeaveCount}
                    </div>
                  )}
                  {medicalLeaveCount > 0 && (
                    <div className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/75 bg-gradient-to-b from-red-200 via-red-400 to-red-700 text-sm font-black text-white shadow-xl shadow-red-500/40 ring-2 ring-red-100/60">
                      {medicalLeaveCount}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {hoveredDate && (
        <div
          className="fixed z-50 aero-glass px-4 py-3 shadow-2xl transform -translate-x-1/2 -translate-y-full -mt-2 max-w-xs border-2 border-cyan-300/30 dark:border-cyan-500/20"
          style={{ left: hoveredPosition.x, top: hoveredPosition.y }}
        >
          <p className="font-bold text-cyan-800 dark:text-cyan-200 mb-2">{t('employeesOnLeave')}</p>
          <div className="space-y-1">
            {getEmployeesOnLeave(new Date(hoveredDate)).map((emp, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full shadow-lg ${emp.type === 'paid' ? 'bg-blue-400 shadow-blue-500/50' : 'bg-red-400 shadow-red-500/50'}`}></div>
                <span className="text-cyan-800 dark:text-cyan-200 font-medium">{emp.name}</span>
                <span className="text-xs text-cyan-700 dark:text-cyan-300 font-medium">({emp.type === 'paid' ? t('paidLeave') : t('medicalLeave')})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
