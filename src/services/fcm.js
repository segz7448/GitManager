// Firebase Cloud Messaging - client side only.
//
// This wires the device up to receive real push notifications (works while
// the app is killed, unlike the local-notification polling in
// notifications.js). It does NOT send anything on its own - something
// server-side (your own server, a Cloud Function, a GitHub webhook relay,
// etc.) needs to call the FCM HTTP v1 API with the device token below to
// actually deliver a push. Until you wire that up, use the token shown in
// Settings to send yourself test pushes from the Firebase console
// (Cloud Messaging -> "Send test message").
//
// Setup required before this works:
//   1. Create a Firebase project (console.firebase.google.com).
//   2. Add an Android app with package name com.zenas.gitmanager
//      (must match android.package in app.json).
//   3. Download google-services.json and drop it at the project root,
//      next to app.json. app.json already points to it.
//   4. npx expo prebuild --platform android --clean to regenerate native code.

import messaging from '@react-native-firebase/messaging';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { presentLocalNotification } from './notifications';

const FCM_TOKEN_KEY = 'fcm_token_v1';
const PUSH_ENABLED_KEY = 'fcm_push_enabled_v1';

let unsubscribeForeground = null;
let unsubscribeTokenRefresh = null;

export async function requestPushPermission() {
  const authStatus = await messaging().requestPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

export async function getPushPermissionStatus() {
  const authStatus = await messaging().hasPermission();
  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  );
}

export async function getStoredFcmToken() {
  try {
    return await SecureStore.getItemAsync(FCM_TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export async function isPushEnabled() {
  const v = await SecureStore.getItemAsync(PUSH_ENABLED_KEY);
  return v === '1';
}

async function persistToken(token) {
  if (!token) return;
  await SecureStore.setItemAsync(FCM_TOKEN_KEY, token);
}

/**
 * Call once on app start (after a token has been requested at least once).
 * Registers the foreground message handler and token-refresh listener.
 * Safe to call multiple times - it tears down prior listeners first.
 */
export function initFcmListeners() {
  teardownFcmListeners();

  unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
    const title = remoteMessage.notification?.title || 'GitManager';
    const body = remoteMessage.notification?.body || '';
    await presentLocalNotification(title, body, remoteMessage.data || {});
  });

  unsubscribeTokenRefresh = messaging().onTokenRefresh(async (token) => {
    await persistToken(token);
  });
}

export function teardownFcmListeners() {
  if (unsubscribeForeground) {
    unsubscribeForeground();
    unsubscribeForeground = null;
  }
  if (unsubscribeTokenRefresh) {
    unsubscribeTokenRefresh();
    unsubscribeTokenRefresh = null;
  }
}

/**
 * Requests permission, fetches the device's FCM registration token, stores
 * it, and starts listening for messages. Returns the token (or null if
 * permission was denied).
 */
export async function enablePushNotifications() {
  const granted = await requestPushPermission();
  if (!granted) return null;

  await messaging().registerDeviceForRemoteMessages();
  const token = await messaging().getToken();
  await persistToken(token);
  await SecureStore.setItemAsync(PUSH_ENABLED_KEY, '1');
  initFcmListeners();
  return token;
}

export async function disablePushNotifications() {
  await SecureStore.setItemAsync(PUSH_ENABLED_KEY, '0');
  teardownFcmListeners();
  try {
    await messaging().deleteToken();
  } catch (e) {
    // fine - token may already be gone
  }
}

/**
 * Register the background/quit-state message handler. Must be called at
 * the top level of index.js, outside of any component, before
 * AppRegistry.registerComponent runs.
 */
export function registerBackgroundHandler() {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    // Data-only messages land here when the app is killed or backgrounded.
    // Nothing to do by default beyond letting the OS show the notification
    // payload (if `notification` was set server-side, Android displays it
    // automatically without this handler running any UI code).
    return Promise.resolve();
  });
}

export function isFcmSupported() {
  // FCM (via react-native-firebase) is Android/iOS only, and this app
  // targets Android exclusively per app.json.
  return Platform.OS === 'android' || Platform.OS === 'ios';
}
