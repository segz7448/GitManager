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
import { listReleases } from '../services/github';
import { colors, spacing, typography } from '../theme';

export default function ReleasesListScreen({ route, navigation }) {
  const { owner, repo } = route.params;
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  navigation.setOptions({
    title: `Releases · ${repo}`,
    headerRight: () => (
      <TouchableOpacity
        onPress={() => navigation.navigate('CreateRelease', { owner, repo })}
        style={{ marginRight: spacing.sm }}
      >
        <Text style={{ color: colors.accent, fontWeight: '600' }}>+ New</Text>
      </TouchableOpacity>
    ),
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await listReleases(owner, repo, { perPage: 30 });
      setReleases(data);
    } catch (e) {
      setError(e.message || 'Failed to load releases');
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
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={releases}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No releases yet.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.releaseCard}
              onPress={() => navigation.navigate('ReleaseDetail', { owner, repo, releaseId: item.id })}
            >
              <View style={styles.releaseHeaderRow}>
                <Text style={styles.releaseName} numberOfLines={1}>{item.name || item.tag_name}</Text>
                {item.draft && <View style={styles.draftBadge}><Text style={styles.draftBadgeText}>Draft</Text></View>}
                {item.prerelease && <View style={styles.preBadge}><Text style={styles.preBadgeText}>Pre-release</Text></View>}
              </View>
              <Text style={styles.releaseMeta}>
                {item.tag_name} · {item.assets?.length || 0} asset{item.assets?.length === 1 ? '' : 's'}
              </Text>
              <Text style={styles.releaseDate}>
                {new Date(item.published_at || item.created_at).toLocaleDateString()}
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
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  centerBox: { alignItems: 'center', marginTop: spacing.xl },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  releaseCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  releaseHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  releaseName: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '700', flex: 1 },
  draftBadge: { backgroundColor: 'rgba(139,148,158,0.2)', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 10 },
  draftBadgeText: { color: colors.fgMuted, fontSize: 11, fontWeight: '600' },
  preBadge: { backgroundColor: 'rgba(210,153,34,0.2)', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 10 },
  preBadgeText: { color: colors.warning, fontSize: 11, fontWeight: '600' },
  releaseMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 4 },
  releaseDate: { color: colors.fgSubtle, fontSize: 11, marginTop: 2 },
});
