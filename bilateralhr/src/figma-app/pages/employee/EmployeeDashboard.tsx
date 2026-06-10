import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, Briefcase, Camera, Clock, CreditCard, FileSpreadsheet, FileText, IdCard, Pencil, Save, Trash2, Upload, User, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { fetchAnnualLeaveBalance, fetchEmployees, subscribeToDataChanges, updateEmployee } from '../../utils/data';
import type { AnnualLeaveBalance } from '../../utils/data';
import type { Employee } from '../../types';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { greetingKeyForCurrentTime } from '../../utils/greeting';

type EditableField = 'phone' | 'address';

const formatMoney = (value?: number) => (
  value === undefined || Number.isNaN(value) ? 'N/A' : `$${value.toLocaleString()}`
);

const formatValue = (value?: string | number | null) => (
  value === undefined || value === null || value === '' ? 'N/A' : String(value)
);

const defaultProfilePicture = () => {
  return undefined;
};

export function EmployeeDashboard() {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [annualLeaveBalance, setAnnualLeaveBalance] = useState<AnnualLeaveBalance | null>(null);
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [detailsOffset, setDetailsOffset] = useState(0);
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<string | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const personalInfoButtonRef = useRef<HTMLButtonElement | null>(null);
  const detailsPanelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    window.localStorage.removeItem(`hr-profile-picture:${user.id}`);
    setCustomAvatar(null);

    const loadEmployee = async () => {
      const employees = await fetchEmployees();
      const currentEmployee = employees.find((item) => item.id === user.id || item.email === user.email);
      setEmployee(currentEmployee || null);
      setAnnualLeaveBalance(currentEmployee ? await fetchAnnualLeaveBalance(currentEmployee.id) : null);
    };

    loadEmployee();
    return subscribeToDataChanges(loadEmployee);
  }, [user]);

  const profile = useMemo(() => ({
    name: employee?.name || user?.name || t('employee'),
    status: employee?.status || 'default',
    position: employee?.position || t('notAvailable'),
    workNormHours: employee?.workNormHours,
    salaryGross: employee?.salary,
    salaryNet: employee?.salaryNet,
    contractType: employee?.contractType || t('notAvailable'),
  }), [employee, user, t]);

  useEffect(() => {
    if (!showPersonalInfo) return;

    const syncDetailsPosition = () => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      const buttonRect = personalInfoButtonRef.current?.getBoundingClientRect();
      const detailsRect = detailsPanelRef.current?.getBoundingClientRect();
      if (!containerRect || !buttonRect || !detailsRect) return;

      const buttonMiddle = buttonRect.top - containerRect.top + buttonRect.height / 2;
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
  }, [showPersonalInfo, profile.name]);

  if (!user) return null;

  const profilePicture = customAvatar || employee?.avatarUrl || user.profilePicture || defaultProfilePicture();

  const openPhotoModal = () => {
    setPhotoDraft(profilePicture || null);
    setPhotoZoom(1);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
    setIsPhotoModalOpen(true);
  };

  const handlePhotoSelect = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoDraft(String(reader.result));
      setPhotoZoom(1);
      setPhotoOffsetX(0);
      setPhotoOffsetY(0);
    };
    reader.readAsDataURL(file);
  };

  const savePhoto = async () => {
    if (!photoDraft) return;
    const image = new Image();
    image.onload = () => {
      const size = 320;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) return;

      const baseScale = Math.max(size / image.width, size / image.height);
      const scale = baseScale * photoZoom;
      const width = image.width * scale;
      const height = image.height * scale;
      const dx = (size - width) / 2 + (photoOffsetX / 100) * size;
      const dy = (size - height) / 2 + (photoOffsetY / 100) * size;

      context.drawImage(image, dx, dy, width, height);
      const croppedPhoto = canvas.toDataURL('image/jpeg', 0.88);
      window.localStorage.setItem(`hr-profile-picture:${user.id}`, croppedPhoto);
      setCustomAvatar(croppedPhoto);
      setIsPhotoModalOpen(false);
    };
    image.src = photoDraft;
  };

  const deletePhoto = () => {
    window.localStorage.removeItem(`hr-profile-picture:${user.id}`);
    setCustomAvatar(null);
    setPhotoDraft(null);
    setIsPhotoModalOpen(false);
  };

  const startEditing = (field: EditableField) => {
    setEditingField(field);
    setDraftValue(String(employee?.[field] || ''));
  };

  const saveEditableField = async () => {
    if (!employee || !editingField) return;
    await updateEmployee(employee.id, { [editingField]: draftValue });
    setEmployee({ ...employee, [editingField]: draftValue });
    setEditingField(null);
    setDraftValue('');
  };

  const personalInfo = [
    [t('employeeCode'), employee?.employeeCode],
    [t('profileId'), employee?.profileId],
    [t('email'), employee?.email || user.email],
    ['CNP', employee?.cnp],
    [t('phone'), employee?.phone, 'phone'],
    [t('address'), employee?.address, 'address'],
    [t('department'), employee?.department],
    [t('manager'), employee?.managerName],
    [t('hireDate'), employee?.hireDate ? formatDate(new Date(employee.hireDate)) : undefined],
    [t('annualLeaveDays'), employee?.annualLeaveDays === undefined
      ? undefined
      : `${employee.annualLeaveDays} (${t('annualLeaveRemainingShort', { count: annualLeaveBalance?.remainingDays ?? employee.annualLeaveDays })})`],
  ] as const;

  const mainCards = [
    { label: t('status'), value: t(profile.status), icon: BadgeCheck },
    { label: t('position'), value: profile.position, icon: Briefcase },
    { label: t('workNorm'), value: profile.workNormHours === undefined ? t('notAvailable') : t('hoursPerDay', { hours: profile.workNormHours }), icon: Clock },
    { label: t('grossSalary'), value: formatMoney(profile.salaryGross).replace('N/A', t('notAvailable')), icon: CreditCard },
    { label: t('netSalary'), value: formatMoney(profile.salaryNet).replace('N/A', t('notAvailable')), icon: CreditCard },
    { label: t('contractType'), value: profile.contractType, icon: FileText },
  ];

  return (
    <div ref={containerRef} className="flex flex-col gap-5 xl:flex-row xl:items-start">
      <div className="w-full max-w-md rounded-2xl border border-white/50 bg-white/35 p-4 shadow-xl shadow-cyan-500/20 backdrop-blur-xl dark:bg-cyan-950/20">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-cyan-900 dark:text-cyan-100">
            {t(greetingKeyForCurrentTime(), { name: profile.name })}
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-cyan-300/40 bg-white/40 p-3 dark:bg-cyan-900/20 sm:col-span-2">
            <div className="flex items-center gap-3">
              <div className="group relative">
                <ProfileAvatar name={profile.name} className="h-14 w-14 border-2 border-white/70 text-base shadow-cyan-500/20 dark:bg-cyan-950/50" />
                <div className="pointer-events-none absolute left-full top-0 z-50 ml-3 hidden h-36 w-36 overflow-hidden rounded-2xl border-2 border-white/70 bg-white/80 p-1 shadow-2xl shadow-cyan-500/30 backdrop-blur-xl group-hover:block dark:bg-cyan-950/80">
                  <ProfileAvatar name={profile.name} className="h-full w-full rounded-xl text-3xl" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{t('fullName')}</p>
                <p className="truncate text-base font-semibold text-cyan-900 dark:text-cyan-100">{profile.name}</p>
              </div>
            </div>
          </div>

          {mainCards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-cyan-300/40 bg-white/40 p-3 dark:bg-cyan-900/20">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-300" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-cyan-800 dark:text-cyan-200">{label}</p>
                  <p className="truncate text-base font-semibold text-cyan-900 dark:text-cyan-100">{value}</p>
                </div>
              </div>
            </div>
          ))}

          <button
            ref={personalInfoButtonRef}
            type="button"
            onClick={() => setShowPersonalInfo((current) => !current)}
            className="w-full cursor-pointer rounded-xl border border-cyan-300/40 bg-white/50 p-3 text-left shadow-sm transition hover:border-cyan-300/80 hover:bg-white/75 hover:shadow-lg hover:shadow-cyan-500/20 dark:bg-cyan-900/30 dark:hover:bg-cyan-900/45 sm:col-span-2"
          >
            <div className="flex items-center gap-3">
              <IdCard className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
              <div>
                <p className="text-base font-bold text-cyan-900 dark:text-cyan-100">{t('personalInformation')}</p>
                <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                  {showPersonalInfo ? t('hideDetails') : t('showDetails')}
                </p>
              </div>
            </div>
          </button>

          {user.role === 'manager' && (
            <Link
              to="/manager/reports"
              className="w-full cursor-pointer rounded-xl border border-cyan-300/40 bg-gradient-to-br from-white/60 via-cyan-100/60 to-blue-200/55 p-3 text-left shadow-sm transition hover:border-cyan-300/80 hover:bg-white/80 hover:shadow-lg hover:shadow-cyan-500/20 dark:border-cyan-500/25 dark:from-cyan-950/55 dark:via-blue-950/35 dark:to-slate-950/40 sm:col-span-2"
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
                <div>
                  <p className="text-base font-bold text-cyan-900 dark:text-cyan-100">{t('teamReports')}</p>
                  <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">{t('downloadExcel')}</p>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>

      {showPersonalInfo && (
        <div
          ref={detailsPanelRef}
          className="relative mt-0 w-full max-w-2xl rounded-2xl border border-white/50 bg-white/40 p-4 shadow-xl shadow-cyan-500/20 backdrop-blur-xl dark:bg-cyan-950/25 xl:mt-[var(--personal-details-offset)]"
          style={{ '--personal-details-offset': `${detailsOffset}px` } as CSSProperties}
        >
          <div
            className="absolute -left-4 top-1/2 hidden h-8 w-4 -translate-y-1/2 border-y border-l border-white/50 bg-white/40 backdrop-blur-xl xl:block dark:bg-cyan-950/25"
            style={{ clipPath: 'polygon(100% 0, 0 50%, 100% 100%)' }}
          />
          <h2 className="mb-3 text-xl font-bold text-cyan-900 dark:text-cyan-100">{t('personalInformation')}</h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {personalInfo.map(([label, value, field]) => {
              const isEditing = editingField === field;
              return (
                <div key={label} className="rounded-xl border border-cyan-300/40 bg-white/45 p-3 dark:bg-cyan-900/20">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase text-cyan-700 dark:text-cyan-300">{label}</p>
                    {field && !isEditing && (
                      <button
                        type="button"
                        onClick={() => startEditing(field)}
                        className="rounded-lg border border-cyan-200/70 bg-white/70 p-2 text-cyan-700 shadow-sm transition hover:bg-cyan-50 dark:bg-cyan-950/50 dark:text-cyan-100"
                        title={t('editField', { field: label })}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {field && isEditing && (
                      <button
                        type="button"
                        onClick={saveEditableField}
                        className="rounded-lg border border-emerald-200/70 bg-emerald-100/80 p-2 text-emerald-700 shadow-sm transition hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-100"
                        title={t('saveField', { field: label })}
                      >
                        <Save className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <input
                      value={draftValue}
                      onChange={(event) => setDraftValue(event.target.value)}
                      className="aero-input w-full text-cyan-900 placeholder:text-cyan-800/70 dark:text-cyan-100"
                      autoFocus
                    />
                  ) : (
                    <p className="break-words text-sm font-bold text-cyan-900 dark:text-cyan-100">{formatValue(value).replace('N/A', t('notAvailable'))}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isPhotoModalOpen && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-cyan-950/30 px-4 backdrop-blur-sm"
          onClick={() => setIsPhotoModalOpen(false)}
        >
          <div
            className="aero-glass w-full max-w-lg rounded-2xl p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-cyan-900 dark:text-cyan-100">{t('profilePicture')}</h2>
                <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">{t('cropAndZoomPhoto')}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(false)}
                className="rounded-xl border border-white/60 bg-white/60 p-2 text-cyan-700 shadow-lg dark:bg-cyan-950/50 dark:text-cyan-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mx-auto mb-5 flex h-64 w-64 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/70 bg-white/55 shadow-inner dark:bg-cyan-950/35">
              {photoDraft ? (
                <ProfileAvatar name={profile.name} className="h-full w-full rounded-2xl text-4xl" />
              ) : (
                <User className="h-20 w-20 text-cyan-500" />
              )}
            </div>

            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handlePhotoSelect(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-white/60 bg-white/60 px-4 py-3 font-bold text-cyan-800 shadow-lg transition hover:bg-white/80 dark:bg-cyan-950/50 dark:text-cyan-100"
              >
                <Upload className="h-5 w-5" />
                {t('selectImage')}
              </button>

              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200">
                {t('zoom')}
                <input type="range" min="1" max="2.5" step="0.05" value={photoZoom} onChange={(event) => setPhotoZoom(Number(event.target.value))} className="mt-2 w-full" />
              </label>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200">
                {t('horizontalCrop')}
                <input type="range" min="-35" max="35" step="1" value={photoOffsetX} onChange={(event) => setPhotoOffsetX(Number(event.target.value))} className="mt-2 w-full" />
              </label>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200">
                {t('verticalCrop')}
                <input type="range" min="-35" max="35" step="1" value={photoOffsetY} onChange={(event) => setPhotoOffsetY(Number(event.target.value))} className="mt-2 w-full" />
              </label>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={savePhoto}
                  disabled={!photoDraft}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-green-400 to-green-600 px-5 py-3 font-bold text-white shadow-xl shadow-green-500/40 disabled:opacity-50"
                >
                  <Save className="h-5 w-5" />
                  {t('save')}
                </button>
                <button
                  type="button"
                  onClick={deletePhoto}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-red-400 to-red-600 px-5 py-3 font-bold text-white shadow-xl shadow-red-500/40"
                >
                  <Trash2 className="h-5 w-5" />
                  {t('deletePhoto')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
