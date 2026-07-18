import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, TextInput, Alert, ActivityIndicator } from 'react-native';
import { createBranch, deleteBranch } from '../services/github';
import { colors, spacing, typography } from '../theme';

/**
 * Branch switching, creation, and deletion in one place. Switching just
 * updates local state (no GitHub call needed); creating and deleting
 * both hit the Git Data API directly.
 */
export default function BranchManagerModal({
  visible,
  onClose,
  owner,
  repo,
  branches,
  currentBranch,
  defaultBranch,
  onSwitch,
  onBranchesChanged,
}) {
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [deletingName, setDeletingName] = useState(null);

  const handleCreate = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    if (branches.some((b) => b.name === name)) {
      Alert.alert('Branch exists', `"${name}" already exists.`);
      return;
    }
    setCreating(true);
    try {
      await createBranch(owner, repo, name, currentBranch || defaultBranch);
      setNewBranchName('');
      setShowCreateInput(false);
      await onBranchesChanged();
      Alert.alert('Branch created', `"${name}" was created from "${currentBranch || defaultBranch}".`);
    } catch (e) {
      Alert.alert('Failed to create branch', e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (name) => {
    if (name === defaultBranch) {
      Alert.alert('Cannot delete', 'The default branch cannot be deleted from here.');
      return;
    }
    Alert.alert('Delete this branch?', `This permanently deletes "${name}" from GitHub. This cannot be undone unless you know the commit sha it pointed to.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingName(name);
          try {
            await deleteBranch(owner, repo, name);
            if (currentBranch === name) onSwitch(defaultBranch);
            await onBranchesChanged();
          } catch (e) {
            Alert.alert('Failed to delete branch', e.message);
          } finally {
            setDeletingName(null);
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Branches</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          {showCreateInput ? (
            <View style={styles.createRow}>
              <TextInput
                style={styles.input}
                placeholder="new-branch-name"
                placeholderTextColor={colors.fgSubtle}
                value={newBranchName}
                onChangeText={setNewBranchName}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <TouchableOpacity style={styles.createConfirmButton} onPress={handleCreate} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.createConfirmText}>Create</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCreateInput(false)} style={styles.cancelCreateButton}>
                <Text style={styles.cancelCreateText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.newBranchButton} onPress={() => setShowCreateInput(true)}>
              <Text style={styles.newBranchButtonText}>+ New branch from "{currentBranch || defaultBranch}"</Text>
            </TouchableOpacity>
          )}

          <FlatList
            data={branches}
            keyExtractor={(b) => b.name}
            renderItem={({ item }) => (
              <View style={styles.branchRow}>
                <TouchableOpacity
                  style={styles.branchNameTouch}
                  onPress={() => {
                    onSwitch(item.name);
                    onClose();
                  }}
                >
                  <Text style={[styles.branchText, item.name === currentBranch && styles.branchTextActive]}>
                    {item.name === currentBranch ? '● ' : ''}{item.name}
                  </Text>
                  {item.name === defaultBranch && <Text style={styles.defaultTag}>default</Text>}
                </TouchableOpacity>
                {item.name !== defaultBranch && (
                  <TouchableOpacity onPress={() => handleDelete(item.name)} disabled={deletingName === item.name}>
                    {deletingName === item.name ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <Text style={styles.deleteText}>Delete</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.bgSubtle, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: spacing.lg, borderColor: colors.border, borderWidth: 1, maxHeight: '75%',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700' },
  closeText: { color: colors.accent, fontWeight: '600' },
  newBranchButton: { paddingVertical: spacing.sm, marginBottom: spacing.sm },
  newBranchButtonText: { color: colors.accent, fontWeight: '600', fontSize: typography.sizeSm },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  input: {
    flex: 1, color: colors.fgDefault, borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, fontFamily: typography.mono, fontSize: typography.sizeSm,
  },
  createConfirmButton: { backgroundColor: colors.successEmphasis, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  createConfirmText: { color: '#fff', fontWeight: '600', fontSize: typography.sizeSm },
  cancelCreateButton: { paddingHorizontal: spacing.sm },
  cancelCreateText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  branchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.md, borderBottomColor: colors.borderMuted, borderBottomWidth: 1,
  },
  branchNameTouch: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  branchText: { color: colors.fgDefault, fontFamily: typography.mono, fontSize: typography.sizeSm },
  branchTextActive: { color: colors.accent, fontWeight: '700' },
  defaultTag: { color: colors.fgSubtle, fontSize: 10, borderColor: colors.border, borderWidth: 1, borderRadius: 4, paddingHorizontal: 4 },
  deleteText: { color: colors.danger, fontSize: typography.sizeSm },
});
