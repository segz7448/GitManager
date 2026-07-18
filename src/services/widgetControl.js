import { NativeModules, Platform } from 'react-native';
import { getToken } from './github';

const { WidgetControl } = NativeModules;

function assertAvailable() {
  if (Platform.OS !== 'android') {
    throw new Error('Home screen widgets are only available on Android.');
  }
  if (!WidgetControl) {
    throw new Error('Native widget module not found - this build may be missing the plugin.');
  }
}

export async function startWatchingRepo(owner, repo) {
  assertAvailable();
  const token = await getToken();
  if (!token) throw new Error('No GitHub token available.');
  return WidgetControl.startMonitoring(owner, repo, token);
}

export async function stopWatchingRepo() {
  assertAvailable();
  return WidgetControl.stopMonitoring();
}

export async function getWatchedRepo() {
  assertAvailable();
  return WidgetControl.getWatchedRepo();
}

export async function getPlacedWidgetCount() {
  assertAvailable();
  return WidgetControl.getPlacedWidgetCount();
}
