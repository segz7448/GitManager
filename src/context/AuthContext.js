import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, saveToken, clearToken, verifyToken, cacheUsername, getCachedUsername } from '../services/github';
import { addAccount, listAccounts, getAccountToken, touchAccount } from '../db/accounts';

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

    // Register this login in the multi-account list too (or just bump
    // its last-used time if it's already there), so switching back to
    // it later from the account switcher works even if the person only
    // ever used the single-account login flow.
    try {
      const existing = await listAccounts();
      const already = existing.find((a) => a.username === result.user.login);
      if (already) {
        await touchAccount(already.id);
      } else {
        await addAccount(result.user.login, newToken);
      }
    } catch (e) {
      // Non-fatal - the account switcher just won't show this account
      // if bookkeeping fails, but login itself still succeeded.
    }

    return result.user;
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setToken(null);
    setUsername(null);
  }, []);

  /**
   * Switches the active session to a previously-added account without
   * going through the token-entry screen again. Copies that account's
   * token into the single "active" slot the rest of the app reads from.
   */
  const switchAccount = useCallback(async (accountId) => {
    const accountToken = await getAccountToken(accountId);
    if (!accountToken) throw new Error('Could not find a saved token for this account.');
    const result = await verifyToken(accountToken);
    if (!result.valid) {
      throw new Error('This account\'s saved token is no longer valid. Remove it and sign in again.');
    }
    await saveToken(accountToken);
    await cacheUsername(result.user.login);
    setToken(accountToken);
    setUsername(result.user.login);
    await touchAccount(accountId);
    return result.user;
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, loading, login, logout, switchAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
