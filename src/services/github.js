import * as SecureStore from 'expo-secure-store';
import { encode as btoa, decode as atob } from 'base-64';

const API_BASE = 'https://api.github.com';
const TOKEN_KEY = 'gh_pat_token';
const USER_KEY = 'gh_username_cache';

// ---------- Token management ----------

export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function cacheUsername(username) {
  await SecureStore.setItemAsync(USER_KEY, username);
}

export async function getCachedUsername() {
  return SecureStore.getItemAsync(USER_KEY);
}

// ---------- Core request wrapper ----------

class GitHubError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path, options = {}) {
  const token = await getToken();
  if (!token) {
    throw new GitHubError('No GitHub token configured', 401, null);
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });

  // Some endpoints (raw logs) return plain text/zip, not JSON
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let data = null;
    try {
      data = contentType.includes('application/json') ? await res.json() : await res.text();
    } catch (e) {
      // ignore parse failure
    }
    const message = (data && data.message) || `GitHub API error: ${res.status}`;
    throw new GitHubError(message, res.status, data);
  }

  if (res.status === 204) return null;

  if (contentType.includes('application/json')) {
    return res.json();
  }
  // caller decides how to handle raw/binary responses via rawResponse option
  return res;
}

async function requestPaginated(path, options = {}) {
  const token = await getToken();
  if (!token) throw new GitHubError('No GitHub token configured', 401, null);

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch (e) {}
    throw new GitHubError((data && data.message) || `GitHub API error: ${res.status}`, res.status, data);
  }

  const data = await res.json();
  const linkHeader = res.headers.get('link') || '';
  const pagination = parseLinkHeader(linkHeader);
  return { data, pagination };
}

function parseLinkHeader(linkHeader) {
  const result = { hasNext: false, hasPrev: false, nextPage: null, lastPage: null };
  if (!linkHeader) return result;

  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (!match) continue;
    const [, urlStr, rel] = match;
    const pageMatch = urlStr.match(/[?&]page=(\d+)/);
    const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : null;

    if (rel === 'next') {
      result.hasNext = true;
      result.nextPage = pageNum;
    }
    if (rel === 'prev') {
      result.hasPrev = true;
    }
    if (rel === 'last') {
      result.lastPage = pageNum;
    }
  }
  return result;
}


async function requestRaw(path, options = {}) {
  const token = await getToken();
  if (!token) throw new GitHubError('No GitHub token configured', 401, null);

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok && res.status !== 302) {
    let text = '';
    try { text = await res.text(); } catch (e) {}
    throw new GitHubError(`GitHub API error: ${res.status}`, res.status, text);
  }
  return res;
}

// ---------- User ----------

export async function getAuthenticatedUser() {
  const user = await request('/user');
  await cacheUsername(user.login);
  return user;
}

export async function verifyToken(token) {
  const res = await fetch(`${API_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) return { valid: false };
  const data = await res.json();
  return { valid: true, user: data };
}

// ---------- Repos ----------

export async function listRepos({ page = 1, perPage = 30, sort = 'updated' } = {}) {
  return requestPaginated(`/user/repos?per_page=${perPage}&page=${page}&sort=${sort}&affiliation=owner,collaborator`);
}

export async function getRepo(owner, repo) {
  return request(`/repos/${owner}/${repo}`);
}

export async function createRepo({
  name,
  description = '',
  isPrivate = false,
  autoInit = false,
  gitignoreTemplate,
  licenseTemplate,
}) {
  // GitHub only applies gitignore/license templates when there's an
  // initial commit to attach them to, so auto_init must be true whenever
  // either is set - even if the caller didn't explicitly ask for a README.
  const needsInit = autoInit || !!gitignoreTemplate || !!licenseTemplate;

  const body = {
    name,
    description,
    private: isPrivate,
    auto_init: needsInit,
  };
  if (gitignoreTemplate) body.gitignore_template = gitignoreTemplate;
  if (licenseTemplate) body.license_template = licenseTemplate;

  return request('/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * GitHub's list of built-in .gitignore templates (by name, e.g. "Node",
 * "Python", "Android").
 */
export async function listGitignoreTemplates() {
  return request('/gitignore/templates');
}

/**
 * GitHub's list of common OSS licenses with their template keys
 * (e.g. { key: "mit", name: "MIT License" }).
 */
export async function listLicenseTemplates() {
  return request('/licenses');
}

export async function updateRepo(owner, repo, updates) {
  return request(`/repos/${owner}/${repo}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function deleteRepo(owner, repo) {
  return request(`/repos/${owner}/${repo}`, { method: 'DELETE' });
}

// ---------- Contents / Files ----------

export async function getContents(owner, repo, path = '', ref = undefined) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  return request(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}${q}`);
}

export async function getFileContent(owner, repo, path, ref = undefined) {
  const data = await getContents(owner, repo, path, ref);
  if (Array.isArray(data)) throw new Error('Path is a directory, not a file');
  // content is base64, potentially with newlines
  const decoded = decodeBase64Utf8(data.content.replace(/\n/g, ''));
  return { ...data, decodedContent: decoded };
}

export async function createOrUpdateFile(owner, repo, path, { message, content, sha, branch }) {
  const body = {
    message,
    content: encodeBase64Utf8(content),
  };
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;

  return request(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteFile(owner, repo, path, { message, sha, branch }) {
  const body = { message, sha };
  if (branch) body.branch = branch;
  return request(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------- Multi-file commit (Git Data API - trees/blobs) ----------
// Used for zip upload: commit many files in a single commit instead of
// one API call per file.

export async function getRef(owner, repo, branch) {
  return request(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
}

export async function getCommit(owner, repo, commitSha) {
  return request(`/repos/${owner}/${repo}/git/commits/${commitSha}`);
}

export async function createBlob(owner, repo, content, encoding = 'utf-8') {
  return request(`/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, encoding }),
  });
}

export async function createTree(owner, repo, tree, baseTreeSha) {
  const body = { tree };
  if (baseTreeSha) body.base_tree = baseTreeSha;
  return request(`/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function createGitCommit(owner, repo, message, treeSha, parentSha) {
  return request(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
  });
}

export async function updateRef(owner, repo, branch, commitSha, force = false) {
  return request(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commitSha, force }),
  });
}

/**
 * Commit multiple files in a single commit using the Git Data API.
 * files: [{ path: 'src/index.js', content: 'string content', binaryBase64?: 'base64...' }]
 * onProgress(current, total, label) called during blob upload.
 */
export async function commitMultipleFiles(owner, repo, branch, files, message, onProgress) {
  const refData = await getRef(owner, repo, branch);
  const latestCommitSha = refData.object.sha;
  const latestCommit = await getCommit(owner, repo, latestCommitSha);
  const baseTreeSha = latestCommit.tree.sha;

  const treeItems = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (onProgress) onProgress(i + 1, files.length, f.path);

    let blob;
    if (f.binaryBase64) {
      blob = await createBlob(owner, repo, f.binaryBase64, 'base64');
    } else {
      blob = await createBlob(owner, repo, f.content, 'utf-8');
    }

    treeItems.push({
      path: f.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  const newTree = await createTree(owner, repo, treeItems, baseTreeSha);
  const newCommit = await createGitCommit(owner, repo, message, newTree.sha, latestCommitSha);
  await updateRef(owner, repo, branch, newCommit.sha);

  return newCommit;
}

// ---------- Branches ----------

export async function listBranches(owner, repo) {
  return request(`/repos/${owner}/${repo}/branches?per_page=100`);
}

// ---------- Actions / Workflow Runs ----------

export async function listWorkflowRuns(owner, repo, { perPage = 30, page = 1, branch } = {}) {
  const q = new URLSearchParams({ per_page: String(perPage), page: String(page) });
  if (branch) q.set('branch', branch);
  return requestPaginated(`/repos/${owner}/${repo}/actions/runs?${q.toString()}`);
}

export async function getWorkflowRun(owner, repo, runId) {
  return request(`/repos/${owner}/${repo}/actions/runs/${runId}`);
}

export async function listRunJobs(owner, repo, runId) {
  return request(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`);
}

export async function cancelWorkflowRun(owner, repo, runId) {
  return request(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, { method: 'POST' });
}

export async function rerunWorkflow(owner, repo, runId) {
  return request(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, { method: 'POST' });
}

export async function listWorkflows(owner, repo) {
  return request(`/repos/${owner}/${repo}/actions/workflows`);
}

export async function triggerWorkflowDispatch(owner, repo, workflowIdOrFilename, ref, inputs = {}) {
  return request(`/repos/${owner}/${repo}/actions/workflows/${workflowIdOrFilename}/dispatches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, inputs }),
  });
}

// ---------- Code search ----------

/**
 * Search code across a single repo (or globally if owner/repo omitted).
 * GitHub's search API requires at least one qualifier beyond the raw text
 * for good results; we scope to repo: by default.
 */
export async function searchCode(query, { owner, repo, page = 1, perPage = 30 } = {}) {
  let q = query;
  if (owner && repo) {
    q += ` repo:${owner}/${repo}`;
  }
  const params = new URLSearchParams({
    q,
    per_page: String(perPage),
    page: String(page),
  });
  return request(`/search/code?${params.toString()}`, {
    headers: { Accept: 'application/vnd.github.text-match+json' },
  });
}

// ---------- Issues ----------

/**
 * Issues assigned to, mentioning, or authored by the authenticated user,
 * across all repos they can see. Uses the search API since there's no
 * single REST endpoint for "my issues" across repos.
 */
export async function listMyIssues({ page = 1, perPage = 30, state = 'open' } = {}) {
  const q = `is:issue involves:@me is:${state}`;
  const params = new URLSearchParams({
    q,
    per_page: String(perPage),
    page: String(page),
    sort: 'updated',
  });
  return requestPaginated(`/search/issues?${params.toString()}`);
}

export async function listRepoIssues(owner, repo, { page = 1, perPage = 30, state = 'open' } = {}) {
  const params = new URLSearchParams({ state, per_page: String(perPage), page: String(page) });
  return requestPaginated(`/repos/${owner}/${repo}/issues?${params.toString()}`);
}

export async function createIssue(owner, repo, { title, body }) {
  return request(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
}

// ---------- Activity ----------

/**
 * The authenticated user's recent public + private activity (commits,
 * PRs, issues, stars, etc.) - the same feed shown on their GitHub profile.
 */
export async function listMyRecentActivity(username, { page = 1, perPage = 30 } = {}) {
  return requestPaginated(`/users/${username}/events?per_page=${perPage}&page=${page}`);
}

/**
 * Get raw logs for a full run as a zip (GitHub returns a zip archive of all
 * job logs). Returns the raw fetch Response so caller can stream to disk.
 */
export async function downloadRunLogsZipResponse(owner, repo, runId) {
  return requestRaw(`/repos/${owner}/${repo}/actions/runs/${runId}/logs`, { method: 'GET' });
}

/**
 * Get raw logs for a single job as plain text.
 */
export async function getJobLogsText(owner, repo, jobId) {
  const res = await requestRaw(`/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, { method: 'GET' });
  return res.text();
}

// ---------- Artifacts ----------

export async function listRunArtifacts(owner, repo, runId) {
  return request(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`);
}

/**
 * Downloads an artifact as a zip (GitHub always wraps artifacts in a zip,
 * even single-file ones like an APK). Returns the raw Response - caller
 * reads the bytes and unzips with JSZip to get the actual file(s) inside.
 */
export async function downloadArtifactZipResponse(owner, repo, artifactId) {
  return requestRaw(`/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`, { method: 'GET' });
}

// ---------- Pull Requests ----------

export async function listPullRequests(owner, repo, { state = 'open', page = 1, perPage = 30 } = {}) {
  const params = new URLSearchParams({ state, per_page: String(perPage), page: String(page), sort: 'updated', direction: 'desc' });
  return requestPaginated(`/repos/${owner}/${repo}/pulls?${params.toString()}`);
}

export async function getPullRequest(owner, repo, pullNumber) {
  return request(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
}

/**
 * Per-file changes with unified diff patches - much more useful for a
 * mobile UI than one giant whole-PR diff blob.
 */
export async function getPullRequestFiles(owner, repo, pullNumber, { page = 1, perPage = 50 } = {}) {
  return request(`/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=${perPage}&page=${page}`);
}

export async function createPullRequest(owner, repo, { title, head, base, body }) {
  return request(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, head, base, body }),
  });
}

export async function listPullRequestReviews(owner, repo, pullNumber) {
  return request(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`);
}

/**
 * event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
 */
export async function createPullRequestReview(owner, repo, pullNumber, { body, event }) {
  return request(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, event }),
  });
}

/**
 * Conversation comments (issue-level, shown in the PR's main thread - not
 * inline code review comments, which use a separate, more complex API).
 */
export async function listPullRequestComments(owner, repo, pullNumber) {
  return request(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`);
}

export async function createPullRequestComment(owner, repo, pullNumber, body) {
  return request(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

/**
 * mergeMethod: 'merge' | 'squash' | 'rebase'
 */
export async function mergePullRequest(owner, repo, pullNumber, { commitTitle, commitMessage, mergeMethod = 'merge' } = {}) {
  const body = { merge_method: mergeMethod };
  if (commitTitle) body.commit_title = commitTitle;
  if (commitMessage) body.commit_message = commitMessage;
  return request(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------- Releases ----------

export async function listReleases(owner, repo, { page = 1, perPage = 30 } = {}) {
  return requestPaginated(`/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`);
}

export async function getRelease(owner, repo, releaseId) {
  return request(`/repos/${owner}/${repo}/releases/${releaseId}`);
}

export async function createRelease(owner, repo, { tagName, targetCommitish, name, body, draft = false, prerelease = false }) {
  return request(`/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tagName,
      target_commitish: targetCommitish,
      name,
      body,
      draft,
      prerelease,
    }),
  });
}

export async function updateRelease(owner, repo, releaseId, updates) {
  return request(`/repos/${owner}/${repo}/releases/${releaseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function deleteRelease(owner, repo, releaseId) {
  return request(`/repos/${owner}/${repo}/releases/${releaseId}`, { method: 'DELETE' });
}

/**
 * Uploads a binary asset (e.g. an APK) to a release. Note the upload host
 * is uploads.github.com, not api.github.com - GitHub's release object
 * provides the exact upload_url template to use, so we parse the repo
 * path out of it rather than hardcoding the uploads host ourselves.
 */
export async function uploadReleaseAsset(uploadUrlTemplate, fileName, contentType, base64Data) {
  const token = await getToken();
  if (!token) throw new GitHubError('No GitHub token configured', 401, null);

  // upload_url looks like: https://uploads.github.com/repos/o/r/releases/123/assets{?name,label}
  const uploadUrl = uploadUrlTemplate.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`);

  const binaryString = decodeBase64Utf8Raw(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      Accept: 'application/vnd.github+json',
    },
    body: bytes,
  });

  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch (e) {}
    throw new GitHubError((data && data.message) || `Upload failed: ${res.status}`, res.status, data);
  }
  return res.json();
}

export async function deleteReleaseAsset(owner, repo, assetId) {
  return request(`/repos/${owner}/${repo}/releases/assets/${assetId}`, { method: 'DELETE' });
}

function decodeBase64Utf8Raw(b64) {
  return atob(b64);
}

// ---------- Actions secrets & variables ----------

export async function getRepoSecretsPublicKey(owner, repo) {
  return request(`/repos/${owner}/${repo}/actions/secrets/public-key`);
}

export async function listRepoSecrets(owner, repo) {
  return request(`/repos/${owner}/${repo}/actions/secrets`);
}

/**
 * encryptedValue and keyId come from encryptSecretValue() +
 * getRepoSecretsPublicKey() - GitHub never accepts plaintext secret values.
 */
export async function createOrUpdateRepoSecret(owner, repo, secretName, encryptedValue, keyId) {
  return request(`/repos/${owner}/${repo}/actions/secrets/${secretName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted_value: encryptedValue, key_id: keyId }),
  });
}

export async function deleteRepoSecret(owner, repo, secretName) {
  return request(`/repos/${owner}/${repo}/actions/secrets/${secretName}`, { method: 'DELETE' });
}

export async function listRepoVariables(owner, repo) {
  return request(`/repos/${owner}/${repo}/actions/variables`);
}

export async function createRepoVariable(owner, repo, name, value) {
  return request(`/repos/${owner}/${repo}/actions/variables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, value }),
  });
}

export async function updateRepoVariable(owner, repo, name, value) {
  return request(`/repos/${owner}/${repo}/actions/variables/${name}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, value }),
  });
}

export async function deleteRepoVariable(owner, repo, name) {
  return request(`/repos/${owner}/${repo}/actions/variables/${name}`, { method: 'DELETE' });
}

// ---------- Commit history ----------

/**
 * Commit history for a specific file path.
 */
export async function getFileCommitHistory(owner, repo, path, { branch, perPage = 30, page = 1 } = {}) {
  const params = new URLSearchParams({ path, per_page: String(perPage), page: String(page) });
  if (branch) params.set('sha', branch);
  return request(`/repos/${owner}/${repo}/commits?${params.toString()}`);
}

// ---------- Base64 helpers (UTF-8 safe, no Buffer dependency issues) ----------

function encodeBase64Utf8(str) {
  // Encode a JS string (UTF-16) to base64 of its UTF-8 bytes
  const utf8 = unescape(encodeURIComponent(str));
  return btoa(utf8);
}

function decodeBase64Utf8(b64) {
  const binary = atob(b64);
  try {
    return decodeURIComponent(escape(binary));
  } catch (e) {
    // Not valid UTF-8 (likely binary file) - return raw binary string
    return binary;
  }
}

export { GitHubError };
