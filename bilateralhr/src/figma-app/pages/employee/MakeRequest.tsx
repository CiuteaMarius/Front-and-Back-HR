import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { ArrowRight, Calendar, ChevronLeft, ChevronRight, FileText, History, Send, Upload, X } from 'lucide-react';
import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import { mondayFirstLeadingDays, mondayFirstWeekdayKeys } from '../../utils/calendar';
import { createRequest, fetchAnnualLeaveBalance, fetchEmployees, fetchRequests, subscribeToDataChanges } from '../../utils/data';
import type { AnnualLeaveBalance } from '../../utils/data';
import { findLeaveDateOverlap, getLeaveDateRange, getLeaveDates } from '../../utils/leaveRules';
import type { Request } from '../../types';
import { PageInfoButton } from '../../components/PageInfoButton';

export function MakeRequest() {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const { theme } = useTheme();
  const { formatMoney, toBaseCurrency, toDisplayCurrency } = useCurrency();
  const [requestType, setRequestType] = useState<'medical-leave' | 'paid-leave' | 'salary-raise'>('medical-leave');
  const [details, setDetails] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [documents, setDocuments] = useState<File[]>([]);
  const [salaryIncrease, setSalaryIncrease] = useState('');
  const [currentNetSalary, setCurrentNetSalary] = useState<number | undefined>();
  const [annualLeaveBalance, setAnnualLeaveBalance] = useState<AnnualLeaveBalance | null>(null);
  const [selectedLeaveDates, setSelectedLeaveDates] = useState<string[]>([]);
  const [showLeaveCalendar, setShowLeaveCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [requests, setRequests] = useState<Request[]>([]);
  const [showRequestHistory, setShowRequestHistory] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadCurrentEmployeeDetails = async () => {
      if (!user) return;
      const employees = await fetchEmployees();
      const currentEmployee = employees.find((employee) =>
        employee.id === user.id || employee.profileId === user.profileId || employee.profileId === user.id,
      );
      const leaveBalance = currentEmployee
        ? await fetchAnnualLeaveBalance(currentEmployee.id)
        : null;

      if (mounted) {
        setCurrentNetSalary(currentEmployee?.salaryNet ?? currentEmployee?.salary ?? user.salary);
        setAnnualLeaveBalance(leaveBalance);
      }
    };

    loadCurrentEmployeeDetails();
    const unsubscribe = subscribeToDataChanges(loadCurrentEmployeeDetails);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    const loadRequests = async () => {
      setRequests(await fetchRequests());
    };

    loadRequests();
    return subscribeToDataChanges(loadRequests);
  }, []);

  useEffect(() => {
    if (requestType !== 'paid-leave') {
      setSelectedLeaveDates([]);
      setShowLeaveCalendar(false);
    }
  }, [requestType]);

  useEffect(() => {
    if (!submitMessage) return;
    const timeoutId = window.setTimeout(() => setSubmitMessage(''), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [submitMessage]);

  const requestTypeLabel = (type: Request['type']) => {
    if (type === 'medical-leave') return t('medicalLeave');
    if (type === 'paid-leave') return t('paidLeave');
    return t('salaryRaise');
  };

  const statusLabel = (status: Request['status']) => {
    if (status === 'approved') return t('approved');
    if (status === 'rejected') return t('rejected');
    if (status === 'in_review') return t('inReview');
    if (status === 'closed') return t('closed');
    return t('pending');
  };

  const formatRequestDates = (request: Request) => {
    const dates = getLeaveDates(request);
    if (dates.length === 0) return undefined;
    if (dates.length === 1) return dates[0];
    return `${dates[0]} - ${dates[dates.length - 1]} (${dates.length})`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    try {
      setIsSubmitting(true);
      setSubmitMessage('');
      setSubmitError('');
      const requestedSalaryNetIncrease = Number(salaryIncrease);
      if (requestType === 'salary-raise' && (!Number.isFinite(requestedSalaryNetIncrease) || requestedSalaryNetIncrease <= 0)) {
        setSubmitError(t('salaryIncreaseRequired'));
        return;
      }
      const manualLeaveDates = Array.from(new Set(selectedLeaveDates)).sort();
      const effectiveStartDate = requestType === 'paid-leave' && manualLeaveDates.length > 0
        ? manualLeaveDates[0]
        : startDate || undefined;
      const effectiveEndDate = requestType === 'paid-leave' && manualLeaveDates.length > 0
        ? manualLeaveDates[manualLeaveDates.length - 1]
        : endDate || undefined;

      if ((requestType === 'paid-leave' || requestType === 'medical-leave') && (!effectiveStartDate || !effectiveEndDate)) {
        setSubmitError(t('selectLeaveDates'));
        return;
      }
      if (requestType === 'medical-leave' && documents.length === 0) {
        setSubmitError(t('medicalDocumentRequired'));
        return;
      }
      const candidateLeaveDates = requestType === 'paid-leave' && manualLeaveDates.length > 0
        ? manualLeaveDates
        : getLeaveDateRange(effectiveStartDate, effectiveEndDate);
      if (
        requestType === 'paid-leave' &&
        annualLeaveBalance &&
        candidateLeaveDates.length > annualLeaveBalance.remainingDays
      ) {
        setSubmitError(t('paidLeaveDaysExceeded', {
          selected: candidateLeaveDates.length,
          available: annualLeaveBalance.remainingDays,
        }));
        return;
      }
      const overlap = requestType === 'paid-leave' || requestType === 'medical-leave'
        ? findLeaveDateOverlap(requests, user.id, candidateLeaveDates)
        : undefined;

      if (overlap) {
        setSubmitError(t('leaveOverlapError', {
          date: overlap.date,
          type: requestTypeLabel(overlap.request.type),
          status: statusLabel(overlap.request.status),
        }));
        return;
      }

      await createRequest({
        employeeId: user.id,
        employeeName: user.name,
        managerId: user.managerId,
        type: requestType,
        details,
        documents: documents.map((file) => file.name),
        documentFiles: documents,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        requestedDates: requestType === 'paid-leave' && manualLeaveDates.length > 0 ? manualLeaveDates : undefined,
        requestedSalaryNetIncrease: requestType === 'salary-raise' ? toBaseCurrency(requestedSalaryNetIncrease) : undefined,
      });
      setDetails('');
      setStartDate('');
      setEndDate('');
      setSelectedLeaveDates([]);
      setDocuments([]);
      setSalaryIncrease('');
      setSubmitMessage(t('requestSubmitted'));
      setRequests(await fetchRequests());
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setSubmitError(message === 'medicalDocumentRequired' ? t('medicalDocumentRequired') : message || t('requestSubmitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      setDocuments(Array.from(e.target.files));
    }
  };

  const toggleLeaveDate = (date: string) => {
    setSelectedLeaveDates((dates) =>
      dates.includes(date) ? dates.filter((item) => item !== date) : [...dates, date],
    );
  };

  if (!user) return null;

  const userRequests = requests
    .filter((request) => request.employeeId === user.id && request.type !== 'hr-message')
    .sort((first, second) => new Date(second.submittedDate).getTime() - new Date(first.submittedDate).getTime());
  const occupiedLeaveDates = new Map<string, Request[]>();
  userRequests
    .filter((request) =>
      (request.type === 'paid-leave' || request.type === 'medical-leave') &&
      ['pending', 'in_review', 'approved'].includes(request.status),
    )
    .forEach((request) => {
      getLeaveDates(request).forEach((date) => {
        occupiedLeaveDates.set(date, [...(occupiedLeaveDates.get(date) ?? []), request]);
      });
    });
  const sortedSelectedLeaveDates = Array.from(new Set(selectedLeaveDates)).sort();
  const calendarDays = eachDayOfInterval({
    start: startOfMonth(calendarMonth),
    end: endOfMonth(calendarMonth),
  });
  const calendarLeadingDays = mondayFirstLeadingDays(calendarMonth);
  const today = format(new Date(), 'yyyy-MM-dd');
  const currentNetSalaryDisplay = currentNetSalary === undefined ? undefined : toDisplayCurrency(currentNetSalary);
  const salaryIncreaseValue = Number(salaryIncrease) || 0;
  const selectedPaidLeaveDates = sortedSelectedLeaveDates.length > 0
    ? sortedSelectedLeaveDates
    : getLeaveDateRange(startDate || undefined, endDate || undefined);
  const selectedPaidLeaveDaysCount = selectedPaidLeaveDates.length;
  const noPaidLeaveDaysRemaining = requestType === 'paid-leave' &&
    annualLeaveBalance !== null &&
    annualLeaveBalance.remainingDays === 0;
  const exceedsPaidLeaveBalance = requestType === 'paid-leave' &&
    annualLeaveBalance !== null &&
    selectedPaidLeaveDaysCount > annualLeaveBalance.remainingDays;
  const projectedPaidLeaveBalance = annualLeaveBalance
    ? Math.max(0, annualLeaveBalance.remainingDays - selectedPaidLeaveDaysCount)
    : undefined;
  const salaryIncreasePercent = currentNetSalaryDisplay && salaryIncreaseValue > 0
    ? (salaryIncreaseValue / currentNetSalaryDisplay) * 100
    : 0;
  const newNetSalary = currentNetSalaryDisplay !== undefined && salaryIncreaseValue > 0
    ? currentNetSalaryDisplay + salaryIncreaseValue
    : undefined;
  const leaveCalendarDotClass = (request: Request) => {
    if (request.status !== 'approved') {
      return request.type === 'medical-leave'
        ? 'from-amber-300 to-orange-500 shadow-amber-500/35'
        : 'from-sky-300 to-cyan-600 shadow-cyan-500/35';
    }

    return request.type === 'medical-leave'
      ? 'from-red-300 to-red-600 shadow-red-500/35'
      : 'from-emerald-300 to-emerald-600 shadow-emerald-500/35';
  };

  const requestCards = [
    {
      type: 'medical-leave' as const,
      title: t('medicalLeave'),
      description: t('requiresDocumentation'),
      image: 'card_medical_leave.png',
      cropClass: 'scale-[1.05]',
      arrowClass: 'border-green-200 text-cyan-900 shadow-green-500/20',
      selectedClass: 'ring-4 ring-green-300/55 shadow-green-500/30',
      selectedDotClass: 'bg-gradient-to-br from-green-300 to-emerald-600 shadow-green-500/50',
    },
    {
      type: 'paid-leave' as const,
      title: t('paidLeave'),
      description: t('sentToManager'),
      image: 'card_paid_leave.png',
      cropClass: 'scale-[1.08]',
      arrowClass: 'border-blue-200 text-cyan-900 shadow-blue-500/20',
      selectedClass: 'ring-4 ring-blue-300/55 shadow-blue-500/30',
      selectedDotClass: 'bg-gradient-to-br from-sky-300 to-blue-600 shadow-blue-500/50',
    },
    {
      type: 'salary-raise' as const,
      title: t('salaryRaise'),
      description: t('sentToHr'),
      image: 'card_salary_raise.png',
      cropClass: 'scale-[1.09]',
      arrowClass: 'border-teal-200 text-cyan-900 shadow-teal-500/20',
      selectedClass: 'ring-4 ring-teal-300/55 shadow-teal-500/30',
      selectedDotClass: 'bg-gradient-to-br from-teal-300 to-cyan-600 shadow-teal-500/50',
    },
  ];

  return (
    <div className="relative max-w-5xl space-y-8 pt-14">
      <PageInfoButton title={t('makeRequest')} description={t('makeRequestInfo')} />
      {submitMessage && (
        <div className="fixed left-1/2 top-24 z-[90] w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border-2 border-white/70 bg-gradient-to-br from-emerald-100/95 via-white/90 to-cyan-100/95 px-5 py-4 pl-11 text-sm font-black text-emerald-800 shadow-2xl shadow-emerald-500/25 backdrop-blur-xl dark:border-emerald-300/25 dark:from-emerald-950/90 dark:via-cyan-950/85 dark:to-cyan-900/85 dark:text-emerald-100">
          <button
            type="button"
            onClick={() => setSubmitMessage('')}
            className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/65 p-1 text-emerald-700 shadow transition hover:scale-105 dark:bg-cyan-950/60 dark:text-emerald-100"
            aria-label={t('close')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {submitMessage}
        </div>
      )}

      <div className="fixed right-6 top-28 z-30 flex flex-col items-end gap-3">
        <button
          type="button"
          onClick={() => setShowRequestHistory((value) => !value)}
          className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/60 bg-gradient-to-b from-cyan-300 to-blue-600 px-4 py-3 font-black text-white shadow-xl shadow-cyan-500/35 transition hover:scale-[1.03]"
        >
          <History className="h-5 w-5" />
          {t('requestHistory')}
        </button>

        {showRequestHistory && (
          <div className="aero-glass max-h-[70vh] w-[min(88vw,360px)] overflow-y-auto rounded-2xl border-2 border-white/60 p-4 shadow-2xl">
            <h3 className="mb-3 bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-lg font-black text-transparent dark:from-cyan-300 dark:to-blue-300">
              {t('requestHistory')}
            </h3>
            <div className="space-y-3">
              {userRequests.length === 0 ? (
                <p className="text-sm font-bold text-cyan-700 dark:text-cyan-300">{t('noRequestsYet')}</p>
              ) : (
                userRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-cyan-200/60 bg-white/50 p-3 shadow-inner dark:border-cyan-500/25 dark:bg-cyan-950/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-blue-700 dark:text-white">{requestTypeLabel(request.type)}</p>
                        <p className="mt-1 text-xs font-bold text-cyan-700 dark:text-cyan-300">
                          {formatRequestDates(request) ?? format(new Date(request.submittedDate), 'yyyy-MM-dd')}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black text-white shadow ${
                        request.status === 'approved'
                          ? 'bg-emerald-500'
                          : request.status === 'rejected'
                          ? 'bg-red-500'
                          : request.status === 'in_review'
                          ? 'bg-amber-500'
                          : 'bg-cyan-600'
                      }`}>
                        {statusLabel(request.status)}
                      </span>
                    </div>
                    {request.details && (
                      <p className="mt-2 line-clamp-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300">{request.details}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Request Type Selection */}
      <div className="grid grid-cols-1 gap-7 py-3 md:grid-cols-3">
        {requestCards.map(({ type, title, description, image, cropClass, arrowClass, selectedClass, selectedDotClass }) => {
          const isSelected = requestType === type;
          const imageSrc = `/background/cards/requests_cards/${theme === 'dark' ? 'dark_theme' : 'light_theme'}/${image}`;

          return (
            <button
              key={type}
              onClick={() => setRequestType(type)}
              className={`relative h-[218px] cursor-pointer overflow-hidden rounded-[2rem] border border-white/70 bg-white/50 text-left shadow-xl shadow-slate-400/20 transition duration-200 hover:z-10 hover:scale-[1.045] hover:shadow-2xl hover:brightness-105 dark:border-cyan-400/20 dark:bg-cyan-950/35 ${isSelected ? selectedClass : ''}`}
            >
              <img
                src={imageSrc}
                alt=""
                className={`pointer-events-none absolute inset-0 h-full w-full origin-center object-cover object-top ${cropClass}`}
                draggable={false}
              />
              <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-b from-transparent via-transparent to-white/20 dark:to-cyan-950/20" />
              <div className="relative z-10 flex h-full flex-col px-7 pb-5 pt-7">
                <div className="mt-auto flex translate-y-3 items-end justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-black text-cyan-950 dark:text-cyan-100">{title}</h3>
                    <p className="mt-1 text-base font-medium text-cyan-900/80 dark:text-cyan-200/80">{description}</p>
                  </div>
                  <span className={`mb-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border shadow-lg backdrop-blur-md ${
                    isSelected ? `${selectedDotClass} border-white/70` : `bg-white/64 ${arrowClass}`
                  }`}>
                    {isSelected ? (
                      <span className="h-5 w-5 rounded-full bg-white/95 shadow-inner" />
                    ) : (
                      <ArrowRight className="h-6 w-6" />
                    )}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Request Form */}
      <div className="overflow-hidden rounded-[1.75rem] border-2 border-white/55 bg-white/35 shadow-2xl shadow-cyan-500/15 backdrop-blur-xl dark:border-cyan-500/20 dark:bg-cyan-950/20">
        <div className="border-b border-cyan-300/30 bg-white/35 p-6 dark:border-cyan-500/20 dark:bg-cyan-950/20">
          <div>
            <h2 className="text-xl font-bold text-cyan-900 dark:text-cyan-100">{t('requestDetails')}</h2>
            <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
              {requestType === 'medical-leave' && t('medicalLeaveRequest')}
              {requestType === 'paid-leave' && t('paidLeaveRequest')}
              {requestType === 'salary-raise' && t('salaryRaiseRequest')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {(requestType === 'paid-leave' || requestType === 'medical-leave') && (
            <div className="space-y-4">
              {requestType === 'paid-leave' && annualLeaveBalance && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-cyan-100/85 via-white/60 to-blue-100/80 p-4 shadow-lg shadow-cyan-500/15 dark:border-cyan-400/20 dark:from-cyan-950/60 dark:via-cyan-900/35 dark:to-blue-950/50">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">{t('annualLeaveTotal')}</p>
                    <p className="mt-1 text-2xl font-black text-cyan-950 dark:text-white">{annualLeaveBalance.totalDays}</p>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-emerald-100/85 via-white/60 to-cyan-100/80 p-4 shadow-lg shadow-emerald-500/15 dark:border-emerald-400/20 dark:from-emerald-950/50 dark:via-cyan-950/45 dark:to-cyan-900/35">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">{t('annualLeaveRemaining')}</p>
                    <p className="mt-1 text-2xl font-black text-emerald-900 dark:text-white">{annualLeaveBalance.remainingDays}</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                    {t('startDate')}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required={requestType === 'medical-leave' || sortedSelectedLeaveDates.length === 0}
                    className="aero-input w-full text-cyan-900 dark:text-cyan-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                    {t('endDate')}
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required={requestType === 'medical-leave' || sortedSelectedLeaveDates.length === 0}
                    className="aero-input w-full text-cyan-900 dark:text-cyan-100"
                  />
                </div>
              </div>

              {requestType === 'paid-leave' && (
                <div className="rounded-2xl border border-cyan-200/60 bg-white/45 p-4 shadow-inner dark:border-cyan-500/25 dark:bg-cyan-950/25">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-cyan-900 dark:text-cyan-100">{t('manualLeaveDays')}</p>
                      <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">{t('manualLeaveDaysSummary', { count: sortedSelectedLeaveDates.length })}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLeaveCalendar(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/50 bg-gradient-to-b from-cyan-300 to-blue-600 px-4 py-3 font-black text-white shadow-xl shadow-cyan-500/35 transition hover:scale-[1.02]"
                    >
                      <Calendar className="h-5 w-5" />
                      {t('selectDaysOnCalendar')}
                    </button>
                  </div>
                  {sortedSelectedLeaveDates.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sortedSelectedLeaveDates.map((date) => (
                        <span key={date} className="rounded-full border border-white/70 bg-cyan-100/80 px-3 py-1 text-xs font-black text-cyan-800 shadow-md dark:border-cyan-400/25 dark:bg-cyan-950/45 dark:text-cyan-100">
                          {date}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {requestType === 'salary-raise' && (
            <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-cyan-50/70 via-white/45 to-emerald-50/65 p-5 shadow-xl shadow-cyan-500/15 backdrop-blur-xl dark:border-cyan-400/20 dark:from-cyan-950/35 dark:via-cyan-900/20 dark:to-emerald-950/25">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-cyan-200/50 bg-white/55 p-4 shadow-inner dark:border-cyan-500/20 dark:bg-cyan-950/30">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-600 dark:text-cyan-300">{t('currentNetSalary')}</p>
                  <p className="mt-2 text-2xl font-black text-cyan-950 dark:text-cyan-100">
                    {currentNetSalary === undefined ? '-' : formatMoney(currentNetSalary)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                    {t('requestedNetIncrease')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={salaryIncrease}
                    onChange={(e) => setSalaryIncrease(e.target.value)}
                    required
                    className="aero-input w-full text-cyan-900 dark:text-cyan-100"
                    placeholder={t('salaryRaiseAmountPlaceholder')}
                  />
                  <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold text-cyan-800 dark:text-cyan-200">
                    <span className="rounded-full border border-white/60 bg-white/55 px-4 py-2 shadow-md dark:bg-cyan-950/35">
                      {t('raisePercent')}: {salaryIncreasePercent.toFixed(2)}%
                    </span>
                    <span className="rounded-full border border-white/60 bg-white/55 px-4 py-2 shadow-md dark:bg-cyan-950/35">
                      {t('newNetSalary')}: {newNetSalary === undefined ? '-' : formatMoney(toBaseCurrency(newNetSalary))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
              {t('details')}
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              required={requestType === 'salary-raise'}
              rows={5}
              className="aero-input w-full resize-none text-cyan-900 placeholder:text-cyan-800/70 dark:text-cyan-100 dark:placeholder:text-cyan-300/60"
              placeholder={
                requestType === 'medical-leave'
                  ? t('medicalDetailsPlaceholder')
                  : requestType === 'paid-leave'
                  ? t('paidLeaveDetailsPlaceholder')
                  : t('salaryRaiseDetailsPlaceholder')
              }
            />
          </div>

          {requestType === 'medical-leave' && (
            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('medicalDocumentsSupported')} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-cyan-300/50 bg-white/45 px-6 py-4 transition hover:border-cyan-500 hover:bg-white/60 dark:border-cyan-500/30 dark:bg-cyan-900/20 dark:hover:border-cyan-400"
                >
                  <Upload className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  <span className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">
                    {t('clickToUploadDocuments')}
                  </span>
                </label>
              </div>
              {documents.length > 0 && (
                <div className="mt-3 space-y-2">
                  {documents.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 rounded-lg bg-gradient-to-r from-blue-400 to-cyan-500 border-2 border-white/40 shadow-xl shadow-cyan-500/50">
                      <FileText className="w-4 h-4 text-white" />
                      <span className="text-sm text-white font-bold">{file.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {requestType === 'paid-leave' && annualLeaveBalance && selectedPaidLeaveDaysCount > 0 && !exceedsPaidLeaveBalance && (
            <p className="rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 text-sm font-black text-emerald-800 shadow-inner dark:border-emerald-400/25 dark:bg-emerald-950/30 dark:text-emerald-200">
              {t('annualLeaveAfterApproval', { count: projectedPaidLeaveBalance ?? 0 })}
            </p>
          )}
          {noPaidLeaveDaysRemaining && (
            <p className="rounded-xl border border-amber-300/70 bg-amber-50/90 px-4 py-3 text-sm font-black text-amber-800 shadow-inner dark:border-amber-400/30 dark:bg-amber-950/35 dark:text-amber-100">
              {t('noPaidLeaveDaysRemaining')}
            </p>
          )}
          {!noPaidLeaveDaysRemaining && exceedsPaidLeaveBalance && annualLeaveBalance && (
            <p className="rounded-xl border border-amber-300/70 bg-amber-50/90 px-4 py-3 text-sm font-black text-amber-800 shadow-inner dark:border-amber-400/30 dark:bg-amber-950/35 dark:text-amber-100">
              {t('paidLeaveDaysExceeded', {
                selected: selectedPaidLeaveDaysCount,
                available: annualLeaveBalance.remainingDays,
              })}
            </p>
          )}

          <div className="flex gap-4 pt-4">
            {!noPaidLeaveDaysRemaining && !exceedsPaidLeaveBalance && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="relative flex items-center gap-2 overflow-hidden rounded-xl border-2 border-white/40 border-t-white/60 bg-gradient-to-b from-cyan-400 to-blue-600 px-6 py-3 font-bold text-white shadow-xl shadow-cyan-500/50 transition hover:brightness-110 disabled:opacity-60"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                <Send className="w-5 h-5 relative z-10" />
                <span className="relative z-10">{isSubmitting ? t('submitting') : t('submitRequest')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDetails('');
                setStartDate('');
                setEndDate('');
                setSelectedLeaveDates([]);
                setDocuments([]);
                setSalaryIncrease('');
              }}
              className="relative overflow-hidden rounded-xl border-2 border-white/40 border-t-white/60 bg-white/60 px-6 py-3 font-bold text-cyan-800 shadow-xl shadow-cyan-500/20 transition hover:bg-white/80 dark:bg-cyan-950/45 dark:text-cyan-100"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
              <span className="relative z-10">{t('cancel')}</span>
            </button>
          </div>
          {submitError && (
            <p className="rounded-xl border border-red-200/70 bg-red-50/85 px-4 py-3 text-sm font-black text-red-700 shadow-inner dark:border-red-400/25 dark:bg-red-950/30 dark:text-red-200">
              {submitError}
            </p>
          )}
        </form>
      </div>

      {showLeaveCalendar && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowLeaveCalendar(false)}
        >
          <div
            className="aero-glass max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border-2 border-white/50 p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-2xl font-black text-transparent dark:from-cyan-300 dark:to-blue-300">
                  {t('selectPaidLeaveDays')}
                </h3>
                <p className="mt-1 text-sm font-bold text-cyan-700 dark:text-cyan-300">
                  {t('manualLeaveDaysSummary', { count: sortedSelectedLeaveDates.length })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLeaveCalendar(false)}
                className="rounded-full border border-white/60 bg-white/50 p-2 text-cyan-700 shadow-lg transition hover:scale-105 dark:bg-cyan-950/50 dark:text-cyan-200"
                aria-label={t('close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-5 flex items-center justify-between rounded-2xl border border-cyan-200/60 bg-white/40 p-3 shadow-inner dark:border-cyan-500/20 dark:bg-cyan-950/25">
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                className="rounded-xl aero-glass px-4 py-2 font-black text-cyan-700 transition hover:scale-105 dark:text-cyan-200"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h4 className="text-lg font-black text-cyan-900 dark:text-cyan-100">
                {formatDate(calendarMonth, { month: 'long', year: 'numeric' })}
              </h4>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                className="rounded-xl aero-glass px-4 py-2 font-black text-cyan-700 transition hover:scale-105 dark:text-cyan-200"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-2 rounded-2xl border border-cyan-200/60 bg-white/40 p-3 shadow-inner dark:border-cyan-500/20 dark:bg-cyan-950/25 sm:grid-cols-2">
              {[
                { label: `${t('paidLeave')} - ${t('pending')}`, className: 'from-sky-300 to-cyan-600' },
                { label: `${t('medicalLeave')} - ${t('pending')}`, className: 'from-amber-300 to-orange-500' },
                { label: `${t('paidLeave')} - ${t('approved')}`, className: 'from-emerald-300 to-emerald-600' },
                { label: `${t('medicalLeave')} - ${t('approved')}`, className: 'from-red-300 to-red-600' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className={`h-4 w-4 rounded-full border border-white/70 bg-gradient-to-b ${item.className} shadow-lg`} />
                  <span className="text-xs font-black text-cyan-800 dark:text-cyan-100">{item.label}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {mondayFirstWeekdayKeys.map((day) => (
                <div key={day} className="py-2 text-center text-xs font-black text-cyan-700 dark:text-cyan-300">
                  {t(day)}
                </div>
              ))}
              {calendarLeadingDays.map((_, index) => <div key={`empty-${index}`} />)}
              {calendarDays.map((day) => {
                const date = format(day, 'yyyy-MM-dd');
                const isSelected = sortedSelectedLeaveDates.includes(date);
                const isPast = date < today;
                const occupiedRequests = occupiedLeaveDates.get(date) ?? [];
                const isUnavailable = occupiedRequests.length > 0;
                const isDisabled = isUnavailable || (isPast && !isSelected);
                const occupiedLabel = occupiedRequests
                  .map((request) => `${requestTypeLabel(request.type)} - ${statusLabel(request.status)}`)
                  .join(', ');

                return (
                  <button
                    key={date}
                    type="button"
                    disabled={isDisabled}
                    title={occupiedLabel || undefined}
                    onClick={() => !isDisabled && toggleLeaveDate(date)}
                    className={`relative min-h-20 rounded-2xl border-2 p-3 text-sm font-black transition-all ${
                      isUnavailable
                        ? 'cursor-not-allowed border-cyan-300/45 bg-white/35 text-cyan-700 shadow-inner dark:border-cyan-500/30 dark:bg-cyan-950/35 dark:text-cyan-200'
                        : isSelected
                        ? 'scale-[1.03] border-white/70 bg-gradient-to-b from-sky-300 via-cyan-400 to-blue-700 text-white shadow-xl shadow-cyan-500/45'
                        : isPast
                        ? 'cursor-not-allowed border-cyan-200/30 bg-white/25 text-cyan-600/45 opacity-50 dark:border-cyan-700/20 dark:text-cyan-300/40'
                        : 'aero-glass border-cyan-200/60 text-cyan-800 hover:scale-[1.03] dark:border-cyan-500/25 dark:text-cyan-100'
                    }`}
                  >
                    <span className="relative z-10">{format(day, 'd')}</span>
                    {isUnavailable && (
                      <span className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                        {occupiedRequests.map((request) => (
                          <span
                            key={`${request.id}-${date}`}
                            className={`h-3 w-3 rounded-full border border-white/70 bg-gradient-to-b shadow-lg ${leaveCalendarDotClass(request)}`}
                          />
                        ))}
                      </span>
                    )}
                    {isSelected && (
                      <span className="pointer-events-none absolute inset-2 rounded-xl border border-white/70 shadow-[inset_0_0_18px_rgba(255,255,255,0.45)]" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowLeaveCalendar(false)}
                className="flex-1 rounded-xl border-2 border-white/50 bg-gradient-to-b from-emerald-300 to-emerald-600 px-6 py-3 font-black text-white shadow-xl shadow-emerald-500/35 transition hover:scale-[1.02]"
              >
                {t('useSelectedDays')}
              </button>
              <button
                type="button"
                onClick={() => setSelectedLeaveDates([])}
                className="flex-1 rounded-xl aero-glass px-6 py-3 font-black text-cyan-800 transition hover:scale-[1.02] dark:text-cyan-100"
              >
                {t('clearSelection')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
