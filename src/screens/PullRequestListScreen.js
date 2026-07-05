import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { listPullRequests } from '../services/github';
import { colors, spacing, typography } from '../theme';

export default function PullRequestListScreen({ route, navigation }) {
  const { owner, repo } = route.params;
  const [prs, setPrs] = useState([]);
  const [state, setState] = useState('open');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  navigation.setOptions({
    title: `Pull Requests · ${repo}`,
    headerRight: () => (
      <TouchableOpacity
        onPress={() => navigation.navigate('CreatePullRequest', { owner, repo })}
        style={{ marginRight: spacing.sm }}
      >
        <Text style={{ color: colors.accent, fontWeight: '600' }}>+ New</Text>
      </TouchableOpacity>
    ),
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await listPullRequests(owner, repo, { state, perPage: 30 });
      setPrs(data);
    } catch (e) {
      setError(e.message || 'Failed to load pull requests');
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
          data={prs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No {state} pull requests.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.prCard}
              onPress={() => navigation.navigate('PullRequestDetail', { owner, repo, pullNumber: item.number })}
            >
              <View style={styles.prHeaderRow}>
                <View style={[styles.stateDot, item.draft ? styles.stateDotDraft : item.state === 'open' ? styles.stateDotOpen : styles.stateDotClosed]} />
                <Text style={styles.prTitle} numberOfLines={2}>{item.title}</Text>
              </View>
              <Text style={styles.prMeta}>
                #{item.number} opened by {item.user?.login} · {item.head.ref} → {item.base.ref}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
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
  prCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  prHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  stateDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  stateDotOpen: { backgroundColor: colors.success },
  stateDotClosed: { backgroundColor: colors.danger },
  stateDotDraft: { backgroundColor: colors.fgMuted },
  prTitle: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600', flex: 1 },
  prMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 4 },
});
