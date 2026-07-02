import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.getMe()
        .then(setUser)
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // React to session expiry (401) surfaced by the API client.
  useEffect(() => {
    const onUnauthorized = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('budgetOwnerId');
      setUser(null);
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, []);

  const login = async (email, password, mfaCode = null) => {
    const result = await api.login(email, password, mfaCode);

    if (result.requiresMfa) {
      return { requiresMfa: true };
    }

    const token = result.accessToken || result.token;
    if (!token) {
      throw new Error('Login failed: no token returned');
    }
    localStorage.setItem('token', token);
    setUser(result.user);
    return result.user;
  };

  const register = async (email, password, name) => {
    const result = await api.register(email, password, name);
    const token = result.accessToken || result.token;
    if (!token) {
      throw new Error('Registration failed: no token returned');
    }
    localStorage.setItem('token', token);
    setUser(result.user);
    return result.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('budgetOwnerId');
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const userData = await api.getMe();
      setUser(userData);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
