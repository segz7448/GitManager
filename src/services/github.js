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

export async function listRepos({ page = 1, perPage = 50, sort = 'updated' } = {}) {
  return request(`/user/repos?per_page=${perPage}&page=${page}&sort=${sort}&affiliation=owner,collaborator`);
}

export async function getRepo(owner, repo) {
  return request(`/repos/${owner}/${repo}`);
}

export async function createRepo({ name, description = '', isPrivate = true, autoInit = true }) {
  return request('/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: autoInit,
    }),
  });
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
  return request(`/repos/${owner}/${repo}/actions/runs?${q.toString()}`);
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
