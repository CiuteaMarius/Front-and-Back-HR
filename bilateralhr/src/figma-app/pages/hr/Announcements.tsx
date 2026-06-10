import { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Megaphone, Send, Trash2 } from 'lucide-react';
import { createAnnouncement, fetchAnnouncements, fetchDepartments, fetchEmployees, subscribeToDataChanges } from '../../utils/data';
import type { Announcement, Department, Employee } from '../../types';

export function Announcements() {
  const { t, formatDate } = useLanguage();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetType, setTargetType] = useState<Announcement['targetAudience']>('all');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [hiddenAnnouncements, setHiddenAnnouncements] = useState<Announcement[]>([]);
  const [historyMessage, setHistoryMessage] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [hoveredAnnouncement, setHoveredAnnouncement] = useState<Announcement | null>(null);
  const [hoverPopupPosition, setHoverPopupPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    const loadData = async () => {
      const [announcementItems, departmentItems, employeeItems] = await Promise.all([
        fetchAnnouncements(),
        fetchDepartments(),
        fetchEmployees(),
      ]);

      setAnnouncements(announcementItems);
      setHiddenAnnouncements([]);
      setHistoryMessage('');
      setDepartments(departmentItems);
      setEmployees(employeeItems.filter((employee) => employee.status === 'active'));
    };

    loadData();
    return subscribeToDataChanges(loadData);
  }, []);

  useEffect(() => {
    if (!historyMessage) return;
    const timer = window.setTimeout(() => setHistoryMessage(''), 2400);
    return () => window.clearTimeout(timer);
  }, [historyMessage]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const department = departments.find((item) => item.id === selectedDepartment);
    await createAnnouncement({
      title,
      content,
      targetAudience: targetType,
      departmentId: targetType === 'department' ? selectedDepartment : undefined,
      departmentName: targetType === 'department' ? department?.name : undefined,
      targetIds: targetType === 'specific' ? selectedEmployees : undefined,
    });
    setTitle('');
    setContent('');
    setTargetType('all');
    setSelectedDepartment('');
    setSelectedEmployees([]);
  };

  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployees(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    setAnnouncements((items) => {
      const announcement = items.find((item) => item.id === announcementId);
      if (announcement) {
        setHiddenAnnouncements((hidden) => [announcement, ...hidden]);
        setHistoryMessage('');
      }
      return items.filter((item) => item.id !== announcementId);
    });
  };

  const handleDeleteAllAnnouncements = async () => {
    if (announcements.length === 0) {
      setHistoryMessage(t('noAnnouncementsToDelete'));
      return;
    }

    setHiddenAnnouncements((hidden) => [...announcements, ...hidden]);
    setAnnouncements([]);
    setHistoryMessage('');
  };

  const restoreLastAnnouncement = () => {
    if (hiddenAnnouncements.length === 0) {
      setHistoryMessage(t('noAnnouncementsToRestore'));
      return;
    }

    const [lastHidden, ...remainingHidden] = hiddenAnnouncements;
    setAnnouncements((items) => [lastHidden, ...items]);
    setHiddenAnnouncements(remainingHidden);
    setHistoryMessage(t('lastAnnouncementRestored'));
  };

  const restoreAllAnnouncements = () => {
    if (hiddenAnnouncements.length === 0) {
      setHistoryMessage(t('noAnnouncementsToRestore'));
      return;
    }

    setAnnouncements((items) => [...hiddenAnnouncements, ...items]);
    setHiddenAnnouncements([]);
    setHistoryMessage(t('allAnnouncementsRestored'));
  };

  const showAnnouncementPreview = (announcement: Announcement, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setHoveredAnnouncement(announcement);
    setHoverPopupPosition({
      left: Math.min(window.innerWidth - 336, rect.right + 16),
      top: Math.max(80, Math.min(window.innerHeight - 260, rect.top + rect.height / 2 - 120)),
    });
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent">
          {t('announcements')}
        </h1>
        <p className="text-cyan-700 dark:text-cyan-300 font-medium mt-1">{t('sendAnnouncements')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Create Announcement */}
        <div className="aero-glass overflow-hidden h-fit">
          <div className="p-6 border-b border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
            <div className="flex items-center gap-3">
              <div className="aero-button">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-xl shadow-cyan-500/50">
                  <Megaphone className="w-6 h-6 text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent">{t('newAnnouncement')}</h2>
                <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">{t('createAndSend')}</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('title')}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="aero-input w-full text-cyan-900 placeholder:text-cyan-800/70 dark:text-cyan-100 dark:placeholder:text-cyan-300/60"
                placeholder={t('announcementTitle')}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('message')}
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={4}
                className="aero-input w-full resize-none text-cyan-900 placeholder:text-cyan-800/70 dark:text-cyan-100 dark:placeholder:text-cyan-300/60"
                placeholder={t('announcementContent')}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('targetAudience')}
              </label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as Announcement['targetAudience'])}
                className="aero-input w-full text-cyan-900 dark:text-cyan-100"
              >
                <option value="all">{t('allEmployees')}</option>
                <option value="department">{t('specificDepartment')}</option>
                <option value="specific">{t('specificEmployees')}</option>
              </select>
            </div>

            {targetType === 'department' && (
              <div>
                <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                  {t('selectDepartment')}
                </label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  required
                  className="aero-input w-full text-cyan-900 dark:text-cyan-100"
                >
                  <option value="">{t('chooseDepartment')}</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
            )}

            {targetType === 'specific' && (
              <div>
                <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                  {t('selectEmployees', { count: selectedEmployees.length })}
                </label>
                <div className="max-h-48 overflow-y-auto space-y-2 p-3 rounded-xl bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20 border border-cyan-300/30 dark:border-cyan-500/20">
                  {employees.map((emp) => (
                    <label key={emp.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-cyan-100/50 dark:hover:bg-cyan-800/30 cursor-pointer transition-all">
                      <input
                        type="checkbox"
                        checked={selectedEmployees.includes(emp.id)}
                        onChange={() => toggleEmployee(emp.id)}
                        className="w-4 h-4 rounded border-cyan-300 text-cyan-600 focus:ring-cyan-500"
                      />
                      <span className="text-sm text-cyan-900 dark:text-cyan-200 font-medium">{emp.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              className="relative w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-b from-cyan-400 to-blue-600 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-cyan-500/50 hover:scale-105 transition-all overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
              <Send className="w-5 h-5 relative z-10" />
              <span className="relative z-10">{t('sendAnnouncement')}</span>
            </button>
          </form>
        </div>

        {/* Recent Announcements */}
        <div className="aero-glass h-[500px] flex flex-col relative !overflow-visible">
          <div className="relative z-20 p-6 border-b border-cyan-300/30 dark:border-cyan-500/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent">{t('recentAnnouncements')}</h2>
                <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium mt-1">{t('previouslySentMessages')}</p>
              </div>
              <div className="relative z-30 flex flex-wrap justify-end gap-2">
                {historyMessage && (
                  <div className="absolute right-0 bottom-full z-[80] mb-2 min-w-[250px] rounded-xl border border-white/60 bg-white/90 px-4 py-2 text-sm font-bold text-cyan-800 shadow-xl shadow-cyan-500/30 backdrop-blur-xl dark:bg-cyan-950/90 dark:text-cyan-100">
                    {historyMessage}
                  </div>
                )}
                <button
                  type="button"
                  onClick={restoreLastAnnouncement}
                  className="px-3 py-2 rounded-xl border-2 border-white/50 bg-white/60 text-cyan-800 text-xs font-bold shadow-lg dark:bg-cyan-950/40 dark:text-cyan-100"
                >
                  {t('restoreLast')}
                </button>
                <button
                  type="button"
                  onClick={restoreAllAnnouncements}
                  className="px-3 py-2 rounded-xl border-2 border-white/50 bg-white/60 text-cyan-800 text-xs font-bold shadow-lg dark:bg-cyan-950/40 dark:text-cyan-100"
                >
                  {t('restoreAll')}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAllAnnouncements}
                  className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-b from-red-400 to-red-600 border-2 border-white/40 border-t-white/60 text-white text-xs font-bold shadow-xl shadow-red-500/40 transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                  <Trash2 className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">{t('deleteAll')}</span>
                </button>
              </div>
            </div>
          </div>
          <div className="divide-y divide-cyan-300/30 dark:divide-cyan-500/20 flex-1 overflow-y-auto rounded-b-2xl">
            {announcements.length === 0 ? (
              <p className="p-6 text-cyan-800 dark:text-cyan-200 font-medium">{t('noAnnouncements')}</p>
            ) : announcements.map((announcement) => (
              <div
                key={announcement.id}
                onMouseEnter={(event) => showAnnouncementPreview(announcement, event.currentTarget)}
                onMouseMove={(event) => showAnnouncementPreview(announcement, event.currentTarget)}
                onMouseLeave={() => setHoveredAnnouncement(null)}
                className="group relative p-4 hover:z-30 hover:bg-gradient-to-r hover:from-cyan-50/50 hover:to-blue-50/50 dark:hover:from-cyan-900/20 dark:hover:to-blue-900/20 transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate pr-2 text-base font-bold text-cyan-800 underline-offset-4 transition group-hover:text-cyan-600 group-hover:underline dark:text-cyan-200 dark:group-hover:text-cyan-100">
                      {announcement.title}
                    </h3>
                    <p className="mt-1 text-xs font-medium text-cyan-600 dark:text-cyan-400">
                      {formatDate(new Date(announcement.date))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border-2 border-white/40 shadow-lg ${
                      announcement.targetAudience === 'all'
                        ? 'bg-gradient-to-r from-blue-400 to-cyan-500 text-white shadow-cyan-500/50'
                        : announcement.targetAudience === 'department'
                        ? 'bg-gradient-to-r from-purple-400 to-blue-500 text-white shadow-blue-500/50'
                        : 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-green-500/50'
                    }`}>
                      {announcement.targetAudience === 'all' && t('all')}
                      {announcement.targetAudience === 'department' && t('department')}
                      {announcement.targetAudience === 'specific' && t('specific')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteAnnouncement(announcement.id)}
                      className="relative p-2 rounded-xl bg-gradient-to-b from-red-400 to-red-600 border-2 border-white/40 border-t-white/60 text-white shadow-lg shadow-red-500/40 transition-all overflow-hidden"
                      title={t('deleteAnnouncement')}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
                      <Trash2 className="w-4 h-4 relative z-10" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {hoveredAnnouncement && (
        <div
          className="pointer-events-none fixed z-[300] w-80 rounded-2xl border-2 border-white/70 bg-white/90 p-4 shadow-2xl shadow-cyan-500/30 backdrop-blur-xl dark:border-cyan-400/30 dark:bg-cyan-950/95"
          style={{ left: hoverPopupPosition.left, top: hoverPopupPosition.top }}
        >
          <p className="relative z-10 text-xs font-black uppercase tracking-wide text-cyan-600 dark:text-cyan-300">
            {formatDate(new Date(hoveredAnnouncement.date))}
          </p>
          <h3 className="relative z-10 mt-1 text-lg font-black text-cyan-900 dark:text-cyan-100">
            {hoveredAnnouncement.title}
          </h3>
          <p className="relative z-10 mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm font-semibold leading-relaxed text-cyan-800 dark:text-cyan-200">
            {hoveredAnnouncement.content}
          </p>
          {hoveredAnnouncement.departmentName && (
            <p className="relative z-10 mt-3 rounded-xl border border-cyan-200/70 bg-cyan-50/70 px-3 py-2 text-xs font-bold text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-900/30 dark:text-cyan-200">
              {t('department')}: {hoveredAnnouncement.departmentName}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
