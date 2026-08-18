import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listPullRequests } from '../services/github';
import { colors, spacing, typography, radii } from '../theme';
import { Screen, Card, Button, IconButton, EmptyState } from '../components/ui';
import { haptic } from '../utils/haptics';

const FILTERS = ['open', 'closed', 'all'];

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
      <IconButton
        name="add-circle-outline"
        color={colors.accent}
        size={22}
        onPress={() => navigation.navigate('CreatePullRequest', { owner, repo })}
      />
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
    <Screen>
      <View style={styles.filterBar}>
        {FILTERS.map((s) => {
          const active = state === s;
          return (
            <Pressable
              key={s}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => {
                haptic.select();
                setState(s);
              }}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </Pressable>
          );
        })}
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
          data={prs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <EmptyState icon="git-pull-request-outline" title={`No ${state} pull requests`} subtitle="Open one from the button up top." />
          }
          renderItem={({ item }) => {
            const icon = item.draft ? 'git-pull-request-outline' : item.state === 'open' ? 'git-pull-request' : 'git-merge';
            const tone = item.draft ? colors.fgMuted : item.state === 'open' ? colors.success : colors.done;
            return (
              <Card
                style={styles.prCard}
                onPress={() => navigation.navigate('PullRequestDetail', { owner, repo, pullNumber: item.number })}
              >
                <View style={styles.prHeaderRow}>
                  <Ionicons name={icon} size={18} color={tone} style={styles.prIcon} />
                  <Text style={styles.prTitle} numberOfLines={2}>{item.title}</Text>
                </View>
                <Text style={styles.prMeta}>
                  #{item.number} opened by {item.user?.login} · {item.head.ref} → {item.base.ref}
                </Text>
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterBar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  filterChip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgSubtle,
  },
  filterChipActive: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  filterChipText: { color: colors.fgMuted, fontSize: typography.sizeSm, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  centerBox: { alignItems: 'center', marginTop: spacing.xl },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  prCard: { marginBottom: spacing.sm },
  prHeaderRow: { flexDirection: 'row', alignItems: 'flex-start' },
  prIcon: { marginRight: spacing.sm, marginTop: 2 },
  prTitle: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600', flex: 1 },
  prMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 4, marginLeft: 26 },
});
