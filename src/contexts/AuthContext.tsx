/**
 * AuthContext: single source of truth for "who is signed in" across the app.
 *
 * - Wraps the existing `useAuth` hook (Firebase + FCM token plumbing).
 * - Caches a small "last user hint" to AsyncStorage so we can render the
 *   home screen on cold start without first flashing the login screen.
 *   Firebase's `onAuthStateChanged` is async, and the splash screen alone
 *   can't tell which side of the auth wall to drop us on.
 * - Exposes a `signOut()` that clears the cache and the Firebase session
 *   in the right order (so we don't briefly re-auto-login from the hint).
 *
 * This is plain React Context — no Redux dependency, but the shape is
 * Redux-friendly if you later want to graduate to RTK Query / Zustand /
 * Jotai. Consumers just `useAuthContext()` instead of receiving `user`
 * via props.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../hooks/useAuth';
import { logout as firebaseLogout, type AuthUser } from '../services/authService';
import {
  getLastUserHint,
  getStaySignedIn,
  setLastUserHint,
  setStaySignedIn as persistStaySignedIn,
  type LastUserHint,
} from '../storage/cache';

interface AuthContextValue {
  /** The Firebase user, once `onAuthStateChanged` has fired. */
  user: AuthUser | null;
  /** True until the first Firebase auth callback. */
  initializing: boolean;
  /**
   * Cached snapshot from the previous session. Useful for the splash screen:
   * if `hint` exists and `initializing` is true, we know the user *was*
   * signed in, so we can pre-route to the home screen optimistically.
   */
  hint: LastUserHint | null;
  /** True if the user wants automatic sign-in on next launch. */
  staySignedIn: boolean;
  setStaySignedIn: (value: boolean) => void;
  /** Clears AsyncStorage hint and signs out of Firebase. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  const [hint, setHint] = useState<LastUserHint | null>(null);
  const [staySignedIn, setStaySignedInState] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Pull the cached hint + preference once at mount.
  useEffect(() => {
    (async () => {
      const [h, stay] = await Promise.all([getLastUserHint(), getStaySignedIn()]);
      setHint(h);
      setStaySignedInState(stay);
      setHydrated(true);
    })();
  }, []);

  // Whenever Firebase tells us about a user change, mirror a hint to
  // AsyncStorage so the next cold start can skip the login flash.
  useEffect(() => {
    if (!hydrated) return;
    if (user) {
      const next: LastUserHint = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        storedAt: Date.now(),
      };
      setHint(next);
      void setLastUserHint(next);
    } else if (hint) {
      // Firebase just dropped the session — clear the hint too so we
      // don't pretend to know a user on the next launch.
      setHint(null);
      void setLastUserHint(null);
    }
    // We intentionally only react to `user` here; hint changes are our own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hydrated]);

  // Honour `staySignedIn=false`: if Firebase rehydrated a session but the
  // user previously asked us to forget them, sign out immediately.
  useEffect(() => {
    if (!hydrated) return;
    if (user && !staySignedIn) {
      void firebaseLogout();
    }
  }, [user, staySignedIn, hydrated]);

  const setStaySignedIn = useCallback((value: boolean) => {
    setStaySignedInState(value);
    void persistStaySignedIn(value);
  }, []);

  const signOut = useCallback(async () => {
    // Clear the hint first so a race with onAuthStateChanged can't write a
    // fresh hint right back after we removed it.
    setHint(null);
    await setLastUserHint(null);
    await firebaseLogout();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, initializing, hint, staySignedIn, setStaySignedIn, signOut }),
    [user, initializing, hint, staySignedIn, setStaySignedIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used inside <AuthProvider>.');
  }
  return ctx;
}
