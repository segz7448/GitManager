import { withDb, fileMetaKey } from './database';
import { getFileCommitHistory } from '../services/github';

// How long a cached "last modified" value is considered fresh before
// we're willing to refetch it from GitHub (per path).
const FRESH_MS = 10 * 60 * 1000; // 10 minutes

export async function getCachedFileMeta(owner, repo, branch, path) {
  const db = await withDb();
  const key = fileMetaKey(owner, repo, branch, path);
  const row = await db.getFirstAsync(`SELECT * FROM file_meta_cache WHERE meta_key = ?`, [key]);
  if (!row) return null;
  return {
    lastModified: row.last_modified,
    lastCommitSha: row.last_commit_sha,
    lastCommitMessage: row.last_commit_message,
    cachedAt: row.cached_at,
  };
}

async function storeFileMeta(owner, repo, branch, path, meta) {
  const db = await withDb();
  const key = fileMetaKey(owner, repo, branch, path);
  await db.runAsync(
    `INSERT INTO file_meta_cache (meta_key, owner, repo, branch, path, last_modified, last_commit_sha, last_commit_message, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(meta_key) DO UPDATE SET
       last_modified = excluded.last_modified,
       last_commit_sha = excluded.last_commit_sha,
       last_commit_message = excluded.last_commit_message,
       cached_at = excluded.cached_at`,
    [
      key,
      owner,
      repo,
      branch || '',
      path,
      meta.lastModified || null,
      meta.lastCommitSha || null,
      meta.lastCommitMessage || null,
      Date.now(),
    ]
  );
}

/**
 * Returns last-modified info for a path, preferring a fresh cache entry
 * and only hitting the GitHub commits API when the cache is missing or
 * stale. Never throws - falls back to null on any failure so a single
 * rate-limited row doesn't break the whole file listing.
 */
export async function getOrFetchFileMeta(owner, repo, branch, path) {
  const cached = await getCachedFileMeta(owner, repo, branch, path);
  if (cached && Date.now() - cached.cachedAt < FRESH_MS) {
    return cached;
  }

  try {
    const commits = await getFileCommitHistory(owner, repo, path, { branch, perPage: 1 });
    const latest = Array.isArray(commits) ? commits[0] : null;
    if (!latest) return cached; // keep stale cache rather than nothing

    const meta = {
      lastModified: latest.commit?.committer?.date
        ? new Date(latest.commit.committer.date).getTime()
        : null,
      lastCommitSha: latest.sha,
      lastCommitMessage: latest.commit?.message?.split('\n')[0] || null,
    };
    await storeFileMeta(owner, repo, branch, path, meta);
    return { ...meta, cachedAt: Date.now() };
  } catch (e) {
    // Network/rate-limit failure: fall back to whatever we had cached.
    return cached;
  }
}
