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
      // getToken()/getCachedUsername() read from expo-secure-store, which
      // is backed by the Android Keystore. On some devices (Xiaomi/MIUI in
      // particular) the Keystore key backing that encrypted storage can
      // get invalidated outside the app's control - after a security
      // patch, a lock-screen/biometric change, or MIUI's own background
      // "optimization" - and SecureStore.getItemAsync then throws instead
      // of resolving to null. Since this runs at the very top of the
      // component tree before anything has rendered, an uncaught throw
      // here previously took the whole app down on every single launch,
      // with no way to recover short of a full uninstall/reinstall (wiping
      // the corrupt Keystore entry). Treat any failure here the same as
      // "not logged in" - worst case the person just has to log in again,
      // instead of the app being permanently unlaunchable.
      try {
        const t = await getToken();
        const u = await getCachedUsername();
        setToken(t);
        setUsername(u);
      } catch (e) {
        console.error('[auth] failed to read stored session, treating as logged out:', e);
        setToken(null);
        setUsername(null);
      } finally {
        setLoading(false);
      }
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
