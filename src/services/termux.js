import { NativeModules, Platform } from 'react-native';

const { TermuxRunCommand } = NativeModules;

const TERMUX_BASH_PATH = '/data/data/com.termux/files/usr/bin/bash';

function assertAvailable() {
  if (Platform.OS !== 'android') {
    throw new Error('Termux integration is only available on Android.');
  }
  if (!TermuxRunCommand) {
    throw new Error(
      'Native Termux module not found. This build may be missing the plugin, or you\'re running ' +
        'in an environment (like Expo Go) that doesn\'t include custom native modules.'
    );
  }
}

/**
 * Returns { termuxInstalled, hasPermission }.
 */
export async function getTermuxStatus() {
  assertAvailable();
  return TermuxRunCommand.getStatus();
}

/**
 * Runs an arbitrary shell command string inside the user's real Termux
 * environment via `bash -c "<command>"`. Returns { stdout, stderr,
 * exitCode, errmsg }.
 */
export async function runShellCommand(command, { workdir } = {}) {
  assertAvailable();
  return TermuxRunCommand.runCommand(TERMUX_BASH_PATH, ['-c', command], workdir || null);
}

export { TERMUX_BASH_PATH };

// ---------- Background execution & polling-based "streaming" ----------
//
// Termux's RUN_COMMAND intent (see plugins/termux-native/TermuxRunCommandModule.kt)
// delivers exactly one final result bundle - there is no OS-level channel
// for incremental stdout. To get output that *appears* to stream, and to
// support commands that outlive a single screen visit ("persistent
// sessions", "background execution"), every job here is wrapped in a
// shell one-liner that:
//   1. backgrounds the real command with nohup, redirecting all output
//      to a log file under ~/.gitmanager/jobs/<id>/
//   2. records the child PID and, on completion, its exit code
//   3. returns almost immediately (the wrapper command itself finishes
//      in milliseconds - the real work continues in the background)
// The app then polls the log file's content on an interval and diffs it
// against what it already has, which is what actually produces the
// "streaming" feel in the UI. This is a well-understood workaround for
// exactly this kind of one-shot RPC transport, not a true PTY stream.

const JOBS_DIR = '~/.gitmanager/jobs';

function shellEscapeSingleQuotes(str) {
  return str.replace(/'/g, `'\\''`);
}

function jobPaths(jobId) {
  const dir = `${JOBS_DIR}/${jobId}`;
  return {
    dir,
    log: `${dir}/output.log`,
    pid: `${dir}/pid`,
    exit: `${dir}/exitcode`,
    cmdFile: `${dir}/command.txt`,
  };
}

/**
 * Starts a command running in the background inside Termux and returns
 * immediately once it's launched (not once it finishes). `jobId` should
 * be a short, filesystem-safe identifier the caller generates and keeps
 * track of (e.g. via a local jobs table) so it can poll and resume this
 * same job later, even across app restarts. Captures the exit code once
 * the backgrounded command finishes so pollJob can report a definite
 * finished state rather than just "still running or not".
 */
export async function startBackgroundCommand(jobId, command, { workdir } = {}) {
  assertAvailable();
  const { dir, log, pid, exit, cmdFile } = jobPaths(jobId);
  const escaped = shellEscapeSingleQuotes(command);
  const wrapper = [
    `mkdir -p '${dir}'`,
    `echo '${escaped}' > '${cmdFile}'`,
    `rm -f '${exit}'`,
    `(bash -c '${escaped}' > '${log}' 2>&1; echo $? > '${exit}') & echo $! > '${pid}'`,
    `disown`,
    `echo __GITMANAGER_STARTED__`,
  ].join(' && ');
  return TermuxRunCommand.runCommand(TERMUX_BASH_PATH, ['-c', wrapper], workdir || null);
}

/**
 * Polls a running/finished job's log file and status in one round trip.
 * Returns { log, running, exitCode }. `exitCode` is null while still
 * running. Safe to call repeatedly on an interval - each call is a fresh,
 * independent shell invocation (there's no persistent connection to
 * maintain), which is also what makes this resilient to the app being
 * backgrounded or killed and reopened mid-job.
 */
export async function pollJob(jobId) {
  assertAvailable();
  const { log, pid, exit } = jobPaths(jobId);
  const wrapper = [
    `cat '${log}' 2>/dev/null`,
    `echo __GITMANAGER_SPLIT__`,
    `if [ -f '${exit}' ]; then cat '${exit}'; else if kill -0 "$(cat '${pid}' 2>/dev/null)" 2>/dev/null; then echo RUNNING; else echo UNKNOWN; fi; fi`,
  ].join('; ');
  const result = await TermuxRunCommand.runCommand(TERMUX_BASH_PATH, ['-c', wrapper], null);
  const combined = result.stdout || '';
  const [logPart, statusPart] = combined.split('__GITMANAGER_SPLIT__\n');
  const status = (statusPart || '').trim();

  if (status === 'RUNNING') {
    return { log: logPart || '', running: true, exitCode: null };
  }
  if (status === 'UNKNOWN') {
    // Neither an exit code file nor a live PID - the process ended
    // without our wrapper's trap recording it (e.g. Termux itself was
    // killed). Treat as finished with an unknown exit code rather than
    // polling forever.
    return { log: logPart || '', running: false, exitCode: null };
  }
  const exitCode = parseInt(status, 10);
  return { log: logPart || '', running: false, exitCode: Number.isNaN(exitCode) ? null : exitCode };
}

/**
 * Kills a running background job by PID, best-effort.
 */
export async function killJob(jobId) {
  assertAvailable();
  const { pid } = jobPaths(jobId);
  const wrapper = `if [ -f '${pid}' ]; then kill "$(cat '${pid}')" 2>/dev/null; echo killed; else echo no-pid; fi`;
  return TermuxRunCommand.runCommand(TERMUX_BASH_PATH, ['-c', wrapper], null);
}

/**
 * Removes a job's log/pid/exitcode files once the app is done with it
 * (e.g. user dismissed it from the session list).
 */
export async function cleanupJob(jobId) {
  assertAvailable();
  const { dir } = jobPaths(jobId);
  return TermuxRunCommand.runCommand(TERMUX_BASH_PATH, ['-c', `rm -rf '${dir}'`], null);
}

/**
 * Lists job directories still present under ~/.gitmanager/jobs, for
 * reconciling with locally-tracked session state on app launch (e.g. a
 * job the DB thinks is running, but whose files no longer exist because
 * Termux was force-stopped).
 */
export async function listJobDirs() {
  assertAvailable();
  const wrapper = `mkdir -p '${JOBS_DIR}' && ls -1 '${JOBS_DIR}' 2>/dev/null`;
  const result = await TermuxRunCommand.runCommand(TERMUX_BASH_PATH, ['-c', wrapper], null);
  return (result.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
}
