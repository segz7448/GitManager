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

/**
 * Reads token metadata GitHub exposes via response headers on any
 * authenticated request: granted OAuth scopes (classic PATs only - fine-
 * grained PATs don't return this header since they use a different
 * permission model) and the token's expiration date, if it has one.
 * Returns nulls for whatever the token type/header doesn't provide,
 * rather than guessing.
 */
export async function getTokenInfo(tokenOverride) {
  const token = tokenOverride || (await getToken());
  if (!token) throw new GitHubError('No GitHub token configured', 401, null);

  const res = await fetch(`${API_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) {
    throw new GitHubError(`Token check failed: ${res.status}`, res.status, null);
  }

  const scopesHeader = res.headers.get('x-oauth-scopes');
  const expirationHeader = res.headers.get('github-authentication-token-expiration');
  const user = await res.json();

  return {
    user,
    scopes: scopesHeader ? scopesHeader.split(',').map((s) => s.trim()).filter(Boolean) : null,
    isFineGrained: !scopesHeader && token.startsWith('github_pat_'),
    expiresAt: expirationHeader ? new Date(expirationHeader.replace(' UTC', 'Z').replace(' ', 'T')) : null,
  };
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

/**
 * Transfers a repository to a new owner (user or organization). For a
 * transfer to a personal account, GitHub emails the new owner a
 * confirmation link and the transfer only completes once they accept it
 * (it expires after 24h if ignored) - this call just kicks that off, it
 * doesn't mean the repo has moved yet.
 */
export async function transferRepo(owner, repo, newOwner) {
  return request(`/repos/${owner}/${repo}/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_owner: newOwner }),
  });
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

export async function getBranch(owner, repo, branch) {
  return request(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`);
}

/**
 * Full recursive file tree for a branch (paths, blob shas, sizes) - one
 * call instead of walking directories one level at a time. Used by the
 * commit-history-aware features (cherry-pick's delete-guard) and by
 * "Clone repository locally".
 */
export async function getRepoTreeRecursive(owner, repo, branch) {
  const ref = await getRef(owner, repo, branch);
  const commit = await getCommit(owner, repo, ref.object.sha);
  return request(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
}

export async function getBlobContent(owner, repo, blobSha) {
  return request(`/repos/${owner}/${repo}/git/blobs/${blobSha}`);
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

export async function getIssue(owner, repo, issueNumber) {
  return request(`/repos/${owner}/${repo}/issues/${issueNumber}`);
}

export async function updateIssueState(owner, repo, issueNumber, state) {
  // state: 'open' | 'closed'
  return request(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
}

export async function listIssueComments(owner, repo, issueNumber, { page = 1, perPage = 30 } = {}) {
  return requestPaginated(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=${perPage}&page=${page}`
  );
}

export async function createIssueComment(owner, repo, issueNumber, body) {
  return request(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

// ---------- Stars & watching ----------

export async function isRepoStarred(owner, repo) {
  try {
    await requestRaw(`/user/starred/${owner}/${repo}`, { method: 'GET' });
    return true;
  } catch (e) {
    if (e.status === 404) return false;
    throw e;
  }
}

export async function starRepo(owner, repo) {
  await requestRaw(`/user/starred/${owner}/${repo}`, { method: 'PUT', headers: { 'Content-Length': '0' } });
}

export async function unstarRepo(owner, repo) {
  await requestRaw(`/user/starred/${owner}/${repo}`, { method: 'DELETE' });
}

/**
 * GitHub's "watch" concept was superseded by per-repo notification
 * "subscription" settings, but the subscription endpoint is the closest
 * equivalent and is what github.com's "Watch" button actually calls.
 */
export async function getRepoSubscription(owner, repo) {
  try {
    return await request(`/repos/${owner}/${repo}/subscription`);
  } catch (e) {
    if (e.status === 404) return { subscribed: false, ignored: false };
    throw e;
  }
}

export async function setRepoSubscription(owner, repo, { subscribed, ignored } = {}) {
  return request(`/repos/${owner}/${repo}/subscription`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscribed, ignored }),
  });
}

export async function deleteRepoSubscription(owner, repo) {
  return request(`/repos/${owner}/${repo}/subscription`, { method: 'DELETE' });
}

// ---------- Collaborators ----------

export async function listCollaborators(owner, repo) {
  return request(`/repos/${owner}/${repo}/collaborators`);
}

export async function addCollaborator(owner, repo, username, permission = 'push') {
  // permission: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'
  return request(`/repos/${owner}/${repo}/collaborators/${username}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission }),
  });
}

export async function removeCollaborator(owner, repo, username) {
  return request(`/repos/${owner}/${repo}/collaborators/${username}`, { method: 'DELETE' });
}

// ---------- Codespaces ----------
//
// Full lifecycle management (list/create/start/stop/delete/machines) is
// real REST API functionality. The actual in-editor coding session that
// a codespace provides runs over a separate VS Code Web connection at
// its `web_url` - that's a full browser-based editor, not something this
// app reimplements natively. Opening `web_url` (in the system browser or
// an in-app WebView) is the correct way to actually *use* a codespace
// once it's running; these functions cover everything around that.

export async function listCodespaces({ perPage = 30, page = 1 } = {}) {
  return request(`/user/codespaces?per_page=${perPage}&page=${page}`);
}

export async function listRepoCodespaces(owner, repo, { perPage = 30, page = 1 } = {}) {
  return request(`/repos/${owner}/${repo}/codespaces?per_page=${perPage}&page=${page}`);
}

export async function getCodespace(codespaceName) {
  return request(`/user/codespaces/${codespaceName}`);
}

export async function listCodespaceMachines(owner, repo, { ref, location } = {}) {
  const params = new URLSearchParams();
  if (ref) params.set('ref', ref);
  if (location) params.set('location', location);
  const qs = params.toString();
  return request(`/repos/${owner}/${repo}/codespaces/machines${qs ? `?${qs}` : ''}`);
}

/**
 * Creates a codespace for a repo at a given ref (branch/commit). `machine`
 * is optional - omitting it lets GitHub pick a sensible default for the
 * repo's configuration.
 */
export async function createCodespace(owner, repo, { ref, machine, devcontainerPath } = {}) {
  const body = {};
  if (ref) body.ref = ref;
  if (machine) body.machine = machine;
  if (devcontainerPath) body.devcontainer_path = devcontainerPath;
  return request(`/repos/${owner}/${repo}/codespaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function startCodespace(codespaceName) {
  return request(`/user/codespaces/${codespaceName}/start`, { method: 'POST' });
}

export async function stopCodespace(codespaceName) {
  return request(`/user/codespaces/${codespaceName}/stop`, { method: 'POST' });
}

export async function deleteCodespace(codespaceName) {
  return request(`/user/codespaces/${codespaceName}`, { method: 'DELETE' });
}

/**
 * Changes a codespace's machine type or display name. A machine change
 * only takes effect the next time the codespace is restarted. Note:
 * idle timeout is set at creation time only - GitHub's update endpoint
 * doesn't support changing it after the fact, so it's not exposed here.
 */
export async function updateCodespace(codespaceName, { machine, displayName } = {}) {
  const body = {};
  if (machine) body.machine = machine;
  if (displayName) body.display_name = displayName;
  return request(`/user/codespaces/${codespaceName}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

/**
 * Repo-wide commit history (not scoped to a single file), used by the
 * commit history browser and the undo/revert flows.
 */
export async function listRepoCommits(owner, repo, { branch, perPage = 30, page = 1 } = {}) {
  const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
  if (branch) params.set('sha', branch);
  return request(`/repos/${owner}/${repo}/commits?${params.toString()}`);
}

/**
 * Full detail for a single commit, including per-file patches - used to
 * show what a commit changed before reverting/undoing it.
 */
export async function getCommitDetail(owner, repo, sha) {
  return request(`/repos/${owner}/${repo}/commits/${sha}`);
}

// ---------- Branch safety helpers ----------

/**
 * Creates a new branch pointing at the given commit (defaults to the
 * current tip of `fromBranch`). Used for "auto-create branch before major
 * operations" (ZIP upload, bulk edits) and manual branch creation.
 */
export async function createBranch(owner, repo, newBranchName, fromBranch) {
  const ref = await getRef(owner, repo, fromBranch);
  return request(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${newBranchName}`, sha: ref.object.sha }),
  });
}

export async function deleteBranch(owner, repo, branchName) {
  return request(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`, {
    method: 'DELETE',
  });
}

/**
 * A timestamped, collision-resistant backup branch name, matching the
 * requested "gitmanager-backup-YYYYMMDD-HHmm" convention.
 */
export function generateBackupBranchName(prefix = 'gitmanager-backup') {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}-${stamp}`;
}

/**
 * Checks whether `branch`'s remote tip still matches `expectedSha`. Used
 * right before a push/commit to detect if someone else (or another
 * device) has moved the branch since the app last read it - i.e. a
 * conflict - so the app can warn instead of silently overwriting.
 */
export async function checkForConflict(owner, repo, branch, expectedSha) {
  const ref = await getRef(owner, repo, branch);
  const currentSha = ref.object.sha;
  return {
    hasConflict: currentSha !== expectedSha,
    currentSha,
    expectedSha,
  };
}

/**
 * Reverts a single commit by creating a new commit whose tree is the
 * parent's tree re-applied at the tip of the branch (a "revert" in the
 * sense of "undo what this commit changed", implemented via the Git Data
 * API since the REST API has no native single-commit revert endpoint).
 *
 * This only supports reverting the *tip* commit's tree relative to its
 * immediate parent cleanly; reverting a commit buried in history can
 * conflict with later changes to the same files, so the caller should
 * warn the user this is safest for recent commits.
 */
export async function revertCommit(owner, repo, branch, commitSha, message) {
  const commit = await getCommit(owner, repo, commitSha);
  if (!commit.parents || commit.parents.length === 0) {
    throw new Error('Cannot revert the initial commit (it has no parent to restore).');
  }
  const parentSha = commit.parents[0].sha;
  const parentCommit = await getCommit(owner, repo, parentSha);

  const refData = await getRef(owner, repo, branch);
  const tipSha = refData.object.sha;

  const revertCommitObj = await createGitCommit(
    owner,
    repo,
    message || `Revert "${commit.message.split('\n')[0]}"`,
    parentCommit.tree.sha,
    tipSha
  );
  await updateRef(owner, repo, branch, revertCommitObj.sha);
  return revertCommitObj;
}

/**
 * Undoes the most recent commit on a branch by force-moving the branch
 * ref back to its parent. Unlike revertCommit (which adds a new commit
 * that undoes changes), this rewrites history - so it's only offered
 * for the tip commit and only when the app itself made that commit in
 * the current session, to minimize the risk of discarding someone
 * else's work.
 */
export async function undoLastCommit(owner, repo, branch, expectedTipSha) {
  const refData = await getRef(owner, repo, branch);
  if (refData.object.sha !== expectedTipSha) {
    throw new Error('The branch has moved since this commit was made - refusing to undo to avoid losing newer work.');
  }
  const tipCommit = await getCommit(owner, repo, refData.object.sha);
  if (!tipCommit.parents || tipCommit.parents.length === 0) {
    throw new Error('Cannot undo the initial commit (it has no parent).');
  }
  const parentSha = tipCommit.parents[0].sha;
  await updateRef(owner, repo, branch, parentSha, true);
  return { restoredSha: parentSha, undoneSha: expectedTipSha };
}

// ---------- Merge, cherry-pick, fork, clone ----------

/**
 * Merges one branch into another directly (not via a Pull Request),
 * using GitHub's native merge endpoint. GitHub performs the merge
 * server-side and reports a 409 if there's a conflict it can't resolve
 * automatically - the caller should surface that as "resolve via a Pull
 * Request instead" since there's no in-app merge-conflict editor.
 */
export async function mergeBranch(owner, repo, base, head, commitMessage) {
  return request(`/repos/${owner}/${repo}/merges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base, head, commit_message: commitMessage }),
  });
}

/**
 * Cherry-picks a single commit onto another branch by re-applying its
 * tree changes as a new commit there. Since GitHub's REST/Git Data APIs
 * have no native cherry-pick, this is implemented as: take the changed
 * paths from the source commit's diff (via the repos-commits endpoint,
 * which includes file patches/content shas) and rebuild a tree on top of
 * the destination branch with just those blobs replaced.
 *
 * This only handles additions/modifications cleanly (a file whose
 * *content* changed or was added in the source commit). Deletions in the
 * source commit are also applied. It does not attempt a 3-way textual
 * merge, so if the destination branch has diverged heavily on the same
 * lines, the result may not be perfect - the app should show a diff
 * preview before the user confirms.
 */
export async function cherryPickCommit(owner, repo, sourceCommitSha, destBranch, message) {
  // repos/{owner}/{repo}/commits/{sha} (REST, not git/commits) includes
  // a `files` array with each changed path's status and content sha.
  const commitDetail = await request(`/repos/${owner}/${repo}/commits/${sourceCommitSha}`);
  const files = commitDetail.files || [];
  if (files.length === 0) {
    throw new Error('This commit has no file changes to cherry-pick (or touched too many files for GitHub to list).');
  }

  const destRef = await getRef(owner, repo, destBranch);
  const destCommit = await getCommit(owner, repo, destRef.object.sha);

  // GitHub's create-tree endpoint errors if asked to delete a path that
  // doesn't exist in base_tree, so we check the destination tree first
  // and only emit delete entries for paths actually present there
  // (e.g. a rename's old path may already be gone if the destination
  // branch diverged).
  const destTree = await request(`/repos/${owner}/${repo}/git/trees/${destCommit.tree.sha}?recursive=1`);
  const destPaths = new Set((destTree.tree || []).map((t) => t.path));

  const treeItems = [];
  for (const f of files) {
    if (f.status === 'removed') {
      if (destPaths.has(f.filename)) {
        treeItems.push({ path: f.filename, mode: '100644', type: 'blob', sha: null });
      }
    } else {
      // f.sha here is the blob sha in the *source* commit for this file's
      // new content - reusable directly as a git blob sha since blobs are
      // content-addressed and shared across the whole repo.
      treeItems.push({ path: f.filename, mode: '100644', type: 'blob', sha: f.sha });
      if (f.status === 'renamed' && f.previous_filename && destPaths.has(f.previous_filename)) {
        // Also remove the old path so the rename actually takes effect
        // on the destination branch instead of leaving both paths present.
        treeItems.push({ path: f.previous_filename, mode: '100644', type: 'blob', sha: null });
      }
    }
  }

  const newTree = await createTree(owner, repo, treeItems, destCommit.tree.sha);
  const newCommit = await createGitCommit(
    owner,
    repo,
    message || `Cherry-pick: ${commitDetail.commit.message.split('\n')[0]}`,
    newTree.sha,
    destRef.object.sha
  );
  await updateRef(owner, repo, destBranch, newCommit.sha);
  return newCommit;
}

/**
 * Forks a repo into the authenticated user's account (or an org they
 * belong to, if `organization` is passed). Forking is asynchronous on
 * GitHub's side - the returned repo object may not be fully ready
 * (empty/still copying) for a few seconds after this resolves.
 */
export async function forkRepo(owner, repo, { organization } = {}) {
  const body = organization ? { organization } : {};
  return request(`/repos/${owner}/${repo}/forks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------- File / folder management ----------

/**
 * Renames or moves a single file in one atomic commit: adds the new path
 * (reusing the existing blob sha, so content isn't re-uploaded) and
 * removes the old path, both in the same tree/commit. This avoids the
 * "two separate commits, one succeeds and one doesn't" risk of doing a
 * delete + create via the Contents API.
 */
export async function renameOrMoveFile(owner, repo, branch, oldPath, newPath, blobSha, message) {
  const refData = await getRef(owner, repo, branch);
  const baseCommit = await getCommit(owner, repo, refData.object.sha);
  const newTree = await createTree(
    owner,
    repo,
    [
      { path: newPath, mode: '100644', type: 'blob', sha: blobSha },
      { path: oldPath, mode: '100644', type: 'blob', sha: null },
    ],
    baseCommit.tree.sha
  );
  const commit = await createGitCommit(owner, repo, message || `Rename ${oldPath} to ${newPath}`, newTree.sha, refData.object.sha);
  await updateRef(owner, repo, branch, commit.sha);
  return commit;
}

/**
 * Renames or moves an entire folder by rewriting every path under the
 * old prefix to the new prefix, all in one commit. `entries` should be
 * every blob currently under `oldPrefix` (path + blob sha), typically
 * obtained by filtering a recursive tree fetch.
 */
export async function renameOrMoveFolder(owner, repo, branch, oldPrefix, newPrefix, entries, message) {
  const refData = await getRef(owner, repo, branch);
  const baseCommit = await getCommit(owner, repo, refData.object.sha);

  const treeItems = [];
  for (const entry of entries) {
    const suffix = entry.path.slice(oldPrefix.length); // includes leading '/'
    treeItems.push({ path: newPrefix + suffix, mode: '100644', type: 'blob', sha: entry.sha });
    treeItems.push({ path: entry.path, mode: '100644', type: 'blob', sha: null });
  }

  const newTree = await createTree(owner, repo, treeItems, baseCommit.tree.sha);
  const commit = await createGitCommit(
    owner,
    repo,
    message || `Rename ${oldPrefix} to ${newPrefix}`,
    newTree.sha,
    refData.object.sha
  );
  await updateRef(owner, repo, branch, commit.sha);
  return commit;
}

/**
 * Duplicates a single file at a new path in one commit, reusing the
 * existing blob sha (no content re-upload needed since blobs are
 * content-addressed).
 */
export async function duplicateFile(owner, repo, branch, sourcePath, destPath, blobSha, message) {
  const refData = await getRef(owner, repo, branch);
  const baseCommit = await getCommit(owner, repo, refData.object.sha);
  const newTree = await createTree(
    owner,
    repo,
    [{ path: destPath, mode: '100644', type: 'blob', sha: blobSha }],
    baseCommit.tree.sha
  );
  const commit = await createGitCommit(owner, repo, message || `Duplicate ${sourcePath} as ${destPath}`, newTree.sha, refData.object.sha);
  await updateRef(owner, repo, branch, commit.sha);
  return commit;
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
