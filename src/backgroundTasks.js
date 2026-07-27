import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { getWorkflowRun, listWorkflowRuns, listCodespaces, startCodespace } from './services/github';
import {
  getWatchlist,
  removeRunFromWatchlist,
  getWatchedRepos,
  updateWatchedRepoLastSeenRunId,
  presentLocalNotification,
} from './services/notifications';
import { listSessions, updateSession } from './db/terminalSessions';
import { pollJob } from './services/termux';
import { listAutoRestartNames } from './db/codespaceAutoRestart';

export const BACKGROUND_RUN_CHECK_TASK = 'gitmanager-run-status-check';

TaskManager.defineTask(BACKGROUND_RUN_CHECK_TASK, async () => {
  try {

    // 1. Individually watched runs (one-off "notify me" on a specific run)
    const watchlist = await getWatchlist();
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

    // 2. Watched repos - auto-notify on every new completed run, not just
    // one specifically picked run.
    const watchedRepos = await getWatchedRepos();
    for (const watched of watchedRepos) {
      try {
        const { data } = await listWorkflowRuns(watched.owner, watched.repo, { perPage: 5 });
        const runs = data.workflow_runs || [];

        // Only look at runs newer than the last one we already notified
        // about, and only ones that have actually finished.
        const newlyCompleted = runs
          .filter((r) => r.id > watched.lastSeenRunId && r.status === 'completed')
          .sort((a, b) => a.id - b.id); // oldest first, so notifications arrive in order

        for (const run of newlyCompleted) {
          const conclusion = run.conclusion || 'unknown';
          const emoji = conclusion === 'success' ? '✅' : conclusion === 'failure' ? '❌' : 'ℹ️';
          await presentLocalNotification(
            `${emoji} ${run.name || run.display_title}`,
            `${watched.owner}/${watched.repo} · #${run.run_number}: ${conclusion}`,
            { owner: watched.owner, repo: watched.repo, runId: run.id }
          );
        }

        // Advance the watermark to the newest run we've seen at all
        // (whether or not it was "newly completed"), so an in-progress
        // run isn't repeatedly re-evaluated as "new" once it later
        // finishes and this poll cycle runs again.
        const maxSeenId = runs.reduce((max, r) => Math.max(max, r.id), watched.lastSeenRunId);
        if (maxSeenId !== watched.lastSeenRunId) {
          await updateWatchedRepoLastSeenRunId(watched.owner, watched.repo, maxSeenId);
        }
      } catch (e) {
        continue;
      }
    }

    // 3. Background terminal jobs (see src/services/termux.js) - the
    // shell command itself keeps running via nohup/disown regardless of
    // whether this task ever fires, since it lives entirely inside
    // Termux's process, independent of the RN app's lifecycle. What this
    // step adds is a completion *notification* for jobs that finished
    // while the app wasn't open to poll them live. Because Android's
    // WorkManager enforces a 15-minute floor on background task
    // intervals, this notification can lag up to ~15 minutes behind the
    // job actually finishing - the in-app polling in TerminalScreen is
    // what gives near-real-time updates while the app is open.
    try {
      const sessions = await listSessions();
      const stillTracked = sessions.filter((s) => s.status !== 'finished');
      for (const session of stillTracked) {
        try {
          const result = await pollJob(session.jobId);
          if (!result.running) {
            await updateSession(session.jobId, {
              lastLog: result.log,
              status: 'finished',
              exitCode: result.exitCode,
            });
            const ok = result.exitCode === 0;
            await presentLocalNotification(
              ok ? '✅ Terminal command finished' : '⚠️ Terminal command finished',
              `${session.tabLabel} · exit ${result.exitCode ?? 'unknown'}`,
              { jobId: session.jobId }
            );
          }
        } catch (e) {
          continue;
        }
      }
    } catch (e) {
      // Termux unavailable or no sessions - not a task failure.
    }

    // 4. Codespace auto-restart (see db/codespaceAutoRestart.js) - same
    // 15-minute floor caveat as the terminal check above applies here:
    // this can only notice and restart a stopped codespace roughly this
    // often while the app isn't open, not instantly. The in-app
    // foreground loop in CodespacesScreen checks much more often
    // (every 45s) whenever the screen is actually open.
    try {
      const autoRestartNames = await listAutoRestartNames();
      if (autoRestartNames.length > 0) {
        const result = await listCodespaces({ perPage: 50 });
        const codespaces = result.codespaces || [];
        for (const name of autoRestartNames) {
          const cs = codespaces.find((c) => c.name === name);
          if (cs && cs.state === 'Shutdown') {
            try {
              await startCodespace(name);
              await presentLocalNotification(
                '▶️ Codespace restarted',
                `${cs.display_name || cs.name} was stopped for being idle and has been started back up.`,
                { codespaceName: name }
              );
            } catch (e) {
              continue;
            }
          }
        }
      }
    } catch (e) {
      // Not a task failure - just nothing to restart this cycle.
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
