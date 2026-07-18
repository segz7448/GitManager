import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { getLocalClone, deleteLocalClone } from '../db/localClones';
import { colors, spacing, typography } from '../theme';

function formatBytes(bytes) {
  if (!bytes) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function LocalCloneScreen({ route, navigation }) {
  const { owner, repo, branch } = route.params;
  const [clone, setClone] = useState(null);
  const [search, setSearch] = useState('');
  const [viewingFile, setViewingFile] = useState(null);

  navigation.setOptions({ title: `${repo} (offline)` });

  useEffect(() => {
    getLocalClone(owner, repo, branch).then(setClone);
  }, [owner, repo, branch]);

  const handleDeleteClone = () => {
    if (!clone) return;
    Alert.alert('Delete this local clone?', 'This removes the offline copy from your device. The GitHub repo is unaffected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLocalClone(clone.id);
          navigation.goBack();
        },
      },
    ]);
  };

  if (!clone) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No local clone found. Go back and tap "Clone" first.</Text>
      </View>
    );
  }

  if (viewingFile) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={() => setViewingFile(null)} style={styles.backRow}>
          <Text style={styles.backText}>‹ Back to files</Text>
        </TouchableOpacity>
        <Text style={styles.fileTitle} numberOfLines={1}>{viewingFile.path}</Text>
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.md }}
          data={(viewingFile.content || '').split('\n')}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => (
            <View style={styles.codeLine}>
              <Text style={styles.lineNumber}>{index + 1}</Text>
              <Text style={styles.lineContent}>{item || ' '}</Text>
            </View>
          )}
        />
      </View>
    );
  }

  const filtered = clone.files.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {clone.files.length} files · {formatBytes(clone.totalBytes)} · cloned {new Date(clone.createdAt).toLocaleDateString()}
        </Text>
        <TouchableOpacity onPress={handleDeleteClone}>
          <Text style={styles.deleteText}>Delete clone</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Filter files…"
        placeholderTextColor={colors.fgSubtle}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <FlatList
        data={filtered}
        keyExtractor={(f) => f.path}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.fileRow}
            onPress={() => {
              if (item.binary) {
                Alert.alert('Binary file', 'This file\'s content wasn\'t downloaded (binary files are skipped during local clone to save space).');
              } else if (item.error) {
                Alert.alert('Could not load', item.error);
              } else {
                setViewingFile(item);
              }
            }}
          >
            <Text style={styles.filePath} numberOfLines={1}>{item.path}</Text>
            <Text style={styles.fileSize}>{formatBytes(item.size)}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { color: colors.fgSubtle, textAlign: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 1 },
  headerText: { color: colors.fgSubtle, fontSize: typography.sizeSm, flex: 1 },
  deleteText: { color: colors.danger, fontSize: typography.sizeSm, fontWeight: '600' },
  searchInput: {
    marginHorizontal: spacing.md, marginTop: spacing.sm, color: colors.fgDefault,
    borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
  },
  fileRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomColor: colors.borderMuted, borderBottomWidth: 1,
  },
  filePath: { color: colors.fgDefault, fontFamily: typography.mono, fontSize: typography.sizeSm, flex: 1 },
  fileSize: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginLeft: spacing.sm },
  backRow: { padding: spacing.md },
  backText: { color: colors.accent, fontWeight: '600' },
  fileTitle: { color: colors.fgDefault, fontFamily: typography.mono, fontSize: typography.sizeSm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  codeLine: { flexDirection: 'row' },
  lineNumber: { color: colors.fgSubtle, fontFamily: typography.mono, fontSize: 11, width: 36, textAlign: 'right', marginRight: spacing.sm },
  lineContent: { color: colors.fgDefault, fontFamily: typography.mono, fontSize: 12, flex: 1 },
});
