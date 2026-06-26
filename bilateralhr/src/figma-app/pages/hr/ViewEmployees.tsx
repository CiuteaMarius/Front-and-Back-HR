import { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Search, Filter, Edit, FileText, UserX, Save, Eye, Copy, CalendarClock } from 'lucide-react';
import { attachEmployeeLoginAccount, fetchAvailableLoginAccounts, fetchDepartments, fetchEmployees, splitEmployeeName, subscribeToDataChanges, terminateEmployee, updateEmployee } from '../../utils/data';
import type { AvailableLoginAccount } from '../../utils/data';
import type { Department, Employee } from '../../types';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { EmployeeScheduleModal } from '../../components/EmployeeScheduleModal';
import { EmployeeDocumentsModal } from '../../components/EmployeeDocumentsModal';
import { PageInfoButton } from '../../components/PageInfoButton';

type EditForm = {
  firstName: string;
  lastName: string;
  email: string;
  profileId: string;
  departmentId: string;
  position: string;
  status: string;
  salaryGross: string;
  salaryTaxRate: string;
  workNormHours: string;
  hireDate: string;
  annualLeaveDays: string;
  managerId: string;
};

type SortBy = 'name' | 'updatedAt' | 'hireDate' | 'salary';
type SortDirection = 'asc' | 'desc';

export function ViewEmployees() {
  const { t, formatDate } = useLanguage();
  const { formatMoney, toDisplayCurrency, toBaseCurrency } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [availableLoginAccounts, setAvailableLoginAccounts] = useState<AvailableLoginAccount[]>([]);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [schedulingEmployee, setSchedulingEmployee] = useState<Employee | null>(null);
  const [documentEmployee, setDocumentEmployee] = useState<Employee | null>(null);
  const [employeeToFire, setEmployeeToFire] = useState<Employee | null>(null);
  const [isFiringEmployee, setIsFiringEmployee] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    firstName: '',
    lastName: '',
    email: '',
    profileId: '',
    departmentId: '',
    position: '',
    status: 'active',
    salaryGross: '',
    salaryTaxRate: '40',
    workNormHours: '8',
    hireDate: '',
    annualLeaveDays: '20',
    managerId: '',
  });
  const [managerSearch, setManagerSearch] = useState('');
  const [showManagerOptions, setShowManagerOptions] = useState(false);
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [showDepartmentOptions, setShowDepartmentOptions] = useState(false);
  const [limitManagersToDepartment, setLimitManagersToDepartment] = useState(false);
  const [editLoginMode, setEditLoginMode] = useState<'none' | 'attach' | 'create'>('none');
  const [editExistingProfileId, setEditExistingProfileId] = useState('');
  const [editTemporaryPassword, setEditTemporaryPassword] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const [employeeItems, departmentItems, loginAccounts] = await Promise.all([
        fetchEmployees(),
        fetchDepartments(),
        fetchAvailableLoginAccounts(),
      ]);

      setEmployees(employeeItems);
      setDepartments(departmentItems);
      setAvailableLoginAccounts(loginAccounts);
    };

    loadData();
    return subscribeToDataChanges(loadData);
  }, []);

  const salaryMinBase = salaryMin ? toBaseCurrency(Number(salaryMin)) : undefined;
  const salaryMaxBase = salaryMax ? toBaseCurrency(Number(salaryMax)) : undefined;
  const editableMoneyValue = (amount: number) => {
    const value = toDisplayCurrency(amount);
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         emp.id.includes(searchQuery) ||
                         (emp.employeeCode ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = !selectedDepartment || emp.department === selectedDepartment;
    const matchesSalary = (salaryMinBase === undefined || emp.salary >= salaryMinBase) &&
                         (salaryMaxBase === undefined || emp.salary <= salaryMaxBase);
    return matchesSearch && matchesDept && matchesSalary;
  });

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    let comparison = 0;

    if (sortBy === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortBy === 'salary') {
      comparison = a.salary - b.salary;
    } else if (sortBy === 'hireDate') {
      comparison = new Date(a.hireDate).getTime() - new Date(b.hireDate).getTime();
    } else {
      comparison = new Date(a.updatedAt || a.hireDate).getTime() - new Date(b.updatedAt || b.hireDate).getTime();
    }

    return comparison * direction;
  });

  const openEditEmployee = (employee: Employee) => {
    const { firstName, lastName } = splitEmployeeName(employee.name);
    const departmentId = employee.departmentId || departments.find((dept) => dept.name === employee.department)?.id || '';
    const inferredTaxRate = employee.salary > 0 && employee.salaryNet !== undefined
      ? Math.max(0, Math.min(100, (1 - employee.salaryNet / employee.salary) * 100)).toFixed(2)
      : '40';

    setEditingEmployee(employee);
    setEditForm({
      firstName,
      lastName,
      email: employee.email,
      profileId: employee.profileId ?? '',
      departmentId,
      position: employee.position ?? '',
      status: employee.status === 'default' ? 'active' : employee.status,
      salaryGross: editableMoneyValue(employee.salary),
      salaryTaxRate: inferredTaxRate,
      workNormHours: String(employee.workNormHours ?? 8),
      hireDate: employee.hireDate.slice(0, 10),
      annualLeaveDays: String(employee.annualLeaveDays ?? 20),
      managerId: employee.managerId ?? '',
    });
    setManagerSearch(employee.managerName ?? '');
    setDepartmentSearch(departmentId ? employee.department : '');
    setShowManagerOptions(false);
    setShowDepartmentOptions(false);
    setLimitManagersToDepartment(false);
    setEditLoginMode('none');
    setEditExistingProfileId('');
    setEditTemporaryPassword('');
  };

  const handleEditChange = (field: keyof EditForm, value: string) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const editSalaryGross = Number(editForm.salaryGross) || 0;
  const editTaxRate = Number(editForm.salaryTaxRate) || 0;
  const editSalaryNet = Math.max(0, editSalaryGross * (1 - editTaxRate / 100));
  const departmentLabel = (employee: Employee) => employee.departmentId ? employee.department : t('noDepartment');

  const getStatusClass = (status: Employee['status']) => {
    if (status === 'active') return 'bg-gradient-to-r from-green-400 to-emerald-600';
    if (status === 'suspended') return 'bg-gradient-to-r from-orange-400 to-amber-600';
    if (status === 'fired') return 'bg-gradient-to-r from-red-400 to-red-600';
    return 'bg-gradient-to-r from-slate-400 to-slate-600';
  };

  const managerOptions = employees.filter((employee) => {
    if (editingEmployee && employee.id === editingEmployee.id) return false;
    const selectedDepartment = departments.find((department) => department.id === editForm.departmentId);
    if (limitManagersToDepartment && selectedDepartment && employee.department !== selectedDepartment.name) return false;
    const query = managerSearch.toLowerCase();
    return !query ||
      employee.name.toLowerCase().includes(query) ||
      (employee.employeeCode ?? '').toLowerCase().includes(query);
  });

  const handleManagerSearch = (value: string) => {
    setManagerSearch(value);
    setShowManagerOptions(true);
    const selectedManager = managerOptions.find((employee) => {
      const label = `${employee.name}${employee.employeeCode ? ` (${employee.employeeCode})` : ''}`;
      return label === value;
    });
    handleEditChange('managerId', selectedManager?.id ?? '');
  };

  const selectManager = (employee: Employee) => {
    setManagerSearch(`${employee.name}${employee.employeeCode ? ` (${employee.employeeCode})` : ''}`);
    handleEditChange('managerId', employee.id);
    setShowManagerOptions(false);
  };

  const departmentOptions = departments.filter((department) =>
    department.name.toLowerCase().includes(departmentSearch.toLowerCase()),
  );

  const selectDepartment = (department: Department) => {
    setDepartmentSearch(department.name);
    handleEditChange('departmentId', department.id);
    setShowDepartmentOptions(false);
  };

  const clearDepartment = () => {
    setDepartmentSearch(t('noDepartment'));
    handleEditChange('departmentId', '__none__');
    setShowDepartmentOptions(false);
  };

  const selectEditExistingAccount = (profileId: string) => {
    const account = availableLoginAccounts.find((item) => item.id === profileId);
    setEditExistingProfileId(profileId);
    if (account) {
      handleEditChange('email', account.email);
    }
  };

  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    if (!editingEmployee) return;

    await updateEmployee(editingEmployee.id, {
      firstName: editForm.firstName.trim(),
      lastName: editForm.lastName.trim(),
      email: editForm.email.trim(),
      ...(editingEmployee.profileId ? { profileId: editingEmployee.profileId } : {}),
      ...(editForm.departmentId === '__none__'
        ? { departmentId: null }
        : editForm.departmentId
        ? { departmentId: editForm.departmentId }
        : {}),
      position: editForm.position.trim(),
      status: editForm.status as 'active' | 'fired' | 'suspended',
      salaryGross: toBaseCurrency(Number(editForm.salaryGross)),
      salaryNet: toBaseCurrency(Math.round(editSalaryNet * 100) / 100),
      workNormHours: Number(editForm.workNormHours),
      hireDate: editForm.hireDate,
      annualLeaveDays: Number(editForm.annualLeaveDays),
      managerId: editForm.managerId.trim(),
    });
    if (!editingEmployee.profileId && editLoginMode === 'attach') {
      await attachEmployeeLoginAccount(editingEmployee.id, {
        loginMode: 'attach',
        existingProfileId: editExistingProfileId,
      });
    } else if (!editingEmployee.profileId && editLoginMode === 'create') {
      await attachEmployeeLoginAccount(editingEmployee.id, {
        loginMode: 'create',
        temporaryPassword: editTemporaryPassword,
      });
    }
    setEditingEmployee(null);
  };

  return (
    <div className="relative space-y-6 pt-14">
      <PageInfoButton title={t('viewEmployees')} description={t('viewEmployeesInfo')} />
      <section className="space-y-5 rounded-[2rem] border border-white/45 bg-white/20 p-4 shadow-2xl shadow-cyan-900/10 backdrop-blur-md dark:border-cyan-300/20 dark:bg-cyan-950/18 sm:p-5">

      {/* Filters */}
      <div className="aero-glass p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/75 bg-gradient-to-b from-white/90 via-cyan-100/85 to-sky-400/80 shadow-lg shadow-cyan-500/25 dark:border-cyan-200/35 dark:from-cyan-100/25 dark:via-cyan-500/45 dark:to-blue-700/75">
            <Filter className="w-5 h-5 text-cyan-800 drop-shadow-[0_1px_0_rgba(255,255,255,0.75)] dark:text-cyan-50" />
          </div>
          <h3 className="font-bold text-cyan-800 dark:text-cyan-200">{t('filters')}</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchByNameOrCode')}
              className="aero-input w-full pl-10"
            />
          </div>
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="aero-input"
          >
            <option value="">{t('allDepartments')}</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.name}>{dept.name}</option>
            ))}
          </select>
          <input
            type="number"
            value={salaryMin}
            onChange={(e) => setSalaryMin(e.target.value)}
            placeholder={t('minGrossSalary')}
            className="aero-input"
          />
          <input
            type="number"
            value={salaryMax}
            onChange={(e) => setSalaryMax(e.target.value)}
            placeholder={t('maxGrossSalary')}
            className="aero-input"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="aero-input"
          >
            <option value="name">{t('sortAlphabetic')}</option>
            <option value="updatedAt">{t('sortLastModified')}</option>
            <option value="hireDate">{t('sortHireDate')}</option>
            <option value="salary">{t('sortGrossSalary')}</option>
          </select>
          <select
            value={sortDirection}
            onChange={(e) => setSortDirection(e.target.value as SortDirection)}
            className="aero-input"
          >
            <option value="asc">{t('ascending')}</option>
            <option value="desc">{t('descending')}</option>
          </select>
        </div>
      </div>

      {/* Employee Table */}
      <div className="aero-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20 border-b-2 border-cyan-300/30 dark:border-cyan-500/20">
              <tr>
                <th className="px-3 py-4 text-left text-xs font-bold text-cyan-800 dark:text-cyan-200 uppercase tracking-wider">{t('code')}</th>
                <th className="px-3 py-4 text-left text-xs font-bold text-cyan-800 dark:text-cyan-200 uppercase tracking-wider">{t('name')}</th>
                <th className="px-3 py-4 text-left text-xs font-bold text-cyan-800 dark:text-cyan-200 uppercase tracking-wider">{t('department')}</th>
                <th className="px-3 py-4 text-left text-xs font-bold text-cyan-800 dark:text-cyan-200 uppercase tracking-wider">{t('position')}</th>
                <th className="px-3 py-4 text-left text-xs font-bold text-cyan-800 dark:text-cyan-200 uppercase tracking-wider">{t('status')}</th>
                <th className="px-3 py-4 text-left text-xs font-bold text-cyan-800 dark:text-cyan-200 uppercase tracking-wider">{t('grossSalary')}</th>
                <th className="px-3 py-4 text-left text-xs font-bold text-cyan-800 dark:text-cyan-200 uppercase tracking-wider">{t('netSalary')}</th>
                <th className="px-3 py-4 text-left text-xs font-bold text-cyan-800 dark:text-cyan-200 uppercase tracking-wider">{t('hireDate')}</th>
                <th className="px-3 py-4 text-left text-xs font-bold text-cyan-800 dark:text-cyan-200 uppercase tracking-wider">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-300/30 dark:divide-cyan-500/20">
              {sortedEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-gradient-to-r hover:from-cyan-50/50 hover:to-blue-50/50 dark:hover:from-cyan-900/20 dark:hover:to-blue-900/20 transition-all">
                  <td className="px-3 py-4 text-sm text-cyan-700 dark:text-cyan-300 font-medium">#{employee.employeeCode ?? '-'}</td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-3">
                      <ProfileAvatar name={employee.name} className="h-10 w-10 text-xs" />
                      <div>
                        <p className="font-bold text-cyan-800 dark:text-cyan-200">{employee.name}</p>
                        <p className="text-xs text-cyan-600 dark:text-cyan-400">{employee.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <span className="aero-department-badge">
                      {departmentLabel(employee)}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-sm font-bold text-cyan-800 dark:text-cyan-200">{employee.position || '-'}</td>
                  <td className="px-3 py-4">
                    <span className={`px-3 py-1 rounded-full border-2 border-white/40 text-white text-xs font-bold shadow-lg ${getStatusClass(employee.status)}`}>
                      {t(employee.status)}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-sm font-bold text-cyan-800 dark:text-cyan-200">{formatMoney(employee.salary)}</td>
                  <td className="px-3 py-4 text-sm font-bold text-cyan-800 dark:text-cyan-200">
                    {employee.salaryNet === undefined ? '-' : formatMoney(employee.salaryNet)}
                  </td>
                  <td className="px-3 py-4 text-sm text-cyan-700 dark:text-cyan-300 font-medium">
                    {formatDate(new Date(employee.hireDate))}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditEmployee(employee)}
                        className="relative p-2 rounded-xl bg-gradient-to-b from-blue-400 to-blue-600 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-blue-500/50 hover:scale-110 transition-all overflow-hidden group"
                        title={t('edit')}
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                        <Edit className="w-4 h-4 relative z-10" />
                      </button>
                      <button
                        disabled={employee.status === 'fired'}
                        onClick={() => employee.status !== 'fired' && setSchedulingEmployee(employee)}
                        className="relative p-2 rounded-xl bg-gradient-to-b from-amber-300 to-orange-600 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-orange-500/40 hover:scale-110 transition-all overflow-hidden group disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-500 disabled:shadow-none disabled:hover:scale-100"
                        title={employee.status === 'fired' ? t('scheduleUnavailableForFiredEmployee') : t('configureSchedule')}
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                        <CalendarClock className="w-4 h-4 relative z-10" />
                      </button>
                      <button
                        onClick={() => setDocumentEmployee(employee)}
                        className="relative p-2 rounded-xl bg-gradient-to-b from-green-400 to-green-600 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-green-500/50 hover:scale-110 transition-all overflow-hidden group"
                        title={t('viewDocuments')}
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                        <FileText className="w-4 h-4 relative z-10" />
                      </button>
                      <button
                        onClick={() => setViewingEmployee(employee)}
                        className="relative p-2 rounded-xl bg-gradient-to-b from-cyan-400 to-sky-600 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-cyan-500/50 hover:scale-110 transition-all overflow-hidden group"
                        title={t('viewDetails')}
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                        <Eye className="w-4 h-4 relative z-10" />
                      </button>
                      <button
                        disabled={employee.status === 'fired'}
                        className="relative p-2 rounded-xl bg-gradient-to-b from-red-400 to-red-600 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-red-500/50 hover:scale-110 transition-all overflow-hidden group disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-500 disabled:shadow-none disabled:hover:scale-100"
                        title={employee.status === 'fired' ? t('employeeAlreadyFired') : t('fireEmployee')}
                        onClick={() => employee.status !== 'fired' && setEmployeeToFire(employee)}
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                        <UserX className="w-4 h-4 relative z-10" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20 border-t border-cyan-300/30 dark:border-cyan-500/20">
          <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">
            {t('showingEmployees', { shown: filteredEmployees.length, total: employees.length })}
          </p>
        </div>
      </div>
      </section>

      {editingEmployee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-cyan-950/30 backdrop-blur-sm px-4"
          onClick={() => setEditingEmployee(null)}
        >
          <form
            onSubmit={handleSaveEmployee}
            className="aero-glass max-w-6xl w-full p-6 space-y-6 overflow-visible border-2 border-white/50 shadow-2xl shadow-cyan-500/40"
            onClick={(e) => {
              e.stopPropagation();
              setShowDepartmentOptions(false);
              setShowManagerOptions(false);
            }}
          >
            <div>
              <h2 className="text-2xl font-bold text-cyan-900 dark:text-cyan-100">{t('editEmployee')}</h2>
              <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">{editingEmployee.name}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('firstName')}</span>
                <input value={editForm.firstName} onChange={(e) => handleEditChange('firstName', e.target.value)} className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50" required />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('lastName')}</span>
                <input value={editForm.lastName} onChange={(e) => handleEditChange('lastName', e.target.value)} className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50" />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('email')}</span>
                <input type="email" value={editForm.email} onChange={(e) => handleEditChange('email', e.target.value)} className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50" required />
              </label>
              {editingEmployee.profileId ? (
                <div className="space-y-2">
                  <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('loginAccount')}</span>
                  <div className="rounded-xl border-2 border-cyan-200/70 bg-white/55 px-4 py-3 text-sm font-bold text-cyan-900 shadow-inner dark:border-cyan-500/25 dark:bg-cyan-950/35 dark:text-cyan-100">
                    {editingEmployee.profileId}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-cyan-200/60 bg-gradient-to-br from-white/65 via-cyan-50/55 to-blue-100/55 p-4 shadow-inner dark:border-cyan-500/25 dark:from-cyan-950/45 dark:via-cyan-900/30 dark:to-blue-950/35 md:col-span-2 xl:col-span-3">
                  <p className="mb-3 text-sm font-black text-cyan-900 dark:text-cyan-100">{t('loginAccount')}</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {[
                      { value: 'none' as const, label: t('noLoginAccountYet') },
                      { value: 'attach' as const, label: t('attachExistingAccount') },
                      { value: 'create' as const, label: t('createNewLoginAccount') },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setEditLoginMode(option.value);
                          setEditExistingProfileId('');
                          setEditTemporaryPassword('');
                        }}
                        className={`cursor-pointer rounded-xl border-2 px-4 py-3 text-sm font-black transition-all ${
                          editLoginMode === option.value
                            ? 'border-white/70 bg-gradient-to-b from-cyan-300 to-blue-600 text-white shadow-lg shadow-cyan-500/35'
                            : 'border-cyan-200/60 bg-white/55 text-cyan-800 hover:bg-white/85 dark:border-cyan-500/25 dark:bg-cyan-950/35 dark:text-cyan-100'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {editLoginMode === 'attach' && (
                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('existingLoginAccount')}</label>
                      <select
                        value={editExistingProfileId}
                        onChange={(event) => selectEditExistingAccount(event.target.value)}
                        required
                        className="aero-input w-full rounded-xl px-4 py-3 text-cyan-900 dark:text-cyan-100"
                      >
                        <option value="">{t('selectExistingAccount')}</option>
                        {availableLoginAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.fullName} - {account.email}
                          </option>
                        ))}
                      </select>
                      {availableLoginAccounts.length === 0 && (
                        <p className="mt-2 text-xs font-bold text-cyan-700 dark:text-cyan-300">{t('noAvailableLoginAccounts')}</p>
                      )}
                    </div>
                  )}

                  {editLoginMode === 'create' && (
                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('temporaryPassword')}</label>
                      <input
                        type="password"
                        value={editTemporaryPassword}
                        onChange={(event) => setEditTemporaryPassword(event.target.value)}
                        minLength={6}
                        required
                        className="aero-input w-full rounded-xl px-4 py-3 text-cyan-900 dark:text-cyan-100"
                        placeholder={t('temporaryPasswordPlaceholder')}
                      />
                    </div>
                  )}
                </div>
              )}
              <label className="relative space-y-2" onClick={(event) => event.stopPropagation()}>
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('department')}</span>
                <input
                  value={departmentSearch}
                  onChange={(event) => {
                    setDepartmentSearch(event.target.value);
                    handleEditChange('departmentId', '');
                    setShowDepartmentOptions(true);
                  }}
                  onFocus={() => setShowDepartmentOptions(true)}
                  placeholder={t('noDepartment')}
                  className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder:text-cyan-800/75 dark:placeholder:text-cyan-300/60"
                />
                {showDepartmentOptions && (
                  <div className="absolute z-40 mt-2 max-h-80 w-full overflow-auto rounded-xl border-2 border-white/60 bg-white/90 dark:bg-cyan-950/90 backdrop-blur-xl shadow-2xl shadow-cyan-500/30">
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={clearDepartment}
                      className="w-full px-4 py-3 text-left hover:bg-cyan-100/70 dark:hover:bg-cyan-800/50"
                    >
                      <span className="block text-sm font-bold text-cyan-900 dark:text-cyan-100">{t('noDepartment')}</span>
                      <span className="block text-xs font-semibold text-cyan-600 dark:text-cyan-300">{t('leaveUnchanged')}</span>
                    </button>
                    {departmentOptions.map((department) => (
                      <button
                        key={department.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectDepartment(department)}
                        className="w-full px-4 py-3 text-left hover:bg-cyan-100/70 dark:hover:bg-cyan-800/50"
                      >
                        <span className="block text-sm font-bold text-cyan-900 dark:text-cyan-100">{department.name}</span>
                        <span className="block text-xs font-semibold text-cyan-600 dark:text-cyan-300">{t('employeesCount', { count: department.employeeCount })}</span>
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('position')}</span>
                <input value={editForm.position} onChange={(e) => handleEditChange('position', e.target.value)} className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50" required />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('status')}</span>
                <select value={editForm.status} onChange={(e) => handleEditChange('status', e.target.value)} className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100">
                  <option value="active">{t('active')}</option>
                  <option value="fired">{t('fired')}</option>
                  <option value="suspended">{t('suspended')}</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('grossSalary')}</span>
                <input type="number" min="0" step="0.01" value={editForm.salaryGross} onChange={(e) => handleEditChange('salaryGross', e.target.value)} className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50" required />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('taxRate')}</span>
                <input type="number" min="0" max="100" step="0.01" value={editForm.salaryTaxRate} onChange={(e) => handleEditChange('salaryTaxRate', e.target.value)} className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50" required />
                <span className="block rounded-xl border border-cyan-300/40 bg-white/45 px-4 py-2 text-sm font-bold text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-100">
                  {t('netSalary')}: {formatMoney(toBaseCurrency(editSalaryNet))}
                </span>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('hireDate')}</span>
                <input type="date" value={editForm.hireDate} onChange={(e) => handleEditChange('hireDate', e.target.value)} className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100" required />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('workNormHours')}</span>
                <input type="number" min="1" max="24" step="0.25" value={editForm.workNormHours} onChange={(e) => handleEditChange('workNormHours', e.target.value)} className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100" required />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('annualLeaveDays')}</span>
                <input type="number" min="20" step="1" value={editForm.annualLeaveDays} onChange={(e) => handleEditChange('annualLeaveDays', e.target.value)} className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100" required />
              </label>
              <label className="relative space-y-2" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('manager')}</span>
                  <button
                    type="button"
                    onClick={() => setLimitManagersToDepartment((current) => !current)}
                    className={`rounded-lg border border-white/50 px-3 py-1 text-xs font-bold shadow-lg transition-all ${
                      limitManagersToDepartment
                        ? 'bg-gradient-to-b from-cyan-400 to-blue-600 text-white'
                        : 'bg-white/60 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-100'
                    }`}
                  >
                    {t('departmentOnly')}
                  </button>
                </div>
                <input
                  value={managerSearch}
                  onChange={(e) => handleManagerSearch(e.target.value)}
                  onFocus={() => setShowManagerOptions(true)}
                  placeholder={t('searchByNameOrCodeNoDots')}
                  className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
                />
                {showManagerOptions && (
                  <div className="absolute z-40 mt-2 max-h-80 w-full overflow-auto rounded-xl border-2 border-white/60 bg-white/90 dark:bg-cyan-950/90 backdrop-blur-xl shadow-2xl shadow-cyan-500/30">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setManagerSearch('');
                        handleEditChange('managerId', '');
                        setShowManagerOptions(false);
                      }}
                      className="w-full px-4 py-3 text-left text-sm font-bold text-cyan-800 dark:text-cyan-100 hover:bg-cyan-100/70 dark:hover:bg-cyan-800/50"
                    >
                      {t('noManager')}
                    </button>
                    {managerOptions.map((employee) => (
                      <button
                        key={employee.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectManager(employee)}
                        className="w-full px-4 py-3 text-left hover:bg-cyan-100/70 dark:hover:bg-cyan-800/50"
                      >
                        <span className="block text-sm font-bold text-cyan-900 dark:text-cyan-100">{employee.name}</span>
                        <span className="block text-xs font-semibold text-cyan-600 dark:text-cyan-300">{employee.employeeCode || t('noCode')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditingEmployee(null)} className="relative px-6 py-3 rounded-xl bg-gradient-to-b from-slate-300 to-slate-500 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-slate-500/40 hover:scale-105 transition-all overflow-hidden">
                {t('cancel')}
              </button>
              <button type="submit" className="relative flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-b from-green-400 to-green-600 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-green-500/50 hover:scale-105 transition-all overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                <Save className="w-5 h-5 relative z-10" />
                <span className="relative z-10">{t('saveChanges')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {schedulingEmployee && <EmployeeScheduleModal employee={schedulingEmployee} onClose={() => setSchedulingEmployee(null)} />}
      {documentEmployee && <EmployeeDocumentsModal employee={documentEmployee} onClose={() => setDocumentEmployee(null)} />}
      {employeeToFire && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-cyan-950/40 px-4 backdrop-blur-sm"
          onMouseDown={() => !isFiringEmployee && setEmployeeToFire(null)}
        >
          <section
            className="aero-glass w-full max-w-lg rounded-3xl border-2 border-white/65 p-6 shadow-2xl shadow-red-950/30"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-white/70 bg-gradient-to-b from-rose-300 to-red-700 text-white shadow-lg shadow-red-500/35">
                <UserX className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-cyan-950 dark:text-cyan-100">{t('fireEmployee')}</h2>
                <p className="mt-2 font-bold text-cyan-800 dark:text-cyan-200">{t('fireEmployeeConfirm', { name: employeeToFire.name })}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isFiringEmployee}
                onClick={() => setEmployeeToFire(null)}
                className="cursor-pointer rounded-xl border-2 border-white/55 bg-gradient-to-b from-slate-300 to-slate-600 px-5 py-3 font-black text-white shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={isFiringEmployee}
                onClick={async () => {
                  setIsFiringEmployee(true);
                  try {
                    await terminateEmployee(employeeToFire.id);
                    setEmployeeToFire(null);
                  } finally {
                    setIsFiringEmployee(false);
                  }
                }}
                className="cursor-pointer rounded-xl border-2 border-white/65 bg-gradient-to-b from-rose-400 to-red-700 px-5 py-3 font-black text-white shadow-lg shadow-red-500/35 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFiringEmployee ? t('processing') : t('fireEmployee')}
              </button>
            </div>
          </section>
        </div>
      )}

      {viewingEmployee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-cyan-950/30 backdrop-blur-sm px-4"
          onClick={() => setViewingEmployee(null)}
        >
          <div
            className="aero-glass max-w-5xl w-full p-6 border-2 border-white/50 shadow-2xl shadow-cyan-500/40"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const { firstName, lastName } = splitEmployeeName(viewingEmployee.name);
              const fields: Array<[string, string | number]> = [
                [t('databaseId'), viewingEmployee.id],
                [t('employeeCode'), viewingEmployee.employeeCode || '-'],
                [t('profileId'), viewingEmployee.profileId || '-'],
                [t('firstName'), firstName || '-'],
                [t('lastName'), lastName || '-'],
                [t('email'), viewingEmployee.email],
                ['CNP', viewingEmployee.cnp || '-'],
                [t('phone'), viewingEmployee.phone || '-'],
                [t('address'), viewingEmployee.address || '-'],
                [t('department'), viewingEmployee.department],
                [t('position'), viewingEmployee.position || '-'],
                [t('grossSalary'), formatMoney(viewingEmployee.salary)],
                [t('netSalary'), viewingEmployee.salaryNet === undefined ? '-' : formatMoney(viewingEmployee.salaryNet)],
                [t('hireDate'), formatDate(new Date(viewingEmployee.hireDate))],
                [t('contractType'), viewingEmployee.contractType || '-'],
                [t('workNormHours'), viewingEmployee.workNormHours === undefined ? '-' : viewingEmployee.workNormHours],
                [t('annualLeaveDays'), viewingEmployee.annualLeaveDays === undefined ? '-' : viewingEmployee.annualLeaveDays],
                [t('manager'), viewingEmployee.managerName || '-'],
                [t('status'), t(viewingEmployee.status)],
              ];

              return (
                <>
            <div className="flex items-center gap-4 mb-6">
              <ProfileAvatar name={viewingEmployee.name} className="h-16 w-16 rounded-2xl text-lg ring-cyan-300/60" />
              <div>
                <h2 className="text-2xl font-bold text-cyan-900 dark:text-cyan-100">{viewingEmployee.name}</h2>
                <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">{viewingEmployee.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {fields.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-cyan-300/40 bg-white/40 dark:bg-cyan-950/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-cyan-700 dark:text-cyan-300">{label}</p>
                      <p className="text-sm font-bold text-cyan-900 dark:text-cyan-100 break-words">{value}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(String(value))}
                      className="shrink-0 relative p-2 rounded-lg bg-gradient-to-b from-cyan-300 to-blue-500 border border-white/50 text-white shadow-lg hover:scale-105 transition-all overflow-hidden"
                      title={t('copyField', { field: label })}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                      <Copy className="w-4 h-4 relative z-10" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
