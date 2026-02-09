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

  const login = async (email, password, mfaCode = null) => {
    const result = await api.login(email, password, mfaCode);

    if (result.requiresMfa) {
      return { requiresMfa: true };
    }

    // Use accessToken from the new auth system (fallback to token for compatibility)
    localStorage.setItem('token', result.accessToken || result.token);
    setUser(result.user);
    return result.user;
  };

  const register = async (email, password, name) => {
    const result = await api.register(email, password, name);
    // Use accessToken from the new auth system (fallback to token for compatibility)
    localStorage.setItem('token', result.accessToken || result.token);
    setUser(result.user);
    return result.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
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
