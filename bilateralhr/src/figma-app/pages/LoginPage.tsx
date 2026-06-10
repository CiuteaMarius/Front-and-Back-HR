import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Mail, Lock, User, Users, Briefcase, Sparkles } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [quickLoginRole, setQuickLoginRole] = useState<'hr' | 'employee' | 'manager' | null>(null);
  const { login, user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      if (user.role === 'hr') {
        navigate('/hr/dashboard');
      } else {
        navigate('/employee/dashboard');
      }
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError(t('enterEmailAndPassword'));
      return;
    }

    const result = await login(email, password);
    if (!result.success) {
      setError(result.message || t('loginFailed'));
    }
  };

  const handleQuickLogin = async (role: 'hr' | 'employee' | 'manager') => {
    const demoAccounts = {
      hr: { email: 'sarah.johnson@hr.com', password: 'albah23' },
      manager: { email: 'michael.chen@manager.com', password: 'gigi11' },
      employee: { email: 'emily.rodriguez@employee.com', password: 'locked202' },
    };

    const account = demoAccounts[role];
    setEmail(account.email);
    setPassword(account.password);
    setError('');
    setQuickLoginRole(role);

    const result = await login(account.email, account.password);
    if (!result.success) {
      setError(result.message || t('loginFailed'));
    }

    setQuickLoginRole(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Floating light orbs - Frutiger Aero aesthetic */}
      <div className="fixed top-10 right-10 w-96 h-96 bg-cyan-300/30 rounded-full blur-3xl animate-[bubble-float_8s_ease-in-out_infinite]" style={{ animationDelay: '0s' }}></div>
      <div className="fixed bottom-20 left-20 w-80 h-80 bg-blue-400/30 rounded-full blur-3xl animate-[bubble-float_10s_ease-in-out_infinite]" style={{ animationDelay: '2s' }}></div>
      <div className="fixed top-1/2 left-1/3 w-72 h-72 bg-sky-200/20 rounded-full blur-3xl animate-[bubble-float_12s_ease-in-out_infinite]" style={{ animationDelay: '4s' }}></div>

      <div className="w-full max-w-md relative z-10">
        {/* Login Card */}
        <div className="aero-glass rounded-3xl p-8 animate-[bubble-float_3s_ease-out]">
          {/* Logo/Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl aero-button mb-4 animate-[glow-pulse_3s_ease-in-out_infinite] relative">
              <Users className="w-12 h-12 text-white relative z-10" />
              <Sparkles className="w-6 h-6 text-yellow-300 absolute top-2 right-2" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 dark:from-cyan-300 dark:via-blue-300 dark:to-blue-400 bg-clip-text text-transparent mb-2">
              {t('appName')}
            </h1>
            <p className="text-cyan-800 dark:text-cyan-200 font-medium">{t('welcomeGlossyWorkspace')}</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="aero-glass border-2 border-red-400/50 rounded-xl p-3 text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-600 dark:text-cyan-400 z-10" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.name@company.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-cyan-800 dark:text-cyan-200 mb-2">
                {t('password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-600 dark:text-cyan-400 z-10" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl aero-input outline-none transition-all text-cyan-900 dark:text-cyan-100 placeholder-cyan-600/50 dark:placeholder-cyan-400/50"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-6 rounded-xl aero-button text-white font-bold shadow-xl shadow-cyan-500/50 transition-all transform hover:scale-105 hover:shadow-2xl hover:shadow-cyan-400/60"
            >
              {t('login')}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-cyan-300/50 dark:border-cyan-500/30"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 aero-glass text-cyan-700 dark:text-cyan-300 font-semibold">
                {t('quickAccess')}
              </span>
            </div>
          </div>

          {/* Quick Access Buttons */}
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => handleQuickLogin('hr')}
              disabled={quickLoginRole !== null}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl aero-glass hover:scale-110 transition-all group border-2 border-cyan-300/30 disabled:cursor-wait disabled:opacity-60"
            >
              <div className="w-12 h-12 rounded-xl aero-button flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-cyan-500/40">
                <Briefcase className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">{t('hr')}</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('manager')}
              disabled={quickLoginRole !== null}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl aero-glass hover:scale-110 transition-all group border-2 border-cyan-300/30 disabled:cursor-wait disabled:opacity-60"
            >
              <div className="w-12 h-12 rounded-xl aero-button flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/40">
                <Users className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">{t('manager')}</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('employee')}
              disabled={quickLoginRole !== null}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl aero-glass hover:scale-110 transition-all group border-2 border-cyan-300/30 disabled:cursor-wait disabled:opacity-60"
            >
              <div className="w-12 h-12 rounded-xl aero-button flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-sky-500/40">
                <User className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">{t('employee')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
