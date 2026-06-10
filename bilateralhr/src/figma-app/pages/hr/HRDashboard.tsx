import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { CalendarDays, FileText, Users } from 'lucide-react';
import { endOfWeek, format, startOfWeek } from 'date-fns';
import { Link } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { fetchEmployees, fetchRequests, subscribeToDataChanges } from '../../utils/data';
import { getLeaveDates } from '../../utils/leaveRules';
import { greetingKeyForCurrentTime } from '../../utils/greeting';
import type { Employee, Request } from '../../types';

type DashboardPanel = 'employees' | 'requests' | 'leaves';

export function HRDashboard() {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedPanel, setSelectedPanel] = useState<DashboardPanel | null>(null);
  const [detailsOffset, setDetailsOffset] = useState(0);
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const detailsPanelRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<DashboardPanel, HTMLButtonElement | null>>({
    employees: null,
    requests: null,
    leaves: null,
  });

  useEffect(() => {
    const loadDashboard = async () => {
      const [employeeItems, requestItems] = await Promise.all([
        fetchEmployees(),
        fetchRequests(),
      ]);

      setEmployees(employeeItems);
      setRequests(requestItems);
    };

    loadDashboard();
    return subscribeToDataChanges(loadDashboard);
  }, []);

  const activeEmployees = employees.filter((employee) => employee.status === 'active');
  const firedEmployees = employees.filter((employee) => employee.status === 'fired');
  const suspendedEmployees = employees.filter((employee) => employee.status === 'suspended');
  const pendingRequests = requests
    .filter((request) => request.status === 'pending' && request.routedToRole === 'hr')
    .sort((first, second) => new Date(second.submittedDate).getTime() - new Date(first.submittedDate).getTime());
  const now = new Date();
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const leavesThisWeek = new Map<string, {
    employeeName: string;
    leaveTypes: Set<Request['type']>;
    dates: Set<string>;
    totalDates: Set<string>;
  }>();

  requests.forEach((request) => {
    if (request.status !== 'approved' || (request.type !== 'paid-leave' && request.type !== 'medical-leave')) {
      return;
    }

    const requestDates = getLeaveDates(request);
    const weekDates = requestDates.filter((date) => date >= weekStart && date <= weekEnd);
    if (weekDates.length === 0) return;

    const current = leavesThisWeek.get(request.employeeId) ?? {
      employeeName: request.employeeName,
      leaveTypes: new Set<Request['type']>(),
      dates: new Set<string>(),
      totalDates: new Set<string>(),
    };

    current.leaveTypes.add(request.type);
    weekDates.forEach((date) => current.dates.add(date));
    requestDates.forEach((date) => current.totalDates.add(date));
    leavesThisWeek.set(request.employeeId, current);
  });

  const employeesOnLeaveThisWeek = Array.from(leavesThisWeek.values())
    .sort((first, second) => first.employeeName.localeCompare(second.employeeName));

  useEffect(() => {
    if (!selectedPanel) return;

    const syncDetailsPosition = () => {
      const dashboardRect = dashboardRef.current?.getBoundingClientRect();
      const buttonRect = buttonRefs.current[selectedPanel]?.getBoundingClientRect();
      const detailsRect = detailsPanelRef.current?.getBoundingClientRect();
      if (!dashboardRect || !buttonRect || !detailsRect) return;

      const buttonMiddle = buttonRect.top - dashboardRect.top + buttonRect.height / 2;
      setDetailsOffset(Math.max(0, buttonMiddle - detailsRect.height / 2));
    };

    const frame = window.requestAnimationFrame(syncDetailsPosition);
    const resizeObserver = typeof ResizeObserver !== 'undefined' && detailsPanelRef.current
      ? new ResizeObserver(syncDetailsPosition)
      : null;
    if (detailsPanelRef.current) {
      resizeObserver?.observe(detailsPanelRef.current);
    }
    window.addEventListener('resize', syncDetailsPosition);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncDetailsPosition);
    };
  }, [selectedPanel, employees.length, pendingRequests.length, employeesOnLeaveThisWeek.length]);

  const togglePanel = (panel: DashboardPanel) => {
    setSelectedPanel((current) => current === panel ? null : panel);
  };

  const requestTypeLabel = (type: Request['type']) => {
    if (type === 'medical-leave') return t('medicalLeave');
    if (type === 'paid-leave') return t('paidLeave');
    if (type === 'hr-message') return t('hrMessage');
    return t('salaryRaise');
  };

  const renderPanelContent = () => {
    if (selectedPanel === 'employees') {
      return (
        <>
          <h2 className="mb-3 text-xl font-bold text-cyan-900 dark:text-cyan-100">{t('employeesOverview')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              [t('totalEmployees'), employees.length],
              [t('fired'), firedEmployees.length],
              [t('suspended'), suspendedEmployees.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-cyan-300/40 bg-white/45 p-3 dark:bg-cyan-900/20">
                <p className="text-xs font-bold uppercase text-cyan-700 dark:text-cyan-300">{label}</p>
                <p className="mt-1 text-2xl font-black text-cyan-900 dark:text-cyan-100">{value}</p>
              </div>
            ))}
          </div>
        </>
      );
    }

    if (selectedPanel === 'requests') {
      return (
        <>
          <h2 className="mb-3 text-xl font-bold text-cyan-900 dark:text-cyan-100">{t('pendingRequests')}</h2>
          {pendingRequests.length === 0 ? (
            <p className="text-sm font-bold text-cyan-700 dark:text-cyan-300">{t('noPendingRequests')}</p>
          ) : (
            <div className="space-y-2">
              {pendingRequests.slice(0, 4).map((request) => (
                <Link
                  key={request.id}
                  to={`/hr/requests?requestId=${request.id}`}
                  className="block cursor-pointer rounded-xl border border-cyan-300/40 bg-white/45 p-3 transition hover:border-cyan-400/80 hover:bg-white/80 hover:shadow-md hover:shadow-cyan-500/20 dark:bg-cyan-900/20 dark:hover:bg-cyan-800/35"
                >
                  <p className="text-sm font-black text-blue-700 dark:text-white">{requestTypeLabel(request.type)}</p>
                  <p className="mt-1 text-sm font-bold text-cyan-900 dark:text-cyan-100">{request.employeeName}</p>
                  <p className="mt-1 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                    {formatDate(new Date(request.submittedDate))}
                  </p>
                </Link>
              ))}
              {pendingRequests.length > 4 && (
                <Link
                  to="/hr/requests"
                  className="block rounded-xl border border-cyan-300/50 bg-white/55 px-4 py-3 text-center text-sm font-black text-cyan-800 shadow-sm transition hover:bg-white/80 dark:bg-cyan-900/30 dark:text-cyan-100"
                >
                  {t('showMoreRequests')}
                </Link>
              )}
            </div>
          )}
        </>
      );
    }

    return (
      <>
        <h2 className="mb-3 text-xl font-bold text-cyan-900 dark:text-cyan-100">{t('leavesThisWeek')}</h2>
        {employeesOnLeaveThisWeek.length === 0 ? (
          <p className="text-sm font-bold text-cyan-700 dark:text-cyan-300">{t('noLeavesThisWeek')}</p>
        ) : (
          <div className="space-y-2">
            {employeesOnLeaveThisWeek.map((entry) => (
              <div key={entry.employeeName} className="rounded-xl border border-cyan-300/40 bg-white/45 p-3 dark:bg-cyan-900/20">
                <p className="text-sm font-black text-cyan-900 dark:text-cyan-100">{entry.employeeName}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from(entry.leaveTypes).map((type) => (
                    <span
                      key={type}
                      className={`relative inline-flex overflow-hidden rounded-[10px_6px_10px_6px] border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.07em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.68),inset_0_-2px_0_rgba(0,0,0,0.14),0_3px_0_rgba(8,145,178,0.16),0_6px_10px_rgba(14,165,233,0.16)] before:absolute before:inset-x-1 before:top-0.5 before:h-[38%] before:rounded-[7px_4px_7px_4px] before:bg-gradient-to-b before:from-white/50 before:to-white/5 ${
                        type === 'medical-leave'
                          ? 'border-rose-200/95 bg-gradient-to-b from-rose-300 via-red-400 to-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-2px_0_rgba(127,29,29,0.38),0_3px_0_rgba(190,18,60,0.2),0_6px_10px_rgba(244,63,94,0.18)]'
                          : 'border-emerald-100/95 bg-gradient-to-b from-lime-300 via-emerald-400 to-teal-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),inset_0_-2px_0_rgba(6,78,59,0.34),0_3px_0_rgba(5,150,105,0.18),0_6px_10px_rgba(16,185,129,0.16)]'
                      }`}
                    >
                      <span className="relative z-10">{requestTypeLabel(type)}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                  {t('leaveDaysThisWeekSummary', { weekCount: entry.dates.size, totalCount: entry.totalDates.size })}
                </p>
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  const cards = [
    { panel: 'employees' as const, value: activeEmployees.length, label: t('totalActiveEmployees'), icon: Users },
    { panel: 'requests' as const, value: pendingRequests.length, label: t('pendingRequests'), icon: FileText },
    { panel: 'leaves' as const, value: employeesOnLeaveThisWeek.length, label: t('leavesThisWeek'), icon: CalendarDays },
  ];

  return (
    <div ref={dashboardRef} className="flex flex-col gap-5 xl:flex-row xl:items-start">
      <div className="w-full max-w-sm rounded-2xl border border-white/50 bg-white/35 p-6 shadow-xl shadow-cyan-500/20 backdrop-blur-xl dark:bg-cyan-950/20">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-cyan-900 dark:text-cyan-100">
            {t(greetingKeyForCurrentTime(), { name: user?.name || t('hr') })}
          </h1>
        </div>

        <div className="space-y-4">
          {cards.map(({ panel, value, label, icon: Icon }) => (
            <button
              key={panel}
              ref={(element) => {
                buttonRefs.current[panel] = element;
              }}
              type="button"
              onClick={() => togglePanel(panel)}
              className={`w-full cursor-pointer rounded-xl border bg-white/40 p-4 text-left shadow-sm transition hover:border-cyan-300/80 hover:bg-white/75 hover:shadow-lg hover:shadow-cyan-500/20 dark:bg-cyan-900/20 dark:hover:bg-cyan-900/40 ${
                selectedPanel === panel ? 'border-cyan-400/90 ring-2 ring-cyan-300/40' : 'border-cyan-300/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-6 w-6 text-cyan-600 dark:text-cyan-300" />
                <div>
                  <p className="text-3xl font-bold text-cyan-900 dark:text-cyan-100">{value}</p>
                  <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">{label}</p>
                  <p className="mt-1 text-xs font-bold text-cyan-600/85 dark:text-cyan-300/85">
                    {selectedPanel === panel ? t('hideDetails') : t('showDetails')}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedPanel && (
        <div
          ref={detailsPanelRef}
          className="relative mt-0 w-full max-w-2xl rounded-2xl border border-white/50 bg-white/40 p-4 shadow-xl shadow-cyan-500/20 backdrop-blur-xl dark:bg-cyan-950/25 xl:mt-[var(--hr-details-offset)]"
          style={{ '--hr-details-offset': `${detailsOffset}px` } as CSSProperties}
        >
          <div
            className="absolute -left-4 top-1/2 hidden h-8 w-4 -translate-y-1/2 border-y border-l border-white/70 bg-white/60 shadow-[-5px_0_14px_rgba(14,165,233,0.22)] backdrop-blur-xl xl:block dark:border-cyan-200/90 dark:bg-cyan-700/95 dark:shadow-[-5px_0_16px_rgba(34,211,238,0.5)]"
            style={{ clipPath: 'polygon(100% 0, 0 50%, 100% 100%)' }}
          />
          {renderPanelContent()}
        </div>
      )}
    </div>
  );
}
