import { useEffect, useState } from 'react';
import { CalendarClock, Plus, Save, Trash2, X } from 'lucide-react';
import type { Employee, EmployeeWorkSchedule, WorkShift } from '../types';
import { fetchEmployeeWorkSchedule, saveEmployeeWorkSchedule } from '../utils/data';
import { useLanguage } from '../contexts/LanguageContext';

const weekdays = [
  { id: '1', labelKey: 'monShort' },
  { id: '2', labelKey: 'tueShort' },
  { id: '3', labelKey: 'wedShort' },
  { id: '4', labelKey: 'thuShort' },
  { id: '5', labelKey: 'friShort' },
  { id: '6', labelKey: 'satShort' },
  { id: '7', labelKey: 'sunShort' },
] as const;

const defaultShifts: WorkShift[] = [
  { id: 'morning', name: 'Morning', startTime: '06:00' },
  { id: 'afternoon', name: 'Afternoon', startTime: '14:00' },
  { id: 'night', name: 'Night', startTime: '22:00' },
];

function localDateOnly(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function EmployeeScheduleModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { t } = useLanguage();
  const [schedule, setSchedule] = useState<EmployeeWorkSchedule | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchEmployeeWorkSchedule(employee.id)
      .then(setSchedule)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : t('scheduleLoadFailed')));
  }, [employee.id, t]);

  const updateSchedule = (changes: Partial<EmployeeWorkSchedule>) => {
    setSchedule((current) => current ? { ...current, ...changes } : current);
  };

  const setMode = (mode: EmployeeWorkSchedule['mode']) => {
    if (!schedule) return;
    const shifts = schedule.shiftDefinitions.length ? schedule.shiftDefinitions : defaultShifts;
    const firstShift = shifts[0];
    const weeklySchedule = mode === 'shifts'
      ? Object.fromEntries(Object.keys(schedule.weeklySchedule).map((day) => [day, { startTime: firstShift.startTime, shiftId: firstShift.id }]))
      : Object.fromEntries(Object.entries(schedule.weeklySchedule).map(([day, entry]) => [day, { startTime: entry.startTime }]));
    updateSchedule({
      mode,
      weeklySchedule,
      shiftDefinitions: shifts,
      rotationAnchorDate: schedule.rotationAnchorDate ?? localDateOnly(),
      rotationWorkDays: schedule.rotationWorkDays ?? 1,
      rotationOffDays: schedule.rotationOffDays ?? 1,
      rotationStartTime: schedule.rotationStartTime ?? '09:00',
    });
  };

  const toggleFixedDay = (day: string) => {
    if (!schedule) return;
    const weeklySchedule = { ...schedule.weeklySchedule };
    if (weeklySchedule[day]) {
      delete weeklySchedule[day];
    } else {
      weeklySchedule[day] = { startTime: Object.values(weeklySchedule)[0]?.startTime ?? '09:00' };
    }
    updateSchedule({ weeklySchedule });
  };

  const updateFixedStart = (startTime: string) => {
    if (!schedule) return;
    updateSchedule({
      weeklySchedule: Object.fromEntries(Object.keys(schedule.weeklySchedule).map((day) => [day, { startTime }])),
    });
  };

  const updateShift = (id: string, changes: Partial<WorkShift>) => {
    if (!schedule) return;
    const shiftDefinitions = schedule.shiftDefinitions.map((shift) => shift.id === id ? { ...shift, ...changes } : shift);
    const weeklySchedule = { ...schedule.weeklySchedule };
    Object.entries(weeklySchedule).forEach(([day, entry]) => {
      if (entry.shiftId === id && changes.startTime) weeklySchedule[day] = { ...entry, startTime: changes.startTime };
    });
    updateSchedule({ shiftDefinitions, weeklySchedule });
  };

  const addShift = () => {
    if (!schedule) return;
    const id = `shift-${Date.now()}`;
    updateSchedule({ shiftDefinitions: [...schedule.shiftDefinitions, { id, name: t('newShift'), startTime: '09:00' }] });
  };

  const removeShift = (id: string) => {
    if (!schedule || schedule.shiftDefinitions.length <= 1) return;
    const shiftDefinitions = schedule.shiftDefinitions.filter((shift) => shift.id !== id);
    const fallback = shiftDefinitions[0];
    const weeklySchedule = Object.fromEntries(
      Object.entries(schedule.weeklySchedule).map(([day, entry]) => [
        day,
        entry.shiftId === id ? { startTime: fallback.startTime, shiftId: fallback.id } : entry,
      ]),
    );
    updateSchedule({ shiftDefinitions, weeklySchedule });
  };

  const setShiftForDay = (day: string, shiftId: string) => {
    if (!schedule) return;
    const weeklySchedule = { ...schedule.weeklySchedule };
    if (!shiftId) {
      delete weeklySchedule[day];
    } else {
      const shift = schedule.shiftDefinitions.find((item) => item.id === shiftId);
      if (shift) weeklySchedule[day] = { startTime: shift.startTime, shiftId: shift.id };
    }
    updateSchedule({ weeklySchedule });
  };

  const save = async () => {
    if (!schedule) return;
    setSaving(true);
    setError('');
    try {
      await saveEmployeeWorkSchedule(schedule);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('scheduleSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const fixedStart = schedule ? Object.values(schedule.weeklySchedule)[0]?.startTime ?? '09:00' : '09:00';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-cyan-950/40 px-4 py-8 backdrop-blur-sm" onMouseDown={onClose}>
      <section className="aero-glass max-h-[calc(100vh-4rem)] w-full max-w-4xl overflow-y-auto rounded-3xl border-2 border-white/60 p-6 shadow-2xl shadow-cyan-950/35" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-white/70 bg-gradient-to-b from-cyan-300 via-sky-500 to-blue-700 text-white shadow-lg shadow-cyan-500/40">
              <CalendarClock className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-cyan-950 dark:text-cyan-100">{t('employeeSchedule')}</h2>
              <p className="font-bold text-cyan-700 dark:text-cyan-300">{employee.name} - {t('workNormHours')}: {employee.workNormHours ?? 8} h</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-cyan-300/50 bg-white/65 p-2 text-cyan-800 shadow-md transition hover:scale-105 dark:border-cyan-500/30 dark:bg-cyan-950/50 dark:text-cyan-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? <p className="mt-4 rounded-xl border border-rose-300/60 bg-rose-50/80 px-4 py-3 text-sm font-bold text-rose-700 dark:bg-rose-950/35 dark:text-rose-200">{error}</p> : null}
        {!schedule ? <p className="mt-6 font-bold text-cyan-700 dark:text-cyan-300">{t('loading')}</p> : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-cyan-300/50 bg-white/45 p-2 dark:border-cyan-500/25 dark:bg-cyan-950/25 sm:grid-cols-3">
              {(['fixed', 'shifts', 'rotating'] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => setMode(mode)} className={`rounded-xl px-4 py-3 text-sm font-black transition ${schedule.mode === mode ? 'bg-gradient-to-b from-cyan-300 to-blue-600 text-white shadow-lg shadow-cyan-500/30' : 'text-cyan-800 hover:bg-white/60 dark:text-cyan-200 dark:hover:bg-cyan-900/45'}`}>
                  {mode === 'fixed' ? t('fixedSchedule') : mode === 'shifts' ? t('shiftSchedule') : t('rotatingSchedule')}
                </button>
              ))}
            </div>

            {schedule.mode === 'fixed' ? (
              <div className="mt-5 space-y-5">
                <label className="block space-y-2">
                  <span className="text-sm font-black text-cyan-800 dark:text-cyan-200">{t('scheduleStartTime')}</span>
                  <input type="time" value={fixedStart} onChange={(event) => updateFixedStart(event.target.value)} className="aero-input w-full max-w-xs" />
                </label>
                <div>
                  <p className="mb-2 text-sm font-black text-cyan-800 dark:text-cyan-200">{t('workingDays')}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                    {weekdays.map((day) => {
                      const selected = Boolean(schedule.weeklySchedule[day.id]);
                      return <button key={day.id} type="button" onClick={() => toggleFixedDay(day.id)} className={`rounded-xl border-2 px-3 py-3 text-sm font-black shadow-sm transition hover:-translate-y-0.5 ${selected ? 'border-white/70 bg-gradient-to-b from-lime-300 to-emerald-600 text-white shadow-emerald-500/25' : 'border-cyan-200/60 bg-white/55 text-cyan-700 dark:border-cyan-700/40 dark:bg-cyan-950/30 dark:text-cyan-300'}`}>{t(day.labelKey)}</button>;
                    })}
                  </div>
                </div>
              </div>
            ) : schedule.mode === 'shifts' ? (
              <div className="mt-5 space-y-5">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-cyan-800 dark:text-cyan-200">{t('configuredShifts')}</p>
                    <button type="button" onClick={addShift} className="flex items-center gap-1 rounded-xl border-2 border-white/60 bg-gradient-to-b from-cyan-300 to-blue-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-cyan-500/25 transition hover:scale-105"><Plus className="h-4 w-4" />{t('addShift')}</button>
                  </div>
                  <div className="space-y-2">
                    {schedule.shiftDefinitions.map((shift) => (
                      <div key={shift.id} className="grid gap-2 rounded-xl border border-cyan-200/70 bg-white/55 p-3 dark:border-cyan-700/40 dark:bg-cyan-950/30 sm:grid-cols-[minmax(0,1fr)_150px_40px]">
                        <input value={shift.name} onChange={(event) => updateShift(shift.id, { name: event.target.value })} className="aero-input" />
                        <input type="time" value={shift.startTime} onChange={(event) => updateShift(shift.id, { startTime: event.target.value })} className="aero-input" />
                        <button type="button" disabled={schedule.shiftDefinitions.length <= 1} onClick={() => removeShift(shift.id)} className="flex items-center justify-center rounded-lg border border-rose-300/50 bg-rose-50/75 text-rose-600 transition hover:scale-105 disabled:opacity-40 dark:bg-rose-950/30 dark:text-rose-200"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-black text-cyan-800 dark:text-cyan-200">{t('weeklyShiftAssignment')}</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {weekdays.map((day) => (
                      <label key={day.id} className="flex items-center gap-3 rounded-xl border border-cyan-200/70 bg-white/55 px-3 py-2 dark:border-cyan-700/40 dark:bg-cyan-950/30">
                        <span className="w-10 text-sm font-black text-cyan-800 dark:text-cyan-200">{t(day.labelKey)}</span>
                        <select value={schedule.weeklySchedule[day.id]?.shiftId ?? ''} onChange={(event) => setShiftForDay(day.id, event.target.value)} className="aero-input min-w-0 flex-1">
                          <option value="">{t('dayOff')}</option>
                          {schedule.shiftDefinitions.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} - {shift.startTime}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <p className="rounded-xl border border-cyan-300/60 bg-cyan-50/70 px-4 py-3 text-sm font-bold text-cyan-700 dark:border-cyan-600/40 dark:bg-cyan-950/35 dark:text-cyan-200">{t('rotatingScheduleHelp')}</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="block text-sm font-black text-cyan-800 dark:text-cyan-200">{t('firstRotationWorkday')}</span>
                    <input type="date" value={schedule.rotationAnchorDate ?? localDateOnly()} onChange={(event) => updateSchedule({ rotationAnchorDate: event.target.value })} className="aero-input w-full" />
                  </label>
                  <label className="space-y-2">
                    <span className="block text-sm font-black text-cyan-800 dark:text-cyan-200">{t('scheduleStartTime')}</span>
                    <input type="time" value={schedule.rotationStartTime} onChange={(event) => updateSchedule({ rotationStartTime: event.target.value })} className="aero-input w-full" />
                  </label>
                  <label className="space-y-2">
                    <span className="block text-sm font-black text-cyan-800 dark:text-cyan-200">{t('consecutiveWorkDays')}</span>
                    <input type="number" min="1" max="31" step="1" value={schedule.rotationWorkDays} onChange={(event) => updateSchedule({ rotationWorkDays: Number(event.target.value) })} className="aero-input w-full" />
                  </label>
                  <label className="space-y-2">
                    <span className="block text-sm font-black text-cyan-800 dark:text-cyan-200">{t('consecutiveDaysOff')}</span>
                    <input type="number" min="1" max="31" step="1" value={schedule.rotationOffDays} onChange={(event) => updateSchedule({ rotationOffDays: Number(event.target.value) })} className="aero-input w-full" />
                  </label>
                </div>
                <p className="rounded-xl border border-lime-300/60 bg-lime-50/70 px-4 py-3 text-sm font-black text-emerald-700 dark:border-emerald-600/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                  {t('rotationExample', { work: schedule.rotationWorkDays, off: schedule.rotationOffDays })}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="rounded-xl border-2 border-white/60 bg-gradient-to-b from-slate-200 to-slate-400 px-5 py-2.5 font-black text-slate-800 shadow-lg transition hover:scale-105">{t('cancel')}</button>
              <button type="button" disabled={saving} onClick={save} className="flex items-center gap-2 rounded-xl border-2 border-white/70 bg-gradient-to-b from-lime-300 via-emerald-400 to-teal-700 px-5 py-2.5 font-black text-white shadow-xl shadow-emerald-500/30 transition hover:scale-105 disabled:opacity-60"><Save className="h-4 w-4" />{t('saveSchedule')}</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
