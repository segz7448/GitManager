import { registerRootComponent } from 'expo';
import App from './App';
// Must be imported here (module top-level, before the app registers) so
// TaskManager.defineTask runs in global scope - this is what lets the task
// still fire when the app is backgrounded, not just while a screen using
// it is mounted.
import './src/backgroundTasks';
import { registerBackgroundHandler } from './src/services/fcm';

// Must run at module top level, outside any component, so the FCM
// background/quit-state handler is registered before the JS engine could
// otherwise be torn down between pushes.
//
// Wrapped in try/catch deliberately: this line runs before App even
// mounts, so it's outside of ErrorBoundary's reach entirely. If Firebase
// isn't fully initialized natively yet (e.g. android/ was regenerated via
// `expo prebuild` but not rebuilt, or the app was updated without a full
// native rebuild after @react-native-firebase was added), messaging()
// throws synchronously here and previously took down the whole app before
// a single screen could render - a launch crash with no recovery UI and
// nothing in the render tree to catch it. Push notifications degrade
// gracefully without this; a dead app on launch does not.
try {
  registerBackgroundHandler();
} catch (e) {
  console.error('[FCM] registerBackgroundHandler failed - push notifications will be unavailable this session:', e);
}

// registerRootComponent calls AppRegistry.registerComponent under the hood
// and correctly handles both native app launch and expo-dev-client if used.
// It does NOT require Expo Go or any Expo cloud service.
registerRootComponent(App);
