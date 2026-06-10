import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      navigate('/login');
    } else if (allowedRoles && !allowedRoles.includes(user.role)) {
      // Redirect to appropriate dashboard
      if (user.role === 'hr') {
        navigate('/hr/dashboard');
      } else if (user.role === 'manager') {
        navigate('/employee/dashboard');
      } else {
        navigate('/employee/dashboard');
      }
    }
  }, [user, loading, allowedRoles, navigate]);

  if (loading || !user || (allowedRoles && !allowedRoles.includes(user.role))) {
    return null;
  }

  return <>{children}</>;
}
