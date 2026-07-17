import { withDb } from './database';

/**
 * Local file backup system.
 *
 * Workflow (matches the requested design):
 *  1. User opens a file -> createBackup(..., 'open') stores a hidden
 *     pre-edit snapshot ("open" kind), skipped if an identical one
 *     already exists for this exact content (avoids duplicate no-op
 *     backups every time the same unmodified file is reopened).
 *  2. User edits and saves/commits -> createBackup(..., 'save') stores
 *     another timestamped snapshot ("save" kind).
 *  3. Backups are kept for 30 days (pruned lazily on app start and
 *     whenever a new backup is created) or until manually deleted.
 *  4. restorePreviousVersion() lets the user pick any prior snapshot and
 *     get its content back into the editor without touching GitHub.
 *
 * Snapshots are content-addressed by (owner, repo, branch, path,
 * created_at) so multiple versions of the same file coexist and can be
 * browsed as a local version history, independent of Git history.
 */

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function genId() {
  return `bak-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createBackup(owner, repo, branch, path, content, sourceSha, kind) {
  const db = await withDb();

  // Skip creating a duplicate "open" backup if the most recent backup for
  // this path already has identical content - avoids filling the table
  // with redundant snapshots every time someone opens the same file
  // without editing it.
  if (kind === 'open') {
    const latest = await db.getFirstAsync(
      `SELECT content FROM file_backups WHERE owner = ? AND repo = ? AND branch = ? AND path = ?
       ORDER BY created_at DESC LIMIT 1`,
      [owner, repo, branch || '', path]
    );
    if (latest && latest.content === content) return null;
  }

  const id = genId();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO file_backups (id, owner, repo, branch, path, content, source_sha, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, owner, repo, branch || '', path, content, sourceSha || null, kind, now]
  );

  // Opportunistic pruning - cheap enough to run on every backup write,
  // keeps the table from growing unbounded over long-term use.
  await db.runAsync(`DELETE FROM file_backups WHERE created_at < ?`, [now - RETENTION_MS]);

  return id;
}

export async function listBackups(owner, repo, branch, path) {
  const db = await withDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM file_backups WHERE owner = ? AND repo = ? AND branch = ? AND path = ?
     ORDER BY created_at DESC`,
    [owner, repo, branch || '', path]
  );
  return rows.map(mapRow);
}

export async function getBackup(id) {
  const db = await withDb();
  const row = await db.getFirstAsync(`SELECT * FROM file_backups WHERE id = ?`, [id]);
  return row ? mapRow(row) : null;
}

export async function deleteBackup(id) {
  const db = await withDb();
  await db.runAsync(`DELETE FROM file_backups WHERE id = ?`, [id]);
}

export async function pruneExpiredBackups() {
  const db = await withDb();
  await db.runAsync(`DELETE FROM file_backups WHERE created_at < ?`, [Date.now() - RETENTION_MS]);
}

function mapRow(row) {
  return {
    id: row.id,
    owner: row.owner,
    repo: row.repo,
    branch: row.branch || null,
    path: row.path,
    content: row.content,
    sourceSha: row.source_sha,
    kind: row.kind, // 'open' | 'save'
    createdAt: row.created_at,
  };
}
