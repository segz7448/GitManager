import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { listRepos, listBranches, listCodespaceMachines, createCodespace } from '../services/github';
import { colors, spacing, typography } from '../theme';

// Step machine: 'repo' -> 'branch' -> 'machine' (then creates and goes back)
export default function CreateCodespaceScreen({ navigation }) {
  const [step, setStep] = useState('repo');
  const [search, setSearch] = useState('');
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState(null);

  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(null);

  const [machines, setMachines] = useState([]);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [creating, setCreating] = useState(false);

  navigation.setOptions({ title: 'New Codespace' });

  useEffect(() => {
    listRepos({ perPage: 100 })
      .then((result) => setRepos(result.data))
      .catch((e) => Alert.alert('Failed to load repos', e.message))
      .finally(() => setLoadingRepos(false));
  }, []);

  const handlePickRepo = useCallback(async (repo) => {
    setSelectedRepo(repo);
    setStep('branch');
    setLoadingBranches(true);
    try {
      const data = await listBranches(repo.owner.login, repo.name);
      setBranches(data);
    } catch (e) {
      Alert.alert('Failed to load branches', e.message);
      setStep('repo');
    } finally {
      setLoadingBranches(false);
    }
  }, []);

  const handlePickBranch = useCallback(async (branchName) => {
    setSelectedBranch(branchName);
    setStep('machine');
    setLoadingMachines(true);
    try {
      const { machines: list } = await listCodespaceMachines(selectedRepo.owner.login, selectedRepo.name, {
        ref: branchName,
      });
      setMachines(list || []);
    } catch (e) {
      setMachines([]);
    } finally {
      setLoadingMachines(false);
    }
  }, [selectedRepo]);

  const handleCreate = async (machineName) => {
    setCreating(true);
    try {
      const codespace = await createCodespace(selectedRepo.owner.login, selectedRepo.name, {
        ref: selectedBranch,
        machine: machineName || undefined,
      });
      Alert.alert(
        'Codespace created',
        `"${codespace.display_name || codespace.name}" is being provisioned. It'll show up in the list once ready.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        Alert.alert(
          'Failed to create codespace',
          `${e.message}\n\nYour token may be missing the "codespace" scope - check Settings → Security.`
        );
      } else {
        Alert.alert('Failed to create codespace', e.message);
      }
    } finally {
      setCreating(false);
    }
  };

  if (step === 'repo') {
    const filtered = repos.filter((r) => r.full_name.toLowerCase().includes(search.toLowerCase()));
    return (
      <View style={styles.container}>
        <Text style={styles.stepLabel}>1. Choose a repository</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Filter repositories…"
          placeholderTextColor={colors.fgSubtle}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {loadingRepos ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(r) => String(r.id)}
            contentContainerStyle={{ padding: spacing.md }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => handlePickRepo(item)}>
                <Text style={styles.rowText} numberOfLines={1}>{item.full_name}</Text>
                <Text style={styles.rowArrow}>›</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No repositories match "{search}".</Text>}
          />
        )}
      </View>
    );
  }

  if (step === 'branch') {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={() => setStep('repo')} style={styles.backLink}>
          <Text style={styles.backLinkText}>‹ Choose a different repository</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>2. Choose a branch on {selectedRepo.full_name}</Text>
        {loadingBranches ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={branches}
            keyExtractor={(b) => b.name}
            contentContainerStyle={{ padding: spacing.md }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => handlePickBranch(item.name)}>
                <Text style={styles.rowText} numberOfLines={1}>
                  {item.name}
                  {item.name === selectedRepo.default_branch ? '  (default)' : ''}
                </Text>
                <Text style={styles.rowArrow}>›</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => setStep('branch')} style={styles.backLink} disabled={creating}>
        <Text style={styles.backLinkText}>‹ Choose a different branch</Text>
      </TouchableOpacity>
      <Text style={styles.stepLabel}>
        3. Choose a machine for {selectedRepo.full_name}@{selectedBranch}
      </Text>
      {loadingMachines ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : creating ? (
        <View style={{ marginTop: spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.creatingText}>Creating codespace…</Text>
        </View>
      ) : (
        <FlatList
          data={[{ name: null, display_name: 'Default (let GitHub choose)' }, ...machines]}
          keyExtractor={(m) => m.name || 'default'}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => handleCreate(item.name)}>
              <Text style={styles.rowText} numberOfLines={1}>{item.display_name}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  stepLabel: { color: colors.fgMuted, fontSize: typography.sizeSm, fontWeight: '700', padding: spacing.md, paddingBottom: spacing.sm },
  searchInput: {
    marginHorizontal: spacing.md, color: colors.fgDefault, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
  },
  backLink: { padding: spacing.md, paddingBottom: 0 },
  backLinkText: { color: colors.accent, fontWeight: '600', fontSize: typography.sizeSm },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  rowText: { color: colors.fgDefault, fontSize: typography.sizeSm, flex: 1, fontFamily: typography.mono },
  rowArrow: { color: colors.fgSubtle, fontSize: typography.sizeLg },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  creatingText: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: spacing.md },
});
