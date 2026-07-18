import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useStaging } from '../context/StagingContext';
import { commitMultipleFiles, getFileContent } from '../services/github';
import DiffView from '../components/DiffView';
import { colors, spacing, typography } from '../theme';
import { createAutoBackupBranch } from '../services/repoSafety';
import { createBackup } from '../db/fileBackups';

export default function StagedChangesScreen({ route, navigation }) {
  const { owner, repo, branch } = route.params;
  const { getStagedForRepo, unstageFile, clearStaged } = useStaging();
  const [expandedPath, setExpandedPath] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [autoBackupBranch, setAutoBackupBranch] = useState(true);

  const stagedFiles = getStagedForRepo(owner, repo);

  navigation.setOptions({ title: `Staged Changes (${stagedFiles.length})` });

  const handleUnstage = (path) => {
    unstageFile(owner, repo, path);
    if (expandedPath === path) setExpandedPath(null);
  };

  const handleCommitAll = async () => {
    if (stagedFiles.length === 0) return;
    setCommitting(true);
    let backupBranch = null;
    try {
      // Conflict detection before pushing: each staged file carries the
      // blob `sha` it had when it was staged (possibly a while ago, and
      // possibly staged alongside edits made at different times). Refetch
      // each file's current sha from GitHub and flag any that have
      // changed since, rather than pushing blind and risking a silent
      // overwrite of someone else's newer commit.
      const conflicted = [];
      await Promise.all(
        stagedFiles
          .filter((f) => f.sha) // no sha means a brand-new file - nothing to conflict with
          .map(async (f) => {
            try {
              const latest = await getFileContent(owner, repo, f.path, branch || undefined);
              if (latest.sha !== f.sha) conflicted.push(f.path);
            } catch (e) {
              // File may have been deleted upstream, or a transient
              // network error - either way, flag it for the user rather
              // than silently proceeding.
              conflicted.push(f.path);
            }
          })
      );

      if (conflicted.length > 0) {
        const proceed = await new Promise((resolve) => {
          Alert.alert(
            'Conflict detected',
            `${conflicted.length} staged file(s) have changed on ${branch || 'the default branch'} since they were staged:\n\n${conflicted.slice(0, 5).join('\n')}${conflicted.length > 5 ? `\n…and ${conflicted.length - 5} more` : ''}\n\nCommitting now may overwrite those changes. Continue anyway?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue anyway', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) {
          setCommitting(false);
          return;
        }
      }

      // Safety net: back up the branch before a bulk multi-file commit,
      // same reasoning as ZIP upload - if this goes wrong, the previous
      // state is one branch-switch away.
      if (autoBackupBranch) {
        try {
          backupBranch = await createAutoBackupBranch(
            owner,
            repo,
            branch,
            `Bulk edit: ${stagedFiles.length} files`
          );
        } catch (e) {
          const proceed = await new Promise((resolve) => {
            Alert.alert(
              'Could not create backup branch',
              `${e.message}\n\nContinue committing without a safety branch?`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Continue anyway', onPress: () => resolve(true) },
              ]
            );
          });
          if (!proceed) {
            setCommitting(false);
            return;
          }
        }
      }

      // Local backup snapshot of each file's about-to-be-committed
      // content, independent of the new backup branch (covers the case
      // where the user later wants "what did this look like right before
      // I bulk-committed" without needing to check out a branch).
      await Promise.all(
        stagedFiles.map((f) =>
          createBackup(owner, repo, branch, f.path, f.content, f.sha, 'save').catch(() => {})
        )
      );

      const files = stagedFiles.map((f) => ({ path: f.path, content: f.content }));
      const message =
        commitMessage.trim() ||
        `Update ${stagedFiles.length} file${stagedFiles.length === 1 ? '' : 's'}`;
      await commitMultipleFiles(owner, repo, branch, files, message);
      clearStaged(owner, repo);
      Alert.alert(
        'Committed',
        `${files.length} file(s) committed successfully.` +
          (backupBranch ? ` Previous state backed up on "${backupBranch.branchName}".` : ''),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert(
        'Commit failed',
        e.message +
          (backupBranch
            ? `\n\nA backup of the previous state is on "${backupBranch.branchName}" if needed.`
            : '')
      );
    } finally {
      setCommitting(false);
    }
  };

  if (stagedFiles.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No staged changes for this repo.</Text>
        <Text style={styles.emptySubtext}>
          Edit a file and choose "Stage" instead of "Save" to build up changes here before
          committing them all at once.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={stagedFiles}
        keyExtractor={(item) => item.path}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => {
          const isExpanded = expandedPath === item.path;
          return (
            <View style={styles.fileCard}>
              <TouchableOpacity
                style={styles.fileHeader}
                onPress={() => setExpandedPath(isExpanded ? null : item.path)}
              >
                <Text style={styles.filePath} numberOfLines={1}>{item.path}</Text>
                <TouchableOpacity onPress={() => handleUnstage(item.path)} style={styles.unstageButton}>
                  <Text style={styles.unstageButtonText}>Unstage</Text>
                </TouchableOpacity>
              </TouchableOpacity>
              {isExpanded && (
                <DiffView
                  oldText={item.originalContent}
                  newText={item.content}
                  style={styles.diffContainer}
                />
              )}
            </View>
          );
        }}
      />

      <View style={styles.commitBar}>
        <TouchableOpacity
          style={styles.backupToggleRow}
          onPress={() => setAutoBackupBranch((v) => !v)}
          disabled={committing}
        >
          <View style={[styles.checkbox, autoBackupBranch && styles.checkboxChecked]}>
            {autoBackupBranch && <Text style={styles.checkboxTick}>✓</Text>}
          </View>
          <Text style={styles.backupToggleText}>Create a backup branch before committing</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.commitButton, committing && styles.commitButtonDisabled]}
          onPress={handleCommitAll}
          disabled={committing}
        >
          {committing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.commitButtonText}>
              Commit All ({stagedFiles.length})
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { color: colors.fgSubtle, fontSize: typography.sizeMd, textAlign: 'center' },
  emptySubtext: { color: colors.fgSubtle, fontSize: typography.sizeSm, textAlign: 'center', marginTop: spacing.sm, lineHeight: 18 },
  fileCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, marginBottom: spacing.sm, overflow: 'hidden',
  },
  fileHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md,
  },
  filePath: { color: colors.fgDefault, fontFamily: typography.mono, fontSize: typography.sizeSm, flex: 1 },
  unstageButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  unstageButtonText: { color: colors.danger, fontSize: typography.sizeSm },
  diffContainer: { maxHeight: 300, borderTopColor: colors.border, borderTopWidth: 1 },
  commitBar: { padding: spacing.md, borderTopColor: colors.border, borderTopWidth: 1 },
  backupToggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
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
  commitButton: { backgroundColor: colors.successEmphasis, borderRadius: 10, padding: spacing.md, alignItems: 'center' },
  commitButtonDisabled: { opacity: 0.6 },
  commitButtonText: { color: '#fff', fontWeight: '700', fontSize: typography.sizeMd },
});
