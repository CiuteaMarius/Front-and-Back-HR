import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Trash2, UsersRound, X } from 'lucide-react';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Department, Employee } from '../../types';
import {
  DEFAULT_DEPARTMENT_ICON_KEY,
  departmentIconCatalog,
  getDepartmentIcon,
} from '../../utils/departmentIcons';
import { AeroIcon } from '../../components/AeroIcon';
import {
  addDepartment,
  deleteDepartment,
  fetchDepartments,
  fetchEmployees,
  subscribeToDataChanges,
  updateDepartmentIcon,
} from '../../utils/data';
import { PageInfoButton } from '../../components/PageInfoButton';

type IconPickerTarget = Department | 'new' | null;

export function ManageDepartments() {
  const { t } = useLanguage();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptIconKey, setNewDeptIconKey] = useState(DEFAULT_DEPARTMENT_ICON_KEY);
  const [showAddForm, setShowAddForm] = useState(false);
  const [iconPickerTarget, setIconPickerTarget] = useState<IconPickerTarget>(null);
  const [departmentToDelete, setDepartmentToDelete] = useState<Department | null>(null);
  const [blockedDepartment, setBlockedDepartment] = useState<Department | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const [departmentItems, employeeItems] = await Promise.all([
        fetchDepartments(),
        fetchEmployees(),
      ]);
      setDepartments(departmentItems);
      setEmployees(employeeItems);
    };

    loadData();
    return subscribeToDataChanges(loadData);
  }, []);

  const employeesByDepartment = useMemo(() => {
    const grouped = new Map<string, Employee[]>();

    employees.forEach((employee) => {
      if (!employee.departmentId || employee.status === 'fired') return;
      const members = grouped.get(employee.departmentId) ?? [];
      members.push(employee);
      grouped.set(employee.departmentId, members);
    });

    return grouped;
  }, [employees]);

  const selectedNewIcon = getDepartmentIcon(newDeptIconKey);

  const handleAddDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newDeptName.trim()) return;

    await addDepartment(newDeptName.trim(), newDeptIconKey);
    setNewDeptName('');
    setNewDeptIconKey(DEFAULT_DEPARTMENT_ICON_KEY);
    setShowAddForm(false);
  };

  const handleChooseIcon = async (iconKey: string) => {
    if (iconPickerTarget === 'new') {
      setNewDeptIconKey(iconKey);
    } else if (iconPickerTarget) {
      await updateDepartmentIcon(iconPickerTarget.id, iconKey);
    }

    setIconPickerTarget(null);
  };

  const requestDeleteDepartment = (id: string) => {
    const department = departments.find((item) => item.id === id);
    if (department && department.employeeCount > 0) {
      setBlockedDepartment(department);
      return;
    }
    setDepartmentToDelete(department ?? null);
  };

  const confirmDeleteDepartment = async () => {
    if (!departmentToDelete) return;
    await deleteDepartment(departmentToDelete.id);
    setDepartmentToDelete(null);
  };

  const closeAddForm = () => {
    setShowAddForm(false);
    setNewDeptName('');
    setNewDeptIconKey(DEFAULT_DEPARTMENT_ICON_KEY);
  };

  return (
    <div className="relative max-w-6xl space-y-6 pt-14">
      <PageInfoButton title={t('departments')} description={t('departmentsInfo')} />
      <section className="aero-glass overflow-visible rounded-[2rem] border border-white/50 bg-white/35 p-5 shadow-xl shadow-cyan-500/20 backdrop-blur-xl dark:bg-cyan-950/20 sm:p-6">
        <div className="flex flex-wrap items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => setShowAddForm((current) => !current)}
            className="relative flex items-center gap-2 overflow-hidden rounded-xl border-2 border-white/40 border-t-white/60 bg-gradient-to-b from-cyan-400 to-blue-600 px-6 py-3 font-bold text-white shadow-xl shadow-cyan-500/50 transition-all hover:scale-105"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50" />
            <Plus className="relative z-10 h-5 w-5" />
            <span className="relative z-10">{t('addDepartment')}</span>
          </button>
        </div>

        {showAddForm ? (
          <div className="aero-glass mt-5 rounded-3xl p-6">
            <form onSubmit={handleAddDepartment} className="flex flex-col gap-4 md:flex-row md:items-center">
              <input
                type="text"
                value={newDeptName}
                onChange={(event) => setNewDeptName(event.target.value)}
                placeholder={t('departmentName')}
                className="aero-input min-w-0 flex-1 text-black placeholder:text-black dark:text-cyan-100 dark:placeholder:text-cyan-200"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setIconPickerTarget('new')}
                className="flex min-w-64 items-center gap-3 rounded-xl border-2 border-cyan-300/60 bg-white/65 px-3 py-2 text-left shadow-lg shadow-cyan-600/15 transition hover:-translate-y-0.5 hover:bg-white/85 dark:border-cyan-500/30 dark:bg-cyan-950/45 dark:hover:bg-cyan-900/60"
              >
                <IconPedestal iconKey={selectedNewIcon.key} size="small" />
                <span>
                  <span className="block text-xs font-bold uppercase tracking-wide text-cyan-600 dark:text-cyan-300">{t('selectedDepartmentIcon')}</span>
                  <span className="block font-black text-cyan-950 dark:text-white">{selectedNewIcon.label}</span>
                </span>
              </button>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="relative overflow-hidden rounded-xl border-2 border-white/40 border-t-white/60 bg-gradient-to-b from-green-400 to-green-600 px-6 py-3 font-bold text-white shadow-xl shadow-green-500/50 transition-all hover:scale-105"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50" />
                  <span className="relative z-10">{t('add')}</span>
                </button>
                <button
                  type="button"
                  onClick={closeAddForm}
                  className="relative overflow-hidden rounded-xl border-2 border-white/40 border-t-white/60 bg-gradient-to-b from-slate-300 to-slate-500 px-6 py-3 font-bold text-white shadow-xl shadow-slate-500/40 transition-all hover:scale-105"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/35 to-transparent opacity-50" />
                  <span className="relative z-10">{t('cancel')}</span>
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-8 pb-10 pt-6 md:grid-cols-2">
          {departments.map((department) => {
            const members = employeesByDepartment.get(department.id) ?? [];
            const icon = getDepartmentIcon(department.iconKey);

            return (
              <article
                key={department.id}
                className="group relative isolate rounded-[1.75rem] border-2 border-white/80 bg-gradient-to-br from-white/95 via-cyan-50/90 to-sky-200/80 p-5 shadow-[0_9px_0_#66b9ce,0_16px_0_#277999,0_24px_30px_rgba(8,82,120,0.28),inset_0_2px_0_rgba(255,255,255,0.95)] transition duration-300 hover:z-30 hover:-translate-y-1.5 hover:shadow-[0_13px_0_#66b9ce,0_21px_0_#277999,0_30px_36px_rgba(8,82,120,0.32),inset_0_2px_0_rgba(255,255,255,0.95)] dark:border-cyan-200/35 dark:from-slate-800/95 dark:via-cyan-950/95 dark:to-blue-950/95 dark:shadow-[0_9px_0_#14566e,0_16px_0_#082e48,0_24px_30px_rgba(0,0,0,0.4),inset_0_2px_0_rgba(165,243,252,0.22)] dark:hover:shadow-[0_13px_0_#14566e,0_21px_0_#082e48,0_30px_36px_rgba(0,0,0,0.46),inset_0_2px_0_rgba(165,243,252,0.22)]"
              >
              <div className="pointer-events-none absolute inset-x-5 top-2 h-8 rounded-full bg-gradient-to-b from-white/70 to-transparent blur-sm dark:from-cyan-100/10" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <button
                    type="button"
                    onClick={() => setIconPickerTarget(department)}
                    className="shrink-0 text-left transition hover:-translate-y-1"
                    title={t('changeDepartmentIcon')}
                  >
                    <IconPedestal iconKey={icon.key} />
                  </button>
                  <div className="min-w-0 pt-1">
                    <h2 className="truncate bg-gradient-to-r from-cyan-700 to-blue-800 bg-clip-text text-xl font-black text-transparent dark:from-cyan-200 dark:to-blue-200">
                      {department.name}
                    </h2>
                    <div className="mt-3 flex items-center gap-2 text-sm font-bold text-cyan-800 dark:text-cyan-100">
                      <UsersRound className="h-4 w-4" />
                      <span>{t('employeesCount', { count: department.employeeCount })}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => requestDeleteDepartment(department.id)}
                  className="relative shrink-0 overflow-hidden rounded-xl border-2 border-white/55 bg-gradient-to-b from-red-300 via-red-500 to-red-700 p-2 text-white shadow-[0_4px_0_#9f1239,0_8px_14px_rgba(190,24,93,0.24)] transition hover:-translate-y-0.5"
                  title={t('deleteDepartment')}
                >
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/45 to-transparent" />
                  <Trash2 className="relative z-10 h-5 w-5" />
                </button>
              </div>

              <p className="relative mt-5 text-xs font-bold text-cyan-700/75 dark:text-cyan-300/75">{t('departmentMembersHover')}</p>

              <DepartmentMembersPopup department={department} members={members} />
              </article>
            );
          })}
        </div>
      </section>

      {iconPickerTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-cyan-950/40 px-4 py-8 backdrop-blur-sm"
          onMouseDown={() => setIconPickerTarget(null)}
        >
          <section
            className="aero-glass max-h-[calc(100vh-4rem)] w-full max-w-5xl overflow-y-auto rounded-3xl border-2 border-white/60 p-6 shadow-2xl shadow-cyan-950/35"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-cyan-950 dark:text-cyan-100">{t('chooseDepartmentIcon')}</h2>
                {iconPickerTarget !== 'new' ? (
                  <p className="mt-1 font-bold text-cyan-700 dark:text-cyan-300">{iconPickerTarget.name}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIconPickerTarget(null)}
                className="rounded-xl border border-cyan-300/50 bg-white/65 p-2 text-cyan-800 shadow-md transition hover:scale-105 dark:border-cyan-500/30 dark:bg-cyan-950/50 dark:text-cyan-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {departmentIconCatalog.map((icon) => {
                const isSelected = iconPickerTarget === 'new'
                  ? newDeptIconKey === icon.key
                  : iconPickerTarget.iconKey === icon.key;

                return (
                  <button
                    key={icon.key}
                    type="button"
                    onClick={() => handleChooseIcon(icon.key)}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left shadow-md transition hover:-translate-y-1 hover:shadow-xl ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-100/80 shadow-cyan-500/25 dark:border-cyan-300 dark:bg-cyan-800/45'
                        : 'border-white/70 bg-white/55 dark:border-cyan-500/20 dark:bg-cyan-950/35'
                    }`}
                  >
                    <IconPedestal iconKey={icon.key} size="small" />
                    <span className="min-w-0">
                      <span className="block font-black text-cyan-950 dark:text-white">{icon.label}</span>
                      <span className="mt-0.5 block text-xs font-bold text-cyan-700 dark:text-cyan-300">
                        {t('recommendedFor')}: {icon.recommendedFor}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {departmentToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-cyan-950/30 px-4 backdrop-blur-sm">
          <div className="aero-glass w-full max-w-md border-2 border-white/50 p-6 shadow-2xl shadow-cyan-500/40">
            <div className="mb-4 flex items-center gap-3">
              <AeroIcon icon={Trash2} variant="rose" />
              <div>
                <h2 className="text-xl font-bold text-cyan-900 dark:text-cyan-100">{t('deleteDepartmentQuestion')}</h2>
                <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">{departmentToDelete.name}</p>
              </div>
            </div>
            <p className="mb-6 font-medium text-cyan-800 dark:text-cyan-200">{t('deleteDepartmentConfirm')}</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDepartmentToDelete(null)} className="rounded-xl border-2 border-white/50 bg-gradient-to-b from-slate-200 to-slate-400 px-5 py-2.5 font-bold text-slate-800 shadow-lg transition hover:scale-105">
                {t('cancel')}
              </button>
              <button type="button" onClick={confirmDeleteDepartment} className="relative overflow-hidden rounded-xl border-2 border-white/50 bg-gradient-to-b from-red-400 to-red-600 px-5 py-2.5 font-bold text-white shadow-xl shadow-red-500/40 transition hover:scale-105">
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50" />
                <span className="relative z-10">{t('delete')}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {blockedDepartment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-cyan-950/30 px-4 backdrop-blur-sm">
          <div className="aero-glass w-full max-w-md border-2 border-white/50 p-6 shadow-2xl shadow-cyan-500/40">
            <div className="mb-4 flex items-center gap-3">
              <AeroIcon icon={UsersRound} variant="amber" />
              <div>
                <h2 className="text-xl font-bold text-cyan-900 dark:text-cyan-100">{t('departmentInUse')}</h2>
                <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">{blockedDepartment.name}</p>
              </div>
            </div>
            <p className="mb-6 font-medium text-cyan-800 dark:text-cyan-200">{t('departmentInUseHelp')}</p>
            <div className="flex justify-end">
              <button type="button" onClick={() => setBlockedDepartment(null)} className="relative overflow-hidden rounded-xl border-2 border-white/50 bg-gradient-to-b from-cyan-400 to-blue-600 px-5 py-2.5 font-bold text-white shadow-xl shadow-cyan-500/40 transition hover:scale-105">
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50" />
                <span className="relative z-10">{t('ok')}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconPedestal({ iconKey, size = 'normal' }: { iconKey: string; size?: 'normal' | 'small' }) {
  const icon = getDepartmentIcon(iconKey);
  const Icon = icon.Icon;
  const pedestalSize = size === 'small' ? 'h-12 w-12 rounded-xl' : 'h-20 w-20 rounded-[1.35rem]';
  const iconSize = size === 'small' ? 'h-6 w-6' : 'h-10 w-10';
  const depth = size === 'small'
    ? 'shadow-[0_4px_0_rgba(8,47,73,0.38),0_7px_12px_rgba(8,47,73,0.2)]'
    : 'shadow-[0_7px_0_rgba(8,47,73,0.45),0_13px_18px_rgba(8,47,73,0.24)]';

  return (
    <span className={`relative flex ${pedestalSize} ${depth} items-center justify-center overflow-hidden border-2 border-white/70 bg-gradient-to-br ${icon.tileClass} ${icon.shadowClass}`}>
      <span className="absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/55 to-transparent" />
      <Icon className={`relative z-10 ${iconSize} text-white drop-shadow-md`} strokeWidth={2.35} />
    </span>
  );
}

function DepartmentMembersPopup({ department, members }: { department: Department; members: Employee[] }) {
  const { t } = useLanguage();

  return (
    <div className="pointer-events-none invisible absolute left-0 right-0 top-[calc(100%+1.35rem)] z-40 translate-y-2 opacity-0 transition duration-200 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
      <div className="rounded-2xl border-2 border-white/80 bg-gradient-to-br from-white/95 via-cyan-50/95 to-sky-100/95 p-4 shadow-[0_12px_28px_rgba(8,82,120,0.32),inset_0_2px_0_rgba(255,255,255,0.9)] backdrop-blur-xl dark:border-cyan-300/30 dark:from-slate-800/98 dark:via-cyan-950/98 dark:to-blue-950/98">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-300">{t('departmentMembers')}</p>
        <h3 className="mt-1 font-black text-cyan-950 dark:text-white">{department.name}</h3>
        {members.length > 0 ? (
          <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
            {members.map((employee) => (
              <div key={employee.id} className="flex items-center gap-2 rounded-xl border border-cyan-200/70 bg-white/70 px-2.5 py-2 shadow-sm dark:border-cyan-700/50 dark:bg-cyan-900/35">
                <ProfileAvatar name={employee.name} className="h-8 w-8 rounded-lg text-[9px]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-cyan-950 dark:text-cyan-50">{employee.name}</span>
                  <span className="block truncate text-xs font-semibold text-cyan-700 dark:text-cyan-300">{employee.position || employee.employeeCode || employee.email}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-cyan-700 dark:text-cyan-300">{t('noDepartmentMembers')}</p>
        )}
      </div>
    </div>
  );
}
