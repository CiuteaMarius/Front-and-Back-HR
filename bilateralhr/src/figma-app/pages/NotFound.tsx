import { useNavigate } from 'react-router';
import { Home, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export function NotFound() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center">
      <div className="text-center">
        <div className="aero-button inline-flex items-center justify-center w-24 h-24 rounded-2xl mb-6">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-red-400 to-orange-600 flex items-center justify-center shadow-2xl shadow-orange-500/50">
            <AlertCircle className="w-12 h-12 text-white" />
          </div>
        </div>
        <h1 className="text-6xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent mb-4">
          404
        </h1>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent mb-2">{t('pageNotFound')}</h2>
        <p className="text-cyan-700 dark:text-cyan-300 font-medium mb-8 max-w-md">
          {t('pageNotFoundDescription')}
        </p>
        <button
          onClick={() => navigate('/')}
          className="relative inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-b from-cyan-400 to-blue-600 border-2 border-white/40 border-t-white/60 text-white font-bold shadow-xl shadow-cyan-500/50 hover:scale-110 transition-all overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
          <Home className="w-5 h-5 relative z-10" />
          <span className="relative z-10">{t('goHome')}</span>
        </button>
      </div>
    </div>
  );
}
