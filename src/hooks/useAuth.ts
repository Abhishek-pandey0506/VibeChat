/**
 * useAuth — single source of truth for the current Firebase user in React.
 *
 * Subscribes once at mount, and also wires/unwires the FCM token so the
 * device only receives pushes for the signed-in account.
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type AuthUser } from '../services/authService';
import {
  registerFcmTokenForUser,
  unregisterFcmTokenForUser,
  type MessageUnsubscribe,
} from '../services/messagingService';

export interface UseAuthState {
  user: AuthUser | null;
  /** True until the first auth state event arrives. */
  initializing: boolean;
}

export function useAuth(): UseAuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let tokenRefreshUnsub: MessageUnsubscribe | null = null;
    let previousUid: string | null = null;

    const unsubAuth = onAuthStateChanged(async nextUser => {
      // Tear down FCM wiring for the user who just signed out, if any.
      if (previousUid && (!nextUser || nextUser.uid !== previousUid)) {
        tokenRefreshUnsub?.();
        tokenRefreshUnsub = null;
        try {
          await unregisterFcmTokenForUser(previousUid);
        } catch (err) {
          console.warn('[useAuth] failed to clean up FCM token', err);
        }
      }

      if (nextUser) {
        try {
          tokenRefreshUnsub = await registerFcmTokenForUser(nextUser.uid);
        } catch (err) {
          console.warn('[useAuth] failed to register FCM token', err);
        }
        previousUid = nextUser.uid;
      } else {
        previousUid = null;
      }

      setUser(nextUser);
      setInitializing(false);
    });

    return () => {
      unsubAuth();
      tokenRefreshUnsub?.();
    };
  }, []);

  return { user, initializing };
}
