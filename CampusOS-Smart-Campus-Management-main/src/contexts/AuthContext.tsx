import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { ApiError, apiRequest } from '../lib/api.ts';
import { AppUser, UserRole } from '../shared/types.ts';

export interface RoleMismatchInfo {
  actualRole: UserRole;
  expectedRole: UserRole;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  authError: string | null;
  roleMismatch: RoleMismatchInfo | null;
  signInWithGoogle: (expectedRole?: UserRole) => Promise<AppUser | null>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [roleMismatch, setRoleMismatch] = useState<RoleMismatchInfo | null>(null);
  const loginInProgressRef = useRef(false);

  const syncUserFromBackend = useCallback(async () => {
    const data = await apiRequest<{ user: AppUser }>('/api/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (loginInProgressRef.current) {
        return;
      }

      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        await syncUserFromBackend();
        setAuthError(null);
        setRoleMismatch(null);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Unable to verify your campus account.';
        setAuthError(message);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [syncUserFromBackend]);

  const signInWithGoogle = async (expectedRole?: UserRole): Promise<AppUser | null> => {
    setAuthError(null);
    setRoleMismatch(null);
    loginInProgressRef.current = true;
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      if (!result.user) return null;

      const data = await apiRequest<{ user: AppUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(expectedRole ? { expectedRole } : {}),
      });
      setUser(data.user);
      setLoading(false);
      return data.user;
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        // Clear client Firebase session so mismatched/unauthorized login never persists
        await signOut(auth).catch(() => undefined);
        setUser(null);
        if (
          err.data?.code === 'ROLE_MISMATCH' &&
          typeof err.data.actualRole === 'string' &&
          typeof err.data.expectedRole === 'string'
        ) {
          setRoleMismatch({
            actualRole: err.data.actualRole as UserRole,
            expectedRole: err.data.expectedRole as UserRole,
          });
        }
      }
      const message =
        err instanceof Error ? err.message : 'Google sign-in could not be completed.';
      setAuthError(message);
      setLoading(false);
      throw err;
    } finally {
      loginInProgressRef.current = false;
    }
  };

  const logout = async () => {
    try {
      if (auth.currentUser) {
        await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
      }
      await signOut(auth);
    } finally {
      setUser(null);
      setAuthError(null);
      setRoleMismatch(null);
    }
  };

  const refreshProfile = async () => {
    if (!auth.currentUser) return;
    await syncUserFromBackend();
  };

  const clearAuthError = () => {
    setAuthError(null);
    setRoleMismatch(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        roleMismatch,
        signInWithGoogle,
        logout,
        refreshProfile,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
