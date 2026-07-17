import {
  createBranch,
  generateBackupBranchName,
  checkForConflict,
  getRef,
} from './github';
import { logSafetyOperation } from '../db/safetyLog';

/**
 * Creates a timestamped backup branch pointing at the current tip of
 * `branch` before a risky operation (ZIP upload, bulk edit), and logs it
 * so the UI can offer a one-tap "roll back to before this operation" by
 * pointing `branch` at the backup branch's commit if something goes wrong.
 *
 * Returns { branchName, sha } - or null if the user has this behavior
 * disabled (callers should treat null as "proceed without a safety net").
 */
export async function createAutoBackupBranch(owner, repo, branch, operationLabel) {
  const backupBranchName = generateBackupBranchName();
  const ref = await createBranch(owner, repo, backupBranchName, branch);
  await logSafetyOperation(owner, repo, 'auto_branch', {
    backupBranch: backupBranchName,
    fromBranch: branch,
    sha: ref.object.sha,
    operation: operationLabel,
  });
  return { branchName: backupBranchName, sha: ref.object.sha };
}

/**
 * Checks the branch hasn't moved since `expectedSha` was last read. Call
 * this immediately before any push/commit that was staged based on
 * potentially-stale local state (e.g. a file opened a while ago, or a
 * bulk commit built from a cached listing).
 *
 * Returns a conflict result; callers should surface hasConflict to the
 * user with the option to reload and reapply their change, rather than
 * pushing blind and silently clobbering someone else's commit.
 */
export async function checkBranchConflict(owner, repo, branch, expectedSha) {
  if (!expectedSha) {
    // No baseline to compare against (e.g. brand new file) - nothing to
    // detect a conflict against.
    return { hasConflict: false, currentSha: null, expectedSha: null };
  }
  return checkForConflict(owner, repo, branch, expectedSha);
}

/**
 * Convenience helper: fetch the current tip sha of a branch, used to
 * snapshot "what the branch pointed at" right before starting a risky
 * operation so undo/rollback has something concrete to restore to.
 */
export async function getBranchTipSha(owner, repo, branch) {
  const ref = await getRef(owner, repo, branch);
  return ref.object.sha;
}
