import { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Save, CheckCircle2, AlertCircle, FileText, X } from 'lucide-react';
import { addEmployee, fetchAvailableLoginAccounts, fetchDepartments, fetchEmployees, subscribeToDataChanges, uploadEmployeeDocuments } from '../../utils/data';
import type { AvailableLoginAccount } from '../../utils/data';
import type { Department, Employee } from '../../types';
import { PageInfoButton } from '../../components/PageInfoButton';

type AddEmployeeFormData = {
  firstName: string;
  lastName: string;
  email: string;
  cnp: string;
  phone: string;
  address: string;
  department: string;
  position: string;
  salary: string;
  taxRate: string;
  workNormHours: string;
  hireDate: string;
  managerId: string;
};

type ValidationErrors = Partial<Record<keyof AddEmployeeFormData | 'temporaryPassword' | 'existingProfileId', string>>;

const emptyFormData: AddEmployeeFormData = {
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
};

const personNamePattern = /^[\p{L}][\p{L}\s'.-]{1,49}$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const positionPattern = /^[\p{L}\d][\p{L}\d\s.,'()/-]{1,79}$/u;

function normalizeCnp(value: string) {
  return value.replace(/\D/g, '').slice(0, 13);
}

function normalizePhone(value: string) {
  const cleaned = value.replace(/[^\d+()\s-]/g, '');
  return cleaned.startsWith('+')
    ? `+${cleaned.slice(1).replace(/\+/g, '')}`.slice(0, 20)
    : cleaned.replace(/\+/g, '').slice(0, 20);
}

function cnpBirthDateIsValid(cnp: string) {
  if (cnp.length !== 13 || !/^[1-9]\d{12}$/.test(cnp)) return false;

  const century = ['1', '2'].includes(cnp[0])
    ? 1900
    : ['3', '4'].includes(cnp[0])
    ? 1800
    : ['5', '6'].includes(cnp[0])
    ? 2000
    : undefined;

  if (!century) return true;

  const year = century + Number(cnp.slice(1, 3));
  const month = Number(cnp.slice(3, 5));
  const day = Number(cnp.slice(5, 7));
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function cnpCountyIsValid(cnp: string) {
  if (cnp.length !== 13) return false;
  const countyCode = Number(cnp.slice(7, 9));
  return (countyCode >= 1 && countyCode <= 52) || countyCode === 99;
}

export function AddEmployee() {
  const { t } = useLanguage();
  const { formatMoney, toBaseCurrency } = useCurrency();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [formData, setFormData] = useState<AddEmployeeFormData>(emptyFormData);
  const [loginMode, setLoginMode] = useState<'none' | 'attach' | 'create'>('none');
  const [existingProfileId, setExistingProfileId] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [availableLoginAccounts, setAvailableLoginAccounts] = useState<AvailableLoginAccount[]>([]);
  const [managerSearch, setManagerSearch] = useState('');
  const [showManagerOptions, setShowManagerOptions] = useState(false);
  const [showDepartmentOptions, setShowDepartmentOptions] = useState(false);
  const [limitManagersToDepartment, setLimitManagersToDepartment] = useState(false);
  const [contractFiles, setContractFiles] = useState<File[]>([]);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

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

  const validateForm = () => {
    const errors: ValidationErrors = {};
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const email = formData.email.trim();
    const cnp = formData.cnp.trim();
    const phoneDigits = formData.phone.replace(/\D/g, '');
    const position = formData.position.trim();
    const salary = Number(formData.salary);
    const taxRate = Number(formData.taxRate);
    const workNormHours = Number(formData.workNormHours);

    if (!personNamePattern.test(firstName)) errors.firstName = t('invalidFirstName');
    if (!personNamePattern.test(lastName)) errors.lastName = t('invalidLastName');
    if (!emailPattern.test(email)) errors.email = t('invalidEmail');
    if (!/^\d{13}$/.test(cnp) || !cnpBirthDateIsValid(cnp) || !cnpCountyIsValid(cnp)) errors.cnp = t('invalidCnp');
    if (formData.phone.trim() && (phoneDigits.length < 10 || phoneDigits.length > 15)) errors.phone = t('invalidPhone');
    if (formData.address.trim().length > 160) errors.address = t('invalidAddress');
    if (formData.department.trim() && !departments.some((department) => department.name === formData.department.trim())) errors.department = t('invalidDepartment');
    if (!positionPattern.test(position)) errors.position = t('invalidPosition');
    if (!Number.isFinite(salary) || salary <= 0) errors.salary = t('invalidSalary');
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) errors.taxRate = t('invalidTaxRate');
    if (!formData.hireDate) errors.hireDate = t('invalidHireDate');
    if (!Number.isFinite(workNormHours) || workNormHours <= 0 || workNormHours > 24) errors.workNormHours = t('invalidWorkNormHours');
    if (loginMode === 'attach' && !existingProfileId) errors.existingProfileId = t('invalidExistingAccount');
    if (loginMode === 'create' && temporaryPassword.length < 6) errors.temporaryPassword = t('invalidTemporaryPassword');

    return errors;
  };

  const fieldError = (field: keyof AddEmployeeFormData | 'temporaryPassword' | 'existingProfileId') =>
    validationErrors[field] ? (
      <p className="mt-2 rounded-lg border border-red-200/70 bg-red-50/80 px-3 py-2 text-xs font-black text-red-700 dark:border-red-400/25 dark:bg-red-950/30 dark:text-red-200">
        {validationErrors[field]}
      </p>
    ) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const department = departments.find((item) => item.name === formData.department.trim());
    const errors = validateForm();

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setSubmitMessage({ type: 'error', text: t('fixValidationErrors') });
      return;
    }

    try {
      const createdEmployee = await addEmployee({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email,
        cnp: formData.cnp.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        departmentId: department?.id,
        position: formData.position.trim(),
        status: 'active',
        salaryGross: toBaseCurrency(Number(formData.salary)),
        salaryNet: toBaseCurrency(Math.round(Number(formData.salary) * (1 - Number(formData.taxRate) / 100) * 100) / 100),
        workNormHours: Number(formData.workNormHours),
        hireDate: formData.hireDate,
        managerId: formData.managerId || undefined,
        loginMode,
        existingProfileId: loginMode === 'attach' ? existingProfileId : undefined,
        temporaryPassword: loginMode === 'create' ? temporaryPassword : undefined,
      });
      if (createdEmployee?.id && contractFiles.length > 0) {
        await uploadEmployeeDocuments(createdEmployee.id, 'contract', contractFiles);
      }
      setFormData(emptyFormData);
      setLoginMode('none');
      setExistingProfileId('');
      setTemporaryPassword('');
      setManagerSearch('');
      setContractFiles([]);
      setValidationErrors({});
      setSubmitMessage({ type: 'success', text: t('employeeAdded') });
    } catch (error) {
      setSubmitMessage({
        type: 'error',
        text: error instanceof Error ? error.message : t('employeeAddFailed'),
      });
    }
  };

  const handleChange = (e) => {
    const field = e.target.name as keyof AddEmployeeFormData;
    const rawValue = e.target.value;
    const value = field === 'cnp'
      ? normalizeCnp(rawValue)
      : field === 'phone'
      ? normalizePhone(rawValue)
      : field === 'firstName' || field === 'lastName'
      ? rawValue.replace(/[^\p{L}\s'.-]/gu, '').slice(0, 50)
      : field === 'address'
      ? rawValue.slice(0, 160)
      : field === 'position'
      ? rawValue.slice(0, 80)
      : rawValue;

    setSubmitMessage(null);
    setValidationErrors((current) => ({ ...current, [field]: undefined }));
    setFormData({
      ...formData,
      [field]: value,
    });
  };

  const removeContractFile = (fileIndex: number) => {
    setContractFiles((current) => current.filter((_, index) => index !== fileIndex));
  };

  const selectDepartment = (departmentName: string) => {
    setFormData({
      ...formData,
      department: departmentName,
    });
    setValidationErrors((current) => ({ ...current, department: undefined }));
    setShowDepartmentOptions(false);
  };

  const clearDepartment = () => {
    setFormData({
      ...formData,
      department: '',
    });
    setValidationErrors((current) => ({ ...current, department: undefined }));
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
    setValidationErrors((current) => ({ ...current, existingProfileId: undefined, email: undefined }));
    if (account) {
      setFormData((current) => ({ ...current, email: account.email }));
    }
  };

  return (
    <div
      className="relative w-full max-w-7xl pt-14"
      onClick={() => {
        setShowDepartmentOptions(false);
        setShowManagerOptions(false);
      }}
    >
      <PageInfoButton title={t('addEmployee')} description={t('addEmployeeInfo')} />

      <div className="aero-glass rounded-2xl overflow-visible">
        <div className="p-6 border-b-2 border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex items-center gap-3">
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
                    setValidationErrors((current) => ({
                      ...current,
                      existingProfileId: undefined,
                      temporaryPassword: undefined,
                    }));
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
                {fieldError('existingProfileId')}
              </div>
            )}

            {loginMode === 'create' && (
              <div className="mt-4">
                <label className="mb-2 block text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('temporaryPassword')}</label>
                <input
                  type="password"
                  value={temporaryPassword}
                  onChange={(event) => {
                    setTemporaryPassword(event.target.value);
                    setValidationErrors((current) => ({ ...current, temporaryPassword: undefined }));
                  }}
                  minLength={6}
                  maxLength={72}
                  required
                  className="aero-input w-full rounded-xl px-4 py-3 text-cyan-900 dark:text-cyan-100"
                placeholder={t('temporaryPasswordPlaceholder')}
              />
                {fieldError('temporaryPassword')}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('name')}
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                maxLength={50}
                required
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
              />
              {fieldError('firstName')}
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
                maxLength={50}
                required
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
              />
              {fieldError('lastName')}
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
                maxLength={120}
                readOnly={loginMode === 'attach'}
                required
                className={`w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50 ${
                  loginMode === 'attach' ? 'cursor-not-allowed opacity-70' : ''
                }`}
                
              />
              {fieldError('email')}
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
                inputMode="numeric"
                maxLength={13}
                pattern="\d{13}"
                required
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
              />
              {fieldError('cnp')}
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
                maxLength={20}
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-700/70 dark:placeholder-cyan-400/60"
              />
              {fieldError('phone')}
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
                maxLength={160}
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-700/70 dark:placeholder-cyan-400/60"
              />
              {fieldError('address')}
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
              {fieldError('department')}
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
                maxLength={80}
                required
                className="w-full px-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
              />
              {fieldError('position')}
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
                  min="0.01"
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
                  required
                  className="w-28 px-3 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100"
                  placeholder={t('taxPercent')}
                  title={t('taxRatePercentage')}
                />
              </div>
              <p className="mt-2 rounded-xl border border-cyan-300/40 bg-white/45 px-4 py-2 text-sm font-bold text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-100">
                {t('netSalary')}: {formatMoney(toBaseCurrency(salaryNet))}
              </p>
              {fieldError('salary')}
              {fieldError('taxRate')}
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
              {fieldError('hireDate')}
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
              {fieldError('workNormHours')}
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

          <div className="rounded-2xl border border-cyan-200/60 bg-gradient-to-br from-white/65 via-cyan-50/55 to-blue-100/55 p-4 shadow-inner dark:border-cyan-500/25 dark:from-cyan-950/45 dark:via-cyan-900/30 dark:to-blue-950/35">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-b from-cyan-300 to-blue-600 text-white shadow-lg shadow-cyan-500/30">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-black text-cyan-900 dark:text-cyan-100">{t('contractDocuments')}</p>
              </div>
            </div>
            <label className="block cursor-pointer rounded-xl border-2 border-dashed border-cyan-300/70 bg-white/55 px-4 py-5 text-center shadow-inner transition-all hover:border-blue-400 hover:bg-white/80 dark:border-cyan-500/30 dark:bg-cyan-950/35 dark:hover:bg-cyan-900/45">
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(event) => {
                  setContractFiles(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
              <span className="text-sm font-bold text-cyan-800 dark:text-cyan-100">{t('clickToUploadDocuments')}</span>
              <span className="mt-1 block text-xs font-semibold text-cyan-600 dark:text-cyan-300">Optional</span>
            </label>
            {contractFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {contractFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-cyan-200/60 bg-white/55 px-3 py-2 text-sm font-bold text-cyan-900 dark:border-cyan-500/25 dark:bg-cyan-950/35 dark:text-cyan-100"
                  >
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeContractFile(index)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/60 bg-red-100/80 text-red-700 shadow-sm transition-all hover:bg-red-200 dark:bg-red-900/35 dark:text-red-200"
                      aria-label="Remove document"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                setFormData(emptyFormData);
                setLoginMode('none');
                setExistingProfileId('');
                setTemporaryPassword('');
                setManagerSearch('');
                setContractFiles([]);
                setValidationErrors({});
                setSubmitMessage(null);
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
