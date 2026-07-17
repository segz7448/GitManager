import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { getIssue, updateIssueState, listIssueComments, createIssueComment } from '../services/github';
import { colors, spacing, typography } from '../theme';

export default function IssueDetailScreen({ route, navigation }) {
  const { owner, repo, issueNumber } = route.params;
  const [issue, setIssue] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [togglingState, setTogglingState] = useState(false);

  navigation.setOptions({ title: `#${issueNumber}` });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [issueData, { data: commentData }] = await Promise.all([
        getIssue(owner, repo, issueNumber),
        listIssueComments(owner, repo, issueNumber, { perPage: 50 }),
      ]);
      setIssue(issueData);
      setComments(commentData);
    } catch (e) {
      setError(e.message || 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  }, [owner, repo, issueNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleState = async () => {
    if (!issue) return;
    const nextState = issue.state === 'open' ? 'closed' : 'open';
    setTogglingState(true);
    try {
      const updated = await updateIssueState(owner, repo, issueNumber, nextState);
      setIssue(updated);
    } catch (e) {
      Alert.alert('Failed to update issue', e.message);
    } finally {
      setTogglingState(false);
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const comment = await createIssueComment(owner, repo, issueNumber, newComment.trim());
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    } catch (e) {
      Alert.alert('Failed to post comment', e.message);
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error || !issue) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error || 'Issue not found'}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.md }}
        data={comments}
        keyExtractor={(c) => String(c.id)}
        ListHeaderComponent={
          <View style={styles.header}>
            <TouchableOpacity onPress={() => Linking.openURL(issue.html_url)}>
              <Text style={styles.title}>{issue.title}</Text>
            </TouchableOpacity>
            <View style={styles.metaRow}>
              <View style={[styles.stateDot, issue.state === 'open' ? styles.stateDotOpen : styles.stateDotClosed]} />
              <Text style={styles.metaText}>
                {issue.state} · opened by {issue.user?.login}
              </Text>
            </View>
            {!!issue.body && <Text style={styles.body}>{issue.body}</Text>}
            <TouchableOpacity
              style={[styles.toggleButton, issue.state === 'open' ? styles.closeButton : styles.reopenButton]}
              onPress={handleToggleState}
              disabled={togglingState}
            >
              {togglingState ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.toggleButtonText}>{issue.state === 'open' ? 'Close issue' : 'Reopen issue'}</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.commentsHeader}>Comments ({comments.length})</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.commentCard}>
            <Text style={styles.commentAuthor}>{item.user?.login}</Text>
            <Text style={styles.commentBody}>{item.body}</Text>
            <Text style={styles.commentDate}>{new Date(item.created_at).toLocaleString()}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No comments yet.</Text>}
      />
      <View style={styles.commentBar}>
        <TextInput
          style={styles.commentInput}
          placeholder="Write a comment…"
          placeholderTextColor={colors.fgSubtle}
          value={newComment}
          onChangeText={setNewComment}
          multiline
        />
        <TouchableOpacity style={styles.postButton} onPress={handlePostComment} disabled={posting || !newComment.trim()}>
          {posting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.postButtonText}>Post</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { color: colors.danger, textAlign: 'center' },
  header: { marginBottom: spacing.md },
  title: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  stateDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  stateDotOpen: { backgroundColor: colors.success },
  stateDotClosed: { backgroundColor: colors.danger },
  metaText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  body: { color: colors.fgDefault, fontSize: typography.sizeSm, marginTop: spacing.md, lineHeight: 20 },
  toggleButton: { marginTop: spacing.md, padding: spacing.sm, borderRadius: 8, alignItems: 'center' },
  closeButton: { backgroundColor: colors.danger },
  reopenButton: { backgroundColor: colors.successEmphasis },
  toggleButtonText: { color: '#fff', fontWeight: '600', fontSize: typography.sizeSm },
  commentsHeader: { color: colors.fgSubtle, fontSize: typography.sizeSm, fontWeight: '700', marginTop: spacing.lg, textTransform: 'uppercase' },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.md },
  commentCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  commentAuthor: { color: colors.fgDefault, fontWeight: '700', fontSize: typography.sizeSm },
  commentBody: { color: colors.fgDefault, fontSize: typography.sizeSm, marginTop: 4, lineHeight: 18 },
  commentDate: { color: colors.fgSubtle, fontSize: 11, marginTop: spacing.sm },
  commentBar: {
    flexDirection: 'row', alignItems: 'flex-end', padding: spacing.sm,
    borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.bgSubtle,
  },
  commentInput: {
    flex: 1, color: colors.fgDefault, borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, maxHeight: 100, marginRight: spacing.sm,
  },
  postButton: { backgroundColor: colors.successEmphasis, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  postButtonText: { color: '#fff', fontWeight: '600' },
});
