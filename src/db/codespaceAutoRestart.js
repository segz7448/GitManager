import { withDb } from './database';

/**
 * Tracks which codespaces the user has opted into auto-restart for.
 *
 * Important scope note (see CodespacesScreen.js for the user-facing
 * version of this): GitHub only resets a codespace's idle timer on real
 * terminal/editor activity inside it - a REST API status check from
 * this app does not count as "activity" and can't prevent GitHub from
 * stopping it. What this feature actually does is notice quickly once
 * GitHub HAS stopped it, and start it back up automatically, rather
 * than leaving it stopped until the user happens to reopen the app and
 * notice. That's a real, honest capability; "never going idle" is not.
 */

export async function setAutoRestart(codespaceName, enabled) {
  const db = await withDb();
  if (enabled) {
    await db.runAsync(
      `INSERT INTO codespace_auto_restart (codespace_name, enabled_at) VALUES (?, ?)
       ON CONFLICT(codespace_name) DO UPDATE SET enabled_at = excluded.enabled_at`,
      [codespaceName, Date.now()]
    );
  } else {
    await db.runAsync(`DELETE FROM codespace_auto_restart WHERE codespace_name = ?`, [codespaceName]);
  }
}

export async function isAutoRestartEnabled(codespaceName) {
  const db = await withDb();
  const row = await db.getFirstAsync(
    `SELECT 1 FROM codespace_auto_restart WHERE codespace_name = ?`,
    [codespaceName]
  );
  return !!row;
}

export async function listAutoRestartNames() {
  const db = await withDb();
  const rows = await db.getAllAsync(`SELECT codespace_name FROM codespace_auto_restart`);
  return rows.map((r) => r.codespace_name);
}
