import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, FlatList } from 'react-native';
import { getFileContent } from '../services/github';
import { listBackups } from '../db/fileBackups';
import { useStaging } from '../context/StagingContext';
import DiffView from '../components/DiffView';
import { colors, spacing, typography } from '../theme';

/**
 * Compares a file against its current remote (GitHub) version. The
 * "local" side can be either the most recent local backup snapshot or
 * a currently staged edit, whichever the user picks - both represent
 * "what I have locally that GitHub doesn't necessarily have yet".
 */
export default function CompareRemoteScreen({ route, navigation }) {
  const { owner, repo, path, branch } = route.params;
  const [remoteContent, setRemoteContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [localOptions, setLocalOptions] = useState([]);
  const [selectedLocal, setSelectedLocal] = useState(null);
  const { getStagedForRepo } = useStaging();

  navigation.setOptions({ title: 'Compare with remote' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [remote, backups] = await Promise.all([
        getFileContent(owner, repo, path, branch || undefined),
        listBackups(owner, repo, branch, path),
      ]);
      setRemoteContent(remote.decodedContent);

      const staged = getStagedForRepo(owner, repo).find((f) => f.path === path);
      const options = [];
      if (staged) options.push({ label: 'Currently staged edit', content: staged.content });
      backups.slice(0, 5).forEach((b) => {
        options.push({
          label: `${b.kind === 'open' ? 'Backup (on open)' : 'Backup (before save)'} · ${new Date(b.createdAt).toLocaleString()}`,
          content: b.content,
        });
      });
      setLocalOptions(options);
      setSelectedLocal(options[0] || null);
    } catch (e) {
      setError(e.message || 'Failed to load comparison');
    } finally {
      setLoading(false);
    }
  }, [owner, repo, path, branch, getStagedForRepo]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (localOptions.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>
          No local backups or staged edits found for this file to compare against the remote version.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={localOptions}
        keyExtractor={(o) => o.label}
        style={styles.tabsRow}
        contentContainerStyle={{ paddingHorizontal: spacing.md }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.tab, selectedLocal?.label === item.label && styles.tabActive]}
            onPress={() => setSelectedLocal(item)}
          >
            <Text style={[styles.tabText, selectedLocal?.label === item.label && styles.tabTextActive]} numberOfLines={1}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />
      <Text style={styles.diffHint}>Left: local · Right: remote (current on {branch || 'default branch'})</Text>
      <DiffView oldText={selectedLocal?.content || ''} newText={remoteContent} style={styles.diff} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { color: colors.danger, textAlign: 'center' },
  emptyText: { color: colors.fgSubtle, textAlign: 'center' },
  tabsRow: { maxHeight: 48, marginVertical: spacing.sm },
  tab: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm,
    borderRadius: 8, borderColor: colors.border, borderWidth: 1, maxWidth: 220,
  },
  tabActive: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  tabText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  diffHint: { color: colors.fgSubtle, fontSize: typography.sizeSm, textAlign: 'center', marginBottom: spacing.sm },
  diff: { flex: 1 },
});
