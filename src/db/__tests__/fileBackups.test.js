/**
 * These tests substitute a small hand-built fake for the single `db`
 * object createBackup interacts with (getFirstAsync / runAsync), rather
 * than a general SQL engine - the goal is to verify createBackup's own
 * dedup decision logic, not to reimplement SQLite.
 */

function makeFakeDb({ latestBackup = null } = {}) {
  const runAsyncCalls = [];
  return {
    getFirstAsync: jest.fn(() => Promise.resolve(latestBackup)),
    runAsync: jest.fn((sql, params) => {
      runAsyncCalls.push({ sql, params });
      return Promise.resolve({ changes: 1 });
    }),
    _runAsyncCalls: runAsyncCalls,
  };
}

describe('createBackup dedup behavior', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('skips writing a new "open" backup when the most recent one has identical content', async () => {
    const fakeDb = makeFakeDb({ latestBackup: { content: 'same content' } });
    jest.doMock('../database', () => ({ withDb: () => Promise.resolve(fakeDb) }));
    const { createBackup } = require('../fileBackups');

    const result = await createBackup('owner', 'repo', 'main', 'file.js', 'same content', 'sha1', 'open');

    expect(result).toBeNull();
    const insertCalls = fakeDb._runAsyncCalls.filter((c) => /INSERT INTO file_backups/i.test(c.sql));
    expect(insertCalls.length).toBe(0);
  });

  it('writes a new "open" backup when the content differs from the most recent one', async () => {
    const fakeDb = makeFakeDb({ latestBackup: { content: 'old content' } });
    jest.doMock('../database', () => ({ withDb: () => Promise.resolve(fakeDb) }));
    const { createBackup } = require('../fileBackups');

    const result = await createBackup('owner', 'repo', 'main', 'file.js', 'new content', 'sha2', 'open');

    expect(result).not.toBeNull();
    const insertCalls = fakeDb._runAsyncCalls.filter((c) => /INSERT INTO file_backups/i.test(c.sql));
    expect(insertCalls.length).toBe(1);
  });

  it('writes a new "open" backup when there is no prior backup at all', async () => {
    const fakeDb = makeFakeDb({ latestBackup: null });
    jest.doMock('../database', () => ({ withDb: () => Promise.resolve(fakeDb) }));
    const { createBackup } = require('../fileBackups');

    const result = await createBackup('owner', 'repo', 'main', 'file.js', 'first content', 'sha3', 'open');

    expect(result).not.toBeNull();
    const insertCalls = fakeDb._runAsyncCalls.filter((c) => /INSERT INTO file_backups/i.test(c.sql));
    expect(insertCalls.length).toBe(1);
  });

  it('never dedups a "save" backup, even when content matches the most recent snapshot', async () => {
    const fakeDb = makeFakeDb({ latestBackup: { content: 'same content' } });
    jest.doMock('../database', () => ({ withDb: () => Promise.resolve(fakeDb) }));
    const { createBackup } = require('../fileBackups');

    const result = await createBackup('owner', 'repo', 'main', 'file.js', 'same content', 'sha4', 'save');

    expect(result).not.toBeNull();
    const insertCalls = fakeDb._runAsyncCalls.filter((c) => /INSERT INTO file_backups/i.test(c.sql));
    expect(insertCalls.length).toBe(1);
    expect(fakeDb.getFirstAsync).not.toHaveBeenCalled();
  });
});
