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
import { listWorkflowRuns } from '../services/github';
import { colors, spacing, typography, statusColors } from '../theme';

export default function ActionsListScreen({ route, navigation }) {
  const { owner, repo } = route.params;
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  navigation.setOptions({ title: `Actions · ${repo}` });

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listWorkflowRuns(owner, repo, { perPage: 50 });
      setRuns(data.workflow_runs || []);
    } catch (e) {
      setError(e.message || 'Failed to load workflow runs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [owner, repo]);

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
