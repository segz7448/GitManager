jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve('fake-test-token')),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

import {
  cherryPickCommit,
  revertCommit,
  undoLastCommit,
  deleteRepo,
  transferRepo,
  renameOrMoveFile,
} from '../github';

/**
 * Builds a fetch mock that resolves a canned JSON response for each URL
 * it's called with, matched by a substring. Each test lists responses in
 * roughly the order the function under test is expected to call them,
 * but matching is substring-based (not call-order-based) so it stays
 * readable without spelling out full query strings.
 */
function mockFetchSequence(responses) {
  const calls = [];
  global.fetch = jest.fn((url, options) => {
    calls.push({ url, options });
    const match = responses.find((r) => url.includes(r.urlIncludes));
    if (!match) {
      throw new Error(`Unexpected fetch call in test: ${url}`);
    }
    return Promise.resolve({
      ok: true,
      status: match.status || 200,
      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: () => Promise.resolve(match.body),
      text: () => Promise.resolve(JSON.stringify(match.body)),
    });
  });
  return calls;
}

describe('cherryPickCommit', () => {
  it("skips deleting a renamed file's old path when that path no longer exists on the destination branch", async () => {
    const calls = mockFetchSequence([
      {
        urlIncludes: '/commits/sourcesha',
        body: {
          commit: { message: 'Rename foo to bar' },
          files: [
            { filename: 'bar.js', status: 'renamed', previous_filename: 'foo.js', sha: 'blobsha1' },
          ],
        },
      },
      { urlIncludes: '/git/ref/heads/main', body: { object: { sha: 'desttipsha' } } },
      { urlIncludes: '/git/commits/desttipsha', body: { tree: { sha: 'desttreesha' }, parents: [] } },
      {
        // destination tree does NOT contain foo.js - it was already
        // renamed/removed independently on this branch
        urlIncludes: '/git/trees/desttreesha',
        body: { tree: [{ path: 'bar.js', type: 'blob' }, { path: 'other.js', type: 'blob' }] },
      },
      { urlIncludes: '/git/trees', body: { sha: 'newtreesha' } },
      { urlIncludes: '/git/commits', body: { sha: 'newcommitsha' } },
      { urlIncludes: '/git/refs/heads/main', body: { object: { sha: 'newcommitsha' } } },
    ]);

    await cherryPickCommit('owner', 'repo', 'sourcesha', 'main');

    const treeCall = calls.find((c) => c.url.endsWith('/git/trees') && c.options?.method === 'POST');
    expect(treeCall).toBeDefined();
    const body = JSON.parse(treeCall.options.body);
    const paths = body.tree.map((t) => t.path);
    expect(paths).toContain('bar.js');
    expect(paths).not.toContain('foo.js');
  });

  it('includes a delete entry for a removed file that does exist on the destination branch', async () => {
    const calls = mockFetchSequence([
      {
        urlIncludes: '/commits/sourcesha',
        body: {
          commit: { message: 'Remove deprecated.js' },
          files: [{ filename: 'deprecated.js', status: 'removed', sha: null }],
        },
      },
      { urlIncludes: '/git/ref/heads/main', body: { object: { sha: 'desttipsha' } } },
      { urlIncludes: '/git/commits/desttipsha', body: { tree: { sha: 'desttreesha' }, parents: [] } },
      { urlIncludes: '/git/trees/desttreesha', body: { tree: [{ path: 'deprecated.js', type: 'blob' }] } },
      { urlIncludes: '/git/trees', body: { sha: 'newtreesha' } },
      { urlIncludes: '/git/commits', body: { sha: 'newcommitsha' } },
      { urlIncludes: '/git/refs/heads/main', body: { object: { sha: 'newcommitsha' } } },
    ]);

    await cherryPickCommit('owner', 'repo', 'sourcesha', 'main');

    const treeCall = calls.find((c) => c.url.endsWith('/git/trees') && c.options?.method === 'POST');
    const body = JSON.parse(treeCall.options.body);
    const deprecatedEntry = body.tree.find((t) => t.path === 'deprecated.js');
    expect(deprecatedEntry).toBeDefined();
    expect(deprecatedEntry.sha).toBeNull();
  });

  it('throws a clear error when the source commit has no file changes to cherry-pick', async () => {
    mockFetchSequence([
      { urlIncludes: '/commits/sourcesha', body: { commit: { message: 'Empty' }, files: [] } },
    ]);

    await expect(cherryPickCommit('owner', 'repo', 'sourcesha', 'main')).rejects.toThrow(/no file changes/i);
  });
});

describe('revertCommit', () => {
  it('refuses to revert the initial commit, which has no parent', async () => {
    mockFetchSequence([
      { urlIncludes: '/git/commits/initialsha', body: { message: 'Initial commit', parents: [] } },
    ]);

    await expect(revertCommit('owner', 'repo', 'main', 'initialsha')).rejects.toThrow(/no parent/i);
  });

  it('builds the revert commit on top of the current branch tip, not the reverted commit', async () => {
    const calls = mockFetchSequence([
      {
        urlIncludes: '/git/commits/badsha',
        body: { message: 'Bad change', parents: [{ sha: 'parentsha' }], tree: { sha: 'badtreesha' } },
      },
      { urlIncludes: '/git/commits/parentsha', body: { tree: { sha: 'goodtreesha' }, parents: [] } },
      { urlIncludes: '/git/ref/heads/main', body: { object: { sha: 'currenttipsha' } } },
      { urlIncludes: '/git/commits', body: { sha: 'revertcommitsha' } },
      { urlIncludes: '/git/refs/heads/main', body: { object: { sha: 'revertcommitsha' } } },
    ]);

    await revertCommit('owner', 'repo', 'main', 'badsha');

    const commitCall = calls.find((c) => c.url.endsWith('/git/commits') && c.options?.method === 'POST');
    const body = JSON.parse(commitCall.options.body);
    expect(body.parents).toEqual(['currenttipsha']);
    expect(body.tree).toBe('goodtreesha');
  });
});

describe('undoLastCommit', () => {
  it('refuses to undo when the branch has moved since the expected tip sha', async () => {
    mockFetchSequence([
      { urlIncludes: '/git/ref/heads/main', body: { object: { sha: 'actualcurrentsha' } } },
    ]);

    await expect(
      undoLastCommit('owner', 'repo', 'main', 'staleExpectedSha')
    ).rejects.toThrow(/moved since/i);
  });

  it('refuses to undo the initial commit, which has no parent to restore', async () => {
    mockFetchSequence([
      { urlIncludes: '/git/ref/heads/main', body: { object: { sha: 'tipsha' } } },
      { urlIncludes: '/git/commits/tipsha', body: { parents: [] } },
    ]);

    await expect(undoLastCommit('owner', 'repo', 'main', 'tipsha')).rejects.toThrow(/no parent/i);
  });

  it('force-moves the branch ref back to the parent commit when the tip matches expectations', async () => {
    const calls = mockFetchSequence([
      { urlIncludes: '/git/ref/heads/main', body: { object: { sha: 'tipsha' } } },
      { urlIncludes: '/git/commits/tipsha', body: { parents: [{ sha: 'parentsha' }] } },
      { urlIncludes: '/git/refs/heads/main', body: { object: { sha: 'parentsha' } } },
    ]);

    const result = await undoLastCommit('owner', 'repo', 'main', 'tipsha');

    expect(result.restoredSha).toBe('parentsha');
    const updateRefCall = calls.find((c) => c.url.includes('/git/refs/heads/main') && c.options?.method === 'PATCH');
    expect(updateRefCall).toBeDefined();
    const body = JSON.parse(updateRefCall.options.body);
    expect(body.sha).toBe('parentsha');
    expect(body.force).toBe(true);
  });
});

describe('deleteRepo', () => {
  it('sends a DELETE request to the correct repo endpoint', async () => {
    const calls = mockFetchSequence([{ urlIncludes: '/repos/owner/repo', body: {} }]);
    await deleteRepo('owner', 'repo');
    const call = calls[calls.length - 1];
    expect(call.url).toBe('https://api.github.com/repos/owner/repo');
    expect(call.options.method).toBe('DELETE');
  });
});

describe('transferRepo', () => {
  it('sends the new owner in the request body to the transfer endpoint', async () => {
    const calls = mockFetchSequence([{ urlIncludes: '/transfer', body: { owner: { login: 'newowner' } } }]);
    await transferRepo('owner', 'repo', 'newowner');
    const call = calls[calls.length - 1];
    expect(call.url).toBe('https://api.github.com/repos/owner/repo/transfer');
    expect(call.options.method).toBe('POST');
    const body = JSON.parse(call.options.body);
    expect(body.new_owner).toBe('newowner');
  });
});

describe('renameOrMoveFile', () => {
  it('adds the new path and removes the old path in the same tree, reusing the existing blob sha', async () => {
    const calls = mockFetchSequence([
      { urlIncludes: '/git/ref/heads/main', body: { object: { sha: 'tipsha' } } },
      { urlIncludes: '/git/commits/tipsha', body: { tree: { sha: 'basetreesha' } } },
      { urlIncludes: '/git/trees', body: { sha: 'newtreesha' } },
      { urlIncludes: '/git/commits', body: { sha: 'newcommitsha' } },
      { urlIncludes: '/git/refs/heads/main', body: { object: { sha: 'newcommitsha' } } },
    ]);

    await renameOrMoveFile('owner', 'repo', 'main', 'old/path.js', 'new/path.js', 'blobshaABC');

    const treeCall = calls.find((c) => c.url.endsWith('/git/trees') && c.options?.method === 'POST');
    const body = JSON.parse(treeCall.options.body);
    const added = body.tree.find((t) => t.path === 'new/path.js');
    const removed = body.tree.find((t) => t.path === 'old/path.js');
    expect(added.sha).toBe('blobshaABC');
    expect(removed.sha).toBeNull();
  });
});
