import React, { useState } from 'react';
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
import { commitMultipleFiles } from '../services/github';
import { colors, spacing, typography } from '../theme';
import {
  startJournalEntry,
  updateJournalProgress,
  completeJournalEntry,
  failJournalEntry,
} from '../db/sessionJournal';
import { createAutoBackupBranch } from '../services/repoSafety';

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
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [autoBackupBranch, setAutoBackupBranch] = useState(true);
  const journalIdRef = React.useRef(null);

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
    } catch (e) {
      if (journalId) await failJournalEntry(journalId, e.message);
      Alert.alert('Failed to read zip', e.message);
    } finally {
      setPicking(false);
      setExtracting(false);
    }
  };

  const handleCommit = async () => {
    if (!zipRef || !fileTree) return;
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
        setProgress({ current: 0, total: fileTree.length, label: 'Creating safety backup branch…' });
        try {
          backupBranch = await createAutoBackupBranch(owner, repo, branch, `ZIP upload: ${fileTree.length} files`);
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
        const zipEntry = zipRef.file(entry.relativePath);
        if (entry.binary) {
          const base64Content = await zipEntry.async('base64');
          files.push({ path: entry.path, binaryBase64: base64Content });
        } else {
          const textContent = await zipEntry.async('string');
          files.push({ path: entry.path, content: textContent });
        }
      }

      await commitMultipleFiles(
        owner,
        repo,
        branch,
        files,
        `Upload ${fileTree.length} file(s) from zip`,
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
            {picking || extracting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.pickButtonText}>Choose ZIP File</Text>
            )}
          </TouchableOpacity>
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
            The zip will be unpacked in memory on your device. Nothing is uploaded until you
            confirm the commit below.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={fileTree}
            keyExtractor={(item) => item.path}
            contentContainerStyle={{ padding: spacing.md }}
            ListHeaderComponent={
              <Text style={styles.countText}>{fileTree.length} files ready to commit</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.fileRow}>
                <Text style={styles.fileIcon}>{item.binary ? '🗎' : '📄'}</Text>
                <Text style={styles.filePath} numberOfLines={1}>{item.path}</Text>
              </View>
            )}
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
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setFileTree(null);
                setZipRef(null);
                if (journalIdRef.current) {
                  completeJournalEntry(journalIdRef.current);
                  journalIdRef.current = null;
                }
              }}
              disabled={committing}
            >
              <Text style={styles.cancelButtonText}>Choose Different File</Text>
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
  },
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
