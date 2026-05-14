/**
 * Firebase Cloud Messaging service.
 *
 * Responsibilities:
 *   1. Request notification permissions (iOS + Android 13+)
 *   2. Fetch the device's FCM token and persist it under users/{uid}.fcmTokens
 *   3. Wire foreground / background / quit-state message handlers
 *
 * Background handler note: setBackgroundMessageHandler MUST be registered at
 * the top level of index.js, *outside* any component, otherwise it won't run
 * when the JS bundle is cold-started by an incoming push. See index.js.
 */

import { Platform } from 'react-native';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { firebaseMessaging } from '../config/firebase';
import { addFcmToken, removeFcmToken } from './firestoreService';

export type RemoteMessage = FirebaseMessagingTypes.RemoteMessage;
export type MessageUnsubscribe = () => void;

/** Returns true if the user granted (or already had) notification permission. */
export async function requestNotificationPermission(): Promise<boolean> {
  // On Android < 13 permission is granted at install time; the call is a no-op.
  const status = await firebaseMessaging().requestPermission();
  return (
    status === firebaseMessaging.AuthorizationStatus.AUTHORIZED ||
    status === firebaseMessaging.AuthorizationStatus.PROVISIONAL
  );
}

export async function getDeviceFcmToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'ios') {
      // iOS must register with APNS before requesting a token.
      await firebaseMessaging().registerDeviceForRemoteMessages();
    }
    return await firebaseMessaging().getToken();
  } catch (err) {
    console.warn('[FCM] getToken failed', err);
    return null;
  }
}

/**
 * Register the current device's FCM token for `uid`, and watch for refreshes.
 * Call after successful sign-in. Returns an unsubscribe for the refresh
 * listener; call it on sign-out (along with `unregisterFcmTokenForUser`).
 */
export async function registerFcmTokenForUser(uid: string): Promise<MessageUnsubscribe> {
  const granted = await requestNotificationPermission();
  if (!granted) {
    return () => {};
  }
  const token = await getDeviceFcmToken();
  if (token) {
    await addFcmToken(uid, token);
  }
  return firebaseMessaging().onTokenRefresh(async newToken => {
    try {
      await addFcmToken(uid, newToken);
    } catch (err) {
      console.warn('[FCM] failed to persist refreshed token', err);
    }
  });
}

/** Drop the current device's token on sign-out so old devices stop notifying. */
export async function unregisterFcmTokenForUser(uid: string): Promise<void> {
  const token = await getDeviceFcmToken();
  if (token) {
    await removeFcmToken(uid, token);
  }
}

/** Foreground push handler. Returns an unsubscribe. */
export function onForegroundMessage(
  handler: (msg: RemoteMessage) => void,
): MessageUnsubscribe {
  return firebaseMessaging().onMessage(async msg => handler(msg));
}

/** Fired when the user taps a notification that brought the app from background. */
export function onNotificationOpened(
  handler: (msg: RemoteMessage) => void,
): MessageUnsubscribe {
  return firebaseMessaging().onNotificationOpenedApp(msg => {
    if (msg) handler(msg);
  });
}

/** Returns the notification that cold-started the app, if any. */
export async function getInitialNotification(): Promise<RemoteMessage | null> {
  return firebaseMessaging().getInitialNotification();
}
