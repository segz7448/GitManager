import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { listRepoIssues, createIssue } from '../services/github';
import { colors, spacing, typography } from '../theme';

export default function RepoIssuesScreen({ route, navigation }) {
  const { owner, repo } = route.params;
  const [issues, setIssues] = useState([]);
  const [state, setState] = useState('open');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [creating, setCreating] = useState(false);

  navigation.setOptions({
    title: `Issues · ${repo}`,
    headerRight: () => (
      <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={{ marginRight: spacing.sm }}>
        <Text style={{ color: colors.accent, fontWeight: '600' }}>+ New</Text>
      </TouchableOpacity>
    ),
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await listRepoIssues(owner, repo, { state, perPage: 30 });
      // The issues endpoint also returns PRs (they share numbering) -
      // filter those out since PRs have their own screen.
      setIssues(data.filter((i) => !i.pull_request));
    } catch (e) {
      setError(e.message || 'Failed to load issues');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [owner, repo, state]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createIssue(owner, repo, { title: newTitle.trim(), body: newBody.trim() });
      setCreateModalVisible(false);
      setNewTitle('');
      setNewBody('');
      load();
    } catch (e) {
      Alert.alert('Failed to create issue', e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterBar}>
        {['open', 'closed', 'all'].map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, state === s && styles.filterChipActive]}
            onPress={() => setState(s)}
          >
            <Text style={[styles.filterChipText, state === s && styles.filterChipTextActive]}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.accent} />
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={issues}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No {state} issues.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.issueCard}
              onPress={() => navigation.navigate('IssueDetail', { owner, repo, issueNumber: item.number })}
            >
              <View style={styles.issueHeaderRow}>
                <View style={[styles.stateDot, item.state === 'open' ? styles.stateDotOpen : styles.stateDotClosed]} />
                <Text style={styles.issueTitle} numberOfLines={2}>{item.title}</Text>
              </View>
              <Text style={styles.issueMeta}>
                #{item.number} opened by {item.user?.login} · {item.comments} comment{item.comments === 1 ? '' : 's'}
              </Text>
              {item.labels?.length > 0 && (
                <View style={styles.labelRow}>
                  {item.labels.slice(0, 3).map((label) => (
                    <View key={label.id} style={[styles.labelChip, { backgroundColor: `#${label.color}33` }]}>
                      <Text style={[styles.labelText, { color: `#${label.color}` }]}>{label.name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={createModalVisible} transparent animationType="slide" onRequestClose={() => setCreateModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.createCard}>
            <Text style={styles.modalTitle}>New Issue</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="Title"
              placeholderTextColor={colors.fgSubtle}
              value={newTitle}
              onChangeText={setNewTitle}
            />
            <TextInput
              style={styles.bodyInput}
              placeholder="Description (optional)"
              placeholderTextColor={colors.fgSubtle}
              value={newBody}
              onChangeText={setNewBody}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setCreateModalVisible(false)} disabled={creating}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createButton} onPress={handleCreate} disabled={creating || !newTitle.trim()}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.createButtonText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  filterBar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  filterChip: {
    borderColor: colors.border, borderWidth: 1, borderRadius: 20,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  filterChipActive: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  filterChipText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  centerBox: { alignItems: 'center', marginTop: spacing.xl },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  issueCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  issueHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  stateDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  stateDotOpen: { backgroundColor: colors.success },
  stateDotClosed: { backgroundColor: colors.danger },
  issueTitle: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600', flex: 1 },
  issueMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 4 },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  labelChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 12 },
  labelText: { fontSize: 11, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  createCard: {
    backgroundColor: colors.bgSubtle, borderRadius: 12, borderColor: colors.border, borderWidth: 1,
    padding: spacing.lg, width: '90%',
  },
  modalTitle: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700', marginBottom: spacing.md },
  titleInput: {
    backgroundColor: colors.bgInset, borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    color: colors.fgDefault, padding: spacing.md, marginBottom: spacing.sm,
  },
  bodyInput: {
    backgroundColor: colors.bgInset, borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    color: colors.fgDefault, padding: spacing.md, minHeight: 100,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  cancelButtonText: { color: colors.fgMuted },
  createButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  createButtonText: { color: '#fff', fontWeight: '600' },
});
