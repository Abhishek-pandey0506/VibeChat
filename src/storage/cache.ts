/**
 * Typed wrapper around AsyncStorage for local-only state.
 *
 * What we cache here (and why):
 *   - `lastUserHint`: a tiny snapshot of the last signed-in user so the
 *     SplashScreen can route to RoomList immediately on cold start instead
 *     of waiting for Firebase's `onAuthStateChanged` callback. Firebase still
 *     owns the actual session — this is purely a render hint.
 *   - `staySignedIn`: defaults to true. If the user signs out, we set false
 *     so we never auto-restore on next launch.
 *
 * Anything sensitive (tokens, profile PII beyond name/email/avatar) belongs
 * in the platform keystore — not here.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  lastUserHint: '@vibechat/lastUserHint/v1',
  staySignedIn: '@vibechat/staySignedIn/v1',
} as const;

export interface LastUserHint {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  /** Wall-clock when this hint was written (ms). */
  storedAt: number;
}

export async function getLastUserHint(): Promise<LastUserHint | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.lastUserHint);
    return raw ? (JSON.parse(raw) as LastUserHint) : null;
  } catch {
    return null;
  }
}

export async function setLastUserHint(hint: LastUserHint | null): Promise<void> {
  try {
    if (hint) {
      await AsyncStorage.setItem(KEYS.lastUserHint, JSON.stringify(hint));
    } else {
      await AsyncStorage.removeItem(KEYS.lastUserHint);
    }
  } catch {
    // Non-fatal — the app still works without the hint.
  }
}

/** Default true. Returns the stored value if present. */
export async function getStaySignedIn(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.staySignedIn);
    if (raw === null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

export async function setStaySignedIn(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.staySignedIn, value ? '1' : '0');
  } catch {
    // ignore
  }
}

export async function clearAllAppCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEYS.lastUserHint, KEYS.staySignedIn]);
  } catch {
    // ignore
  }
}
