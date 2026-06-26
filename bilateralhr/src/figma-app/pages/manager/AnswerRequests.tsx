import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Calendar, Check, MessageSquare, X, Users } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { mondayFirstLeadingDays, mondayFirstWeekdayKeys } from '../../utils/calendar';
import { fetchEmployees, fetchLeaveDays, fetchRequests, proposeRequestDates, subscribeToDataChanges, updateRequestStatus } from '../../utils/data';
import { findLeaveDateOverlap, getLeaveDates } from '../../utils/leaveRules';
import type { Employee, LeaveDay, Request } from '../../types';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { PageInfoButton } from '../../components/PageInfoButton';
import { AeroIcon } from '../../components/AeroIcon';

type RequestTypeFilter = Request['type'] | 'all';
const requestTypeFilterOptions: RequestTypeFilter[] = ['all', 'paid-leave', 'medical-leave', 'salary-raise', 'hr-message'];

function getDateRange(startDate?: string, endDate?: string) {
  if (!startDate) return [];

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate || startDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [startDate];
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, '0');
    const day = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function sameDates(first: string[], second: string[]) {
  if (first.length !== second.length) return false;

  const normalizedFirst = [...first].sort();
  const normalizedSecond = [...second].sort();
  return normalizedFirst.every((date, index) => date === normalizedSecond[index]);
}

export function AnswerRequests() {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const [searchParams] = useSearchParams();
  const highlightedRequestId = searchParams.get('requestId');
  const [requests, setRequests] = useState<Request[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [originalRequestedDates, setOriginalRequestedDates] = useState<string[]>([]);
  const [proposalMessage, setProposalMessage] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [calendarError, setCalendarError] = useState('');
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [pendingTypeFilter, setPendingTypeFilter] = useState<RequestTypeFilter>('all');
  const [processedTypeFilter, setProcessedTypeFilter] = useState<RequestTypeFilter>('all');

  useEffect(() => {
    const loadData = async () => {
      const [requestItems, leaveDayItems, employeeItems] = await Promise.all([
        fetchRequests(),
        fetchLeaveDays(),
        fetchEmployees(),
      ]);
      const directReportIds = new Set(
        employeeItems
          .filter((employee) => user?.id && employee.managerId === user.id)
          .map((employee) => employee.id),
      );

      const managerRequests = requestItems.filter((request) => {
        if (!user) return false;
        return request.routedToRole === 'manager'
          && request.type === 'paid-leave'
          && (request.managerId === user.id || directReportIds.has(request.employeeId));
      });

      setAllRequests(requestItems);
      setRequests(managerRequests);
      setEmployees(employeeItems);
      setLeaveDays(
        leaveDayItems
          .map((leaveDay) => ({
            ...leaveDay,
            employeeIds: leaveDay.employeeIds.filter((employeeId) => directReportIds.has(employeeId)),
          }))
          .filter((leaveDay) => leaveDay.employeeIds.length > 0),
      );
    };

    loadData();
    return subscribeToDataChanges(loadData);
  }, [user]);

  const handleOpenRequest = (request: Request) => {
    const requestedDates = request.approvedDates?.length
      ? request.approvedDates
      : getDateRange(request.startDate, request.endDate);

    setSelectedRequest(request);
    setSelectedDates(requestedDates);
    setOriginalRequestedDates(requestedDates);
    setProposalMessage('');
    setCalendarError('');
    setShowRejectConfirm(false);
    setCurrentMonth(request.startDate ? new Date(`${request.startDate}T00:00:00`) : new Date());
    setShowCalendar(true);
  };

  const closeCalendar = () => {
    setShowCalendar(false);
    setSelectedRequest(null);
    setSelectedDates([]);
    setOriginalRequestedDates([]);
    setProposalMessage('');
    setCalendarError('');
    setShowRejectConfirm(false);
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    await updateRequestStatus(selectedRequest.id, 'rejected');
    closeCalendar();
  };

  const handleConfirmApproval = async () => {
    setCalendarError('');
    setShowRejectConfirm(false);
    if (selectedDates.length === 0) {
      setCalendarError(t('selectAtLeastOneDay'));
      return;
    }
    if (!selectedRequest) return;

    const overlap = findLeaveDateOverlap(allRequests, selectedRequest.employeeId, selectedDates, selectedRequest.id);
    if (overlap) {
      setCalendarError(t('leaveOverlapError', {
        date: overlap.date,
        type: requestTypeLabel(overlap.request.type),
        status: overlap.request.status === 'in_review' ? t('inReview') : overlap.request.status === 'approved' ? t('approved') : t('pending'),
      }));
      return;
    }

    if (sameDates(selectedDates, originalRequestedDates)) {
      await updateRequestStatus(selectedRequest.id, 'approved', { approvedDates: selectedDates });
    } else {
      if (!proposalMessage.trim()) {
        setCalendarError(t('addProposalMessage'));
        return;
      }
      await proposeRequestDates(selectedRequest.id, selectedDates, proposalMessage.trim());
    }

    closeCalendar();
  };

  const toggleDate = (date: string) => {
    setSelectedDates(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingDays = mondayFirstLeadingDays(currentMonth);

  const getEmployeesOnLeave = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return leaveDays
      .filter(ld => ld.date === dateStr)
      .flatMap((leave) => leave.employeeIds);
  };

  const hasMedicalLeave = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return leaveDays.some((leave) => leave.date === dateStr && leave.type === 'medical');
  };

  const filterByType = (items: Request[], typeFilter: RequestTypeFilter) =>
    typeFilter === 'all' ? items : items.filter((request) => request.type === typeFilter);
  const pendingRequests = filterByType(
    requests.filter(r => r.status === 'pending'),
    pendingTypeFilter,
  )
    .sort((first, second) =>
      highlightedRequestId
        ? first.id === highlightedRequestId ? -1 : second.id === highlightedRequestId ? 1 : 0
        : 0,
    );
  const processedRequests = filterByType(
    requests.filter((request) => request.status !== 'pending'),
    processedTypeFilter,
  )
    .sort((first, second) => new Date(second.submittedDate).getTime() - new Date(first.submittedDate).getTime());
  const isCounterProposal = !sameDates(selectedDates, originalRequestedDates);
  const requestTypeLabel = (type: Request['type']) => {
    if (type === 'medical-leave') return t('medicalLeave');
    if (type === 'paid-leave') return t('paidLeave');
    if (type === 'hr-message') return t('hrMessage');
    return t('salaryRaise');
  };

  const employeeForRequest = (request: Request) =>
    employees.find((employee) => employee.id === request.employeeId);
  const statusLabel = (status: Request['status']) => {
    if (status === 'approved') return t('approved');
    if (status === 'rejected') return t('rejected');
    if (status === 'in_review') return t('inReview');
    if (status === 'closed') return t('closed');
    return t('pending');
  };
  const processedDatesLabel = (request: Request) => {
    const dates = getLeaveDates(request);
    if (dates.length === 0) return '-';
    if (dates.length === 1) return formatDate(new Date(`${dates[0]}T00:00:00`));
    return `${formatDate(new Date(`${dates[0]}T00:00:00`))} - ${formatDate(new Date(`${dates[dates.length - 1]}T00:00:00`))} (${dates.length})`;
  };

  return (
    <div className="relative space-y-6 pt-14">
      <PageInfoButton title={t('leaveManagement')} description={t('answerRequestsInfo')} />

      <div className="aero-glass overflow-hidden rounded-2xl">
        <div className="border-b-2 border-cyan-300/30 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 p-6 dark:border-cyan-500/20 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-2xl font-bold text-transparent dark:from-cyan-300 dark:to-blue-300">{t('pendingRequests')}</h2>
              <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">{t('requestsAwaitingReview', { count: pendingRequests.length })}</p>
            </div>
            <select
              value={pendingTypeFilter}
              onChange={(event) => setPendingTypeFilter(event.target.value as RequestTypeFilter)}
              className="aero-input w-full rounded-xl px-4 py-2 text-cyan-900 dark:text-cyan-100 sm:w-56"
              aria-label={t('requestTypeFilter')}
            >
              {requestTypeFilterOptions.map((type) => (
                <option key={type} value={type}>
                  {type === 'all' ? t('all') : requestTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="divide-y divide-cyan-200/30 dark:divide-cyan-700/20">
          {pendingRequests.length === 0 ? (
            <div className="p-8 text-center">
              <AeroIcon icon={Calendar} variant="cyan" className="mx-auto mb-4" />
              <p className="font-semibold text-cyan-700 dark:text-cyan-300">{t('noPendingRequests')}</p>
            </div>
          ) : (
            pendingRequests.map((request) => {
              const isHighlighted = highlightedRequestId === request.id;
              const requestEmployee = employeeForRequest(request);

              return (
              <button
                key={request.id}
                onClick={() => handleOpenRequest(request)}
                className={`block w-full p-6 text-left transition-colors hover:bg-cyan-50/50 dark:hover:bg-cyan-900/20 ${
                  isHighlighted ? 'animate-[request-flash_1.4s_ease-in-out_2] ring-4 ring-cyan-300/70' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      <ProfileAvatar src={requestEmployee?.avatarUrl} name={request.employeeName} className="h-10 w-10 rounded-lg text-xs" />
                      <div>
                        <h3 className="font-bold text-cyan-800 dark:text-cyan-200">{request.employeeName}</h3>
                        <span className="rounded-full border-2 border-white/30 bg-gradient-to-br from-blue-400 to-blue-600 px-3 py-1 text-xs font-bold text-white">
                          {requestTypeLabel(request.type)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-sm font-medium text-cyan-700 dark:text-cyan-300">{request.details}</p>
                    {request.startDate && (
                      <p className="mt-2 text-xs text-cyan-600 dark:text-cyan-400">
                        {t('requested')}: {formatDate(new Date(`${request.startDate}T00:00:00`))}
                        {request.endDate ? ` - ${formatDate(new Date(`${request.endDate}T00:00:00`))}` : ''}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-cyan-600 dark:text-cyan-400">
                      {t('submitted')}: {formatDate(new Date(request.submittedDate))}
                    </p>
                  </div>
                  <span className="rounded-full border border-cyan-200/70 bg-white/45 px-4 py-2 text-sm font-black text-cyan-700 shadow-lg dark:border-cyan-500/30 dark:bg-cyan-950/30 dark:text-cyan-200">
                    {t('openCalendar')}
                  </span>
                </div>
              </button>
              );
            })
          )}
        </div>
      </div>

      <div className="aero-glass overflow-hidden rounded-2xl">
        <div className="border-b-2 border-cyan-300/30 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 p-6 dark:border-cyan-500/20 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-2xl font-bold text-transparent dark:from-cyan-300 dark:to-blue-300">
              {t('processedRequests')}
            </h2>
            <select
              value={processedTypeFilter}
              onChange={(event) => setProcessedTypeFilter(event.target.value as RequestTypeFilter)}
              className="aero-input w-full rounded-xl px-4 py-2 text-cyan-900 dark:text-cyan-100 sm:w-56"
              aria-label={t('requestTypeFilter')}
            >
              {requestTypeFilterOptions.map((type) => (
                <option key={type} value={type}>
                  {type === 'all' ? t('all') : requestTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="max-h-96 divide-y divide-cyan-200/30 overflow-y-auto dark:divide-cyan-700/20">
          {processedRequests.length === 0 ? (
            <div className="p-8 text-center">
              <AeroIcon icon={Calendar} variant="emerald" className="mx-auto mb-4" />
              <p className="font-semibold text-cyan-700 dark:text-cyan-300">{t('noProcessedRequests')}</p>
            </div>
          ) : (
            processedRequests.map((request) => {
              const requestEmployee = employeeForRequest(request);
              return (
              <div key={request.id} className="p-6 transition-colors hover:bg-cyan-50/50 dark:hover:bg-cyan-900/20">
                <p className="mb-3 bg-gradient-to-r from-blue-700 to-cyan-600 bg-clip-text text-sm font-black uppercase tracking-[0.12em] text-transparent dark:from-white dark:to-cyan-200">
                  {requestTypeLabel(request.type)}
                </p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProfileAvatar src={requestEmployee?.avatarUrl} name={request.employeeName} className="h-10 w-10 rounded-lg text-xs" />
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-cyan-800 dark:text-cyan-200">{request.employeeName}</h3>
                      <p className="mt-1 text-xs font-semibold text-cyan-600 dark:text-cyan-300">
                        {t('leaveInterval')}: {processedDatesLabel(request)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-cyan-600 dark:text-cyan-300">
                        {t('submitted')}: {formatDate(new Date(request.submittedDate))}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border-2 border-white/40 px-3 py-1 text-xs font-black text-white shadow-lg ${
                    request.status === 'approved'
                      ? 'bg-gradient-to-r from-green-400 to-emerald-500 shadow-green-500/40'
                      : request.status === 'in_review'
                      ? 'bg-gradient-to-r from-amber-400 to-orange-500 shadow-amber-500/40'
                      : 'bg-gradient-to-r from-red-400 to-red-600 shadow-red-500/40'
                  }`}>
                    {statusLabel(request.status)}
                  </span>
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>

      {showCalendar && selectedRequest && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="aero-glass max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl p-6 shadow-2xl">
            <h3 className="mb-2 bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-2xl font-bold text-transparent dark:from-cyan-300 dark:to-blue-300">
              {t('reviewLeaveFor', { name: selectedRequest.employeeName })}
            </h3>

            <div className="mb-6">
              <div className="mb-4 flex items-center justify-between">
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                  className="aero-glass rounded-lg px-4 py-2 font-semibold text-cyan-700 transition-all hover:scale-105 dark:text-cyan-300"
                >
                  {t('previous')}
                </button>
                <h4 className="text-lg font-bold text-cyan-800 dark:text-cyan-200">
                  {formatDate(currentMonth, { month: 'long', year: 'numeric' })}
                </h4>
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                  className="aero-glass rounded-lg px-4 py-2 font-semibold text-cyan-700 transition-all hover:scale-105 dark:text-cyan-300"
                >
                  {t('next')}
                </button>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {mondayFirstWeekdayKeys.map(day => (
                  <div key={day} className="py-2 text-center text-xs font-bold text-cyan-700 dark:text-cyan-300">
                    {t(day)}
                  </div>
                ))}
                {leadingDays.map((_, index) => <div key={`empty-${index}`} />)}
                {days.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isSelected = selectedDates.includes(dateStr);
                  const wasRequested = originalRequestedDates.includes(dateStr);
                  const isRemovedFromProposal = wasRequested && !isSelected;
                  const employeesOnLeave = getEmployeesOnLeave(day);
                  const isMedicalBusy = hasMedicalLeave(day);
                  const isPast = format(day, 'yyyy-MM-dd') < format(new Date(), 'yyyy-MM-dd');

                  return (
                    <button
                      key={dateStr}
                      onClick={() => !(isPast && !isSelected) && toggleDate(dateStr)}
                      disabled={isPast && !isSelected}
                      className={`relative rounded-lg p-3 text-sm font-semibold transition-all ${
                        isSelected
                          ? 'scale-105 border-2 border-white/60 bg-gradient-to-b from-emerald-300 via-green-400 to-emerald-700 text-white shadow-xl shadow-emerald-500/45'
                          : isPast
                          ? 'cursor-not-allowed text-cyan-600/50 opacity-40 dark:text-cyan-400/50'
                          : isRemovedFromProposal
                          ? 'border-2 border-emerald-400/80 bg-white/45 text-emerald-800 shadow-[inset_0_0_22px_rgba(52,211,153,0.35),0_10px_25px_rgba(16,185,129,0.22)] ring-1 ring-emerald-200/80 dark:bg-emerald-950/20 dark:text-emerald-200'
                          : employeesOnLeave.length > 0
                          ? isMedicalBusy
                          ? 'aero-glass text-red-600 hover:scale-105 dark:text-red-400'
                          : 'aero-glass text-orange-600 hover:scale-105 dark:text-orange-400'
                          : 'aero-glass text-cyan-700 hover:scale-105 dark:text-cyan-300'
                      }`}
                    >
                      {isRemovedFromProposal && (
                        <span className="pointer-events-none absolute inset-1 rounded-md border border-white/70" />
                      )}
                      <div>{format(day, 'd')}</div>
                      {employeesOnLeave.length > 0 && !isSelected && (
                        <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-xs font-bold text-white shadow-lg">
                          {employeesOnLeave.length}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="aero-glass mb-6 flex items-center gap-4 rounded-xl p-4">
              <Users className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              <p className="text-sm font-bold text-cyan-700 dark:text-cyan-300">
                {t('selectedDaysForApproval', { count: selectedDates.length })}
              </p>
            </div>

            {calendarError && (
              <p className="mb-4 rounded-xl border border-red-200/70 bg-red-50/85 px-4 py-3 text-sm font-black text-red-700 shadow-inner dark:border-red-400/25 dark:bg-red-950/30 dark:text-red-200">
                {calendarError}
              </p>
            )}

            {isCounterProposal && (
              <div className="mb-6 rounded-xl border border-emerald-200/70 bg-emerald-50/45 p-4 shadow-inner dark:border-emerald-500/25 dark:bg-emerald-950/20">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                  <p className="text-sm font-black text-emerald-900 dark:text-emerald-100">
                    {t('counterProposalHelp')}
                  </p>
                </div>
                <textarea
                  value={proposalMessage}
                  onChange={(event) => setProposalMessage(event.target.value)}
                  rows={3}
                  className="aero-input w-full resize-none text-cyan-900 placeholder:text-cyan-700/60 dark:text-cyan-100 dark:placeholder:text-cyan-300/60"
                  placeholder={t('proposalMessagePlaceholder')}
                />
              </div>
            )}

            {showRejectConfirm ? (
              <div className="rounded-2xl border border-red-200/70 bg-red-50/80 p-4 shadow-xl shadow-red-500/10 dark:border-red-400/25 dark:bg-red-950/25">
                <p className="text-sm font-black text-red-700 dark:text-red-200">{t('rejectLeaveConfirm')}</p>
                <div className="mt-3 flex gap-3">
                  <button
                    onClick={handleReject}
                    className="flex-1 rounded-xl bg-gradient-to-b from-red-400 to-red-600 px-6 py-3 font-black text-white shadow-xl shadow-red-500/35 transition hover:scale-[1.02]"
                  >
                    {t('rejectRequest')}
                  </button>
                  <button
                    onClick={() => setShowRejectConfirm(false)}
                    className="flex-1 rounded-xl aero-glass px-6 py-3 font-black text-cyan-700 transition hover:scale-[1.02] dark:text-cyan-200"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmApproval}
                  className="relative flex-1 overflow-hidden rounded-xl border-2 border-white/40 border-t-white/60 bg-gradient-to-b from-green-400 to-green-600 px-6 py-3 font-bold text-white shadow-xl shadow-green-500/50 transition-all hover:scale-105"
                >
                  <div className="pointer-events-none absolute inset-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent"></div>
                  <span className="relative z-10">{isCounterProposal ? t('sendNewProposal') : t('confirmApproval')}</span>
                </button>
                <button
                  onClick={() => setShowRejectConfirm(true)}
                  className="flex-1 rounded-xl border-2 border-white/40 border-t-white/60 bg-gradient-to-b from-red-400 to-red-600 px-6 py-3 font-bold text-white shadow-xl shadow-red-500/40 transition-all hover:scale-105"
                >
                  {t('rejectRequest')}
                </button>
                <button
                  onClick={closeCalendar}
                  className="aero-glass flex-1 rounded-xl px-6 py-3 font-bold text-cyan-700 transition-all hover:scale-105 dark:text-cyan-300"
                >
                  {t('cancel')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
