import { registerRootComponent } from 'expo';
import App from './App';
// Must be imported here (module top-level, before the app registers) so
// TaskManager.defineTask runs in global scope - this is what lets the task
// still fire when the app is backgrounded, not just while a screen using
// it is mounted.
import './src/backgroundTasks';

// registerRootComponent calls AppRegistry.registerComponent under the hood
// and correctly handles both native app launch and expo-dev-client if used.
// It does NOT require Expo Go or any Expo cloud service.
registerRootComponent(App);
