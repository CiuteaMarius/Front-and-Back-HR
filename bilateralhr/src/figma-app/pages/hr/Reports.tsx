import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { fetchHrReports, subscribeToDataChanges } from '../../utils/data';
import type { HRReports } from '../../types';
import { PageInfoButton } from '../../components/PageInfoButton';

const colors = ['#22d3ee', '#38bdf8', '#34d399', '#f59e0b', '#fb7185', '#818cf8', '#14b8a6', '#a3e635'];
const tooltipStyle = {
  borderRadius: '16px',
  border: '1px solid var(--hr-report-tooltip-border)',
  background: 'var(--hr-report-tooltip-bg)',
  boxShadow: '0 18px 45px rgba(8, 145, 178, 0.18)',
  color: 'var(--hr-report-chart-text)',
};

export function Reports() {
  const { t, formatDate } = useLanguage();
  const { formatMoney } = useCurrency();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [reports, setReports] = useState<HRReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [workedView, setWorkedView] = useState<'employee' | 'department'>('employee');

  const yearOptions = useMemo(
    () => Array.from({ length: 8 }, (_, index) => currentYear - 5 + index),
    [currentYear],
  );

  useEffect(() => {
    let cancelled = false;
    const loadReports = async () => {
      setLoading(true);
      const data = await fetchHrReports(year);
      if (!cancelled) {
        setReports(data);
        setLoading(false);
      }
    };

    loadReports();
    const unsubscribe = subscribeToDataChanges(loadReports);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [year]);

  const tenureData = (reports?.tenureDistribution ?? []).map((item) => ({
    ...item,
    bucket: t(item.bucket),
  }));
  const requestResolutionData = (reports?.requestResolutionTime ?? []).map((item) => ({
    ...item,
    type: requestTypeLabel(item.type, t),
  }));
  const leavePeriodData = (reports?.busiestLeavePeriods ?? []).map((item) => ({
    ...item,
    dateLabel: formatDate(new Date(`${item.date}T00:00:00`), { day: 'numeric', month: 'short' }),
  }));
  const monthLabel = (month: number) => formatDate(new Date(year, Math.max(0, month - 1), 1), { month: 'short' });
  const monthlyNewHires = (reports?.monthlyNewHires ?? []).map((item) => ({ ...item, label: monthLabel(item.month) }));
  const employeeEvolution = (reports?.employeeEvolution ?? []).map((item) => ({ ...item, label: monthLabel(item.month) }));
  const monthlySalaryCosts = (reports?.monthlySalaryCosts ?? []).map((item) => ({ ...item, label: monthLabel(item.month) }));
  const monthlyLeaveUsage = (reports?.monthlyLeaveUsage ?? []).map((item) => ({ ...item, label: monthLabel(item.month) }));
  const overtimeMonthly = (reports?.overtimeMonthly ?? []).map((item) => ({ ...item, label: monthLabel(item.month) }));
  const absencesMonthly = (reports?.absencesMonthly ?? []).map((item) => ({ ...item, label: monthLabel(item.month) }));
  const salaryStats = reports?.salaryStats;
  const compactMoney = (value: number) => formatMoney(value, { compact: true, maximumFractionDigits: 1 });

  return (
    <div className="relative space-y-6 pt-14">
      <PageInfoButton title={t('reports')} description={t('hrReportsInfo')} />
      <section className="aero-glass hr-report-shell rounded-[2rem] border border-white/50 bg-white/35 p-5 shadow-xl shadow-cyan-500/20 backdrop-blur-xl dark:bg-cyan-950/20 sm:p-6">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="aero-input w-full cursor-pointer font-black sm:w-40"
          >
            {yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        {loading || !reports ? (
          <div className="aero-glass flex min-h-80 items-center justify-center rounded-3xl text-lg font-black text-cyan-800 dark:text-cyan-100">
            {t('loading')}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard label={t('minimumSalary')} gross={salaryStats?.minGross ?? 0} net={salaryStats?.minNet ?? 0} formatMoney={formatMoney} />
              <StatCard label={t('medianSalary')} gross={salaryStats?.medianGross ?? 0} net={salaryStats?.medianNet ?? 0} formatMoney={formatMoney} />
              <StatCard label={t('maximumSalary')} gross={salaryStats?.maxGross ?? 0} net={salaryStats?.maxNet ?? 0} formatMoney={formatMoney} />
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <ChartCard title={t('monthlyNewHires')}>
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={monthlyNewHires}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.18)" />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="hires" name={t('newHires')} fill="#22d3ee" radius={[12, 12, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

            <ChartCard title={t('employeeTotalEvolution')}>
              <ResponsiveContainer width="100%" height={270}>
                <LineChart data={employeeEvolution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.18)" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="total" name={t('employees')} stroke="#0284c7" strokeWidth={4} dot={{ r: 5, fill: '#67e8f9' }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t('departmentDistribution')}>
              <ResponsiveContainer width="100%" height={310}>
                <PieChart>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Pie data={reports.departmentDistribution} dataKey="employees" nameKey="department" outerRadius={105} innerRadius={48} paddingAngle={3}>
                    {reports.departmentDistribution.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t('tenureDistribution')}>
              <ResponsiveContainer width="100%" height={310}>
                <BarChart data={tenureData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.18)" />
                  <XAxis dataKey="bucket" />
                  <YAxis allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="employees" name={t('employees')} fill="#34d399" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t('monthlySalaryCosts')} className="xl:col-span-2">
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={monthlySalaryCosts}>
                  <defs>
                    <linearGradient id="grossGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.65} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.06} />
                    </linearGradient>
                    <linearGradient id="netGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.65} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.06} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.18)" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={compactMoney} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(Number(value))} />
                  <Legend />
                  <Area type="monotone" dataKey="gross" name={t('grossSalary')} stroke="#0284c7" strokeWidth={3} fill="url(#grossGradient)" />
                  <Area type="monotone" dataKey="net" name={t('netSalary')} stroke="#059669" strokeWidth={3} fill="url(#netGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t('averageSalaryByDepartment')}>
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={reports.averageSalaryByDepartment}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.18)" />
                  <XAxis dataKey="department" />
                  <YAxis tickFormatter={compactMoney} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatMoney(Number(value))} />
                  <Legend />
                  <Bar dataKey="gross" name={t('grossSalary')} fill="#38bdf8" radius={[10, 10, 0, 0]} />
                  <Bar dataKey="net" name={t('netSalary')} fill="#34d399" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t('monthlyLeaveUsage')}>
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={monthlyLeaveUsage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.18)" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="paid" stackId="leave" name={t('paidLeave')} fill="#10b981" radius={[10, 10, 0, 0]} />
                  <Bar dataKey="medical" stackId="leave" name={t('medicalLeave')} fill="#ef4444" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t('requestResolutionTime')}>
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={requestResolutionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.18)" />
                  <XAxis dataKey="type" />
                  <YAxis />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="days" name={t('days')} fill="#818cf8" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t('busiestLeavePeriods')}>
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={leavePeriodData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.18)" />
                  <XAxis dataKey="dateLabel" />
                  <YAxis allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="employees" name={t('employees')} fill="#f59e0b" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t('workedHours')}>
              <div className="mb-4 inline-flex rounded-2xl border-2 border-white/65 bg-white/45 p-1 shadow-lg shadow-cyan-500/10 dark:border-cyan-400/25 dark:bg-cyan-950/45">
                {(['employee', 'department'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setWorkedView(view)}
                    className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-black transition ${
                      workedView === view
                        ? 'bg-gradient-to-b from-cyan-300 to-blue-700 text-white shadow-md'
                        : 'text-cyan-800 hover:bg-white/65 dark:text-cyan-100 dark:hover:bg-cyan-900/55'
                    }`}
                  >
                    {view === 'employee' ? t('employees') : t('departments')}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={305}>
                <BarChart data={workedView === 'employee' ? reports.workedHoursByEmployee.slice(0, 10) : reports.workedHoursByDepartment}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.18)" />
                  <XAxis dataKey={workedView === 'employee' ? 'employee' : 'department'} hide={workedView === 'employee'} />
                  <YAxis />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="hours" name={t('hours')} fill="#14b8a6" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t('overtimeApproved')}>
              <ResponsiveContainer width="100%" height={370}>
                <BarChart data={overtimeMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.18)" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="total" name={t('total')} fill="#fb923c" radius={[10, 10, 0, 0]} />
                  <Bar dataKey="approved" name={t('approved')} fill="#22c55e" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t('unmotivatedAbsences')}>
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={absencesMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(14, 165, 233, 0.18)" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="absences" name={t('absences')} fill="#fb7185" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <TableCard title={t('leaveDaysRemaining')}>
              <ReportTable
                headers={[t('employee'), t('employeeCode'), t('used'), t('remaining')]}
                rows={reports.leaveBalances.map((item) => [
                  item.employee,
                  item.employeeCode ?? '-',
                  String(item.usedDays),
                  String(item.remainingDays),
                ])}
              />
            </TableCard>

            <TableCard title={t('workedHoursByEmployee')}>
              <ReportTable
                headers={[t('employee'), t('department'), t('hours')]}
                rows={reports.workedHoursByEmployee.map((item) => [
                  item.employee,
                  item.department,
                  formatNumber(item.hours),
                ])}
              />
            </TableCard>
          </div>
          </>
        )}
      </section>
    </div>
  );
}

function ChartCard({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`aero-glass rounded-3xl border-2 border-white/55 p-5 shadow-xl shadow-cyan-500/10 ${className}`}>
      <h2 className="mb-4 text-lg font-black text-cyan-950 dark:text-cyan-100">{title}</h2>
      {children}
    </section>
  );
}

function TableCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="aero-glass rounded-3xl border-2 border-white/55 p-5 shadow-xl shadow-cyan-500/10">
      <h2 className="mb-4 text-lg font-black text-cyan-950 dark:text-cyan-100">{title}</h2>
      {children}
    </section>
  );
}

function StatCard({ label, gross, net, formatMoney }: { label: string; gross: number; net: number; formatMoney: (value: number) => string }) {
  return (
    <div className="rounded-3xl border-2 border-white/75 bg-gradient-to-br from-white/95 via-cyan-100/90 to-blue-200/80 p-5 shadow-xl shadow-cyan-500/20 dark:border-cyan-300/35 dark:from-slate-900/95 dark:via-cyan-950/95 dark:to-blue-950/90 dark:shadow-cyan-950/45">
      <p className="text-sm font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-300">{label}</p>
      <p className="mt-3 text-2xl font-black text-cyan-950 dark:text-cyan-50">{formatMoney(gross)}</p>
      <p className="mt-1 font-bold text-emerald-700 dark:text-emerald-300">{formatMoney(net)}</p>
    </div>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-2xl border border-cyan-200/70 bg-white/40 dark:border-cyan-700/35 dark:bg-cyan-950/25">
      <table className="w-full min-w-[34rem]">
        <thead className="sticky top-0 bg-cyan-50/95 backdrop-blur dark:bg-cyan-950/95">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-cyan-200/60 dark:divide-cyan-700/35">
          {rows.map((row, index) => (
            <tr key={index} className="hover:bg-cyan-50/65 dark:hover:bg-cyan-900/35">
              {row.map((cell, cellIndex) => (
                <td key={`${index}-${cellIndex}`} className="px-4 py-3 text-sm font-bold text-cyan-900 dark:text-cyan-100">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function requestTypeLabel(type: string, t: (key: string) => string) {
  if (type === 'medical_leave') return t('medicalLeave');
  if (type === 'paid_leave') return t('paidLeave');
  if (type === 'salary_raise') return t('salaryRaise');
  if (type === 'other' || type === 'complaint') return t('hrMessage');
  return type;
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
