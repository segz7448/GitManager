import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { listWorkflowRuns } from '../services/github';
import {
  requestNotificationPermission,
  isRepoWatched,
  addRepoToWatchlist,
  removeRepoFromWatchlist,
} from '../services/notifications';
import { colors, spacing, typography, statusColors } from '../theme';

export default function ActionsListScreen({ route, navigation }) {
  const { owner, repo } = route.params;
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [autoNotify, setAutoNotify] = useState(false);

  useEffect(() => {
    isRepoWatched(owner, repo).then(setAutoNotify);
  }, [owner, repo]);

  const handleToggleAutoNotify = async () => {
    if (autoNotify) {
      await removeRepoFromWatchlist(owner, repo);
      setAutoNotify(false);
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert(
        'Notifications disabled',
        'Enable notifications for GitManager in Android Settings to use this.'
      );
      return;
    }
    // Seed lastSeenRunId to the current latest run so turning this on
    // doesn't immediately fire a notification for something that already
    // finished before you started watching.
    let lastSeenRunId = 0;
    try {
      const { data } = await listWorkflowRuns(owner, repo, { perPage: 1 });
      if (data.workflow_runs?.[0]) lastSeenRunId = data.workflow_runs[0].id;
    } catch (e) {
      // fine to proceed with 0 - worst case one extra notification
    }
    await addRepoToWatchlist(owner, repo, lastSeenRunId);
    setAutoNotify(true);
    Alert.alert(
      'Auto-notify enabled',
      'You\'ll get a notification whenever any Actions run in this repo finishes. Background ' +
        'checks happen roughly every 15+ minutes (an Android platform limit) - keep the app ' +
        'backgrounded rather than force-closed for this to work.'
    );
  };

  navigation.setOptions({
    title: `Actions · ${repo}`,
    headerRight: () => (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={handleToggleAutoNotify} style={{ marginRight: spacing.md }}>
          <Text style={{ color: autoNotify ? colors.success : colors.fgMuted, fontWeight: '600' }}>
            {autoNotify ? '🔔 Auto' : '🔕 Auto'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('WorkflowDispatch', { owner, repo })} style={{ marginRight: spacing.sm }}>
          <Text style={{ color: colors.accent, fontWeight: '600' }}>Run ▶</Text>
        </TouchableOpacity>
      </View>
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

    return (
      <TouchableOpacity
        style={styles.runCard}
        onPress={() => navigation.navigate('RunDetail', { owner, repo, runId: item.id, runName: item.name })}
      >
        <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
        <View style={styles.runInfo}>
          <Text style={styles.runName} numberOfLines={1}>{item.display_title || item.name}</Text>
          <Text style={styles.runMeta}>
            {item.head_branch} · #{item.run_number} · {formatStatus(status)}
          </Text>
          <Text style={styles.runTime}>{timeAgo(item.created_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
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
          ListEmptyComponent={<Text style={styles.emptyText}>No workflow runs yet.</Text>}
        />
      )}
    </View>
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
  container: { flex: 1, backgroundColor: colors.bgDefault },
  runCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  runInfo: { flex: 1 },
  runName: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600' },
  runMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 2 },
  runTime: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 2 },
  centerBox: { alignItems: 'center', marginTop: spacing.xl },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
});
