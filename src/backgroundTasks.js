import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { getWorkflowRun } from './services/github';
import {
  getWatchlist,
  removeRunFromWatchlist,
  presentLocalNotification,
} from './services/notifications';

export const BACKGROUND_RUN_CHECK_TASK = 'gitmanager-run-status-check';

TaskManager.defineTask(BACKGROUND_RUN_CHECK_TASK, async () => {
  try {
    const watchlist = await getWatchlist();
    if (watchlist.length === 0) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    for (const watched of watchlist) {
      try {
        const run = await getWorkflowRun(watched.owner, watched.repo, watched.runId);
        if (run.status === 'completed') {
          const conclusion = run.conclusion || 'unknown';
          const emoji = conclusion === 'success' ? '✅' : conclusion === 'failure' ? '❌' : 'ℹ️';
          await presentLocalNotification(
            `${emoji} ${watched.runName}`,
            `${watched.owner}/${watched.repo} finished: ${conclusion}`,
            { owner: watched.owner, repo: watched.repo, runId: watched.runId }
          );
          await removeRunFromWatchlist(watched.owner, watched.repo, watched.runId);
        }
      } catch (e) {
        // one run failing to check shouldn't block checking the others
        continue;
      }
    }

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Registers the background task with the OS. Safe to call multiple times -
 * re-registering with the same name is a no-op if already registered.
 * Android's WorkManager enforces a 15-minute minimum interval regardless
 * of what's requested here.
 */
export async function ensureBackgroundTaskRegistered() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_RUN_CHECK_TASK);
  if (!isRegistered) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_RUN_CHECK_TASK, {
      minimumInterval: 15, // minutes - the platform-enforced floor
    });
  }
}
