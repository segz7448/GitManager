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
  ScrollView,
} from 'react-native';
import { listRepos, createRepo, listGitignoreTemplates, listLicenseTemplates } from '../services/github';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';

export default function RepoListScreen({ navigation }) {
  const { username, logout } = useAuth();
  const [repos, setRepos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [newRepoReadme, setNewRepoReadme] = useState(false);
  const [gitignoreTemplate, setGitignoreTemplate] = useState(null);
  const [licenseTemplate, setLicenseTemplate] = useState(null);
  const [gitignoreOptions, setGitignoreOptions] = useState([]);
  const [licenseOptions, setLicenseOptions] = useState([]);
  const [pickerModal, setPickerModal] = useState(null); // 'gitignore' | 'license' | null
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, pagination } = await listRepos({ page: 1, perPage: 30 });
      setRepos(data);
      setFiltered(data);
      setPage(1);
      setHasNextPage(pagination.hasNext);
    } catch (e) {
      setError(e.message || 'Failed to load repos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || loadingMore || search.trim()) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const { data, pagination } = await listRepos({ page: nextPage, perPage: 30 });
      setRepos((prev) => [...prev, ...data]);
      setPage(nextPage);
      setHasNextPage(pagination.hasNext);
    } catch (e) {
      // silent fail on load-more - user can pull to refresh
    } finally {
      setLoadingMore(false);
    }
  }, [hasNextPage, loadingMore, page, search]);

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

  const openCreateModal = () => {
    setCreateModalVisible(true);
    if (gitignoreOptions.length === 0) {
      listGitignoreTemplates().then(setGitignoreOptions).catch(() => {});
    }
    if (licenseOptions.length === 0) {
      listLicenseTemplates().then(setLicenseOptions).catch(() => {});
    }
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
        autoInit: newRepoReadme,
        gitignoreTemplate: gitignoreTemplate || undefined,
        licenseTemplate: licenseTemplate || undefined,
      });
      setCreateModalVisible(false);
      setNewRepoName('');
      setNewRepoDesc('');
      setNewRepoPrivate(false);
      setNewRepoReadme(false);
      setGitignoreTemplate(null);
      setLicenseTemplate(null);
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
        <TouchableOpacity style={styles.newButton} onPress={() => navigation.navigate('CodeSearch')}>
          <Text style={styles.newButtonText}>🔍 Code</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.newButton} onPress={openCreateModal}>
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
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.md }} color={colors.accent} /> : null
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No repositories found.</Text>
          }
        />
      )}

      <Modal visible={createModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
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
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Private repository</Text>
                  <Text style={styles.toggleSubtext}>
                    {newRepoPrivate ? 'Only you choose who can see this.' : 'Anyone on the internet can see this repository.'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setNewRepoReadme(!newRepoReadme)}
              >
                <View style={[styles.checkbox, newRepoReadme && styles.checkboxChecked]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Add a README</Text>
                  <Text style={styles.toggleSubtext}>Can be used for longer descriptions.</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.pickerRow} onPress={() => setPickerModal('gitignore')}>
                <Text style={styles.toggleLabel}>Add .gitignore</Text>
                <Text style={styles.pickerValue}>{gitignoreTemplate || 'None'} ›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.pickerRow} onPress={() => setPickerModal('license')}>
                <Text style={styles.toggleLabel}>Add a license</Text>
                <Text style={styles.pickerValue}>
                  {licenseTemplate
                    ? licenseOptions.find((l) => l.key === licenseTemplate)?.name || licenseTemplate
                    : 'None'} ›
                </Text>
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
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerModal === 'gitignore'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>.gitignore template</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <TouchableOpacity
                style={styles.pickerOption}
                onPress={() => { setGitignoreTemplate(null); setPickerModal(null); }}
              >
                <Text style={styles.pickerOptionText}>None</Text>
              </TouchableOpacity>
              {gitignoreOptions.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={styles.pickerOption}
                  onPress={() => { setGitignoreTemplate(name); setPickerModal(null); }}
                >
                  <Text style={styles.pickerOptionText}>{name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => setPickerModal(null)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerModal === 'license'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>License</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <TouchableOpacity
                style={styles.pickerOption}
                onPress={() => { setLicenseTemplate(null); setPickerModal(null); }}
              >
                <Text style={styles.pickerOptionText}>None</Text>
              </TouchableOpacity>
              {licenseOptions.map((license) => (
                <TouchableOpacity
                  key={license.key}
                  style={styles.pickerOption}
                  onPress={() => { setLicenseTemplate(license.key); setPickerModal(null); }}
                >
                  <Text style={styles.pickerOptionText}>{license.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => setPickerModal(null)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
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
    maxHeight: '85%',
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
  toggleSubtext: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 2 },
  pickerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.md, borderTopColor: colors.borderMuted, borderTopWidth: 1,
  },
  pickerValue: { color: colors.accent, fontSize: typography.sizeSm },
  pickerCard: {
    backgroundColor: colors.bgSubtle, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: spacing.lg, borderColor: colors.border, borderWidth: 1, maxHeight: '70%',
  },
  pickerOption: { paddingVertical: spacing.md, borderBottomColor: colors.borderMuted, borderBottomWidth: 1 },
  pickerOptionText: { color: colors.fgDefault },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalCancelButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  modalCancelText: { color: colors.fgMuted },
  modalCreateButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  modalCreateText: { color: '#fff', fontWeight: '600' },
});
