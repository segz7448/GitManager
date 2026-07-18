import { withDb } from './database';

/**
 * A local "stash" - since there's no working directory on a mobile app
 * to run real `git stash` against, this shelves the current set of
 * staged/in-progress file edits (the same shape used by StagingContext)
 * under a label, so the user can clear their staged changes to work on
 * something else and bring them back later with "Pop stash".
 */

function genId() {
  return `stash-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function createStash(owner, repo, branch, label, files) {
  const db = await withDb();
  const id = genId();
  await db.runAsync(
    `INSERT INTO stashes (id, owner, repo, branch, label, files, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, owner, repo, branch || '', label || null, JSON.stringify(files), Date.now()]
  );
  return id;
}

export async function listStashes(owner, repo) {
  const db = await withDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM stashes WHERE owner = ? AND repo = ? ORDER BY created_at DESC`,
    [owner, repo]
  );
  return rows.map(mapRow);
}

export async function getStash(id) {
  const db = await withDb();
  const row = await db.getFirstAsync(`SELECT * FROM stashes WHERE id = ?`, [id]);
  return row ? mapRow(row) : null;
}

export async function deleteStash(id) {
  const db = await withDb();
  await db.runAsync(`DELETE FROM stashes WHERE id = ?`, [id]);
}

function mapRow(row) {
  let files = [];
  try {
    files = JSON.parse(row.files);
  } catch (e) {
    files = [];
  }
  return {
    id: row.id,
    owner: row.owner,
    repo: row.repo,
    branch: row.branch || null,
    label: row.label,
    files,
    createdAt: row.created_at,
  };
}
