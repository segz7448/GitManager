import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert } from 'react-native';
import { listStashes, deleteStash } from '../db/stashes';
import { useStaging } from '../context/StagingContext';
import { colors, spacing, typography } from '../theme';

function formatTimestamp(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function StashesScreen({ route, navigation }) {
  const { owner, repo } = route.params;
  const [stashes, setStashes] = useState([]);
  const { stageFile, getStagedCount } = useStaging();

  navigation.setOptions({ title: 'Stashes' });

  const load = useCallback(() => {
    listStashes(owner, repo).then(setStashes);
  }, [owner, repo]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePop = (stash) => {
    const currentStagedCount = getStagedCount(owner, repo);
    const proceed = () => {
      stash.files.forEach((f) => stageFile(owner, repo, f));
      deleteStash(stash.id).then(load);
      navigation.navigate('StagedChanges', { owner, repo, branch: stash.branch });
    };

    if (currentStagedCount > 0) {
      Alert.alert(
        'You have staged changes already',
        `Popping this stash will add its ${stash.files.length} file(s) to your ${currentStagedCount} currently staged file(s). Any overlapping paths will be overwritten by the stash. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: proceed },
        ]
      );
    } else {
      proceed();
    }
  };

  const handleDelete = (stash) => {
    Alert.alert('Delete this stash?', 'This discards the shelved changes permanently.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteStash(stash.id).then(load) },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={stashes}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.md }}
        ListEmptyComponent={<Text style={styles.emptyText}>No stashes yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.label}>{item.label || 'Unlabeled stash'}</Text>
            <Text style={styles.meta}>
              {item.files.length} file{item.files.length === 1 ? '' : 's'} · {formatTimestamp(item.createdAt)}
              {item.branch ? ` · from ${item.branch}` : ''}
            </Text>
            {item.files.slice(0, 4).map((f) => (
              <Text key={f.path} style={styles.filePath} numberOfLines={1}>{f.path}</Text>
            ))}
            {item.files.length > 4 && (
              <Text style={styles.filePath}>…and {item.files.length - 4} more</Text>
            )}
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item)}>
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.popButton} onPress={() => handlePop(item)}>
                <Text style={styles.popButtonText}>Pop into staged changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  card: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  label: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '700' },
  meta: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 2, marginBottom: spacing.sm },
  filePath: { color: colors.fgMuted, fontFamily: typography.mono, fontSize: 11, marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  deleteButton: { flex: 1, padding: spacing.sm, alignItems: 'center', borderRadius: 8, borderColor: colors.danger, borderWidth: 1 },
  deleteButtonText: { color: colors.danger, fontSize: typography.sizeSm, fontWeight: '600' },
  popButton: { flex: 2, padding: spacing.sm, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  popButtonText: { color: '#fff', fontSize: typography.sizeSm, fontWeight: '600' },
});
