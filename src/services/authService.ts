/**
 * Auth service: thin wrapper around @react-native-firebase/auth.
 *
 * All functions throw FirebaseAuthTypes.NativeFirebaseAuthError on failure;
 * callers should surface `error.code` (e.g. 'auth/invalid-email') to the UI.
 */

import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { firebaseAuth, firebaseFirestore, COLLECTIONS, serverTimestamp } from '../config/firebase';
import type { UserProfile } from '../types/models';

export type AuthUser = FirebaseAuthTypes.User;
export type AuthUnsubscribe = () => void;

/**
 * Configure the Google Sign-In SDK once at app startup.
 *
 * TODO: set GOOGLE_WEB_CLIENT_ID to the **Web client (auto-created)** OAuth
 *       client from the Firebase Console (Project settings → General →
 *       Your apps → Web → Web client ID), NOT the Android client. The web
 *       client id is what Firebase Auth expects in signInWithCredential.
 */
export const GOOGLE_WEB_CLIENT_ID =
  '233261392388-REPLACE_WITH_WEB_CLIENT_ID.apps.googleusercontent.com';

export function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
}

/** Register with email + password and create the matching Firestore profile. */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const credential = await firebaseAuth().createUserWithEmailAndPassword(
    normalizedEmail,
    password,
  );
  const user = credential.user;

  await user.updateProfile({ displayName });
  await upsertUserProfile(user, { displayName, email: normalizedEmail });
  return user;
}

export async function loginWithEmail(email: string, password: string): Promise<AuthUser> {
  const credential = await firebaseAuth().signInWithEmailAndPassword(
    email.trim().toLowerCase(),
    password,
  );
  return credential.user;
}

/**
 * Sign in with Google. Returns the Firebase user. Creates / refreshes the
 * matching Firestore profile so subsequent reads (e.g. avatars, displayName)
 * work the same as for email accounts.
 *
 * Throws with `error.code === 'CANCELED'` if the user closes the picker.
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  try {
    // Ensure Play Services on Android; on iOS this resolves immediately.
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const { data } = await GoogleSignin.signIn();
    const idToken = data?.idToken;
    if (!idToken) {
      throw new Error('Google sign-in did not return an idToken.');
    }

    const googleCredential = auth.GoogleAuthProvider.credential(idToken);
    const credential = await firebaseAuth().signInWithCredential(googleCredential);
    const user = credential.user;

    await upsertUserProfile(user, {
      displayName: user.displayName ?? data?.user?.name ?? 'New user',
      email: (user.email ?? data?.user?.email ?? '').toLowerCase(),
      photoURL: user.photoURL ?? data?.user?.photo ?? undefined,
    });

    return user;
  } catch (e: any) {
    if (
      e?.code === statusCodes.SIGN_IN_CANCELLED ||
      e?.code === statusCodes.IN_PROGRESS
    ) {
      const err = new Error('Google sign-in cancelled.');
      (err as any).code = 'CANCELED';
      throw err;
    }
    throw e;
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  await firebaseAuth().sendPasswordResetEmail(email);
}

export async function logout(): Promise<void> {
  // Sign out of Google too so the next session shows the account picker.
  try {
    const signedIn = await GoogleSignin.getCurrentUser();
    if (signedIn) await GoogleSignin.signOut();
  } catch {
    // Non-fatal — Google may not have been configured this session.
  }
  await firebaseAuth().signOut();
}

export function getCurrentUser(): AuthUser | null {
  return firebaseAuth().currentUser;
}

/**
 * Subscribe to auth state changes. Returns an unsubscribe function — call it
 * in a useEffect cleanup or when the listener should be torn down.
 */
export function onAuthStateChanged(
  callback: (user: AuthUser | null) => void,
): AuthUnsubscribe {
  return firebaseAuth().onAuthStateChanged(callback);
}

/**
 * Idempotent: creates the `users/{uid}` doc on first sign-in, otherwise
 * just refreshes `updatedAt` and any fields we want to keep in sync.
 */
async function upsertUserProfile(
  user: AuthUser,
  fields: { displayName: string; email: string; photoURL?: string },
): Promise<void> {
  const ref = firebaseFirestore().collection(COLLECTIONS.USERS).doc(user.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    const profile: Omit<UserProfile, 'createdAt' | 'updatedAt'> = {
      uid: user.uid,
      email: fields.email,
      displayName: fields.displayName,
      photoURL: fields.photoURL,
      fcmTokens: [],
    };
    await ref.set({
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    // Don't overwrite a name the user explicitly edited in-app; only fill
    // in fields if missing.
    const data = snap.data() as Partial<UserProfile> | undefined;
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (!data?.displayName) patch.displayName = fields.displayName;
    if (!data?.photoURL && fields.photoURL) patch.photoURL = fields.photoURL;
    await ref.update(patch);
  }
}
