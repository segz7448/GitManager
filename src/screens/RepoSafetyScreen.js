import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { listSafetyOperations } from '../db/safetyLog';
import { getRef, updateRef, undoLastCommit, getCommit, deleteBranch } from '../services/github';
import { colors, spacing, typography } from '../theme';

const KIND_LABELS = {
  auto_branch: 'Backup branch created',
  revert_commit: 'Commit reverted',
  undo_commit: 'Commit undone',
};

function formatTimestamp(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function RepoSafetyScreen({ route, navigation }) {
  const { owner, repo, branch } = route.params;
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipCommit, setTipCommit] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [restoringId, setRestoringId] = useState(null);

  navigation.setOptions({ title: 'Repository Safety' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ops, ref] = await Promise.all([
        listSafetyOperations(owner, repo),
        getRef(owner, repo, branch).catch(() => null),
      ]);
      setOperations(ops);
      if (ref) {
        const commit = await getCommit(owner, repo, ref.object.sha).catch(() => null);
        setTipCommit(commit ? { sha: ref.object.sha, message: commit.message } : null);
      }
    } finally {
      setLoading(false);
    }
  }, [owner, repo, branch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUndoLastCommit = () => {
    if (!tipCommit) return;
    Alert.alert(
      'Undo last commit?',
      `This moves "${branch}" back to before "${tipCommit.message.split('\n')[0]}". The commit itself still exists in GitHub's history for a while and can be recovered, but the branch will no longer point at it. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo commit',
          style: 'destructive',
          onPress: async () => {
            setUndoing(true);
            try {
              await undoLastCommit(owner, repo, branch, tipCommit.sha);
              Alert.alert('Undone', `${branch} was moved back to the previous commit.`);
              load();
            } catch (e) {
              Alert.alert('Undo failed', e.message);
            } finally {
              setUndoing(false);
            }
          },
        },
      ]
    );
  };

  const handleRestoreFromBackup = (op) => {
    const backupBranch = op.details?.backupBranch;
    if (!backupBranch) return;
    Alert.alert(
      `Restore "${branch}" from backup?`,
      `This will force "${branch}" to point at exactly what it was before "${op.details.operation || 'this operation'}" (backup branch "${backupBranch}"). Anything committed to "${branch}" after that point will no longer be reachable from the branch (though it may still exist in GitHub's reflog/history for a while). Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setRestoringId(op.id);
            try {
              const backupRef = await getRef(owner, repo, backupBranch);
              await updateRef(owner, repo, branch, backupRef.object.sha, true);
              Alert.alert('Restored', `"${branch}" now matches the backup from ${formatTimestamp(op.createdAt)}.`);
              load();
            } catch (e) {
              Alert.alert('Restore failed', e.message);
            } finally {
              setRestoringId(null);
            }
          },
        },
      ]
    );
  };

  const handleDeleteBackupBranch = (op) => {
    const backupBranch = op.details?.backupBranch;
    if (!backupBranch) return;
    Alert.alert('Delete this backup branch?', `This permanently deletes "${backupBranch}" from GitHub.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBranch(owner, repo, backupBranch);
            Alert.alert('Deleted', `"${backupBranch}" was deleted.`);
          } catch (e) {
            Alert.alert('Delete failed', e.message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <TouchableOpacity
          style={[styles.dangerButton, (!tipCommit || undoing) && styles.buttonDisabled]}
          onPress={handleUndoLastCommit}
          disabled={!tipCommit || undoing}
        >
          {undoing ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <Text style={styles.dangerButtonText}>
              Undo last commit on "{branch}"
            </Text>
          )}
        </TouchableOpacity>
        {tipCommit && (
          <Text style={styles.tipHint} numberOfLines={1}>
            Current tip: {tipCommit.message.split('\n')[0]}
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safety history</Text>
        <Text style={styles.sectionSubtitle}>
          Backup branches created automatically before risky operations (ZIP uploads, bulk edits).
        </Text>
      </View>

      <FlatList
        data={operations}
        keyExtractor={(op) => op.id}
        contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No safety operations recorded yet for this repo.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.opCard}>
            <Text style={styles.opKind}>{KIND_LABELS[item.kind] || item.kind}</Text>
            {item.details?.backupBranch && (
              <Text style={styles.opBranch} numberOfLines={1}>{item.details.backupBranch}</Text>
            )}
            {item.details?.operation && (
              <Text style={styles.opDetail} numberOfLines={1}>{item.details.operation}</Text>
            )}
            <Text style={styles.opTime}>{formatTimestamp(item.createdAt)}</Text>
            {item.kind === 'auto_branch' && item.details?.backupBranch && (
              <View style={styles.opActions}>
                <TouchableOpacity
                  style={styles.opDeleteButton}
                  onPress={() => handleDeleteBackupBranch(item)}
                >
                  <Text style={styles.opDeleteButtonText}>Delete branch</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.opRestoreButton}
                  disabled={restoringId === item.id}
                  onPress={() => handleRestoreFromBackup(item)}
                >
                  {restoringId === item.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.opRestoreButtonText}>Restore "{branch}" from this</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  section: { padding: spacing.md, paddingBottom: spacing.sm },
  sectionTitle: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '700', marginBottom: spacing.sm },
  sectionSubtitle: { color: colors.fgSubtle, fontSize: typography.sizeSm, lineHeight: 18 },
  dangerButton: {
    borderColor: colors.danger, borderWidth: 1, borderRadius: 10,
    padding: spacing.md, alignItems: 'center',
  },
  dangerButtonText: { color: colors.danger, fontWeight: '600', fontSize: typography.sizeSm },
  buttonDisabled: { opacity: 0.5 },
  tipHint: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: spacing.sm },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  opCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  opKind: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600' },
  opBranch: { color: colors.accent, fontFamily: typography.mono, fontSize: typography.sizeSm, marginTop: 4 },
  opDetail: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 2 },
  opTime: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 4 },
  opActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  opDeleteButton: {
    flex: 1, padding: spacing.sm, alignItems: 'center', borderRadius: 8,
    borderColor: colors.danger, borderWidth: 1,
  },
  opDeleteButtonText: { color: colors.danger, fontSize: typography.sizeSm, fontWeight: '600' },
  opRestoreButton: {
    flex: 2, padding: spacing.sm, alignItems: 'center', borderRadius: 8,
    backgroundColor: colors.warningEmphasis,
  },
  opRestoreButtonText: { color: '#fff', fontSize: typography.sizeSm, fontWeight: '600' },
});
