import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { FileText, Check, X, AlertCircle, Users, BadgeDollarSign, MessageCircle, Download, ExternalLink, Send } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { mondayFirstLeadingDays, mondayFirstWeekdayKeys } from '../../utils/calendar';
import {
  fetchEmployees,
  fetchLeaveDays,
  fetchRequestMessages,
  fetchRequests,
  requestAttachmentUrl,
  requestSalaryRaiseManagerReview,
  closeHrMessageRequest,
  replyToHrMessageRequest,
  resolveSalaryRaiseRequest,
  subscribeToDataChanges,
  updateRequestStatus,
} from '../../utils/data';
import { findLeaveDateOverlap, getLeaveDates } from '../../utils/leaveRules';
import type { Employee, LeaveDay, Request, RequestMessage } from '../../types';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { PageInfoButton } from '../../components/PageInfoButton';
import { AeroIcon } from '../../components/AeroIcon';

type RequestTypeFilter = Request['type'] | 'all';
const requestTypeFilterOptions: RequestTypeFilter[] = ['all', 'medical-leave', 'paid-leave', 'salary-raise', 'hr-message'];

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
    dates.push(format(cursor, 'yyyy-MM-dd'));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function HRRequests() {
  const { t, formatDate } = useLanguage();
  const { formatMoney, toDisplayCurrency, toBaseCurrency } = useCurrency();
  const [searchParams] = useSearchParams();
  const highlightedRequestId = searchParams.get('requestId');
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [calendarRequest, setCalendarRequest] = useState<Request | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [originalRequestedDates, setOriginalRequestedDates] = useState<string[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [documentRequest, setDocumentRequest] = useState<Request | null>(null);
  const [medicalRejectRequest, setMedicalRejectRequest] = useState<Request | null>(null);
  const [salaryRequest, setSalaryRequest] = useState<Request | null>(null);
  const [salaryDecisionAmount, setSalaryDecisionAmount] = useState('');
  const [salaryActionMessage, setSalaryActionMessage] = useState('');
  const [salaryActionError, setSalaryActionError] = useState('');
  const [pendingEmployeeFilter, setPendingEmployeeFilter] = useState('');
  const [processedEmployeeFilter, setProcessedEmployeeFilter] = useState('');
  const [pendingTypeFilter, setPendingTypeFilter] = useState<RequestTypeFilter>('all');
  const [processedTypeFilter, setProcessedTypeFilter] = useState<RequestTypeFilter>('all');
  const [pendingSortNewest, setPendingSortNewest] = useState(true);
  const [processedSortNewest, setProcessedSortNewest] = useState(true);
  const [requestActionError, setRequestActionError] = useState('');
  const [calendarError, setCalendarError] = useState('');
  const [rejectionError, setRejectionError] = useState('');
  const [messageRequest, setMessageRequest] = useState<Request | null>(null);
  const [messageThread, setMessageThread] = useState<RequestMessage[]>([]);
  const [messageReply, setMessageReply] = useState('');
  const [messageActionError, setMessageActionError] = useState('');
  const [isMessageSubmitting, setIsMessageSubmitting] = useState(false);

  const loadRequestData = async () => {
    const [items, leaveDayItems, employeeItems] = await Promise.all([
      fetchRequests(),
      fetchLeaveDays(),
      fetchEmployees(),
    ]);
    setRequests(items);
    setLeaveDays(leaveDayItems);
    setEmployees(employeeItems);
  };

  useEffect(() => {
    loadRequestData();
    return subscribeToDataChanges(loadRequestData);
  }, []);

  useEffect(() => {
    if (!salaryRequest) return;
    const refreshedRequest = requests.find((request) => request.id === salaryRequest.id);
    if (refreshedRequest) setSalaryRequest(refreshedRequest);
  }, [requests, salaryRequest?.id]);

  useEffect(() => {
    if (!messageRequest) return;
    fetchRequestMessages(messageRequest.id).then(setMessageThread);
  }, [messageRequest]);

  const openPaidLeaveCalendar = (request: Request) => {
    const requestedDates = request.approvedDates?.length
      ? request.approvedDates
      : getDateRange(request.startDate, request.endDate);

    setCalendarRequest(request);
    setSelectedDates(requestedDates);
    setOriginalRequestedDates(requestedDates);
    setCurrentMonth(request.startDate ? new Date(`${request.startDate}T00:00:00`) : new Date());
    setCalendarError('');
  };

  const closePaidLeaveCalendar = () => {
    setCalendarRequest(null);
    setSelectedDates([]);
    setOriginalRequestedDates([]);
    setCalendarError('');
  };

  const handleApprove = async (request: Request) => {
    setRequestActionError('');
    if (request.type === 'paid-leave') {
      openPaidLeaveCalendar(request);
      return;
    }

    if (request.type === 'salary-raise') {
      setSalaryRequest(request);
      setSalaryDecisionAmount(String(toDisplayCurrency(Number(request.requestedSalaryNetIncrease ?? 0))));
      setSalaryActionMessage('');
      setSalaryActionError('');
      return;
    }

    const overlap = findLeaveDateOverlap(requests, request.employeeId, getLeaveDates(request), request.id);
    if (overlap) {
      setRequestActionError(t('leaveOverlapError', {
        date: overlap.date,
        type: requestTypeLabel(overlap.request.type),
        status: overlap.request.status === 'in_review' ? t('inReview') : overlap.request.status === 'approved' ? t('approved') : t('pending'),
      }));
      return;
    }

    try {
      await updateRequestStatus(request.id, 'approved');
      await loadRequestData();
    } catch (error) {
      setRequestActionError(error instanceof Error ? error.message : t('requestSubmitFailed'));
    }
  };

  const handleConfirmPaidLeaveApproval = async () => {
    if (!calendarRequest) return;
    setCalendarError('');
    if (selectedDates.length === 0) {
      setCalendarError(t('selectAtLeastOneDay'));
      return;
    }

    const overlap = findLeaveDateOverlap(requests, calendarRequest.employeeId, selectedDates, calendarRequest.id);
    if (overlap) {
      setCalendarError(t('leaveOverlapError', {
        date: overlap.date,
        type: requestTypeLabel(overlap.request.type),
        status: overlap.request.status === 'in_review' ? t('inReview') : overlap.request.status === 'approved' ? t('approved') : t('pending'),
      }));
      return;
    }

    try {
      await updateRequestStatus(calendarRequest.id, 'approved', { approvedDates: selectedDates });
      closePaidLeaveCalendar();
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : t('requestSubmitFailed'));
    }
  };

  const handleReject = (request: Request) => {
    if (request.type === 'medical-leave') {
      setMedicalRejectRequest(request);
      return;
    }

    setSelectedRequest(request);
    setShowRejectModal(true);
  };

  const openMessageThread = async (request: Request) => {
    setMessageRequest(request);
    setMessageReply('');
    setMessageActionError('');
    setMessageThread(await fetchRequestMessages(request.id));
  };

  const submitMessageReply = async () => {
    if (!messageRequest) return;
    setMessageActionError('');
    setIsMessageSubmitting(true);
    try {
      await replyToHrMessageRequest(messageRequest.id, messageReply);
      setMessageReply('');
      setMessageThread(await fetchRequestMessages(messageRequest.id));
      await loadRequestData();
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : t('messageSendFailed'));
    } finally {
      setIsMessageSubmitting(false);
    }
  };

  const closeMessageConversation = async () => {
    if (!messageRequest) return;
    setMessageActionError('');
    setIsMessageSubmitting(true);
    try {
      await closeHrMessageRequest(messageRequest.id);
      setMessageRequest(null);
      setMessageThread([]);
      await loadRequestData();
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : t('messageCloseFailed'));
    } finally {
      setIsMessageSubmitting(false);
    }
  };

  const confirmMedicalReject = () => {
    if (!medicalRejectRequest) return;
    setSelectedRequest(medicalRejectRequest);
    setMedicalRejectRequest(null);
    setShowRejectModal(true);
  };

  const submitRejection = async () => {
    setRejectionError('');
    if (!rejectionReason.trim()) {
      setRejectionError(t('rejectionReasonRequired'));
      return;
    }
    if (selectedRequest) {
      if (selectedRequest.type === 'salary-raise') {
        await resolveSalaryRaiseRequest(selectedRequest.id, 'rejected', {
          rejectionReason,
        });
      } else {
        await updateRequestStatus(selectedRequest.id, 'rejected', {
          rejectionReason,
        });
      }
      setShowRejectModal(false);
      setRejectionReason('');
      setSelectedRequest(null);
      setSalaryRequest(null);
      await loadRequestData();
    }
  };

  const salaryEmployee = salaryRequest
    ? employees.find((employee) => employee.id === salaryRequest.employeeId)
    : undefined;
  const salaryCurrentNet = Number(salaryEmployee?.salaryNet ?? salaryEmployee?.salary ?? 0);
  const salaryRequestedIncrease = Number(salaryRequest?.requestedSalaryNetIncrease ?? 0);
  const salaryCurrentNetDisplay = toDisplayCurrency(salaryCurrentNet);
  const salaryRequestedIncreaseDisplay = toDisplayCurrency(salaryRequestedIncrease);
  const salaryDecisionValue = Number(salaryDecisionAmount);
  const salaryDecisionPercent = salaryCurrentNetDisplay > 0 && salaryDecisionValue > 0
    ? (salaryDecisionValue / salaryCurrentNetDisplay) * 100
    : 0;

  const handleAskManagerReview = async () => {
    if (!salaryRequest) return;
    setSalaryActionMessage('');
    setSalaryActionError('');
    try {
      await requestSalaryRaiseManagerReview(salaryRequest.id);
      setSalaryActionMessage(t('salaryReviewRequested'));
      await loadRequestData();
      const refreshedRequest = (await fetchRequests()).find((request) => request.id === salaryRequest.id);
      if (refreshedRequest) setSalaryRequest(refreshedRequest);
    } catch (error) {
      setSalaryActionError(error instanceof Error ? error.message : t('salaryReviewRequestFailed'));
    }
  };

  const handleApproveSalaryRaise = async (amount = salaryDecisionValue) => {
    if (!salaryRequest) return;
    setSalaryActionMessage('');
    setSalaryActionError('');
    try {
      await resolveSalaryRaiseRequest(salaryRequest.id, 'approved', {
        approvedNetIncrease: toBaseCurrency(amount),
      });
      setSalaryRequest(null);
      await loadRequestData();
    } catch (error) {
      setSalaryActionError(error instanceof Error ? error.message : t('salaryApprovalFailed'));
    }
  };

  const toggleDate = (date: string) => {
    setSelectedDates((items) =>
      items.includes(date) ? items.filter((item) => item !== date) : [...items, date],
    );
  };

  const getEmployeesOnLeave = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return leaveDays
      .filter((leaveDay) => leaveDay.date === dateStr)
      .flatMap((leaveDay) => leaveDay.employeeIds);
  };

  const hasMedicalLeave = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return leaveDays.some((leaveDay) => leaveDay.date === dateStr && leaveDay.type === 'medical');
  };

  const requestTypeLabel = (type: Request['type']) => {
    if (type === 'medical-leave') return t('medicalLeave');
    if (type === 'paid-leave') return t('paidLeave');
    if (type === 'hr-message') return t('hrMessage');
    return t('salaryRaise');
  };

  const statusLabel = (status: Request['status']) => {
    if (status === 'approved') return t('approved');
    if (status === 'rejected') return t('rejected');
    if (status === 'in_review') return t('answered');
    if (status === 'closed') return t('closed');
    return t('open');
  };

  const employeeForRequest = (request: Request) =>
    employees.find((employee) => employee.id === request.employeeId);

  const employeeLabelForRequest = (request: Request) => {
    const employee = employeeForRequest(request);
    return employee?.employeeCode
      ? `${request.employeeName} (${employee.employeeCode})`
      : request.employeeName;
  };

  const employeeMatchesFilter = (request: Request, filter: string) => {
    const normalizedFilter = filter.trim().toLowerCase();
    if (!normalizedFilter) return true;

    const employee = employeeForRequest(request);
    return [
      request.employeeName,
      employee?.employeeCode,
      employeeLabelForRequest(request),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedFilter));
  };

  const employeeSuggestionsForRequests = (items: Request[], filter: string) => {
    const suggestions = new Map<string, string>();
    items.forEach((request) => {
      const label = employeeLabelForRequest(request);
      if (employeeMatchesFilter(request, filter)) {
        suggestions.set(label, label);
      }
    });

    return Array.from(suggestions.values()).slice(0, 8);
  };

  const formatLocalDate = (date?: string) => {
    if (!date) return '';
    const parsedDate = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? date : formatDate(parsedDate);
  };

  const groupDateIntervals = (dates: string[]) => {
    const sortedDates = Array.from(new Set(dates.filter(Boolean))).sort();
    const intervals: Array<{ start: string; end: string }> = [];

    sortedDates.forEach((date) => {
      const lastInterval = intervals[intervals.length - 1];
      if (!lastInterval) {
        intervals.push({ start: date, end: date });
        return;
      }

      const expectedNextDate = new Date(`${lastInterval.end}T00:00:00`);
      expectedNextDate.setDate(expectedNextDate.getDate() + 1);

      if (format(expectedNextDate, 'yyyy-MM-dd') === date) {
        lastInterval.end = date;
      } else {
        intervals.push({ start: date, end: date });
      }
    });

    return intervals;
  };

  const parseDecisionNumber = (request: Request, label: string) => {
    const match = request.decisionComment?.match(new RegExp(`${label}:\\s*([\\d.]+)`));
    const value = match ? Number(match[1]) : Number.NaN;
    return Number.isFinite(value) ? value : undefined;
  };

  const leaveOutcomeSummary = (request: Request) => {
    const dates = request.approvedDates?.length
      ? request.approvedDates
      : getDateRange(request.startDate, request.endDate);

    if (dates.length === 0) return undefined;

    return groupDateIntervals(dates)
      .map((interval) =>
        interval.start === interval.end
          ? formatLocalDate(interval.start)
          : `${formatLocalDate(interval.start)} - ${formatLocalDate(interval.end)}`,
      )
      .join(', ');
  };

  const salaryOutcomeSummary = (request: Request) => {
    const employee = employeeForRequest(request);
    const currentNet = Number(employee?.salaryNet ?? employee?.salary ?? 0);
    const requestedIncrease = Number(request.requestedSalaryNetIncrease ?? 0);
    const approvedIncrease = parseDecisionNumber(request, 'Approved net increase');
    const approvedNewNet = parseDecisionNumber(request, 'New net salary');

    if (request.status === 'approved' && approvedNewNet !== undefined) {
      const oldNet = approvedIncrease !== undefined ? approvedNewNet - approvedIncrease : currentNet;
      return `${formatMoney(oldNet)} -> ${formatMoney(approvedNewNet)}`;
    }

    if (requestedIncrease > 0 && currentNet > 0) {
      return `${formatMoney(currentNet)} -> ${formatMoney(currentNet + requestedIncrease)}`;
    }

    return undefined;
  };

  const requestOutcomeSummary = (request: Request) => {
    if (request.type === 'salary-raise') return salaryOutcomeSummary(request);
    return leaveOutcomeSummary(request);
  };

  const renderRequestTypeTitle = (type: Request['type']) => (
    <div className="mb-4 inline-flex rounded-full border border-cyan-200/80 bg-gradient-to-r from-white/85 via-cyan-50/80 to-blue-50/80 px-4 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_24px_rgba(14,165,233,0.16)] dark:border-cyan-300/25 dark:from-cyan-900/60 dark:via-blue-900/45 dark:to-cyan-950/40">
      <span className="text-sm font-black uppercase tracking-[0.14em] text-blue-700 dark:text-white">
        {requestTypeLabel(type)}
      </span>
    </div>
  );

  const filterAndSortRequests = (
    items: Request[],
    employeeFilter: string,
    typeFilter: RequestTypeFilter,
    newestFirst: boolean,
  ) => {
    const filteredItems = items.filter((request) =>
      employeeMatchesFilter(request, employeeFilter)
      && (typeFilter === 'all' || request.type === typeFilter),
    );

    return [...filteredItems].sort((first, second) => {
      if (highlightedRequestId) {
        if (first.id === highlightedRequestId) return -1;
        if (second.id === highlightedRequestId) return 1;
      }

      const firstDate = new Date(first.submittedDate).getTime();
      const secondDate = new Date(second.submittedDate).getTime();
      return newestFirst ? secondDate - firstDate : firstDate - secondDate;
    });
  };

  const hrRequests = requests.filter((request) => request.routedToRole === 'hr');
  const pendingRequestPool = hrRequests.filter(r => r.status === 'pending');
  const processedRequestPool = hrRequests.filter(r => r.status !== 'pending');
  const pendingRequests = filterAndSortRequests(pendingRequestPool, pendingEmployeeFilter, pendingTypeFilter, pendingSortNewest);
  const processedRequests = filterAndSortRequests(processedRequestPool, processedEmployeeFilter, processedTypeFilter, processedSortNewest);
  const pendingEmployeeSuggestions = employeeSuggestionsForRequests(pendingRequestPool, pendingEmployeeFilter);
  const processedEmployeeSuggestions = employeeSuggestionsForRequests(processedRequestPool, processedEmployeeFilter);
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingDays = mondayFirstLeadingDays(currentMonth);

  return (
    <div className="relative space-y-6 pt-14">
      <PageInfoButton title={t('answerRequests')} description={t('answerRequestsInfo')} />

      <div className="grid gap-6 xl:grid-cols-2 xl:items-stretch">
      {/* Pending Requests */}
      <div className="aero-glass flex min-h-0 min-w-0 flex-col rounded-2xl overflow-hidden xl:h-[clamp(460px,calc(100vh-14rem),680px)]">
        <div className="p-6 border-b-2 border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="flex items-center gap-3">
              <AeroIcon icon={AlertCircle} variant="cyan" />
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-300 dark:to-blue-300 bg-clip-text text-transparent">{t('pendingRequests')}</h2>
                <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">{t('requestsAwaitingReview', { count: pendingRequests.length })}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-[minmax(180px,1fr)_150px_145px]">
              <input
                list="pending-request-employee-suggestions"
                value={pendingEmployeeFilter}
                onChange={(event) => setPendingEmployeeFilter(event.target.value)}
                className="aero-input rounded-xl px-4 py-2 text-cyan-900 dark:text-cyan-100"
                placeholder={t('employeeFilterPlaceholder')}
              />
              <datalist id="pending-request-employee-suggestions">
                {pendingEmployeeSuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
              <select
                value={pendingTypeFilter}
                onChange={(event) => setPendingTypeFilter(event.target.value as RequestTypeFilter)}
                className="aero-input rounded-xl px-4 py-2 text-cyan-900 dark:text-cyan-100"
                aria-label={t('requestTypeFilter')}
              >
                {requestTypeFilterOptions.map((type) => (
                  <option key={type} value={type}>
                    {type === 'all' ? t('allRequestTypes') : requestTypeLabel(type)}
                  </option>
                ))}
              </select>
              <select
                value={pendingSortNewest ? 'newest' : 'oldest'}
                onChange={(event) => setPendingSortNewest(event.target.value === 'newest')}
                className="aero-input rounded-xl px-4 py-2 text-cyan-900 dark:text-cyan-100"
              >
                <option value="newest">{t('sortNewestFirst')}</option>
                <option value="oldest">{t('sortOldestFirst')}</option>
              </select>
            </div>
          </div>
          {requestActionError && (
            <p className="mt-4 rounded-xl border border-red-200/70 bg-red-50/85 px-4 py-3 text-sm font-black text-red-700 shadow-inner dark:border-red-400/25 dark:bg-red-950/30 dark:text-red-200">
              {requestActionError}
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 divide-y divide-cyan-200/30 overflow-y-auto dark:divide-cyan-700/20">
          {pendingRequests.length === 0 ? (
            <div className="p-8 text-center">
              <AeroIcon icon={FileText} variant="cyan" className="mx-auto mb-4" />
              <p className="text-cyan-700 dark:text-cyan-300 font-semibold">{t('noPendingRequests')}</p>
            </div>
          ) : (
            pendingRequests.map((request) => {
              const isMedicalRejecting = medicalRejectRequest?.id === request.id;
              const isHighlighted = highlightedRequestId === request.id;

              return (
              <div
                key={request.id}
                className={`p-5 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/20 transition-colors ${
                  isHighlighted ? 'animate-[request-flash_1.4s_ease-in-out_2] ring-4 ring-cyan-300/70' : ''
                }`}
              >
                {renderRequestTypeTitle(request.type)}
                <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <ProfileAvatar name={request.employeeName} className="h-10 w-10 text-xs" />
                      <div>
                        <h3 className="font-bold text-cyan-800 dark:text-cyan-200">{request.employeeName}</h3>
                        <p className="text-xs font-bold text-cyan-600 dark:text-cyan-300">
                          {employeeForRequest(request)?.employeeCode || t('noCode')}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium mt-3">{request.details}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      <p className="text-xs text-cyan-600 dark:text-cyan-400 font-medium">
                        {t('submitted')}: {formatDate(new Date(request.submittedDate))}
                      </p>
                      {request.documents && request.documents.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setDocumentRequest(request)}
                          className="flex cursor-pointer items-center gap-2 rounded-full border border-blue-200/70 bg-blue-50/70 px-3 py-1 transition hover:scale-[1.02] hover:bg-blue-100/80 dark:border-blue-400/25 dark:bg-blue-950/25"
                        >
                          <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-300">
                            {t('documentAttachedActions', { count: request.documents.length })}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                  {isMedicalRejecting ? (
                    <div className="w-full max-w-md rounded-2xl border border-red-200/70 bg-red-50/80 p-4 shadow-xl shadow-red-500/10 dark:border-red-400/25 dark:bg-red-950/25 2xl:ml-4">
                      <p className="text-sm font-bold text-red-700 dark:text-red-200">{t('rejectMedicalLeaveConfirm')}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={confirmMedicalReject}
                          className="flex-1 rounded-xl bg-gradient-to-b from-red-400 to-red-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-red-500/30 transition hover:scale-105"
                        >
                          {t('reject')}
                        </button>
                        <button
                          onClick={() => setMedicalRejectRequest(null)}
                          className="flex-1 rounded-xl aero-glass px-4 py-2 text-sm font-black text-cyan-700 transition hover:scale-105 dark:text-cyan-200"
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 2xl:ml-4 2xl:justify-end">
                      {request.type === 'hr-message' ? (
                        <button
                          onClick={() => openMessageThread(request)}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-white/50 bg-white/70 text-sm font-black text-cyan-800 shadow-xl shadow-cyan-500/20 transition-all hover:scale-105 hover:bg-cyan-50 dark:bg-cyan-950/50 dark:text-cyan-100 dark:hover:bg-cyan-900/60"
                        >
                          <MessageCircle className="h-5 w-5" />
                          {t('answerMessage')}
                        </button>
                      ) : request.type === 'salary-raise' ? (
                        <button
                          onClick={() => handleApprove(request)}
                          className="px-5 py-2.5 rounded-xl border-2 border-white/50 bg-white/70 text-sm font-black text-cyan-800 shadow-xl shadow-cyan-500/20 transition-all hover:scale-105 hover:bg-cyan-50 dark:bg-cyan-950/50 dark:text-cyan-100 dark:hover:bg-cyan-900/60"
                        >
                          {t('answerRequest')}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleApprove(request)}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-b from-green-400 to-green-600 border-2 border-white/40 border-t-white/60 text-white text-sm font-bold transition-all hover:scale-110 shadow-xl shadow-green-500/50 hover:shadow-2xl hover:shadow-green-400/70 relative overflow-hidden"
                          >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent h-1/2 pointer-events-none"></div>
                            <Check className="w-5 h-5 relative z-10" />
                            <span className="relative z-10">{t('approve')}</span>
                          </button>
                          <button
                            onClick={() => handleReject(request)}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-b from-red-400 to-red-600 border-2 border-white/40 border-t-white/60 text-white text-sm font-bold transition-all hover:scale-110 shadow-xl shadow-red-500/50 hover:shadow-2xl hover:shadow-red-400/70 relative overflow-hidden"
                          >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent h-1/2 pointer-events-none"></div>
                            <X className="w-5 h-5 relative z-10" />
                            <span className="relative z-10">{t('reject')}</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>

      {/* Processed Requests */}
      <div className="aero-glass flex min-h-0 min-w-0 flex-col rounded-2xl overflow-hidden xl:h-[clamp(460px,calc(100vh-14rem),680px)]">
        <div className="p-6 border-b-2 border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-300 dark:to-blue-300 bg-clip-text text-transparent">{t('processedRequests')}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-[minmax(180px,1fr)_150px_145px]">
              <input
                list="processed-request-employee-suggestions"
                value={processedEmployeeFilter}
                onChange={(event) => setProcessedEmployeeFilter(event.target.value)}
                className="aero-input rounded-xl px-4 py-2 text-cyan-900 dark:text-cyan-100"
                placeholder={t('employeeFilterPlaceholder')}
              />
              <datalist id="processed-request-employee-suggestions">
                {processedEmployeeSuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
              <select
                value={processedTypeFilter}
                onChange={(event) => setProcessedTypeFilter(event.target.value as RequestTypeFilter)}
                className="aero-input rounded-xl px-4 py-2 text-cyan-900 dark:text-cyan-100"
                aria-label={t('requestTypeFilter')}
              >
                {requestTypeFilterOptions.map((type) => (
                  <option key={type} value={type}>
                    {type === 'all' ? t('allRequestTypes') : requestTypeLabel(type)}
                  </option>
                ))}
              </select>
              <select
                value={processedSortNewest ? 'newest' : 'oldest'}
                onChange={(event) => setProcessedSortNewest(event.target.value === 'newest')}
                className="aero-input rounded-xl px-4 py-2 text-cyan-900 dark:text-cyan-100"
              >
                <option value="newest">{t('sortNewestFirst')}</option>
                <option value="oldest">{t('sortOldestFirst')}</option>
              </select>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-cyan-200/30 overflow-y-auto dark:divide-cyan-700/20">
          {processedRequests.map((request) => {
            const isHighlighted = highlightedRequestId === request.id;
            const outcomeSummary = requestOutcomeSummary(request);
            const outcomeLabel = request.type === 'salary-raise' ? t('salaryChange') : t('leaveInterval');

            return (
            <div
              key={request.id}
              className={`p-5 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/20 transition-colors ${
                isHighlighted ? 'animate-[request-flash_1.4s_ease-in-out_2] ring-4 ring-cyan-300/70' : ''
              }`}
            >
              {renderRequestTypeTitle(request.type)}
              <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <ProfileAvatar name={request.employeeName} className="h-10 w-10 text-xs" />
                    <div>
                      <h3 className="font-bold text-cyan-800 dark:text-cyan-200">{request.employeeName}</h3>
                      <p className="text-xs font-bold text-cyan-600 dark:text-cyan-300">
                        {employeeForRequest(request)?.employeeCode || t('noCode')}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border-2 border-white/40 shadow-lg ${
                      request.status === 'approved'
                        ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-green-500/50'
                        : request.status === 'in_review'
                        ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-white shadow-cyan-500/50'
                        : request.status === 'closed'
                        ? 'bg-gradient-to-r from-slate-300 to-slate-500 text-white shadow-slate-500/35'
                        : 'bg-gradient-to-r from-red-400 to-red-600 text-white shadow-red-500/50'
                    }`}>
                      {statusLabel(request.status)}
                    </span>
                  </div>
                  <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">{request.details}</p>
                  {outcomeSummary && (
                    <p className="mt-2 rounded-xl border border-cyan-200/60 bg-white/45 px-3 py-2 text-sm font-black text-cyan-800 shadow-inner dark:border-cyan-500/25 dark:bg-cyan-950/30 dark:text-cyan-100">
                      <span className="text-blue-700 dark:text-white">{outcomeLabel}:</span> {outcomeSummary}
                    </p>
                  )}
                  {request.rejectionReason && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                      {t('reason')}: {request.rejectionReason === 'Employee rejected the manager proposal.'
                        ? t('employeeRejectedProposalReason')
                        : request.rejectionReason}
                    </p>
                  )}
                  {request.type === 'hr-message' && (
                    <button
                      type="button"
                      onClick={() => openMessageThread(request)}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-white/50 bg-gradient-to-b from-cyan-300 to-blue-600 px-4 py-2 text-sm font-black text-white shadow-xl shadow-cyan-500/30 transition hover:scale-[1.02]"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {t('openConversation')}
                    </button>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>

      </div>

      {messageRequest && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4"
          onClick={() => setMessageRequest(null)}
        >
          <div
            className="aero-glass rounded-[2rem] p-6 max-w-4xl w-full shadow-2xl border-2 border-white/50 max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700 dark:text-white">{t('hrMessage')}</p>
                <h3 className="text-2xl font-black text-cyan-950 dark:text-cyan-100">{messageRequest.details}</h3>
                <p className="mt-1 text-sm font-bold text-cyan-700 dark:text-cyan-300">{employeeLabelForRequest(messageRequest)}</p>
              </div>
              <button
                onClick={() => setMessageRequest(null)}
                className="rounded-full border border-white/60 bg-white/50 p-2 text-cyan-700 shadow-lg transition hover:scale-105 dark:bg-cyan-950/50 dark:text-cyan-200"
                aria-label={t('close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-3xl border border-cyan-200/50 bg-white/35 p-5 shadow-inner dark:border-cyan-500/20 dark:bg-cyan-950/25">
              {messageThread.map((message) => {
                const employee = employeeForRequest(messageRequest);
                const isEmployeeMessage = message.senderProfileId && message.senderProfileId === employee?.profileId;
                return (
                  <div key={message.id} className={`flex ${isEmployeeMessage ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[78%] rounded-[1.5rem] border-2 px-5 py-4 shadow-xl ${
                      isEmployeeMessage
                        ? 'border-cyan-200/60 bg-white/75 text-cyan-900 shadow-cyan-500/10 dark:border-cyan-400/25 dark:bg-cyan-950/55 dark:text-cyan-100'
                        : 'border-white/60 bg-gradient-to-br from-cyan-300 to-blue-600 text-white shadow-cyan-500/25'
                    }`}>
                      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] opacity-80">
                        {isEmployeeMessage ? messageRequest.employeeName : 'HR'}
                      </p>
                      <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed">{message.body}</p>
                      <p className={`mt-2 text-[11px] font-black ${isEmployeeMessage ? 'text-cyan-600 dark:text-cyan-300' : 'text-white/80'}`}>
                        {formatDate(new Date(message.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {messageActionError && (
              <p className="mt-4 rounded-xl border border-red-200/70 bg-red-50/85 px-4 py-3 text-sm font-black text-red-700 shadow-inner dark:border-red-400/25 dark:bg-red-950/30 dark:text-red-200">
                {messageActionError}
              </p>
            )}

            <div className="mt-5">
              {messageRequest.status === 'closed' ? (
                <p className="rounded-2xl border border-slate-200/70 bg-white/65 px-4 py-3 text-sm font-black text-slate-600 dark:border-slate-500/30 dark:bg-slate-900/40 dark:text-slate-200">
                  {t('conversationClosed')}
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <textarea
                    value={messageReply}
                    onChange={(event) => setMessageReply(event.target.value)}
                    rows={3}
                    className="aero-input resize-none text-cyan-900 placeholder:text-cyan-700/60 dark:text-cyan-100 dark:placeholder:text-cyan-300/60"
                    placeholder={t('messageReplyPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={submitMessageReply}
                    disabled={isMessageSubmitting || !messageReply.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-white/50 bg-gradient-to-b from-emerald-300 to-cyan-600 px-6 py-3 font-black text-white shadow-xl shadow-emerald-500/30 transition hover:scale-[1.02] disabled:opacity-60"
                  >
                    <Send className="h-5 w-5" />
                    {t('send')}
                  </button>
                  <button
                    type="button"
                    onClick={closeMessageConversation}
                    disabled={isMessageSubmitting}
                    className="rounded-2xl aero-glass px-6 py-3 font-black text-cyan-800 transition hover:scale-[1.02] disabled:opacity-60 dark:text-cyan-100"
                  >
                    {t('closeConversation')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {documentRequest && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4"
          onClick={() => setDocumentRequest(null)}
        >
          <div
            className="aero-glass rounded-[2rem] p-6 max-w-4xl w-full shadow-2xl border-2 border-white/50 max-h-[90vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-300 dark:to-blue-300 bg-clip-text text-transparent">
                  {t('requestDocuments')}
                </h3>
              </div>
              <button
                onClick={() => setDocumentRequest(null)}
                className="rounded-full border border-white/60 bg-white/50 p-2 text-cyan-700 shadow-lg transition hover:scale-105 dark:bg-cyan-950/50 dark:text-cyan-200"
                aria-label={t('close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              {(documentRequest.attachments?.length
                ? documentRequest.attachments
                : (documentRequest.documents ?? []).map((fileName) => ({ fileName, filePath: undefined, mimeType: undefined }))
              ).map((attachment) => {
                const url = requestAttachmentUrl(attachment);
                const isPdf = (attachment.mimeType || '').includes('pdf') || attachment.fileName.toLowerCase().endsWith('.pdf');

                return (
                  <div key={`${attachment.filePath ?? attachment.fileName}`} className="rounded-2xl border border-cyan-200/50 bg-white/45 p-4 shadow-inner dark:border-cyan-500/20 dark:bg-cyan-950/30">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-gradient-to-b from-cyan-300 to-blue-600 shadow-lg shadow-cyan-500/30">
                          <FileText className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="break-words font-black text-cyan-950 dark:text-cyan-100">{attachment.fileName}</p>
                          {!isPdf && (
                            <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">{t('pdfOnlyPreview')}</p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:min-w-[300px]">
                        {isPdf && url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 border-white/50 bg-gradient-to-b from-cyan-300 to-blue-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-cyan-500/30 transition hover:scale-[1.03]"
                          >
                            <ExternalLink className="h-4 w-4" />
                            {t('viewInBrowser')}
                          </a>
                        )}
                        {url && (
                          <a
                            href={url}
                            download={attachment.fileName}
                            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 border-white/50 bg-gradient-to-b from-emerald-300 to-emerald-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-emerald-500/30 transition hover:scale-[1.03]"
                          >
                            <Download className="h-4 w-4" />
                            {t('download')}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {salaryRequest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="aero-glass rounded-[2rem] p-6 max-w-3xl w-full shadow-2xl border-2 border-white/50 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/70 bg-gradient-to-b from-lime-200 via-emerald-300 to-cyan-600 shadow-xl shadow-emerald-500/35">
                <BadgeDollarSign className="h-7 w-7 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-black bg-gradient-to-r from-emerald-600 to-cyan-600 dark:from-emerald-300 dark:to-cyan-300 bg-clip-text text-transparent">
                  {t('salaryRaiseReviewTitle')}
                </h3>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/55 bg-white/45 p-4 shadow-inner dark:bg-cyan-950/30">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600 dark:text-cyan-300">{t('currentNetSalary')}</p>
                <p className="mt-1 text-2xl font-black text-cyan-950 dark:text-cyan-100">{formatMoney(salaryCurrentNet)}</p>
              </div>
              <div className="rounded-2xl border border-white/55 bg-white/45 p-4 shadow-inner dark:bg-cyan-950/30">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600 dark:text-cyan-300">{t('requestedIncrease')}</p>
                <p className="mt-1 text-2xl font-black text-cyan-950 dark:text-cyan-100">{formatMoney(salaryRequestedIncrease)}</p>
              </div>
              <div className="rounded-2xl border border-white/55 bg-white/45 p-4 shadow-inner dark:bg-cyan-950/30">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600 dark:text-cyan-300">{t('raisePercent')}</p>
                <p className="mt-1 text-2xl font-black text-cyan-950 dark:text-cyan-100">
                  {salaryCurrentNetDisplay > 0 ? ((salaryRequestedIncreaseDisplay / salaryCurrentNetDisplay) * 100).toFixed(2) : '0.00'}%
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-cyan-200/50 bg-white/40 p-4 dark:border-cyan-500/20 dark:bg-cyan-950/25">
              <p className="text-sm font-black text-cyan-900 dark:text-cyan-100">{t('details')}</p>
              <p className="mt-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300">{salaryRequest.details || '-'}</p>
            </div>

            <div className="mt-4 rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-white/55 to-cyan-50/45 p-4 dark:border-cyan-500/20 dark:from-cyan-950/35 dark:to-cyan-900/20">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black text-cyan-900 dark:text-cyan-100">{t('managerRecommendation')}</p>
                  <p className="mt-1 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                    {salaryRequest.salaryReview?.recommendation
                      ? t('managerReviewResponse', {
                        answer: salaryRequest.salaryReview.recommendation === 'yes' ? t('yes') : t('no'),
                      })
                      : salaryRequest.salaryReview?.requested
                      ? t('managerReviewPending')
                      : t('managerReviewNotRequested')}
                  </p>
                </div>
                <button
                  onClick={handleAskManagerReview}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/50 bg-gradient-to-b from-cyan-300 to-blue-600 px-4 py-3 font-black text-white shadow-xl shadow-cyan-500/35 transition hover:scale-[1.02]"
                >
                  <MessageCircle className="h-5 w-5" />
                  {t('askManagerForSalaryReview')}
                </button>
              </div>
              {salaryRequest.salaryReview?.comment && (
                <p className="mt-3 rounded-xl border border-white/60 bg-white/55 px-4 py-3 text-sm font-semibold text-cyan-800 shadow-inner dark:bg-cyan-950/30 dark:text-cyan-100">
                  {salaryRequest.salaryReview.comment}
                </p>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-200/60 bg-emerald-50/45 p-4 dark:border-emerald-400/25 dark:bg-emerald-950/20">
              <label className="block text-sm font-black text-cyan-900 dark:text-cyan-100 mb-2">
                {t('customRaiseAmount')}
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={salaryDecisionAmount}
                onChange={(event) => setSalaryDecisionAmount(event.target.value)}
                className="aero-input w-full text-cyan-900 dark:text-cyan-100"
              />
              <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold text-cyan-800 dark:text-cyan-200">
                <span className="rounded-full border border-white/60 bg-white/55 px-4 py-2 shadow-md dark:bg-cyan-950/35">
                  {t('raisePercent')}: {salaryDecisionPercent.toFixed(2)}%
                </span>
                <span className="rounded-full border border-white/60 bg-white/55 px-4 py-2 shadow-md dark:bg-cyan-950/35">
                  {t('newNetSalary')}: {formatMoney(toBaseCurrency(salaryCurrentNetDisplay + (salaryDecisionValue || 0)))}
                </span>
              </div>
            </div>

            {(salaryActionMessage || salaryActionError) && (
              <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-black ${salaryActionError ? 'bg-red-50/75 text-red-700 dark:bg-red-950/25 dark:text-red-200' : 'bg-emerald-50/75 text-emerald-700 dark:bg-emerald-950/25 dark:text-emerald-200'}`}>
                {salaryActionError || salaryActionMessage}
              </p>
            )}

            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
              <button
                onClick={() => handleApproveSalaryRaise(salaryRequestedIncreaseDisplay)}
                className="rounded-xl border-2 border-white/50 bg-gradient-to-b from-emerald-300 to-emerald-600 px-4 py-3 font-black text-white shadow-xl shadow-emerald-500/35 transition hover:scale-[1.02]"
              >
                {t('approveRequestedRaise')}
              </button>
              <button
                onClick={() => handleApproveSalaryRaise()}
                className="rounded-xl border-2 border-white/50 bg-gradient-to-b from-cyan-300 to-blue-600 px-4 py-3 font-black text-white shadow-xl shadow-cyan-500/35 transition hover:scale-[1.02]"
              >
                {t('approveCustomRaise')}
              </button>
              <button
                onClick={() => handleReject(salaryRequest)}
                className="rounded-xl border-2 border-white/50 bg-gradient-to-b from-red-300 to-red-600 px-4 py-3 font-black text-white shadow-xl shadow-red-500/30 transition hover:scale-[1.02]"
              >
                {t('reject')}
              </button>
              <button
                onClick={() => setSalaryRequest(null)}
                className="rounded-xl aero-glass px-4 py-3 font-black text-cyan-800 transition hover:scale-[1.02] dark:text-cyan-100"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {calendarRequest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="aero-glass rounded-2xl p-6 max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-300 dark:to-blue-300 bg-clip-text text-transparent mb-2">
              {t('reviewLeaveFor', { name: calendarRequest.employeeName })}
            </h3>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                  className="px-4 py-2 rounded-lg aero-glass hover:scale-105 transition-all text-cyan-700 dark:text-cyan-300 font-semibold"
                >
                  {t('previous')}
                </button>
                <h4 className="text-lg font-bold text-cyan-800 dark:text-cyan-200">
                  {formatDate(currentMonth, { month: 'long', year: 'numeric' })}
                </h4>
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                  className="px-4 py-2 rounded-lg aero-glass hover:scale-105 transition-all text-cyan-700 dark:text-cyan-300 font-semibold"
                >
                  {t('next')}
                </button>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {mondayFirstWeekdayKeys.map((day) => (
                  <div key={day} className="text-center text-xs font-bold text-cyan-700 dark:text-cyan-300 py-2">
                    {t(day)}
                  </div>
                ))}
                {leadingDays.map((_, index) => <div key={`empty-${index}`} />)}
                {days.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isSelected = selectedDates.includes(dateStr);
                  const wasRequested = originalRequestedDates.includes(dateStr);
                  const isRemovedFromApproval = wasRequested && !isSelected;
                  const employeesOnLeave = getEmployeesOnLeave(day);
                  const isMedicalBusy = hasMedicalLeave(day);
                  const isPast = dateStr < format(new Date(), 'yyyy-MM-dd');

                  return (
                    <button
                      key={dateStr}
                      onClick={() => !(isPast && !isSelected) && toggleDate(dateStr)}
                      disabled={isPast && !isSelected}
                      className={`relative p-3 rounded-lg text-sm font-semibold transition-all ${
                        isSelected
                          ? 'scale-105 border-2 border-white/60 bg-gradient-to-b from-emerald-300 via-green-400 to-emerald-700 text-white shadow-xl shadow-emerald-500/45'
                          : isPast
                          ? 'opacity-40 cursor-not-allowed text-cyan-600/50 dark:text-cyan-400/50'
                          : isRemovedFromApproval
                          ? 'border-2 border-emerald-400/80 bg-white/45 text-emerald-800 shadow-[inset_0_0_22px_rgba(52,211,153,0.35),0_10px_25px_rgba(16,185,129,0.22)] ring-1 ring-emerald-200/80 dark:bg-emerald-950/20 dark:text-emerald-200'
                          : employeesOnLeave.length > 0
                          ? isMedicalBusy
                          ? 'aero-glass text-red-600 hover:scale-105 dark:text-red-400'
                          : 'aero-glass text-orange-600 hover:scale-105 dark:text-orange-400'
                          : 'aero-glass text-cyan-700 hover:scale-105 dark:text-cyan-300'
                      }`}
                    >
                      {isRemovedFromApproval && (
                        <span className="pointer-events-none absolute inset-1 rounded-md border border-white/70" />
                      )}
                      <div>{format(day, 'd')}</div>
                      {employeesOnLeave.length > 0 && !isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white text-xs flex items-center justify-center font-bold shadow-lg">
                          {employeesOnLeave.length}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-4 mb-6 p-4 rounded-xl aero-glass">
              <Users className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <p className="text-sm text-cyan-700 dark:text-cyan-300 font-bold">
                {t('selectedDaysForApproval', { count: selectedDates.length })}
              </p>
            </div>

            {calendarError && (
              <p className="mb-4 rounded-xl border border-red-200/70 bg-red-50/85 px-4 py-3 text-sm font-black text-red-700 shadow-inner dark:border-red-400/25 dark:bg-red-950/30 dark:text-red-200">
                {calendarError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleConfirmPaidLeaveApproval}
                className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-b from-green-400 to-green-600 border-2 border-white/40 border-t-white/60 text-white font-bold transition-all hover:scale-105 shadow-xl shadow-green-500/50 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent h-1/2 pointer-events-none"></div>
                <span className="relative z-10">{t('confirmApproval')}</span>
              </button>
              <button
                onClick={closePaidLeaveCalendar}
                className="flex-1 px-6 py-3 rounded-xl aero-glass hover:scale-105 text-cyan-700 dark:text-cyan-300 font-bold transition-all"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="aero-glass rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-red-500 to-red-600 dark:from-red-400 dark:to-red-500 bg-clip-text text-transparent mb-4">{t('rejectRequestTitle')}</h3>
            <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium mb-4">
              {t('rejectionHelp')}
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all resize-none mb-4 text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
              placeholder={t('rejectionReasonPlaceholder')}
              autoFocus
            />
            {rejectionError && (
              <p className="mb-4 rounded-xl border border-red-200/70 bg-red-50/85 px-4 py-3 text-sm font-black text-red-700 shadow-inner dark:border-red-400/25 dark:bg-red-950/30 dark:text-red-200">
                {rejectionError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={submitRejection}
                className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-b from-red-400 to-red-600 border-2 border-white/40 border-t-white/60 text-white font-bold transition-all hover:scale-105 shadow-xl shadow-red-500/50 hover:shadow-2xl relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent h-1/2 pointer-events-none"></div>
                <span className="relative z-10">{t('confirmRejection')}</span>
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                  setSelectedRequest(null);
                }}
                className="flex-1 px-4 py-3 rounded-xl aero-glass hover:scale-105 text-cyan-700 dark:text-cyan-300 font-bold transition-all"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
