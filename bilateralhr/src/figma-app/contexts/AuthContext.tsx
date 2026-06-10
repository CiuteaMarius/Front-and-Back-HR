import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
const AUTH_TOKEN_KEY = 'bilateralhr_auth_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    if (!token) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    fetch(`${API_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        if (!mounted) return;

        if (!response.ok) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setUser(null);
          return;
        }

        const data = await response.json();
        setUser(data.user);
      })
      .catch(() => {
        if (mounted) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setUser(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return { success: false, message: data.message || 'Login failed.' };
      }

      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      setUser(data.user);

      return { success: true };
    } catch {
      return { success: false, message: 'Backend API is not available.' };
    }
  };

  const logout = async () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    await fetch(`${API_URL}/api/auth/logout`, { method: 'POST' }).catch(() => undefined);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
