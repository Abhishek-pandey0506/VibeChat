/**
 * @format
 */

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

// MUST be at the top level (outside any component) so it runs even when the
// JS bundle is cold-started by an incoming push in the background.
messaging().setBackgroundMessageHandler(async remoteMessage => {
  // Keep this lightweight — the OS already shows the notification body when
  // FCM sends a "notification" payload. For data-only payloads, use this hook
  // to update local state, schedule a local notification, etc.
  console.log('[FCM] background message received', remoteMessage?.messageId);
});

AppRegistry.registerComponent(appName, () => App);
