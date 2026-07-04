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
import { commitMultipleFiles } from '../services/github';
import DiffView from '../components/DiffView';
import { colors, spacing, typography } from '../theme';

export default function StagedChangesScreen({ route, navigation }) {
  const { owner, repo, branch } = route.params;
  const { getStagedForRepo, unstageFile, clearStaged } = useStaging();
  const [expandedPath, setExpandedPath] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  const stagedFiles = getStagedForRepo(owner, repo);

  navigation.setOptions({ title: `Staged Changes (${stagedFiles.length})` });

  const handleUnstage = (path) => {
    unstageFile(owner, repo, path);
    if (expandedPath === path) setExpandedPath(null);
  };

  const handleCommitAll = async () => {
    if (stagedFiles.length === 0) return;
    setCommitting(true);
    try {
      const files = stagedFiles.map((f) => ({ path: f.path, content: f.content }));
      const message =
        commitMessage.trim() ||
        `Update ${stagedFiles.length} file${stagedFiles.length === 1 ? '' : 's'}`;
      await commitMultipleFiles(owner, repo, branch, files, message);
      clearStaged(owner, repo);
      Alert.alert('Committed', `${files.length} file(s) committed successfully.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Commit failed', e.message);
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
  commitButton: { backgroundColor: colors.successEmphasis, borderRadius: 10, padding: spacing.md, alignItems: 'center' },
  commitButtonDisabled: { opacity: 0.6 },
  commitButtonText: { color: '#fff', fontWeight: '700', fontSize: typography.sizeMd },
});
