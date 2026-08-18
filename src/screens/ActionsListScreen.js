import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listWorkflowRuns } from '../services/github';
import { isRepoWatched, addRepoToWatchlist } from '../services/notifications';
import { colors, spacing, typography, statusColors } from '../theme';
import { Screen, Card, Button, IconButton, EmptyState } from '../components/ui';

export default function ActionsListScreen({ route, navigation }) {
  const { owner, repo } = route.params;
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  // Automatic mode: every repo you open Actions for gets watched silently,
  // no toggle, no icon, no prompt beyond Android's own one-time permission
  // dialog (handled globally by the FCM auto-enable in App.js). Mirrors the
  // "no manual notification controls anywhere" decision applied app-wide.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const alreadyWatched = await isRepoWatched(owner, repo);
        if (alreadyWatched || cancelled) return;
        let lastSeenRunId = 0;
        try {
          const { data } = await listWorkflowRuns(owner, repo, { perPage: 1 });
          if (data.workflow_runs?.[0]) lastSeenRunId = data.workflow_runs[0].id;
        } catch (e) {
          // fine to proceed with 0 - worst case one extra notification
        }
        if (!cancelled) await addRepoToWatchlist(owner, repo, lastSeenRunId);
      } catch (e) {
        console.error('[notifications] auto-watch failed for', repo, e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  navigation.setOptions({
    title: `Actions · ${repo}`,
    headerRight: () => (
      <IconButton
        name="play-circle-outline"
        color={colors.accent}
        onPress={() => navigation.navigate('WorkflowDispatch', { owner, repo })}
        size={22}
      />
    ),
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, pagination } = await listWorkflowRuns(owner, repo, { page: 1, perPage: 30 });
      setRuns(data.workflow_runs || []);
      setPage(1);
      setHasNextPage(pagination.hasNext);
    } catch (e) {
      setError(e.message || 'Failed to load workflow runs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [owner, repo]);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const { data, pagination } = await listWorkflowRuns(owner, repo, { page: nextPage, perPage: 30 });
      setRuns((prev) => [...prev, ...(data.workflow_runs || [])]);
      setPage(nextPage);
      setHasNextPage(pagination.hasNext);
    } catch (e) {
      // silent - pull to refresh recovers
    } finally {
      setLoadingMore(false);
    }
  }, [owner, repo, hasNextPage, loadingMore, page]);

  useEffect(() => {
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

  const renderRun = ({ item }) => {
    const status = item.status === 'completed' ? item.conclusion : item.status;
    const dotColor = statusColors[status] || colors.fgMuted;
    const icon =
      status === 'success' || status === 'completed'
        ? 'checkmark-circle'
        : status === 'failure'
        ? 'close-circle'
        : status === 'in_progress' || status === 'queued'
        ? 'time'
        : 'ellipse';

    return (
      <Card
        style={styles.runCard}
        onPress={() => navigation.navigate('RunDetail', { owner, repo, runId: item.id, runName: item.name })}
      >
        <Ionicons name={icon} size={22} color={dotColor} style={styles.statusIcon} />
        <View style={styles.runInfo}>
          <Text style={styles.runName} numberOfLines={1}>{item.display_title || item.name}</Text>
          <Text style={styles.runMeta}>
            {item.head_branch} · #{item.run_number} · {formatStatus(status)}
          </Text>
          <Text style={styles.runTime}>{timeAgo(item.created_at)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.fgSubtle} />
      </Card>
    );
  };

  return (
    <Screen>
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
          data={runs}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderRun}
          contentContainerStyle={{ padding: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.md }} color={colors.accent} /> : null
          }
          ListEmptyComponent={
            <EmptyState icon="play-outline" title="No workflow runs yet" subtitle="Trigger a workflow to see it appear here." />
          }
        />
      )}
    </Screen>
  );
}

function formatStatus(status) {
  if (!status) return 'unknown';
  return status.replace(/_/g, ' ');
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  runCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  statusIcon: { marginRight: spacing.md },
  runInfo: { flex: 1 },
  runName: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600' },
  runMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 2 },
  runTime: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 2 },
  centerBox: { alignItems: 'center', marginTop: spacing.xl },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.sm },
});
