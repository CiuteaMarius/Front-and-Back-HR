import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { CalendarDays, Check, X } from 'lucide-react';
import { mondayFirstLeadingDays, mondayFirstWeekdayKeys } from '../utils/calendar';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import {
  acceptRequestProposal,
  fetchLeaveDays,
  fetchRequests,
  markNotificationAsRead,
  rejectRequestProposal,
  respondToSalaryRaiseReview,
} from '../utils/data';
import { notificationText } from '../utils/notificationText';
import type { LeaveDay, Notification, Request, User } from '../types';

type NotificationModalProps = {
  notification: Notification;
  user: User;
  onClose: () => void;
  onChanged?: () => void;
};

function dateRangeLabel(dates: string[], noDatesLabel: string, formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string) {
  if (dates.length === 0) return noDatesLabel;
  if (dates.length === 1) return formatDate(new Date(`${dates[0]}T00:00:00`));

  return `${formatDate(new Date(`${dates[0]}T00:00:00`))} - ${formatDate(new Date(`${dates[dates.length - 1]}T00:00:00`))}`;
}

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

export function NotificationModal({ notification, user, onClose, onChanged }: NotificationModalProps) {
  const { t, formatDate } = useLanguage();
  const { formatMoney } = useCurrency();
  const display = notificationText(notification, t);
  const [request, setRequest] = useState<Request | null>(null);
  const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [salaryRecommendation, setSalaryRecommendation] = useState<'yes' | 'no'>('yes');
  const [salaryRecommendationComment, setSalaryRecommendationComment] = useState('');
  const [salaryResponseError, setSalaryResponseError] = useState('');

  useEffect(() => {
    markNotificationAsRead(notification.id, user.profileId || user.id).catch(() => undefined);
  }, [notification.id, user.id, user.profileId]);

  useEffect(() => {
    let mounted = true;

    const loadRequestDetails = async () => {
      if (!notification.relatedRequestId) return;

      const [requests, leaveDayItems] = await Promise.all([
        fetchRequests(),
        fetchLeaveDays(),
      ]);
      if (!mounted) return;

      const relatedRequest = requests.find((item) => item.id === notification.relatedRequestId) ?? null;
      setRequest(relatedRequest);
      setLeaveDays(
        leaveDayItems
          .map((leaveDay) => ({
            ...leaveDay,
            employeeIds: leaveDay.employeeIds.filter((employeeId) => employeeId === user.id),
          }))
          .filter((leaveDay) => leaveDay.employeeIds.length > 0),
      );
      if (relatedRequest?.startDate) {
        setCurrentMonth(new Date(`${relatedRequest.startDate}T00:00:00`));
      }
    };

    loadRequestDetails();

    return () => {
      mounted = false;
    };
  }, [notification.relatedRequestId, user.id]);

  const proposedDates = useMemo(() => request?.approvedDates ?? [], [request]);
  const requestedOrProposedDates = useMemo(
    () => proposedDates.length > 0 ? proposedDates : getDateRange(request?.startDate, request?.endDate),
    [proposedDates, request?.endDate, request?.startDate],
  );
  const canRespondToProposal = request?.status === 'in_review' && request.employeeId === user.id && proposedDates.length > 0;
  const canRespondToSalaryReview =
    request?.type === 'salary-raise' &&
    user.role === 'manager' &&
    request.managerId === user.id &&
    request.salaryReview?.requested &&
    !request.salaryReview?.recommendation;
  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const leadingDays = mondayFirstLeadingDays(currentMonth);

  const handleAcceptProposal = async () => {
    if (!request) return;
    setIsSubmitting(true);
    try {
      await acceptRequestProposal(request.id);
      onChanged?.();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectProposal = async () => {
    if (!request) return;
    setIsSubmitting(true);
    try {
      await rejectRequestProposal(request.id);
      onChanged?.();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSalaryReviewResponse = async () => {
    if (!request) return;
    setIsSubmitting(true);
    setSalaryResponseError('');
    try {
      await respondToSalaryRaiseReview(request.id, salaryRecommendation, salaryRecommendationComment);
      onChanged?.();
      onClose();
    } catch (error) {
      setSalaryResponseError(error instanceof Error ? error.message : t('salaryReviewResponseFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-cyan-950/35 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="aero-glass max-h-[calc(100vh-4rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border-2 border-white/60 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-cyan-600 dark:text-cyan-300">
              {formatDate(new Date(notification.date), { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <h2 className="mt-1 text-2xl font-black text-cyan-900 dark:text-cyan-100">
              {display.title}
            </h2>
            <p className="mt-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300">
              {display.body}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/60 bg-white/50 p-2 text-cyan-700 shadow-lg transition hover:scale-105 dark:bg-cyan-950/50 dark:text-cyan-200"
            aria-label={t('closeNotification')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {request && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-cyan-200/50 bg-white/40 p-4 dark:border-cyan-500/20 dark:bg-cyan-950/25">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                <div>
                  <p className="text-sm font-black text-cyan-900 dark:text-cyan-100">
                    {request.type === 'paid-leave' ? t('paidLeave') : request.type === 'medical-leave' ? t('medicalLeave') : request.type === 'hr-message' ? t('hrMessage') : t('salaryRaise')} - {request.employeeName}
                  </p>
                  <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                    {request.type === 'salary-raise'
                      ? `${t('requestedIncrease')}: ${formatMoney(Number(request.requestedSalaryNetIncrease ?? 0))}`
                      : `${canRespondToProposal ? t('proposedDates') : t('requested')}: ${dateRangeLabel(requestedOrProposedDates, t('noDatesSelected'), formatDate)}`}
                  </p>
                </div>
              </div>
              {request.decisionComment && (
                <p className="mt-3 rounded-xl bg-cyan-50/70 px-4 py-3 text-sm font-semibold text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-100">
                  {request.decisionComment}
                </p>
              )}
            </div>

            {request.type !== 'salary-raise' && request.type !== 'hr-message' && (
            <div className="rounded-2xl border border-cyan-200/50 bg-white/35 p-4 dark:border-cyan-500/20 dark:bg-cyan-950/25">
              <div className="mb-4 flex items-center justify-between">
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                  className="rounded-xl border border-white/60 bg-white/45 px-4 py-2 text-sm font-bold text-cyan-800 shadow-md transition hover:scale-105 dark:bg-cyan-950/35 dark:text-cyan-100"
                >
                  {t('previous')}
                </button>
                <h3 className="text-lg font-black text-cyan-900 dark:text-cyan-100">
                  {formatDate(currentMonth, { month: 'long', year: 'numeric' })}
                </h3>
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                  className="rounded-xl border border-white/60 bg-white/45 px-4 py-2 text-sm font-bold text-cyan-800 shadow-md transition hover:scale-105 dark:bg-cyan-950/35 dark:text-cyan-100"
                >
                  {t('next')}
                </button>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {mondayFirstWeekdayKeys.map((day) => (
                  <div key={day} className="py-2 text-center text-xs font-black text-cyan-700 dark:text-cyan-300">
                    {t(day)}
                  </div>
                ))}
                {leadingDays.map((_, index) => <div key={`empty-${index}`} />)}
                {days.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isProposed = requestedOrProposedDates.includes(dateStr);
                  const ownLeave = leaveDays.some((leaveDay) => leaveDay.date === dateStr);

                  return (
                    <div
                      key={dateStr}
                      className={`relative min-h-14 rounded-xl border text-center text-sm font-black transition ${
                        isProposed
                          ? 'border-emerald-200 bg-gradient-to-b from-emerald-300 to-emerald-600 text-white shadow-lg shadow-emerald-500/35'
                          : ownLeave
                          ? 'border-cyan-200 bg-cyan-100/70 text-cyan-800 shadow-inner dark:border-cyan-500/30 dark:bg-cyan-900/35 dark:text-cyan-100'
                          : 'border-white/50 bg-white/35 text-cyan-800 dark:bg-cyan-950/20 dark:text-cyan-200'
                      }`}
                    >
                      <div className="pt-4">{format(day, 'd')}</div>
                      {ownLeave && !isProposed && (
                        <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-cyan-500 shadow-md shadow-cyan-400/50" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {canRespondToProposal && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleAcceptProposal}
                  disabled={isSubmitting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-white/50 bg-gradient-to-b from-emerald-300 to-emerald-600 px-5 py-3 font-black text-white shadow-xl shadow-emerald-500/35 transition hover:scale-[1.02] disabled:opacity-60"
                >
                  <Check className="h-5 w-5" />
                  {t('acceptNewTerms')}
                </button>
                <button
                  onClick={handleRejectProposal}
                  disabled={isSubmitting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-white/50 bg-gradient-to-b from-red-300 to-red-600 px-5 py-3 font-black text-white shadow-xl shadow-red-500/30 transition hover:scale-[1.02] disabled:opacity-60"
                >
                  <X className="h-5 w-5" />
                  {t('declineProposal')}
                </button>
              </div>
            )}

            {canRespondToSalaryReview && (
              <div className="rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-white/55 to-cyan-50/50 p-4 dark:border-cyan-500/20 dark:from-cyan-950/35 dark:to-cyan-900/20">
                <p className="text-sm font-black text-cyan-900 dark:text-cyan-100">{t('managerRecommendation')}</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {(['yes', 'no'] as const).map((value) => (
                    <button
                      key={value}
                      onClick={() => setSalaryRecommendation(value)}
                      className={`rounded-xl border-2 px-4 py-3 font-black transition hover:scale-[1.02] ${
                        salaryRecommendation === value
                          ? value === 'yes'
                            ? 'border-white/60 bg-gradient-to-b from-emerald-300 to-emerald-600 text-white shadow-xl shadow-emerald-500/35'
                            : 'border-white/60 bg-gradient-to-b from-red-300 to-red-600 text-white shadow-xl shadow-red-500/30'
                          : 'border-white/50 bg-white/45 text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100'
                      }`}
                    >
                      {value === 'yes' ? t('yes') : t('no')}
                    </button>
                  ))}
                </div>
                <textarea
                  value={salaryRecommendationComment}
                  onChange={(event) => setSalaryRecommendationComment(event.target.value)}
                  rows={4}
                  className="mt-4 w-full resize-none rounded-xl aero-input text-cyan-900 dark:text-cyan-100"
                  placeholder={t('managerRecommendationPlaceholder')}
                />
                {salaryResponseError && (
                  <p className="mt-3 rounded-xl bg-red-50/75 px-4 py-3 text-sm font-black text-red-700 dark:bg-red-950/25 dark:text-red-200">
                    {salaryResponseError}
                  </p>
                )}
                <button
                  onClick={handleSalaryReviewResponse}
                  disabled={isSubmitting}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-white/50 bg-gradient-to-b from-cyan-300 to-blue-600 px-5 py-3 font-black text-white shadow-xl shadow-cyan-500/35 transition hover:scale-[1.02] disabled:opacity-60"
                >
                  <Check className="h-5 w-5" />
                  {t('sendManagerRecommendation')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
