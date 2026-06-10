import { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { UserPlus, Save, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { addEmployee, fetchAvailableLoginAccounts, fetchDepartments, fetchEmployees, subscribeToDataChanges } from '../../utils/data';
import type { AvailableLoginAccount } from '../../utils/data';
import type { Department, Employee } from '../../types';

export function AddEmployee() {
  const { t } = useLanguage();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    cnp: '',
    phone: '',
    address: '',
    department: '',
    position: '',
    salary: '',
    taxRate: '40',
    workNormHours: '8',
    hireDate: '',
    managerId: '',
  });
  const [loginMode, setLoginMode] = useState<'none' | 'attach' | 'create'>('none');
  const [existingProfileId, setExistingProfileId] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [availableLoginAccounts, setAvailableLoginAccounts] = useState<AvailableLoginAccount[]>([]);
  const [managerSearch, setManagerSearch] = useState('');
  const [showManagerOptions, setShowManagerOptions] = useState(false);
  const [showDepartmentOptions, setShowDepartmentOptions] = useState(false);
  const [limitManagersToDepartment, setLimitManagersToDepartment] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const loadDepartments = async () => {
      setDepartments(await fetchDepartments());
    };

    const loadEmployees = async () => {
      const employeeItems = await fetchEmployees();
      setEmployees(employeeItems.filter((employee) => employee.status === 'active'));
    };
    const loadAvailableLoginAccounts = async () => {
      setAvailableLoginAccounts(await fetchAvailableLoginAccounts());
    };

    loadDepartments();
    loadEmployees();
    loadAvailableLoginAccounts();
    return subscribeToDataChanges(() => {
      loadDepartments();
      loadEmployees();
      loadAvailableLoginAccounts();
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const department = departments.find((item) => item.name === formData.department);

    try {
      await addEmployee({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email,
        cnp: formData.cnp.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        departmentId: department?.id,
        position: formData.position.trim(),
        status: 'active',
        salaryGross: Number(formData.salary),
        salaryNet: Math.round(Number(formData.salary) * (1 - Number(formData.taxRate) / 100) * 100) / 100,
        workNormHours: Number(formData.workNormHours),
        hireDate: formData.hireDate,
        managerId: formData.managerId || undefined,
        loginMode,
        existingProfileId: loginMode === 'attach' ? existingProfileId : undefined,
        temporaryPassword: loginMode === 'create' ? temporaryPassword : undefined,
      });
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        cnp: '',
        phone: '',
        address: '',
        department: '',
        position: '',
        salary: '',
        taxRate: '40',
        workNormHours: '8',
        hireDate: '',
        managerId: '',
      });
      setLoginMode('none');
      setExistingProfileId('');
      setTemporaryPassword('');
      setManagerSearch('');
      setSubmitMessage({ type: 'success', text: t('employeeAdded') });
    } catch (error) {
      setSubmitMessage({
        type: 'error',
        text: error instanceof Error ? error.message : t('employeeAddFailed'),
      });
    }
  };

  const handleChange = (e) => {
    setSubmitMessage(null);
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const selectDepartment = (departmentName: string) => {
    setFormData({
      ...formData,
      department: departmentName,
    });
    setShowDepartmentOptions(false);
  };

  const clearDepartment = () => {
    setFormData({
      ...formData,
      department: '',
    });
    setShowDepartmentOptions(false);
  };

  const managerOptions = employees.filter((employee) => {
    if (limitManagersToDepartment && formData.department && employee.department !== formData.department) return false;
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
    setFormData({
      ...formData,
      managerId: selectedManager?.id ?? '',
    });
  };

  const selectManager = (employee: Employee) => {
    setManagerSearch(`${employee.name}${employee.employeeCode ? ` (${employee.employeeCode})` : ''}`);
    setFormData({
      ...formData,
      managerId: employee.id,
    });
    setShowManagerOptions(false);
  };

  const setTodayAsHireDate = () => {
    setFormData({
      ...formData,
      hireDate: new Date().toISOString().slice(0, 10),
    });
  };

  const salaryGross = Number(formData.salary) || 0;
  const taxRate = Number(formData.taxRate) || 0;
  const salaryNet = Math.max(0, salaryGross * (1 - taxRate / 100));
  const selectExistingAccount = (profileId: string) => {
    const account = availableLoginAccounts.find((item) => item.id === profileId);
    setExistingProfileId(profileId);
    if (account) {
      setFormData((current) => ({ ...current, email: account.email }));
    }
  };

  return (
    <div
      className="max-w-3xl"
      onClick={() => {
        setShowDepartmentOptions(false);
        setShowManagerOptions(false);
      }}
    >
      <div className="mb-6">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent">
          {t('addEmployee')}
        </h1>
        <p className="text-cyan-700 dark:text-cyan-300 mt-2 font-medium text-lg">{t('createEmployeeProfile')}</p>
      </div>

      <div className="aero-glass rounded-2xl overflow-visible">
        <div className="p-6 border-b-2 border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl aero-button flex items-center justify-center shadow-xl shadow-cyan-500/50 relative">
              <UserPlus className="w-7 h-7 text-white relative z-10" />
              <Sparkles className="w-4 h-4 text-yellow-300 absolute top-1 right-1" />
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-300 dark:to-blue-300 bg-clip-text text-transparent">{t('employeeInformation')}</h2>
              <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">{t('fillDetailsBelow')}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {submitMessage && (
            <div
              className={`flex items-center gap-3 rounded-xl border-2 p-4 font-bold ${
                submitMessage.type === 'success'
                  ? 'border-green-300/70 bg-green-100/70 text-green-800 dark:border-green-400/30 dark:bg-green-900/30 dark:text-green-100'
                  : 'border-red-300/70 bg-red-100/70 text-red-800 dark:border-red-400/30 dark:bg-red-900/30 dark:text-red-100'
              }`}
            >
              {submitMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span>{submitMessage.text}</span>
            </div>
          )}

          <div className="rounded-2xl border border-cyan-200/60 bg-gradient-to-br from-white/65 via-cyan-50/55 to-blue-100/55 p-4 shadow-inner dark:border-cyan-500/25 dark:from-cyan-950/45 dark:via-cyan-900/30 dark:to-blue-950/35">
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
                    setLoginMode(option.value);
                    setExistingProfileId('');
                    setTemporaryPassword('');
                  }}
                  className={`cursor-pointer rounded-xl border-2 px-4 py-3 text-sm font-black transition-all ${
                    loginMode === option.value
                      ? 'border-white/70 bg-gradient-to-b from-cyan-300 to-blue-600 text-white shadow-lg shadow-cyan-500/35'
                      : 'border-cyan-200/60 bg-white/55 text-cyan-800 hover:bg-white/85 dark:border-cyan-500/25 dark:bg-cyan-950/35 dark:text-cyan-100'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {loginMode === 'attach' && (
              <div className="mt-4">
                <label className="mb-2 block text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('existingLoginAccount')}</label>
                <select
                  value={existingProfileId}
                  onChange={(event) => selectExistingAccount(event.target.value)}
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

            {loginMode === 'create' && (
              <div className="mt-4">
                <label className="mb-2 block text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('temporaryPassword')}</label>
                <input
                  type="password"
                  value={temporaryPassword}
                  onChange={(event) => setTemporaryPassword(event.target.value)}
                  minLength={6}
                  required
                  className="aero-input w-full rounded-xl px-4 py-3 text-cyan-900 dark:text-cyan-100"
                  placeholder={t('temporaryPasswordPlaceholder')}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('name')}
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('lastName')}
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('email')}
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                readOnly={loginMode === 'attach'}
                required
                className={`w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50 ${
                  loginMode === 'attach' ? 'cursor-not-allowed opacity-70' : ''
                }`}
                
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                CNP
              </label>
              <input
                type="text"
                name="cnp"
                value={formData.cnp}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('phoneOptional')}
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-700/70 dark:placeholder-cyan-400/60"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('addressOptional')}
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-700/70 dark:placeholder-cyan-400/60"
              />
            </div>

            <div className="relative" onClick={(event) => event.stopPropagation()}>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('department')}
              </label>
              <input
                name="department"
                value={formData.department}
                onChange={(event) => {
                  handleChange(event);
                  setShowDepartmentOptions(true);
                }}
                onFocus={() => setShowDepartmentOptions(true)}
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100"
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
                    <span className="block text-xs font-semibold text-cyan-600 dark:text-cyan-300">{t('leaveUnassigned')}</span>
                  </button>
                  {departments
                    .filter((dept) => dept.name.toLowerCase().includes(formData.department.toLowerCase()))
                    .map((dept) => (
                      <button
                        key={dept.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectDepartment(dept.name)}
                        className="w-full px-4 py-3 text-left hover:bg-cyan-100/70 dark:hover:bg-cyan-800/50"
                      >
                        <span className="block text-sm font-bold text-cyan-900 dark:text-cyan-100">{dept.name}</span>
                        <span className="block text-xs font-semibold text-cyan-600 dark:text-cyan-300">{t('employeesCount', { count: dept.employeeCount })}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('position')}
              </label>
              <input
                type="text"
                name="position"
                value={formData.position}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('grossSalary')}
              </label>
              <div className="flex gap-3">
                <input
                  type="number"
                  name="salary"
                  value={formData.salary}
                  onChange={handleChange}
                  step="0.01"
                  required
                  className="min-w-0 flex-1 px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
                />
                <input
                  type="number"
                  name="taxRate"
                  value={formData.taxRate}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  step="0.01"
                  className="w-28 px-3 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100"
                  placeholder={t('taxPercent')}
                  title={t('taxRatePercentage')}
                />
              </div>
              <p className="mt-2 rounded-xl border border-cyan-300/40 bg-white/45 px-4 py-2 text-sm font-bold text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-100">
                {t('netSalary')}: ${salaryNet.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('hireDate')}
              </label>
              <input
                type="date"
                name="hireDate"
                value={formData.hireDate}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 pr-20 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100"
              />
              <button
                type="button"
                onClick={setTodayAsHireDate}
                className="mt-2 px-3 py-1.5 rounded-lg bg-gradient-to-b from-cyan-300 to-blue-500 border border-white/50 text-white text-xs font-bold shadow-lg hover:scale-105 transition-all"
              >
                {t('today')}
              </button>
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('workNormHours')}
              </label>
              <input
                type="number"
                name="workNormHours"
                value={formData.workNormHours}
                onChange={handleChange}
                min="1"
                max="24"
                step="0.25"
                required
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
              />
            </div>

            <div className="relative" onClick={(event) => event.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200">
                  {t('manager')}
                </label>
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
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100"
              />
              {showManagerOptions && (
                <div className="absolute z-40 mt-2 max-h-80 w-full overflow-auto rounded-xl border-2 border-white/60 bg-white/90 dark:bg-cyan-950/90 backdrop-blur-xl shadow-2xl shadow-cyan-500/30">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setManagerSearch('');
                      setFormData({ ...formData, managerId: '' });
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
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-b from-green-400 to-green-600 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-green-500/50 transition-all hover:scale-110 hover:shadow-2xl hover:shadow-green-400/70 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent h-1/2 pointer-events-none"></div>
              <Save className="w-5 h-5 relative z-10" />
              <span className="relative z-10">{t('save')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFormData({
                  firstName: '',
                  lastName: '',
                  email: '',
                  cnp: '',
                  phone: '',
                  address: '',
                  department: '',
                  position: '',
                  salary: '',
                  taxRate: '40',
                  workNormHours: '8',
                  hireDate: '',
                  managerId: '',
                });
                setLoginMode('none');
                setExistingProfileId('');
                setTemporaryPassword('');
                setManagerSearch('');
              }}
              className="px-6 py-3 rounded-xl aero-glass hover:scale-105 text-cyan-700 dark:text-cyan-300 font-bold transition-all"
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
