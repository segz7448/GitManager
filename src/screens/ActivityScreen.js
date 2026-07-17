import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { listMyRecentActivity } from '../services/github';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';

function describeEvent(event) {
  const repo = event.repo?.name || 'unknown repo';
  switch (event.type) {
    case 'PushEvent': {
      const count = event.payload?.commits?.length || 0;
      return `Pushed ${count} commit${count === 1 ? '' : 's'} to ${repo}`;
    }
    case 'CreateEvent':
      return `Created ${event.payload?.ref_type || 'ref'} in ${repo}`;
    case 'DeleteEvent':
      return `Deleted ${event.payload?.ref_type || 'ref'} in ${repo}`;
    case 'IssuesEvent':
      return `${capitalize(event.payload?.action)} issue in ${repo}`;
    case 'IssueCommentEvent':
      return `Commented on an issue in ${repo}`;
    case 'PullRequestEvent':
      return `${capitalize(event.payload?.action)} a pull request in ${repo}`;
    case 'ForkEvent':
      return `Forked ${repo}`;
    case 'WatchEvent':
      return `Starred ${repo}`;
    case 'ReleaseEvent':
      return `${capitalize(event.payload?.action)} a release in ${repo}`;
    default:
      return `${event.type.replace('Event', '')} in ${repo}`;
  }
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ActivityScreen() {
  const { username } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!username) return;
    setError(null);
    try {
      const { data } = await listMyRecentActivity(username, { perPage: 30 });
      setEvents(data || []);
    } catch (e) {
      setError(e.message || 'Failed to load activity');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No recent activity.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.eventCard}
              onPress={() => Linking.openURL(`https://github.com/${item.repo.name}`)}
            >
              <Text style={styles.eventText}>{describeEvent(item)}</Text>
              <Text style={styles.eventTime}>{timeAgo(item.created_at)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  eventCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  eventText: { color: colors.fgDefault, fontSize: typography.sizeSm },
  eventTime: { color: colors.fgSubtle, fontSize: 11, marginTop: 4 },
});
