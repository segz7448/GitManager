import { withDb, repoCacheKey } from './database';

/**
 * Offline repository cache. Whenever a directory listing is fetched
 * successfully from GitHub, it's stashed here. If a later fetch fails
 * (no network, rate limit, app was killed mid-load), the last-known
 * listing is shown instead of a blank error screen, with a clear
 * "showing cached data from <time>" indicator left to the UI layer.
 */

export async function saveRepoListing(owner, repo, branch, path, data) {
  const db = await withDb();
  const key = repoCacheKey(owner, repo, branch, path);
  await db.runAsync(
    `INSERT INTO repo_cache (cache_key, owner, repo, branch, path, data, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET data = excluded.data, cached_at = excluded.cached_at`,
    [key, owner, repo, branch || '', path || '', JSON.stringify(data), Date.now()]
  );
}

export async function getCachedRepoListing(owner, repo, branch, path) {
  const db = await withDb();
  const key = repoCacheKey(owner, repo, branch, path);
  const row = await db.getFirstAsync(`SELECT data, cached_at FROM repo_cache WHERE cache_key = ?`, [key]);
  if (!row) return null;
  try {
    return { data: JSON.parse(row.data), cachedAt: row.cached_at };
  } catch (e) {
    return null;
  }
}

export async function clearRepoCache(owner, repo) {
  const db = await withDb();
  await db.runAsync(`DELETE FROM repo_cache WHERE owner = ? AND repo = ?`, [owner, repo]);
}
