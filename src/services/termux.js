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
