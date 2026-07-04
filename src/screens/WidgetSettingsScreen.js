import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { listRepos } from '../services/github';
import { startWatchingRepo, stopWatchingRepo, getWatchedRepo, getPlacedWidgetCount } from '../services/widgetControl';
import { colors, spacing, typography } from '../theme';

export default function WidgetSettingsScreen() {
  const [repos, setRepos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [watched, setWatched] = useState({ owner: null, repo: null });
  const [placedCount, setPlacedCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data }, watchedRepo, count] = await Promise.all([
        listRepos({ page: 1, perPage: 30 }),
        getWatchedRepo(),
        getPlacedWidgetCount(),
      ]);
      setRepos(data);
      setFiltered(data);
      setWatched(watchedRepo);
      setPlacedCount(count);
    } catch (e) {
      Alert.alert('Failed to load', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(repos);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(repos.filter((r) => r.name.toLowerCase().includes(q)));
  }, [search, repos]);

  const handleWatch = async (item) => {
    setBusy(true);
    try {
      await startWatchingRepo(item.owner.login, item.name);
      setWatched({ owner: item.owner.login, repo: item.name });
      Alert.alert(
        'Watching started',
        'A persistent notification will show while this is active - Android requires this for ' +
          'any app running continuous background work. Long-press your home screen and add the ' +
          '"GitManager" widget if you haven\'t already.'
      );
    } catch (e) {
      Alert.alert('Failed to start', e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await stopWatchingRepo();
      setWatched({ owner: null, repo: null });
    } catch (e) {
      Alert.alert('Failed to stop', e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const isWatchingAny = !!(watched.owner && watched.repo);

  return (
    <View style={styles.container}>
      <View style={styles.statusCard}>
        {isWatchingAny ? (
          <>
            <Text style={styles.statusLabel}>Currently watching</Text>
            <Text style={styles.statusValue}>{watched.owner}/{watched.repo}</Text>
            <TouchableOpacity style={styles.stopButton} onPress={handleStop} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.stopButtonText}>Stop Watching</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.statusLabel}>Not watching any repo</Text>
        )}
        <Text style={styles.widgetCountText}>
          {placedCount === 0
            ? 'No widget on your home screen yet - long-press your home screen, tap Widgets, and add "GitManager".'
            : `${placedCount} widget(s) on your home screen.`}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Choose a repo to watch</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Search repos..."
        placeholderTextColor={colors.fgSubtle}
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => {
          const isThisWatched = watched.owner === item.owner.login && watched.repo === item.name;
          return (
            <TouchableOpacity
              style={[styles.repoRow, isThisWatched && styles.repoRowActive]}
              onPress={() => handleWatch(item)}
              disabled={busy || isThisWatched}
            >
              <Text style={styles.repoName}>{item.name}</Text>
              {isThisWatched && <Text style={styles.watchingBadge}>Watching</Text>}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  statusCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, margin: spacing.md,
  },
  statusLabel: { color: colors.fgMuted, fontSize: typography.sizeSm, textTransform: 'uppercase' },
  statusValue: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700', marginTop: 4 },
  stopButton: { backgroundColor: colors.dangerEmphasis, borderRadius: 8, padding: spacing.sm, alignItems: 'center', marginTop: spacing.md },
  stopButtonText: { color: '#fff', fontWeight: '600' },
  widgetCountText: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: spacing.md, lineHeight: 18 },
  sectionLabel: { color: colors.fgMuted, fontSize: typography.sizeSm, textTransform: 'uppercase', marginHorizontal: spacing.md, marginTop: spacing.sm },
  searchInput: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, margin: spacing.md, marginBottom: 0, padding: spacing.md, color: colors.fgDefault,
  },
  repoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  repoRowActive: { borderColor: colors.success },
  repoName: { color: colors.fgDefault, fontSize: typography.sizeMd },
  watchingBadge: { color: colors.success, fontSize: typography.sizeSm, fontWeight: '600' },
});
