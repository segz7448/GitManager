import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const WATCHLIST_KEY = 'watched_runs_v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function presentLocalNotification(title, body, data = {}) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null, // fire immediately
  });
}

// ---------- Watchlist (runs the background task should poll) ----------

async function readWatchlist() {
  try {
    const raw = await SecureStore.getItemAsync(WATCHLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

async function writeWatchlist(list) {
  await SecureStore.setItemAsync(WATCHLIST_KEY, JSON.stringify(list));
}

export async function getWatchlist() {
  return readWatchlist();
}

export async function isRunWatched(owner, repo, runId) {
  const list = await readWatchlist();
  return list.some((w) => w.owner === owner && w.repo === repo && w.runId === runId);
}

export async function addRunToWatchlist({ owner, repo, runId, runName }) {
  const list = await readWatchlist();
  if (list.some((w) => w.owner === owner && w.repo === repo && w.runId === runId)) return;
  list.push({ owner, repo, runId, runName: runName || `Run #${runId}`, addedAt: Date.now() });
  await writeWatchlist(list);
}

export async function removeRunFromWatchlist(owner, repo, runId) {
  const list = await readWatchlist();
  const filtered = list.filter((w) => !(w.owner === owner && w.repo === repo && w.runId === runId));
  await writeWatchlist(filtered);
}
