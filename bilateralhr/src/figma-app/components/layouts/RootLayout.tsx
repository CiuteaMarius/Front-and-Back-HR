import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

export function RootLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return null;
  }

  return (
    <div
      className={`min-h-screen relative overflow-x-hidden ${
        user.role === 'hr'
          ? 'hr-light-background'
          : user.role === 'manager'
            ? 'manager-background'
            : 'employee-background'
      }`}
    >
      {/* Floating light orbs - Frutiger Aero aesthetic */}
      <div className="aero-orb fixed top-10 left-10 w-96 h-96 bg-cyan-400/20 rounded-full blur-3xl animate-[bubble-float_8s_ease-in-out_infinite] pointer-events-none" style={{ animationDelay: '0s' }}></div>
      <div className="aero-orb fixed bottom-20 right-20 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-[bubble-float_10s_ease-in-out_infinite] pointer-events-none" style={{ animationDelay: '2s' }}></div>
      <div className="aero-orb fixed top-1/2 right-1/4 w-72 h-72 bg-sky-300/15 rounded-full blur-3xl animate-[bubble-float_12s_ease-in-out_infinite] pointer-events-none" style={{ animationDelay: '4s' }}></div>

      <TopNav />
      <div className="flex overflow-visible">
        <Sidebar />
        <main className="flex-1 p-6 ml-64 mt-16 min-h-screen relative z-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
