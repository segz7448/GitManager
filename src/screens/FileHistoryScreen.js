import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { getFileCommitHistory } from '../services/github';
import { getFileBlame } from '../services/githubGraphql';
import { colors, spacing, typography } from '../theme';

export default function FileHistoryScreen({ route, navigation }) {
  const { owner, repo, path, branch } = route.params;
  const [view, setView] = useState('history'); // 'history' | 'blame'

  const [commits, setCommits] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);

  const [blameRanges, setBlameRanges] = useState([]);
  const [blameLoading, setBlameLoading] = useState(false);
  const [blameError, setBlameError] = useState(null);
  const [blameLoaded, setBlameLoaded] = useState(false);

  navigation.setOptions({ title: path.split('/').pop() });

  const loadHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      const data = await getFileCommitHistory(owner, repo, path, { branch });
      setCommits(data);
    } catch (e) {
      setHistoryError(e.message || 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, [owner, repo, path, branch]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const loadBlame = useCallback(async () => {
    setBlameLoading(true);
    setBlameError(null);
    try {
      const ranges = await getFileBlame(owner, repo, branch || 'HEAD', path);
      setBlameRanges(ranges);
      setBlameLoaded(true);
    } catch (e) {
      setBlameError(e.message || 'Failed to load blame');
    } finally {
      setBlameLoading(false);
    }
  }, [owner, repo, path, branch]);

  const openBlameTab = () => {
    setView('blame');
    if (!blameLoaded && !blameLoading) loadBlame();
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, view === 'history' && styles.tabButtonActive]}
          onPress={() => setView('history')}
        >
          <Text style={styles.tabButtonText}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, view === 'blame' && styles.tabButtonActive]}
          onPress={openBlameTab}
        >
          <Text style={styles.tabButtonText}>Blame</Text>
        </TouchableOpacity>
      </View>

      {view === 'history' && (
        historyLoading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.accent} />
        ) : historyError ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>{historyError}</Text>
            <TouchableOpacity onPress={loadHistory} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={commits}
            keyExtractor={(item) => item.sha}
            contentContainerStyle={{ padding: spacing.md }}
            ListEmptyComponent={<Text style={styles.emptyText}>No commit history found for this file.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.commitCard}
                onPress={() => Linking.openURL(item.html_url)}
              >
                <Text style={styles.commitMessage} numberOfLines={2}>
                  {item.commit.message.split('\n')[0]}
                </Text>
                <View style={styles.commitMetaRow}>
                  <Text style={styles.commitAuthor}>{item.commit.author?.name || 'unknown'}</Text>
                  <Text style={styles.commitDate}>
                    {new Date(item.commit.author?.date).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.commitSha}>{item.sha.slice(0, 7)}</Text>
              </TouchableOpacity>
            )}
          />
        )
      )}

      {view === 'blame' && (
        blameLoading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.accent} />
        ) : blameError ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>{blameError}</Text>
            <TouchableOpacity onPress={loadBlame} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={blameRanges}
            keyExtractor={(item, idx) => `${item.startingLine}-${idx}`}
            contentContainerStyle={{ padding: spacing.md }}
            ListEmptyComponent={<Text style={styles.emptyText}>No blame data available.</Text>}
            renderItem={({ item }) => (
              <View style={styles.blameCard}>
                <Text style={styles.blameLines}>
                  Lines {item.startingLine}-{item.endingLine}
                </Text>
                <Text style={styles.blameMessage} numberOfLines={1}>
                  {item.commit.message?.split('\n')[0]}
                </Text>
                <View style={styles.commitMetaRow}>
                  <Text style={styles.commitAuthor}>{item.commit.author?.name || 'unknown'}</Text>
                  <Text style={styles.commitDate}>
                    {new Date(item.commit.committedDate).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            )}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  tabBar: { flexDirection: 'row', borderBottomColor: colors.border, borderBottomWidth: 1 },
  tabButton: { flex: 1, padding: spacing.md, alignItems: 'center' },
  tabButtonActive: { borderBottomColor: colors.accent, borderBottomWidth: 2 },
  tabButtonText: { color: colors.fgDefault, fontSize: typography.sizeSm },
  centerBox: { alignItems: 'center', marginTop: spacing.xl },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  commitCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  commitMessage: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600' },
  commitMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  commitAuthor: { color: colors.fgMuted, fontSize: typography.sizeSm },
  commitDate: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  commitSha: { color: colors.fgSubtle, fontFamily: typography.mono, fontSize: 11, marginTop: 4 },
  blameCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  blameLines: { color: colors.accent, fontFamily: typography.mono, fontSize: 11, fontWeight: '700' },
  blameMessage: { color: colors.fgDefault, fontSize: typography.sizeSm, marginTop: 4 },
});
