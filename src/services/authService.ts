/**
 * Auth service: thin wrapper around @react-native-firebase/auth.
 *
 * Google Sign-In is the only supported provider. Email/password and phone
 * flows were removed at the product's request — if you need to re-introduce
 * them, look at git history for the previous implementation.
 *
 * All functions throw FirebaseAuthTypes.NativeFirebaseAuthError on failure;
 * callers should surface `error.code` to the UI.
 */

import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  firebaseAuth,
  firebaseFirestore,
  firebaseStorage,
  COLLECTIONS,
  serverTimestamp,
} from '../config/firebase';
import { phoneLast10Of } from './firestoreService';
import type { UserProfile } from '../types/models';

export type AuthUser = FirebaseAuthTypes.User;
export type AuthUnsubscribe = () => void;

/**
 * Configure the Google Sign-In SDK once at app startup.
 *
 * This is the **Web client (auto-created)** OAuth client created by Firebase
 * when Google Sign-In was enabled. The value is also present inside
 * `android/app/google-services.json` under `oauth_client` with `client_type: 3`.
 * It is NOT the Android client — Firebase Auth expects the web one when we
 * call `signInWithCredential`.
 */
export const GOOGLE_WEB_CLIENT_ID =
  '233261392388-91oalvnpn4bcmvu6900ld2ln4m3tpml9.apps.googleusercontent.com';

export function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
}

/**
 * Sign in with Google. Returns the Firebase user. Creates / refreshes the
 * matching Firestore profile so subsequent reads (e.g. avatars, displayName)
 * work the same as before.
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

/**
 * Permanently delete the signed-in user.
 *
 * Order is critical to avoid a half-deleted state where the Firestore
 * profile is gone but the Firebase Auth user is still around (App.tsx
 * would then route to CompleteProfileScreen with no doc to populate).
 *
 *   1. Re-authenticate via Google FIRST. This refreshes the credential
 *      so `auth.delete()` won't trip "requires-recent-login" later — and
 *      if the user dismisses the Google sheet, we abort BEFORE wiping
 *      anything.
 *   2. Delete Firestore profile doc (rules allow self-delete).
 *   3. Best-effort delete of profile images.
 *   4. Delete the Firebase Auth user — fires the auth state listener,
 *      which routes back to LoginScreen.
 *   5. Google sign-out so the next launch shows the account picker.
 */
export async function deleteAccount(): Promise<void> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new Error('No signed-in user to delete.');
  const uid = user.uid;

  // 1. Refresh Google credential up-front. If this throws (cancelled,
  //    no Play Services, etc.) we exit without deleting anything.
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const { data } = await GoogleSignin.signIn();
    const idToken = data?.idToken;
    if (!idToken) throw new Error('Could not refresh Google credential.');
    const credential = auth.GoogleAuthProvider.credential(idToken);
    await user.reauthenticateWithCredential(credential);
  } catch (e: any) {
    if (
      e?.code === statusCodes.SIGN_IN_CANCELLED ||
      e?.code === statusCodes.IN_PROGRESS
    ) {
      const err = new Error('Account deletion cancelled.');
      (err as any).code = 'CANCELED';
      throw err;
    }
    throw e;
  }

  // 2. Delete Firestore profile doc.
  try {
    await firebaseFirestore().collection(COLLECTIONS.USERS).doc(uid).delete();
  } catch (e) {
    console.warn('[deleteAccount] failed to delete user doc', e);
  }

  // 3. Best-effort delete of profile images.
  try {
    const listing = await firebaseStorage().ref(`profileImages/${uid}`).listAll();
    await Promise.all(
      listing.items.map(item =>
        item.delete().catch(err =>
          console.warn('[deleteAccount] storage delete failed', item.fullPath, err),
        ),
      ),
    );
  } catch (e) {
    console.warn('[deleteAccount] failed to list/delete profile images', e);
  }

  // 4. Delete Firebase Auth user. With the fresh credential above, this
  //    shouldn't hit requires-recent-login — but retry once just in case.
  try {
    await user.delete();
  } catch (e: any) {
    if (e?.code === 'auth/requires-recent-login') {
      const { data } = await GoogleSignin.signIn();
      const idToken = data?.idToken;
      if (!idToken) throw new Error('Could not refresh Google credential.');
      const credential = auth.GoogleAuthProvider.credential(idToken);
      await user.reauthenticateWithCredential(credential);
      await user.delete();
    } else {
      throw e;
    }
  }

  // 5. Google sign-out. Best-effort.
  try {
    const signedIn = await GoogleSignin.getCurrentUser();
    if (signedIn) await GoogleSignin.signOut();
  } catch {
    // ignore
  }
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
 *
 * IMPORTANT: Firestore rejects writes that contain `undefined` values
 * with `Unsupported field value: undefined`. Optional fields are only
 * included in the write when they're actually present.
 */
async function upsertUserProfile(
  user: AuthUser,
  fields: {
    displayName: string;
    email: string;
    photoURL?: string;
  },
): Promise<void> {
  const ref = firebaseFirestore().collection(COLLECTIONS.USERS).doc(user.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    const profile: Record<string, unknown> = {
      uid: user.uid,
      email: fields.email,
      displayName: fields.displayName,
      fcmTokens: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (fields.photoURL) profile.photoURL = fields.photoURL;
    if (user.phoneNumber) {
      profile.phoneNumber = user.phoneNumber;
      const last10 = phoneLast10Of(user.phoneNumber);
      if (last10) profile.phoneLast10 = last10;
    }
    await ref.set(profile);
  } else {
    // Don't overwrite a name the user explicitly edited in-app; only fill
    // in fields if missing on the server.
    const data = snap.data() as Partial<UserProfile> | undefined;
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (!data?.displayName && fields.displayName) {
      patch.displayName = fields.displayName;
    }
    if (!data?.photoURL && fields.photoURL) {
      patch.photoURL = fields.photoURL;
    }
    await ref.update(patch);
  }
}
