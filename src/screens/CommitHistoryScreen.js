import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  Modal,
} from 'react-native';
import { listRepoCommits, cherryPickCommit, listBranches } from '../services/github';
import { colors, spacing, typography } from '../theme';

/**
 * Repo-wide commit history (as opposed to FileHistoryScreen, which is
 * scoped to one file). Each commit can be opened on github.com or
 * cherry-picked onto another branch.
 */
export default function CommitHistoryScreen({ route, navigation }) {
  const { owner, repo, branch } = route.params;
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerCommit, setPickerCommit] = useState(null);
  const [branches, setBranches] = useState([]);
  const [cherryPicking, setCherryPicking] = useState(false);

  navigation.setOptions({ title: `Commits · ${branch || 'default'}` });

  const load = useCallback(async (pageNum = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const data = await listRepoCommits(owner, repo, { branch, perPage: 30, page: pageNum });
      setHasMore(data.length === 30);
      setCommits((prev) => (append ? [...prev, ...data] : data));
    } catch (e) {
      Alert.alert('Failed to load commits', e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [owner, repo, branch]);

  useEffect(() => {
    load(1, false);
    listBranches(owner, repo).then(setBranches).catch(() => {});
  }, [load, owner, repo]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    load(nextPage, true);
  };

  const openCherryPickPicker = (commit) => {
    setPickerCommit(commit);
    setPickerVisible(true);
  };

  const handleCherryPick = async (destBranch) => {
    setPickerVisible(false);
    if (!pickerCommit) return;
    setCherryPicking(true);
    try {
      await cherryPickCommit(owner, repo, pickerCommit.sha, destBranch);
      Alert.alert('Cherry-picked', `"${pickerCommit.commit.message.split('\n')[0]}" was applied to "${destBranch}".`);
    } catch (e) {
      Alert.alert(
        'Cherry-pick failed',
        `${e.message}\n\nThis works best for commits that don't heavily overlap with changes already on the destination branch.`
      );
    } finally {
      setCherryPicking(false);
      setPickerCommit(null);
    }
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
      <FlatList
        data={commits}
        keyExtractor={(c) => c.sha}
        contentContainerStyle={{ padding: spacing.md }}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.md }} /> : null}
        renderItem={({ item }) => (
          <View style={styles.commitCard}>
            <TouchableOpacity onPress={() => Linking.openURL(item.html_url)}>
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
            <TouchableOpacity
              style={styles.cherryPickButton}
              onPress={() => openCherryPickPicker(item)}
              disabled={cherryPicking}
            >
              <Text style={styles.cherryPickButtonText}>Cherry-pick to…</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerVisible(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Cherry-pick to branch</Text>
            {branches
              .filter((b) => b.name !== branch)
              .map((b) => (
                <TouchableOpacity key={b.name} style={styles.pickerItem} onPress={() => handleCherryPick(b.name)}>
                  <Text style={styles.pickerItemText}>{b.name}</Text>
                </TouchableOpacity>
              ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  commitCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  commitMessage: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600' },
  commitMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  commitAuthor: { color: colors.fgMuted, fontSize: typography.sizeSm },
  commitDate: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  commitSha: { color: colors.fgSubtle, fontFamily: typography.mono, fontSize: 11, marginTop: 4 },
  cherryPickButton: { marginTop: spacing.sm, paddingVertical: spacing.xs, alignItems: 'center', borderRadius: 6, borderColor: colors.accent, borderWidth: 1 },
  cherryPickButtonText: { color: colors.accent, fontSize: typography.sizeSm, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  pickerCard: { backgroundColor: colors.bgSubtle, borderRadius: 12, borderColor: colors.border, borderWidth: 1, padding: spacing.lg, minWidth: '70%', maxHeight: '60%' },
  pickerTitle: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '700', marginBottom: spacing.md },
  pickerItem: { paddingVertical: spacing.sm },
  pickerItemText: { color: colors.fgDefault, fontFamily: typography.mono, fontSize: typography.sizeSm },
});
