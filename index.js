import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent under the hood
// and correctly handles both native app launch and expo-dev-client if used.
// It does NOT require Expo Go or any Expo cloud service.
registerRootComponent(App);
