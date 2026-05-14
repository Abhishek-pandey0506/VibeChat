/**
 * Firebase initialization for VibeChat.
 *
 * With @react-native-firebase, the native SDK is auto-initialized at app launch
 * via the platform-specific credentials files:
 *
 *   - Android: android/app/google-services.json
 *   - iOS:    ios/VibeChat/GoogleService-Info.plist
 *
 * TODO: Add the two files above before running the app. They are NOT checked
 *       into git — see FIREBASE_SETUP.md for instructions on obtaining them
 *       from the Firebase Console (Project Settings → Your apps).
 *
 * This module exposes the pre-configured firebase service singletons so the
 * rest of the app imports from one place instead of pulling from
 * @react-native-firebase/* directly.
 */

import { firebase } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore, { FieldValue } from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import messaging from '@react-native-firebase/messaging';

/**
 * Verify the native SDK was configured. Throws a clear, actionable error if
 * the google-services.json / GoogleService-Info.plist files are missing.
 */
export function assertFirebaseConfigured(): void {
  if (!firebase.apps.length) {
    throw new Error(
      '[Firebase] No default app configured. Make sure google-services.json ' +
        '(Android) and GoogleService-Info.plist (iOS) are in place, and that ' +
        'the native build was run after adding them. See FIREBASE_SETUP.md.',
    );
  }
}

export const firebaseAuth = auth;
export const firebaseFirestore = firestore;
export const firebaseStorage = storage;
export const firebaseMessaging = messaging;

export const serverTimestamp = () => FieldValue.serverTimestamp();
export const arrayUnion = (...values: unknown[]) => FieldValue.arrayUnion(...values);
export const arrayRemove = (...values: unknown[]) => FieldValue.arrayRemove(...values);
export const increment = (n: number) => FieldValue.increment(n);

export const COLLECTIONS = {
  USERS: 'users',
  CHAT_ROOMS: 'chatRooms',
  MESSAGES: 'messages', // sub-collection under chatRooms/{roomId}
} as const;
