import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { Language } from '../types';
import { Settings as SettingsIcon, Globe, Sun, Moon } from 'lucide-react';

export function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const languages: { code: Language; name: string; region: string }[] = [
    { code: 'en', name: 'English', region: 'US' },
    { code: 'ro', name: 'Romana', region: 'RO' },
    { code: 'es', name: 'Espanol', region: 'ES' },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent">
          {t('settings')}
        </h1>
        <p className="text-cyan-700 dark:text-cyan-300 font-medium mt-1">{t('managePreferences')}</p>
      </div>

      <div className="aero-glass overflow-hidden">
        <div className="p-6 border-b border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex items-center gap-3">
            <div className="aero-button">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-xl shadow-cyan-500/50">
                <SettingsIcon className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent">{t('appearance')}</h2>
              <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">{t('customizeAppLooks')}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <h3 className="font-bold text-cyan-800 dark:text-cyan-200 mb-4">{t('theme')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => theme === 'dark' && toggleTheme()}
              className={`aero-glass p-6 border-2 transition-all hover:scale-105 ${
                theme === 'light'
                  ? 'border-cyan-500 bg-cyan-50/70 shadow-xl shadow-cyan-500/35'
                  : 'border-cyan-300/50 bg-white/70 dark:border-cyan-500/30 dark:bg-cyan-950/35'
              }`}
            >
              <div className="aero-button mx-auto mb-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-xl ${
                  theme === 'light' ? 'bg-gradient-to-br from-cyan-400 to-blue-600 shadow-cyan-500/50' : 'bg-gradient-to-br from-slate-300 to-slate-500 shadow-slate-500/50'
                }`}>
                  <Sun className="w-6 h-6 text-white" />
                </div>
              </div>
              <p className={`font-bold text-center ${
                theme === 'light' ? 'text-cyan-900 dark:text-cyan-100' : 'text-slate-800 dark:text-cyan-100'
              }`}>
                {t('lightMode')}
              </p>
            </button>

            <button
              onClick={() => theme === 'light' && toggleTheme()}
              className={`aero-glass p-6 border-2 transition-all hover:scale-105 ${
                theme === 'dark'
                  ? 'border-blue-400 shadow-xl shadow-blue-500/50'
                  : 'border-cyan-300/50 bg-white/70 dark:border-cyan-500/30 dark:bg-cyan-950/35'
              }`}
            >
              <div className="aero-button mx-auto mb-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-xl ${
                  theme === 'dark' ? 'bg-gradient-to-br from-purple-400 to-blue-600 shadow-blue-500/50' : 'bg-gradient-to-br from-slate-300 to-slate-500 shadow-slate-500/50'
                }`}>
                  <Moon className="w-6 h-6 text-white" />
                </div>
              </div>
              <p className={`font-bold text-center ${
                theme === 'dark' ? 'text-purple-700 dark:text-purple-200' : 'text-slate-800 dark:text-cyan-100'
              }`}>
                {t('darkMode')}
              </p>
            </button>
          </div>
        </div>
      </div>

      <div className="aero-glass overflow-hidden">
        <div className="p-6 border-b border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex items-center gap-3">
            <div className="aero-button">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-xl shadow-green-500/50">
                <Globe className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent">{t('language')}</h2>
              <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">{t('choosePreferredLanguage')}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`aero-glass p-6 border-2 transition-all hover:scale-105 ${
                  language === lang.code
                    ? 'border-emerald-500 bg-emerald-50/70 shadow-xl shadow-green-500/35 dark:border-emerald-300 dark:bg-emerald-950/30'
                    : 'border-cyan-300/50 bg-white/70 dark:border-cyan-500/30 dark:bg-cyan-950/35'
                }`}
              >
                <div
                  className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border-2 font-black tracking-wide shadow-lg ${
                    language === lang.code
                      ? 'border-emerald-200 bg-gradient-to-b from-white to-emerald-100 text-emerald-950 shadow-emerald-500/25 dark:border-emerald-300/60 dark:from-emerald-200 dark:to-emerald-500 dark:text-emerald-950'
                      : 'border-cyan-200 bg-gradient-to-b from-white to-slate-100 text-slate-800 shadow-cyan-500/15 dark:border-cyan-400/40 dark:from-cyan-900 dark:to-cyan-700 dark:text-cyan-50'
                  }`}
                >
                  {lang.region}
                </div>
                <p className={`font-bold text-center ${
                  language === lang.code
                    ? 'text-emerald-950 dark:text-emerald-100'
                    : 'text-slate-800 dark:text-cyan-100'
                }`}>
                  {lang.name}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="aero-glass overflow-hidden">
        <div className="p-6 border-b border-cyan-300/30 dark:border-cyan-500/20">
          <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent">{t('account')}</h2>
          <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">{t('manageAccountSettings')}</p>
        </div>
        <div className="p-6 space-y-4">
          <button className="w-full p-4 rounded-xl aero-glass border-2 border-cyan-300/50 bg-white/70 dark:border-cyan-500/30 dark:bg-cyan-950/35 hover:scale-105 hover:shadow-xl transition-all text-left">
            <p className="font-bold text-slate-800 dark:text-cyan-100">{t('changePassword')}</p>
            <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium mt-1">{t('updatePassword')}</p>
          </button>
          <button className="w-full p-4 rounded-xl aero-glass border-2 border-cyan-300/50 bg-white/70 dark:border-cyan-500/30 dark:bg-cyan-950/35 hover:scale-105 hover:shadow-xl transition-all text-left">
            <p className="font-bold text-slate-800 dark:text-cyan-100">{t('emailNotifications')}</p>
            <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium mt-1">{t('manageNotificationPreferences')}</p>
          </button>
          <button className="w-full p-4 rounded-xl aero-glass border-2 border-cyan-300/50 bg-white/70 dark:border-cyan-500/30 dark:bg-cyan-950/35 hover:scale-105 hover:shadow-xl transition-all text-left">
            <p className="font-bold text-slate-800 dark:text-cyan-100">{t('privacySettings')}</p>
            <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium mt-1">{t('controlPrivacyOptions')}</p>
          </button>
        </div>
      </div>
    </div>
  );
}
