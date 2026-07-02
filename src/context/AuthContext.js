import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, saveToken, clearToken, verifyToken, cacheUsername, getCachedUsername } from '../services/github';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      const u = await getCachedUsername();
      setToken(t);
      setUsername(u);
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (newToken) => {
    const result = await verifyToken(newToken);
    if (!result.valid) {
      throw new Error('Invalid token — check the PAT and its scopes (repo, workflow).');
    }
    await saveToken(newToken);
    await cacheUsername(result.user.login);
    setToken(newToken);
    setUsername(result.user.login);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setToken(null);
    setUsername(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
