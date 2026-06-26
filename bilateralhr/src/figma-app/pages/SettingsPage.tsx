import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { Language } from '../types';
import { Settings as SettingsIcon, Globe, Sun, Moon, Coins } from 'lucide-react';
import { PageInfoButton } from '../components/PageInfoButton';
import { AeroIcon } from '../components/AeroIcon';

export function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const {
    currency,
    setCurrency,
    ronDisplayMode,
    setRonDisplayMode,
    currencyOptions,
    exchangeRate,
    exchangeRateDate,
    exchangeStatus,
  } = useCurrency();

  const languages: { code: Language; name: string; region: string }[] = [
    { code: 'en', name: 'English', region: 'US' },
    { code: 'ro', name: 'Romana', region: 'RO' },
    { code: 'es', name: 'Espanol', region: 'ES' },
  ];

  return (
    <div className="relative max-w-4xl space-y-6 pt-14">
      <PageInfoButton title={t('settings')} description={t('settingsInfo')} />

      <div className="aero-glass overflow-hidden">
        <div className="p-6 border-b border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex items-center gap-3">
            <AeroIcon icon={SettingsIcon} variant="cyan" />
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
              <AeroIcon icon={Sun} variant={theme === 'light' ? 'amber' : 'cyan'} className="mx-auto mb-3" />
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
              <AeroIcon icon={Moon} variant={theme === 'dark' ? 'violet' : 'cyan'} className="mx-auto mb-3" />
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
            <AeroIcon icon={Globe} variant="cyan" />
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
        <div className="p-6 border-b border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
          <div className="flex items-center gap-3">
            <AeroIcon icon={Coins} variant="cyan" />
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent">{t('currency')}</h2>
              <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">{t('currencySettingsNote')}</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {currencyOptions.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => setCurrency(option.code)}
                className={`aero-glass p-5 border-2 transition-all hover:scale-105 ${
                  currency === option.code
                    ? 'border-cyan-500 bg-cyan-50/70 shadow-xl shadow-cyan-500/35 dark:border-cyan-300 dark:bg-cyan-950/30'
                    : 'border-cyan-300/50 bg-white/70 dark:border-cyan-500/30 dark:bg-cyan-950/35'
                }`}
              >
                <p className={`text-xl font-black text-center ${
                  currency === option.code ? 'text-cyan-950 dark:text-cyan-100' : 'text-slate-800 dark:text-cyan-100'
                }`}>
                  {option.code}
                </p>
                <p className="mt-1 text-center text-sm font-bold text-cyan-700 dark:text-cyan-300">{t(option.labelKey)}</p>
              </button>
            ))}
          </div>

          {currency === 'RON' ? (
            <button
              type="button"
              onClick={() => setRonDisplayMode(ronDisplayMode === 'code' ? 'words' : 'code')}
              className={`flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl border-2 p-4 text-left shadow-lg transition hover:scale-[1.01] ${
                ronDisplayMode === 'words'
                  ? 'border-emerald-300/70 bg-emerald-50/75 dark:border-emerald-400/30 dark:bg-emerald-950/25'
                  : 'border-cyan-200/70 bg-white/60 dark:border-cyan-500/25 dark:bg-cyan-950/35'
              }`}
            >
              <div>
                <p className="font-black text-cyan-900 dark:text-cyan-100">{t('ronWordsToggle')}</p>
                <p className="text-sm font-bold text-cyan-700 dark:text-cyan-300">{ronDisplayMode === 'words' ? t('ronShownAsWords') : t('ronShownAsCode')}</p>
              </div>
              <span className={`flex h-8 w-16 items-center rounded-full border-2 border-white/70 p-1 shadow-inner transition ${
                ronDisplayMode === 'words' ? 'justify-end bg-gradient-to-r from-emerald-300 to-cyan-600' : 'justify-start bg-slate-300/80 dark:bg-slate-700'
              }`}>
                <span className="h-5 w-5 rounded-full bg-white shadow-lg" />
              </span>
            </button>
          ) : (
            <div className="rounded-2xl border border-cyan-200/70 bg-white/55 px-4 py-3 text-sm font-bold text-cyan-800 shadow-inner dark:border-cyan-500/25 dark:bg-cyan-950/35 dark:text-cyan-100">
              {exchangeStatus === 'loading'
                ? t('exchangeRatesLoading')
                : exchangeStatus === 'error'
                ? t('exchangeRatesUnavailable')
                : t('exchangeRateLoaded', { rate: exchangeRate.toFixed(4), currency, date: exchangeRateDate || '-' })}
            </div>
          )}
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
