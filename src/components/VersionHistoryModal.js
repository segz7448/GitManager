import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, Alert } from 'react-native';
import { listBackups, deleteBackup } from '../db/fileBackups';
import DiffView from './DiffView';
import { colors, spacing, typography } from '../theme';

const KIND_LABELS = {
  open: 'Auto-saved on open',
  save: 'Saved before commit',
};

function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/**
 * Lets the user browse local backup snapshots for a file (taken
 * automatically on open and before every commit - see src/db/fileBackups.js)
 * and restore any of them back into the editor. This is a purely local,
 * offline version history independent of Git - it works even for changes
 * that were never pushed to GitHub.
 */
export default function VersionHistoryModal({
  visible,
  onClose,
  owner,
  repo,
  branch,
  path,
  currentContent,
  onRestore,
}) {
  const [backups, setBackups] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    const list = await listBackups(owner, repo, branch, path);
    setBackups(list);
  }, [owner, repo, branch, path]);

  useEffect(() => {
    if (visible) {
      setSelected(null);
      load();
    }
  }, [visible, load]);

  const handleRestore = (backup) => {
    Alert.alert(
      'Restore this version?',
      `This will replace the editor content with the version from ${formatTimestamp(backup.createdAt)}. Your current unsaved changes in the editor will be lost unless you save them first.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => onRestore(backup) },
      ]
    );
  };

  const handleDelete = (backup) => {
    Alert.alert('Delete this backup?', 'This only removes the local snapshot, not anything on GitHub.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteBackup(backup.id);
          load();
          if (selected?.id === backup.id) setSelected(null);
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Local version history</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>{path}</Text>

          {backups.length === 0 ? (
            <Text style={styles.empty}>No local backups yet for this file.</Text>
          ) : selected ? (
            <View style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => setSelected(null)} style={styles.backLink}>
                <Text style={styles.backLinkText}>‹ Back to list</Text>
              </TouchableOpacity>
              <Text style={styles.selectedLabel}>
                {KIND_LABELS[selected.kind] || selected.kind} · {formatTimestamp(selected.createdAt)}
              </Text>
              <DiffView
                oldText={selected.content}
                newText={currentContent}
                style={styles.diff}
              />
              <Text style={styles.diffHint}>Left: this backup · Right: current editor content</Text>
              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(selected)}>
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.restoreButton} onPress={() => handleRestore(selected)}>
                  <Text style={styles.restoreButtonText}>Restore this version</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <FlatList
              data={backups}
              keyExtractor={(b) => b.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => setSelected(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowKind}>{KIND_LABELS[item.kind] || item.kind}</Text>
                    <Text style={styles.rowTime}>{formatTimestamp(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.rowArrow}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.bgSubtle,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    borderColor: colors.border,
    borderWidth: 1,
    height: '80%',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700' },
  closeText: { color: colors.accent, fontWeight: '600' },
  subtitle: { color: colors.fgMuted, fontFamily: typography.mono, fontSize: typography.sizeSm, marginTop: 2, marginBottom: spacing.md },
  empty: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomColor: colors.borderMuted,
    borderBottomWidth: 1,
  },
  rowKind: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600' },
  rowTime: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 2 },
  rowArrow: { color: colors.fgSubtle, fontSize: typography.sizeLg },
  backLink: { paddingVertical: spacing.sm },
  backLinkText: { color: colors.accent, fontWeight: '600' },
  selectedLabel: { color: colors.fgMuted, fontSize: typography.sizeSm, marginBottom: spacing.sm },
  diff: { flex: 1, borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  diffHint: { color: colors.fgSubtle, fontSize: typography.sizeSm, textAlign: 'center', marginTop: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  deleteButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, borderColor: colors.danger, borderWidth: 1 },
  deleteButtonText: { color: colors.danger, fontWeight: '600' },
  restoreButton: { flex: 2, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  restoreButtonText: { color: '#fff', fontWeight: '600' },
});
