import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listRepos, createRepo, listGitignoreTemplates, listLicenseTemplates } from '../services/github';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography, radii } from '../theme';
import { Screen, Card, Input, Button, IconButton, Badge, EmptyState } from '../components/ui';

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
    <Card
      style={styles.repoCard}
      onPress={() => navigation.navigate('RepoDetail', { owner: item.owner.login, repo: item.name })}
    >
      <View style={styles.repoHeader}>
        <Text style={styles.repoName} numberOfLines={1}>{item.name}</Text>
        <Badge label={item.private ? 'Private' : 'Public'} tone={item.private ? 'warning' : 'success'} small />
      </View>
      {!!item.description && (
        <Text style={styles.repoDesc} numberOfLines={2}>{item.description}</Text>
      )}
      <View style={styles.repoMeta}>
        {!!item.language && (
          <View style={styles.metaItem}>
            <View style={styles.langDot} />
            <Text style={styles.metaText}>{item.language}</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <Ionicons name="star-outline" size={12} color={colors.fgSubtle} />
          <Text style={styles.metaText}>{item.stargazers_count}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={12} color={colors.fgSubtle} />
          <Text style={styles.metaText}>{timeAgo(item.updated_at)}</Text>
        </View>
      </View>
    </Card>
  );

  return (
    <Screen>
      <View style={styles.topBar}>
        <Input
          icon="search-outline"
          placeholder="Search repos..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
        <IconButton name="code-slash-outline" variant="subtle" onPress={() => navigation.navigate('CodeSearch')} />
        <IconButton name="add" variant="subtle" color={colors.accent} onPress={openCreateModal} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.accent} />
      ) : error ? (
        <View style={styles.centerBox}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Retry" onPress={load} variant="secondary" size="sm" style={{ marginTop: spacing.md }} />
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
            <EmptyState icon="folder-open-outline" title="No repositories found" subtitle="Try a different search, or create a new one." />
          }
        />
      )}

      <Modal visible={createModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>New repository</Text>
              <Input
                placeholder="repo-name"
                value={newRepoName}
                onChangeText={setNewRepoName}
                autoCapitalize="none"
                mono
                style={styles.modalInput}
              />
              <Input
                placeholder="Description (optional)"
                value={newRepoDesc}
                onChangeText={setNewRepoDesc}
                style={styles.modalInput}
              />

              <Card
                level="none"
                inset
                onPress={() => setNewRepoPrivate(!newRepoPrivate)}
                style={styles.toggleRow}
              >
                <View style={styles.toggleContent}>
                  <View style={[styles.checkbox, newRepoPrivate && styles.checkboxChecked]}>
                    {newRepoPrivate && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>Private repository</Text>
                    <Text style={styles.toggleSubtext}>
                      {newRepoPrivate ? 'Only you choose who can see this.' : 'Anyone on the internet can see this repository.'}
                    </Text>
                  </View>
                </View>
              </Card>

              <Card
                level="none"
                inset
                onPress={() => setNewRepoReadme(!newRepoReadme)}
                style={styles.toggleRow}
              >
                <View style={styles.toggleContent}>
                  <View style={[styles.checkbox, newRepoReadme && styles.checkboxChecked]}>
                    {newRepoReadme && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>Add a README</Text>
                    <Text style={styles.toggleSubtext}>Can be used for longer descriptions.</Text>
                  </View>
                </View>
              </Card>

              <Card level="none" inset onPress={() => setPickerModal('gitignore')} style={styles.pickerRow}>
                <Text style={styles.toggleLabel}>Add .gitignore</Text>
                <View style={styles.pickerValueRow}>
                  <Text style={styles.pickerValue}>{gitignoreTemplate || 'None'}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.fgSubtle} />
                </View>
              </Card>

              <Card level="none" inset onPress={() => setPickerModal('license')} style={styles.pickerRow}>
                <Text style={styles.toggleLabel}>Add a license</Text>
                <View style={styles.pickerValueRow}>
                  <Text style={styles.pickerValue}>
                    {licenseTemplate
                      ? licenseOptions.find((l) => l.key === licenseTemplate)?.name || licenseTemplate
                      : 'None'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.fgSubtle} />
                </View>
              </Card>

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setCreateModalVisible(false)}
                  style={styles.modalActionButton}
                />
                <Button
                  title="Create"
                  onPress={handleCreate}
                  loading={creating}
                  icon="add-circle-outline"
                  style={styles.modalActionButton}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerModal === 'gitignore'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>.gitignore template</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <Card level="none" inset onPress={() => { setGitignoreTemplate(null); setPickerModal(null); }} style={styles.pickerOption}>
                <Text style={styles.pickerOptionText}>None</Text>
              </Card>
              {gitignoreOptions.map((name) => (
                <Card
                  key={name}
                  level="none"
                  inset
                  onPress={() => { setGitignoreTemplate(name); setPickerModal(null); }}
                  style={styles.pickerOption}
                >
                  <Text style={styles.pickerOptionText}>{name}</Text>
                </Card>
              ))}
            </ScrollView>
            <Button title="Close" variant="secondary" onPress={() => setPickerModal(null)} style={{ marginTop: spacing.md }} />
          </View>
        </View>
      </Modal>

      <Modal visible={pickerModal === 'license'} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>License</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <Card level="none" inset onPress={() => { setLicenseTemplate(null); setPickerModal(null); }} style={styles.pickerOption}>
                <Text style={styles.pickerOptionText}>None</Text>
              </Card>
              {licenseOptions.map((license) => (
                <Card
                  key={license.key}
                  level="none"
                  inset
                  onPress={() => { setLicenseTemplate(license.key); setPickerModal(null); }}
                  style={styles.pickerOption}
                >
                  <Text style={styles.pickerOptionText}>{license.name}</Text>
                </Card>
              ))}
            </ScrollView>
            <Button title="Close" variant="secondary" onPress={() => setPickerModal(null)} style={{ marginTop: spacing.md }} />
          </View>
        </View>
      </Modal>
    </Screen>
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
  topBar: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  searchInput: { flex: 1 },
  repoCard: { marginBottom: spacing.sm },
  repoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  repoName: { color: colors.accent, fontSize: typography.sizeLg, fontWeight: '700', flex: 1 },
  repoDesc: { color: colors.fgMuted, marginTop: spacing.xs, fontSize: typography.sizeSm },
  repoMeta: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  langDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  metaText: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  centerBox: { alignItems: 'center', marginTop: spacing.xl },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.bgSubtle,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    borderColor: colors.border,
    borderWidth: 1,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700', marginBottom: spacing.md },
  modalInput: { marginBottom: spacing.md },
  toggleRow: { marginBottom: spacing.md },
  toggleContent: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  toggleLabel: { color: colors.fgDefault, fontWeight: '600', fontSize: typography.sizeMd },
  toggleSubtext: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 2 },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  pickerValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pickerValue: { color: colors.fgMuted, fontSize: typography.sizeSm },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md },
  modalActionButton: { flex: 1 },
  pickerCard: {
    backgroundColor: colors.bgSubtle,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    borderColor: colors.border,
    borderWidth: 1,
    maxHeight: '70%',
  },
  pickerOption: { marginBottom: spacing.sm },
  pickerOptionText: { color: colors.fgDefault, fontSize: typography.sizeMd },
});
