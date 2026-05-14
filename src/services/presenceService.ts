/**
 * Presence service.
 *
 * Writes `online: true` to users/{uid} when the app is foregrounded, and
 * `online: false` with a fresh `lastSeenAt` when it backgrounds or the user
 * signs out. Driven by RN's AppState — no separate realtime DB required.
 *
 * Limitations: if the app is force-killed, no "going offline" write fires;
 * `online` will stay `true` until the next launch. WhatsApp itself has the
 * same caveat — they smooth it over with a "last seen" fallback that we
 * already compute below.
 */

import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { firebaseFirestore, COLLECTIONS, serverTimestamp } from '../config/firebase';

export interface PresenceHandle {
  stop: () => Promise<void>;
}

async function writePresence(uid: string, online: boolean): Promise<void> {
  try {
    await firebaseFirestore()
      .collection(COLLECTIONS.USERS)
      .doc(uid)
      .update({ online, lastSeenAt: serverTimestamp() });
  } catch {
    // Profile doc might not exist yet on a brand-new account; ignore.
  }
}

/**
 * Start tracking presence for `uid`. Returns a handle whose `stop()` writes
 * one final offline ping (call on logout / hook teardown).
 */
export function startPresenceTracking(uid: string): PresenceHandle {
  let current: AppStateStatus = AppState.currentState;

  // Initial state: if we're already foregrounded, mark online.
  if (current === 'active') {
    void writePresence(uid, true);
  }

  const sub: NativeEventSubscription = AppState.addEventListener(
    'change',
    next => {
      if (current === next) return;
      // 'active' = foreground; 'background' / 'inactive' = not.
      if (next === 'active') {
        void writePresence(uid, true);
      } else {
        void writePresence(uid, false);
      }
      current = next;
    },
  );

  return {
    async stop() {
      sub.remove();
      await writePresence(uid, false);
    },
  };
}

/**
 * Compute a human-readable "last seen" string from a Firestore Timestamp.
 * Returns null if we don't know yet.
 */
export function formatLastSeen(lastSeenMs: number | null | undefined): string | null {
  if (!lastSeenMs) return null;
  const diffMs = Date.now() - lastSeenMs;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'last seen just now';
  if (minutes < 60) return `last seen ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `last seen ${days}d ago`;
  const date = new Date(lastSeenMs);
  return `last seen ${date.toLocaleDateString()}`;
}
