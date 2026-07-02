import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { listRepos, createRepo } from '../services/github';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';

export default function RepoListScreen({ navigation }) {
  const { username, logout } = useAuth();
  const [repos, setRepos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listRepos({ perPage: 100 });
      setRepos(data);
      setFiltered(data);
    } catch (e) {
      setError(e.message || 'Failed to load repos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const navUnsub = navigation.addListener('focus', load);
    return navUnsub;
  }, [navigation, load]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(repos);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(repos.filter((r) => r.name.toLowerCase().includes(q)));
  }, [search, repos]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleCreate = async () => {
    if (!newRepoName.trim()) {
      Alert.alert('Name required', 'Enter a repository name.');
      return;
    }
    setCreating(true);
    try {
      await createRepo({
        name: newRepoName.trim(),
        description: newRepoDesc.trim(),
        isPrivate: newRepoPrivate,
      });
      setCreateModalVisible(false);
      setNewRepoName('');
      setNewRepoDesc('');
      setNewRepoPrivate(true);
      load();
    } catch (e) {
      Alert.alert('Failed to create repo', e.message);
    } finally {
      setCreating(false);
    }
  };

  const renderRepo = ({ item }) => (
    <TouchableOpacity
      style={styles.repoCard}
      onPress={() => navigation.navigate('RepoDetail', { owner: item.owner.login, repo: item.name })}
    >
      <View style={styles.repoHeader}>
        <Text style={styles.repoName} numberOfLines={1}>{item.name}</Text>
        <View style={[styles.badge, item.private ? styles.badgePrivate : styles.badgePublic]}>
          <Text style={styles.badgeText}>{item.private ? 'Private' : 'Public'}</Text>
        </View>
      </View>
      {!!item.description && (
        <Text style={styles.repoDesc} numberOfLines={2}>{item.description}</Text>
      )}
      <View style={styles.repoMeta}>
        {!!item.language && <Text style={styles.metaText}>● {item.language}</Text>}
        <Text style={styles.metaText}>★ {item.stargazers_count}</Text>
        <Text style={styles.metaText}>Updated {timeAgo(item.updated_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search repos..."
          placeholderTextColor={colors.fgSubtle}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity style={styles.newButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.newButtonText}>+ New</Text>
        </TouchableOpacity>
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
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderRepo}
          contentContainerStyle={{ padding: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No repositories found.</Text>
          }
        />
      )}

      <Modal visible={createModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Repository</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="repo-name"
              placeholderTextColor={colors.fgSubtle}
              value={newRepoName}
              onChangeText={setNewRepoName}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Description (optional)"
              placeholderTextColor={colors.fgSubtle}
              value={newRepoDesc}
              onChangeText={setNewRepoDesc}
            />
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setNewRepoPrivate(!newRepoPrivate)}
            >
              <View style={[styles.checkbox, newRepoPrivate && styles.checkboxChecked]} />
              <Text style={styles.toggleLabel}>Private repository</Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCreateButton}
                onPress={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalCreateText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  topBar: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.fgDefault,
  },
  newButton: {
    backgroundColor: colors.successEmphasis,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  newButtonText: { color: '#fff', fontWeight: '600' },
  repoCard: {
    backgroundColor: colors.bgSubtle,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  repoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  repoName: { color: colors.accent, fontSize: typography.sizeLg, fontWeight: '600', flex: 1 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 20, marginLeft: spacing.sm },
  badgePrivate: { backgroundColor: '#3d2b02' },
  badgePublic: { backgroundColor: '#0d2818' },
  badgeText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  repoDesc: { color: colors.fgMuted, marginTop: spacing.xs, fontSize: typography.sizeSm },
  repoMeta: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  metaText: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  centerBox: { alignItems: 'center', marginTop: spacing.xl },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.bgSubtle,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    borderColor: colors.border,
    borderWidth: 1,
  },
  modalTitle: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700', marginBottom: spacing.md },
  modalInput: {
    backgroundColor: colors.bgInset,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.fgDefault,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.sm },
  checkbox: {
    width: 20, height: 20, borderRadius: 4,
    borderColor: colors.border, borderWidth: 1.5, marginRight: spacing.sm,
  },
  checkboxChecked: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  toggleLabel: { color: colors.fgDefault },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalCancelButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  modalCancelText: { color: colors.fgMuted },
  modalCreateButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  modalCreateText: { color: '#fff', fontWeight: '600' },
});
