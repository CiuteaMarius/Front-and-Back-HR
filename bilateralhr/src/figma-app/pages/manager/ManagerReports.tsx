import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { downloadManagerReport, fetchEmployees, fetchManagerReport, subscribeToDataChanges } from '../../utils/data';
import type { Employee, ManagerReport, ManagerReportType } from '../../types';
import { PageInfoButton } from '../../components/PageInfoButton';
import { AeroIcon } from '../../components/AeroIcon';

const reportTypes: ManagerReportType[] = [
  'team-attendance',
  'overtime',
  'late-absences',
  'team-leaves',
  'resolved-requests',
  'availability',
];

const reportLabelKeys: Record<ManagerReportType, string> = {
  'team-attendance': 'teamAttendanceReport',
  overtime: 'overtimeReport',
  'late-absences': 'lateAbsencesReport',
  'team-leaves': 'teamLeavesReport',
  'resolved-requests': 'resolvedRequestsReport',
  availability: 'availabilityReport',
};

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultFromDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return dateOnly(date);
}

export function ManagerReports() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [reportType, setReportType] = useState<ManagerReportType>('team-attendance');
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(() => dateOnly(new Date()));
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [report, setReport] = useState<ManagerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;

    const loadEmployees = async () => {
      const items = await fetchEmployees();
      setEmployees(items.filter((employee) => employee.status === 'active' && employee.managerId === user.id));
    };

    loadEmployees();
    return subscribeToDataChanges(loadEmployees);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const loadReport = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchManagerReport(reportType, { from, to, employeeId: employeeId || undefined });
        if (!cancelled) setReport(data);
      } catch (err) {
        if (!cancelled) {
          setReport(null);
          setError(err instanceof Error ? err.message : t('reportLoadFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadReport();
    return () => {
      cancelled = true;
    };
  }, [reportType, from, to, employeeId, t]);

  const visibleRows = useMemo(() => report?.rows.slice(0, 250) ?? [], [report]);

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      await downloadManagerReport(reportType, { from, to, employeeId: employeeId || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reportExportFailed'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="relative space-y-6 pt-14">
      <PageInfoButton title={t('teamReports')} description={t('teamReportsInfo')} />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleDownload}
          disabled={loading || downloading}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white/60 bg-gradient-to-b from-emerald-300 via-cyan-400 to-blue-700 px-5 py-3 text-sm font-black text-white shadow-xl shadow-cyan-500/35 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="h-5 w-5" />
          {downloading ? t('downloading') : t('downloadExcel')}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {reportTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setReportType(type)}
            className={`cursor-pointer rounded-3xl border-2 p-4 text-left shadow-xl transition hover:-translate-y-0.5 ${
              reportType === type
                ? 'border-white/75 bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-700 text-white shadow-cyan-500/35'
                : 'border-cyan-200/65 bg-gradient-to-br from-white/75 via-cyan-50/65 to-blue-100/55 text-cyan-900 shadow-cyan-500/10 dark:border-cyan-500/25 dark:from-cyan-950/65 dark:via-blue-950/45 dark:to-slate-950/45 dark:text-cyan-100'
            }`}
          >
            <AeroIcon icon={FileSpreadsheet} size="small" variant={reportType === type ? 'emerald' : 'cyan'} className="mb-3" />
            <span className="block text-sm font-black">{t(reportLabelKeys[type])}</span>
          </button>
        ))}
      </div>

      <div className="aero-glass rounded-3xl border-2 border-white/55 p-5 shadow-xl shadow-cyan-500/10">
        <div className="grid gap-4 lg:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm font-black text-cyan-800 dark:text-cyan-200">{t('fromDate')}</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="aero-input w-full cursor-pointer" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-black text-cyan-800 dark:text-cyan-200">{t('toDate')}</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="aero-input w-full cursor-pointer" />
          </label>
          <label className="space-y-2 lg:col-span-2">
            <span className="text-sm font-black text-cyan-800 dark:text-cyan-200">{t('employee')}</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-600 dark:text-cyan-300" />
              <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="aero-input w-full cursor-pointer pl-10">
                <option value="">{t('allEmployees')}</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}{employee.employeeCode ? ` (${employee.employeeCode})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border-2 border-rose-300/70 bg-rose-100/75 p-4 text-sm font-black text-rose-800 shadow-lg dark:border-rose-400/30 dark:bg-rose-950/35 dark:text-rose-100">
          {error}
        </div>
      )}

      <section className="aero-glass rounded-3xl border-2 border-white/55 p-5 shadow-xl shadow-cyan-500/10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-cyan-950 dark:text-cyan-100">{t(reportLabelKeys[reportType])}</h2>
          <span className="rounded-full border border-white/60 bg-white/55 px-4 py-2 text-xs font-black text-cyan-800 shadow-inner dark:border-cyan-500/25 dark:bg-cyan-950/45 dark:text-cyan-100">
            {loading ? t('loading') : t('rowsCount', { count: report?.rows.length ?? 0 })}
          </span>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-lg font-black text-cyan-800 dark:text-cyan-100">{t('loading')}</div>
        ) : !report || visibleRows.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center text-lg font-black text-cyan-800 dark:text-cyan-100">{t('noReportRows')}</div>
        ) : (
          <div className="max-h-[34rem] overflow-auto rounded-2xl border border-cyan-200/70 bg-white/45 dark:border-cyan-700/35 dark:bg-cyan-950/25">
            <table className="w-full min-w-[54rem]">
              <thead className="sticky top-0 z-10 bg-cyan-50/95 backdrop-blur dark:bg-cyan-950/95">
                <tr>
                  {report.columns.map((column) => (
                    <th key={column.key} className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-200/60 dark:divide-cyan-800/45">
                {visibleRows.map((row, index) => (
                  <tr key={index} className="transition hover:bg-cyan-100/45 dark:hover:bg-cyan-900/35">
                    {report.columns.map((column) => (
                      <td key={column.key} className="px-4 py-3 text-sm font-bold text-cyan-900 dark:text-cyan-100">
                        {row[column.key] ?? '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
