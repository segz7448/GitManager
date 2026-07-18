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
import { listMyIssues } from '../services/github';
import { colors, spacing, typography } from '../theme';

export default function IssuesScreen() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await listMyIssues({ perPage: 30, state: 'open' });
      setIssues(data.items || []);
    } catch (e) {
      setError(e.message || 'Failed to load issues');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
          data={issues}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No open issues involve you right now.</Text>}
          renderItem={({ item }) => {
            const repoFullName = item.repository_url.split('/repos/')[1];
            return (
              <TouchableOpacity style={styles.issueCard} onPress={() => Linking.openURL(item.html_url)}>
                <Text style={styles.issueTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.issueMeta}>
                  {repoFullName} #{item.number}
                </Text>
                {item.labels?.length > 0 && (
                  <View style={styles.labelRow}>
                    {item.labels.slice(0, 3).map((label) => (
                      <View key={label.id} style={[styles.labelChip, { backgroundColor: `#${label.color}33` }]}>
                        <Text style={[styles.labelText, { color: `#${label.color}` }]}>{label.name}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
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
  issueCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  issueTitle: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600' },
  issueMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 4 },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  labelChip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 12 },
  labelText: { fontSize: 11, fontWeight: '600' },
});
