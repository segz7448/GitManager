import React, { createContext, useContext, useState, useCallback } from 'react';

const StagingContext = createContext(null);

function repoKey(owner, repo) {
  return `${owner}/${repo}`;
}

export function StagingProvider({ children }) {
  // { "owner/repo": { "path/to/file": { path, content, originalContent, sha, branch } } }
  const [staged, setStaged] = useState({});

  const stageFile = useCallback((owner, repo, entry) => {
    setStaged((prev) => {
      const key = repoKey(owner, repo);
      const repoFiles = { ...(prev[key] || {}) };
      repoFiles[entry.path] = entry;
      return { ...prev, [key]: repoFiles };
    });
  }, []);

  const unstageFile = useCallback((owner, repo, path) => {
    setStaged((prev) => {
      const key = repoKey(owner, repo);
      const repoFiles = { ...(prev[key] || {}) };
      delete repoFiles[path];
      return { ...prev, [key]: repoFiles };
    });
  }, []);

  const clearStaged = useCallback((owner, repo) => {
    setStaged((prev) => {
      const key = repoKey(owner, repo);
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const getStagedForRepo = useCallback(
    (owner, repo) => {
      const key = repoKey(owner, repo);
      return Object.values(staged[key] || {});
    },
    [staged]
  );

  const getStagedCount = useCallback(
    (owner, repo) => {
      const key = repoKey(owner, repo);
      return Object.keys(staged[key] || {}).length;
    },
    [staged]
  );

  const isFileStaged = useCallback(
    (owner, repo, path) => {
      const key = repoKey(owner, repo);
      return !!(staged[key] && staged[key][path]);
    },
    [staged]
  );

  return (
    <StagingContext.Provider
      value={{ stageFile, unstageFile, clearStaged, getStagedForRepo, getStagedCount, isFileStaged }}
    >
      {children}
    </StagingContext.Provider>
  );
}

export function useStaging() {
  const ctx = useContext(StagingContext);
  if (!ctx) throw new Error('useStaging must be used within StagingProvider');
  return ctx;
}
