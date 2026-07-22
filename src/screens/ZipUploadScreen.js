import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { commitMultipleFiles, getRepoTreeRecursive } from '../services/github';
import { colors, spacing, typography } from '../theme';
import {
  startJournalEntry,
  updateJournalProgress,
  completeJournalEntry,
  failJournalEntry,
} from '../db/sessionJournal';
import { createAutoBackupBranch } from '../services/repoSafety';
import { detectProjectType, hasExistingWorkflow } from '../workflows/detectProjectType';
import { generateWorkflowYaml } from '../workflows/generateWorkflow';
import { filterIgnoredEntries } from '../utils/gitignoreMatcher';
import { pickAndWalkFolder } from '../utils/safFolderWalker';

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp',
  'zip', 'gz', 'tar', 'jar', 'apk', 'aab', 'so', 'dex',
  'ttf', 'otf', 'woff', 'woff2', 'pdf', 'mp3', 'mp4', 'wav',
]);

// Reading a zip fully into memory as base64 (JS string) roughly triples
// its footprint (original bytes + base64 string + JSZip's internal
// unpacked buffers). Above this size, low-RAM Android phones are prone to
// the JS engine getting OOM-killed with no error surfaced to the user -
// it just looks like "extraction stuck at 0%". We warn/guard instead.
const SAFE_ZIP_BYTES = 150 * 1024 * 1024; // 150MB
const HARD_LIMIT_ZIP_BYTES = 400 * 1024 * 1024; // 400MB

// Direct file/folder uploads (as opposed to a zip) commit one blob per
// file via sequential API calls (see commitMultipleFiles), rather than
// one big in-memory decode - so the risk here isn't a memory crash, it's
// a slow operation that eats into the token's hourly rate limit. Warn
// past a reasonable count rather than hard-blocking, since it's still
// the user's call to make.
const FILE_COUNT_WARNING = 200;

// Yields to the JS event loop so React can flush a re-render (e.g. an
// updated progress percentage) between synchronous-ish chunks of work.
// Without this, progress state updates get batched and never painted
// until the whole operation finishes - which is why extraction previously
// appeared frozen at 0% even though it was working in the background.
function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function isBinaryPath(path) {
  const ext = path.split('.').pop().toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export default function ZipUploadScreen({ route, navigation }) {
  const { owner, repo, path: targetDir, branch: initialBranch } = route.params;
  const branch = initialBranch || 'main';

  const [picking, setPicking] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState({ pct: 0, label: '' });
  const [fileTree, setFileTree] = useState(null); // [{path, size, binary}]
  const [zipRef, setZipRef] = useState(null);
  const [uploadSource, setUploadSource] = useState(null); // 'zip' | 'files' | 'folder' | null
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [autoBackupBranch, setAutoBackupBranch] = useState(true);
  const [suggestedWorkflow, setSuggestedWorkflow] = useState(null); // { detected, yaml } | null
  const [includeWorkflow, setIncludeWorkflow] = useState(true);
  const [checkingWorkflow, setCheckingWorkflow] = useState(false);
  const [ignoredEntries, setIgnoredEntries] = useState([]); // entries excluded by .gitignore/defaults
  const [includeIgnoredFiles, setIncludeIgnoredFiles] = useState(false);
  const [ignoredListExpanded, setIgnoredListExpanded] = useState(false);
  const journalIdRef = React.useRef(null);

  const ignoredPathSet = useMemo(
    () => new Set(ignoredEntries.map((e) => e.relativePath)),
    [ignoredEntries]
  );
  const effectiveCommitCount = includeIgnoredFiles
    ? fileTree ? fileTree.length : 0
    : fileTree ? fileTree.filter((e) => !ignoredPathSet.has(e.relativePath)).length : 0;

  const handlePickZip = async () => {
    setPicking(true);
    let journalId = null;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];

      // Check size BEFORE reading into memory - this is the guard that
      // was previously missing, letting huge zips silently hang/crash
      // low-RAM devices instead of failing with a clear message.
      const info = await FileSystem.getInfoAsync(asset.uri, { size: true });
      const sizeBytes = info.size || asset.size || 0;

      if (sizeBytes > HARD_LIMIT_ZIP_BYTES) {
        Alert.alert(
          'ZIP too large',
          `This file is ${(sizeBytes / 1048576).toFixed(0)}MB. Files above ${(HARD_LIMIT_ZIP_BYTES / 1048576).toFixed(0)}MB can crash the app on many phones because the whole archive has to be held in memory during extraction. Please split it into smaller archives.`
        );
        return;
      }
      if (sizeBytes > SAFE_ZIP_BYTES) {
        const proceed = await new Promise((resolve) => {
          Alert.alert(
            'Large ZIP file',
            `This file is ${(sizeBytes / 1048576).toFixed(0)}MB. Extraction happens in memory, so on phones with limited RAM this may be slow or fail. Continue anyway?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) return;
      }

      setExtracting(true);
      setExtractProgress({ pct: 0, label: 'Reading file…' });

      // Journal this operation so that if the app is killed mid-extraction
      // (OOM, user swipe-kill, crash), the next launch can detect it and
      // offer to clean up the partial state rather than silently losing
      // context or leaving orphaned cache files.
      journalId = await startJournalEntry('zip_upload', {
        owner,
        repo,
        targetDir,
        branch,
        fileName: asset.name,
        sizeBytes,
      });
      journalIdRef.current = journalId;

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await yieldToUI();
      setExtractProgress({ pct: 15, label: 'Parsing archive…' });
      await updateJournalProgress(journalId, { stage: 'parsing', pct: 15 });

      const zip = await JSZip.loadAsync(base64, { base64: true });
      await yieldToUI();

      const allPaths = [];
      zip.forEach((relativePath, entry) => {
        if (!entry.dir) allPaths.push({ relativePath, entry });
      });

      if (allPaths.length === 0) {
        Alert.alert('Empty archive', 'No files found in this zip.');
        return;
      }

      // Build the listing incrementally with periodic UI yields so the
      // progress bar actually animates instead of jumping from 0% to
      // 100% at the very end (the root cause of the "stuck at 0%" bug -
      // the previous version did all of this synchronously in one go).
      const entries = [];
      for (let i = 0; i < allPaths.length; i++) {
        const { relativePath } = allPaths[i];
        entries.push({
          path: targetDir ? `${targetDir}/${relativePath}` : relativePath,
          relativePath,
          binary: isBinaryPath(relativePath),
        });
        if (i % 25 === 0) {
          const pct = 15 + Math.round(((i + 1) / allPaths.length) * 80);
          setExtractProgress({ pct, label: `Indexing ${i + 1}/${allPaths.length} files…` });
          await updateJournalProgress(journalId, { stage: 'indexing', pct });
          await yieldToUI();
        }
      }

      setExtractProgress({ pct: 100, label: 'Done' });
      await updateJournalProgress(journalId, { stage: 'ready', pct: 100 });

      setFileTree(entries);
      setZipRef(zip);
      setUploadSource('zip');
      setIgnoredEntries([]);
      setIncludeIgnoredFiles(false);

      // Check whether a CI workflow already exists - either bundled in
      // this zip, or already committed to the target repo/branch - and
      // if not, try to detect the project type and suggest a generated
      // one. This runs after extraction so it's based on the actual
      // files being uploaded, not a guess from the zip's name.
      checkAndSuggestWorkflow(entries);

      // Filter against the zip's own .gitignore (if it has one) plus a
      // small built-in default list, so a bulk upload doesn't silently
      // commit node_modules/, .env, .DS_Store, etc. alongside the actual
      // project files. This only affects what gets committed by default
      // - nothing is deleted from the zip, and the user can review and
      // override it before confirming.
      checkGitignore(entries, 'zip', zip);
    } catch (e) {
      if (journalId) await failJournalEntry(journalId, e.message);
      Alert.alert('Failed to read zip', e.message);
    } finally {
      setPicking(false);
      setExtracting(false);
    }
  };

  const confirmLargeFileCount = (count) => {
    return new Promise((resolve) => {
      Alert.alert(
        'Large selection',
        `You selected ${count} files. Each one is uploaded as a separate API call, so this may take a while and use a meaningful chunk of your token's hourly rate limit. Continue?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue', onPress: () => resolve(true) },
        ]
      );
    });
  };

  const resetPickState = () => {
    setFileTree(null);
    setZipRef(null);
    setUploadSource(null);
    setSuggestedWorkflow(null);
    setIncludeWorkflow(true);
    setIgnoredEntries([]);
    setIncludeIgnoredFiles(false);
    setIgnoredListExpanded(false);
  };

  const handlePickFiles = async () => {
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const assets = result.assets || [];
      if (assets.length === 0) return;

      if (assets.length > FILE_COUNT_WARNING) {
        const proceed = await confirmLargeFileCount(assets.length);
        if (!proceed) return;
      }

      // A flat multi-file picker has no folder structure to preserve -
      // every selected file lands directly at the target path, which
      // matches how file pickers behave everywhere else (there's no
      // such thing as "the folder it came from" once individually
      // selected one by one).
      const entries = assets.map((asset) => ({
        path: targetDir ? `${targetDir}/${asset.name}` : asset.name,
        relativePath: asset.name,
        binary: isBinaryPath(asset.name),
        uri: asset.uri,
        size: asset.size,
      }));

      setFileTree(entries);
      setUploadSource('files');
      setZipRef(null);
      setIgnoredEntries([]);
      setIncludeIgnoredFiles(false);
      checkAndSuggestWorkflow(entries);
      checkGitignore(entries, 'files', null);
    } catch (e) {
      Alert.alert('Failed to select files', e.message);
    } finally {
      setPicking(false);
    }
  };

  const handlePickFolder = async () => {
    setPicking(true);
    try {
      const result = await pickAndWalkFolder();
      if (!result) return; // user cancelled the folder picker

      const { files: walked, possiblyIncomplete } = result;
      if (walked.length === 0) {
        Alert.alert('Empty folder', "No files found in this folder (or its subfolders couldn't be read).");
        return;
      }

      if (possiblyIncomplete) {
        const proceed = await new Promise((resolve) => {
          Alert.alert(
            'Some nested files may be missing',
            "Android's folder picker sometimes can't reliably read subfolders more than one level deep, so some deeply-nested files may not have been included. If this project has multiple levels of subfolders, zipping it first and using \"Choose ZIP File\" instead is more reliable. Continue with what was found?",
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue anyway', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) return;
      }

      if (walked.length > FILE_COUNT_WARNING) {
        const proceed = await confirmLargeFileCount(walked.length);
        if (!proceed) return;
      }

      const entries = walked.map((w) => ({
        path: targetDir ? `${targetDir}/${w.relativePath}` : w.relativePath,
        relativePath: w.relativePath,
        binary: isBinaryPath(w.relativePath),
        uri: w.uri,
      }));

      setFileTree(entries);
      setUploadSource('folder');
      setZipRef(null);
      setIgnoredEntries([]);
      setIncludeIgnoredFiles(false);
      checkAndSuggestWorkflow(entries);
      checkGitignore(entries, 'folder', null);
    } catch (e) {
      Alert.alert(
        'Failed to read folder',
        `${e.message}\n\nMake sure you granted folder access when prompted.`
      );
    } finally {
      setPicking(false);
    }
  };

  const checkAndSuggestWorkflow = async (entries) => {
    const zipPaths = entries.map((e) => e.path);
    if (hasExistingWorkflow(zipPaths)) {
      // The zip itself already includes a workflow file - respect it,
      // don't offer to add another one alongside it.
      setSuggestedWorkflow(null);
      return;
    }

    setCheckingWorkflow(true);
    try {
      let repoPaths = [];
      try {
        const tree = await getRepoTreeRecursive(owner, repo, branch);
        repoPaths = (tree.tree || []).map((t) => t.path);
      } catch (e) {
        // Repo/branch might not exist yet, or the tree fetch failed for
        // an unrelated reason (rate limit, etc.) - treat as "no existing
        // workflow found" rather than blocking the suggestion on this.
      }

      if (hasExistingWorkflow(repoPaths)) {
        setSuggestedWorkflow(null);
        return;
      }

      const detected = detectProjectType(zipPaths.length > 0 ? zipPaths : repoPaths);
      if (!detected) {
        setSuggestedWorkflow(null);
        return;
      }

      const yaml = generateWorkflowYaml(detected);
      if (!yaml) {
        setSuggestedWorkflow(null);
        return;
      }

      setSuggestedWorkflow({ detected, yaml });
    } finally {
      setCheckingWorkflow(false);
    }
  };

  const checkGitignore = async (entries, source, zip) => {
    try {
      // Look for a .gitignore at the shallowest level present in the
      // selection (usually the project root). If everything is wrapped
      // in a single top-level folder, this still finds it one level
      // down rather than only matching an exact root ".gitignore".
      const gitignoreEntry = entries
        .filter((e) => e.relativePath.toLowerCase().endsWith('.gitignore'))
        .sort((a, b) => a.relativePath.split('/').length - b.relativePath.split('/').length)[0];

      let gitignoreContent = null;
      if (gitignoreEntry) {
        try {
          if (source === 'zip') {
            gitignoreContent = await zip.file(gitignoreEntry.relativePath).async('string');
          } else {
            gitignoreContent = await FileSystem.readAsStringAsync(gitignoreEntry.uri, {
              encoding: FileSystem.EncodingType.UTF8,
            });
          }
        } catch (e) {
          gitignoreContent = null;
        }
      }

      // filterIgnoredEntries matches against each entry's `path` field,
      // but gitignore patterns are relative to the project root of the
      // selection - not to wherever the user chooses to upload within
      // the target repo. When targetDir is set, entry.path has that
      // prefix prepended, which would break anchored patterns like
      // "/build". Match against relativePath instead, then map back to
      // the real entries so callers still see path/binary/etc as normal.
      const entriesForMatching = entries.map((e) => ({ ...e, path: e.relativePath }));
      const { ignored: ignoredForMatching } = filterIgnoredEntries(entriesForMatching, gitignoreContent);
      const ignoredRelativePaths = new Set(ignoredForMatching.map((e) => e.relativePath));
      const ignored = entries.filter((e) => ignoredRelativePaths.has(e.relativePath));
      setIgnoredEntries(ignored);
    } catch (e) {
      // Never let a filtering failure block the upload itself - worst
      // case, nothing gets filtered and the user sees every file as
      // normal.
      setIgnoredEntries([]);
    }
  };

  const handleCommit = async () => {
    if (!fileTree) return;
    setCommitting(true);
    let backupBranch = null;
    try {
      // Safety net: create a timestamped backup branch pointing at the
      // current tip of `branch` before touching anything. If the upload
      // fails partway (network drop mid-commit, conflicting push from
      // elsewhere) or the result turns out to be wrong, the backup branch
      // still has exactly what was there before - restorable with one tap
      // from the repo's branch list even if this session is gone.
      if (autoBackupBranch) {
        setProgress({ current: 0, total: effectiveCommitCount, label: 'Creating safety backup branch…' });
        try {
          backupBranch = await createAutoBackupBranch(
            owner,
            repo,
            branch,
            `${uploadSource === 'zip' ? 'ZIP upload' : uploadSource === 'folder' ? 'Folder upload' : 'File upload'}: ${effectiveCommitCount} files`
          );
          if (journalIdRef.current) {
            await updateJournalProgress(journalIdRef.current, { stage: 'backup_branch', backupBranch: backupBranch.branchName });
          }
        } catch (e) {
          // Non-fatal: if branch creation fails (e.g. permissions), warn
          // but let the user decide whether to proceed without a net.
          const proceed = await new Promise((resolve) => {
            Alert.alert(
              'Could not create backup branch',
              `${e.message}\n\nContinue uploading without a safety branch?`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Continue anyway', onPress: () => resolve(true) },
              ]
            );
          });
          if (!proceed) {
            setCommitting(false);
            setProgress({ current: 0, total: 0, label: '' });
            return;
          }
        }
      }

      const files = [];
      for (const entry of fileTree) {
        if (!includeIgnoredFiles && ignoredPathSet.has(entry.relativePath)) continue;
        if (uploadSource === 'zip') {
          const zipEntry = zipRef.file(entry.relativePath);
          if (entry.binary) {
            const base64Content = await zipEntry.async('base64');
            files.push({ path: entry.path, binaryBase64: base64Content });
          } else {
            const textContent = await zipEntry.async('string');
            files.push({ path: entry.path, content: textContent });
          }
        } else {
          // Individually picked files or a walked folder - read each
          // file directly off its own URI rather than through JSZip.
          if (entry.binary) {
            const base64Content = await FileSystem.readAsStringAsync(entry.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            files.push({ path: entry.path, binaryBase64: base64Content });
          } else {
            const textContent = await FileSystem.readAsStringAsync(entry.uri, {
              encoding: FileSystem.EncodingType.UTF8,
            });
            files.push({ path: entry.path, content: textContent });
          }
        }
      }

      if (suggestedWorkflow && includeWorkflow) {
        files.push({ path: '.github/workflows/build.yml', content: suggestedWorkflow.yaml });
      }

      const sourceLabel = uploadSource === 'zip' ? 'zip' : uploadSource === 'folder' ? 'folder' : 'files';
      await commitMultipleFiles(
        owner,
        repo,
        branch,
        files,
        suggestedWorkflow && includeWorkflow
          ? `Upload ${files.length} file(s) from ${sourceLabel} and add CI workflow`
          : `Upload ${files.length} file(s) from ${sourceLabel}`,
        (current, total, label) => {
          setProgress({ current, total, label });
          if (journalIdRef.current) {
            updateJournalProgress(journalIdRef.current, { stage: 'committing', current, total });
          }
        }
      );

      if (journalIdRef.current) {
        await completeJournalEntry(journalIdRef.current);
        journalIdRef.current = null;
      }

      Alert.alert(
        'Success',
        `Committed ${files.length} files to ${branch}.` +
          (backupBranch ? ` A backup of the previous state was kept on "${backupBranch.branchName}".` : ''),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      if (journalIdRef.current) await failJournalEntry(journalIdRef.current, e.message);
      Alert.alert(
        'Commit failed',
        e.message +
          (backupBranch
            ? `\n\nGood news: "${branch}" wasn't touched by this failed attempt, and a backup of its state right before this upload is on "${backupBranch.branchName}" if you need it.`
            : '')
      );
    } finally {
      setCommitting(false);
      setProgress({ current: 0, total: 0, label: '' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Target: {owner}/{repo}{targetDir ? `/${targetDir}` : ''} on branch "{branch}"
        </Text>
      </View>

      {!fileTree ? (
        <View style={styles.pickArea}>
          <TouchableOpacity
            style={styles.pickButton}
            onPress={handlePickZip}
            disabled={picking || extracting}
          >
            <Text style={styles.pickButtonText}>Choose ZIP File</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickButton, styles.pickButtonSecondary]}
            onPress={handlePickFiles}
            disabled={picking || extracting}
          >
            <Text style={styles.pickButtonText}>Choose Files</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickButton, styles.pickButtonSecondary]}
            onPress={handlePickFolder}
            disabled={picking || extracting}
          >
            <Text style={styles.pickButtonText}>Choose Folder</Text>
          </TouchableOpacity>
          {(picking || extracting) && (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.md }} />
          )}
          {extracting && (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${extractProgress.pct}%` }]} />
              </View>
              <Text style={styles.progressLabel}>
                {extractProgress.label} {extractProgress.pct}%
              </Text>
            </View>
          )}
          <Text style={styles.hint}>
            Upload a ZIP archive, pick individual files, or select a whole folder to upload with
            its structure preserved. Nothing is uploaded until you confirm the commit below.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={fileTree}
            keyExtractor={(item) => item.path}
            contentContainerStyle={{ padding: spacing.md }}
            ListHeaderComponent={
              <>
                <Text style={styles.countText}>
                  {effectiveCommitCount} file{effectiveCommitCount === 1 ? '' : 's'} ready to commit
                  {ignoredEntries.length > 0 && !includeIgnoredFiles ? ` (${ignoredEntries.length} excluded)` : ''}
                </Text>
                {ignoredEntries.length > 0 && (
                  <View style={styles.ignoredCard}>
                    <Text style={styles.ignoredCardTitle}>
                      {ignoredEntries.length} file{ignoredEntries.length === 1 ? '' : 's'} matched .gitignore /
                      common-ignore patterns
                    </Text>
                    <TouchableOpacity onPress={() => setIgnoredListExpanded((v) => !v)}>
                      <Text style={styles.ignoredCardToggleLink}>
                        {ignoredListExpanded ? 'Hide list' : 'Show list'}
                      </Text>
                    </TouchableOpacity>
                    {ignoredListExpanded && (
                      <View style={styles.ignoredListBox}>
                        {ignoredEntries.slice(0, 20).map((e) => (
                          <Text key={e.relativePath} style={styles.ignoredListItem} numberOfLines={1}>
                            {e.relativePath}
                          </Text>
                        ))}
                        {ignoredEntries.length > 20 && (
                          <Text style={styles.ignoredListItem}>…and {ignoredEntries.length - 20} more</Text>
                        )}
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.backupToggleRow}
                      onPress={() => setIncludeIgnoredFiles((v) => !v)}
                      disabled={committing}
                    >
                      <View style={[styles.checkbox, includeIgnoredFiles && styles.checkboxChecked]}>
                        {includeIgnoredFiles && <Text style={styles.checkboxTick}>✓</Text>}
                      </View>
                      <Text style={styles.backupToggleText}>
                        Include these files anyway (not recommended)
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            }
            renderItem={({ item }) => {
              const isIgnoredRow = ignoredPathSet.has(item.relativePath);
              return (
                <View style={[styles.fileRow, isIgnoredRow && !includeIgnoredFiles && styles.fileRowIgnored]}>
                  <Text style={styles.fileIcon}>{item.binary ? '🗎' : '📄'}</Text>
                  <Text
                    style={[styles.filePath, isIgnoredRow && !includeIgnoredFiles && styles.filePathIgnored]}
                    numberOfLines={1}
                  >
                    {item.path}
                  </Text>
                  {isIgnoredRow && !includeIgnoredFiles && <Text style={styles.ignoredTag}>ignored</Text>}
                </View>
              );
            }}
          />
          <TouchableOpacity
            style={styles.backupToggleRow}
            onPress={() => setAutoBackupBranch((v) => !v)}
            disabled={committing}
          >
            <View style={[styles.checkbox, autoBackupBranch && styles.checkboxChecked]}>
              {autoBackupBranch && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.backupToggleText}>
              Create a backup branch of "{branch}" before uploading
            </Text>
          </TouchableOpacity>

          {checkingWorkflow && (
            <View style={styles.workflowCheckingRow}>
              <ActivityIndicator size="small" color={colors.fgSubtle} />
              <Text style={styles.workflowCheckingText}>Checking for an existing CI workflow…</Text>
            </View>
          )}

          {suggestedWorkflow && (
            <View style={styles.workflowCard}>
              <Text style={styles.workflowCardTitle}>
                No CI workflow found — suggest one?
              </Text>
              <Text style={styles.workflowCardDetail}>
                {suggestedWorkflow.detected.detail}. This will add
                .github/workflows/build.yml with a starter {suggestedWorkflow.detected.label} build
                pipeline (checkout → install → build → test) as part of this commit.
              </Text>
              <TouchableOpacity
                style={styles.backupToggleRow}
                onPress={() => setIncludeWorkflow((v) => !v)}
                disabled={committing}
              >
                <View style={[styles.checkbox, includeWorkflow && styles.checkboxChecked]}>
                  {includeWorkflow && <Text style={styles.checkboxTick}>✓</Text>}
                </View>
                <Text style={styles.backupToggleText}>
                  Include .github/workflows/build.yml in this commit
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.actionBar}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                resetPickState();
                if (journalIdRef.current) {
                  completeJournalEntry(journalIdRef.current);
                  journalIdRef.current = null;
                }
              }}
              disabled={committing}
            >
              <Text style={styles.cancelButtonText}>Choose Different Source</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.commitButton}
              onPress={handleCommit}
              disabled={committing}
            >
              {committing ? (
                <View style={styles.committingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.commitButtonText}>
                    {progress.total ? ` ${progress.current}/${progress.total}` : ' Committing...'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.commitButtonText}>Commit to Repo</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backupToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  checkboxTick: { color: '#fff', fontSize: 13, fontWeight: '700' },
  backupToggleText: { color: colors.fgMuted, fontSize: typography.sizeSm, flex: 1 },
  workflowCheckingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  workflowCheckingText: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  workflowCard: {
    marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.md,
    backgroundColor: 'rgba(88,166,255,0.08)', borderColor: colors.accent, borderWidth: 1, borderRadius: 10,
  },
  workflowCardTitle: { color: colors.fgDefault, fontSize: typography.sizeSm, fontWeight: '700', marginBottom: spacing.xs },
  workflowCardDetail: { color: colors.fgMuted, fontSize: typography.sizeSm, lineHeight: 18, marginBottom: spacing.sm },
  ignoredCard: {
    marginTop: spacing.sm, marginBottom: spacing.sm, padding: spacing.md,
    backgroundColor: 'rgba(210,153,34,0.08)', borderColor: colors.warning, borderWidth: 1, borderRadius: 10,
  },
  ignoredCardTitle: { color: colors.warning, fontSize: typography.sizeSm, fontWeight: '700' },
  ignoredCardToggleLink: { color: colors.accent, fontSize: typography.sizeSm, fontWeight: '600', marginTop: spacing.xs },
  ignoredListBox: { marginTop: spacing.sm, paddingLeft: spacing.sm },
  ignoredListItem: { color: colors.fgMuted, fontFamily: typography.mono, fontSize: 11, marginTop: 2 },
  fileRowIgnored: { opacity: 0.5 },
  filePathIgnored: { textDecorationLine: 'line-through' },
  ignoredTag: { color: colors.warning, fontSize: 10, fontWeight: '700', marginLeft: spacing.sm },
  container: { flex: 1, backgroundColor: colors.bgDefault },
  header: {
    padding: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  headerText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  pickArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  pickButton: {
    backgroundColor: colors.accentEmphasis,
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  pickButtonSecondary: { backgroundColor: colors.bgSubtle, borderColor: colors.accent, borderWidth: 1 },
  pickButtonText: { color: '#fff', fontWeight: '600', fontSize: typography.sizeMd },
  hint: { color: colors.fgSubtle, fontSize: typography.sizeSm, textAlign: 'center', marginTop: spacing.lg },
  progressWrap: { width: '100%', marginTop: spacing.lg, alignItems: 'center' },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderMuted,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.accentEmphasis, borderRadius: 3 },
  progressLabel: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: spacing.sm },
  countText: { color: colors.fgMuted, marginBottom: spacing.sm, fontSize: typography.sizeSm },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomColor: colors.borderMuted,
    borderBottomWidth: 1,
  },
  fileIcon: { marginRight: spacing.sm },
  filePath: { color: colors.fgDefault, flex: 1, fontFamily: typography.mono, fontSize: typography.sizeSm },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  cancelButton: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: 8,
    borderColor: colors.border,
    borderWidth: 1,
  },
  cancelButtonText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  commitButton: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.successEmphasis,
  },
  commitButtonText: { color: '#fff', fontWeight: '600' },
  committingRow: { flexDirection: 'row', alignItems: 'center' },
});
