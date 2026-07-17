import { withDb } from './database';

/**
 * "Clone repository locally" - since a React Native app has no
 * filesystem git checkout, this fetches the full file tree + each text
 * file's content for a repo+branch and stores it locally, so it can be
 * browsed offline later without hitting GitHub again. Binary files are
 * recorded by path/size but not downloaded (would balloon local storage
 * for e.g. image-heavy repos) - only their metadata is kept, with a note
 * that content isn't available offline.
 */

function genId() {
  return `clone-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function saveLocalClone(owner, repo, branch, files, totalBytes) {
  const db = await withDb();
  const id = genId();
  // One local clone per (owner, repo, branch) - replace any existing one
  // rather than accumulating stale copies silently.
  await db.runAsync(`DELETE FROM local_clones WHERE owner = ? AND repo = ? AND branch = ?`, [
    owner,
    repo,
    branch || '',
  ]);
  await db.runAsync(
    `INSERT INTO local_clones (id, owner, repo, branch, file_count, total_bytes, files, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, owner, repo, branch || '', files.length, totalBytes || 0, JSON.stringify(files), Date.now()]
  );
  return id;
}

export async function getLocalClone(owner, repo, branch) {
  const db = await withDb();
  const row = await db.getFirstAsync(
    `SELECT * FROM local_clones WHERE owner = ? AND repo = ? AND branch = ?`,
    [owner, repo, branch || '']
  );
  return row ? mapRow(row) : null;
}

export async function listLocalClones() {
  const db = await withDb();
  const rows = await db.getAllAsync(`SELECT * FROM local_clones ORDER BY created_at DESC`);
  return rows.map(mapRow);
}

export async function deleteLocalClone(id) {
  const db = await withDb();
  await db.runAsync(`DELETE FROM local_clones WHERE id = ?`, [id]);
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
    fileCount: row.file_count,
    totalBytes: row.total_bytes,
    files, // [{ path, content?, size, binary, truncated? }]
    createdAt: row.created_at,
  };
}
