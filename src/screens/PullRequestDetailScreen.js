import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native';
import {
  getPullRequest,
  getPullRequestFiles,
  listPullRequestReviews,
  createPullRequestReview,
  listPullRequestComments,
  createPullRequestComment,
  mergePullRequest,
} from '../services/github';
import PatchView from '../components/PatchView';
import { colors, spacing, typography } from '../theme';

export default function PullRequestDetailScreen({ route, navigation }) {
  const { owner, repo, pullNumber } = route.params;

  const [pr, setPr] = useState(null);
  const [files, setFiles] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('files'); // 'files' | 'reviews' | 'comments'
  const [expandedFile, setExpandedFile] = useState(null);

  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewEvent, setReviewEvent] = useState('COMMENT');
  const [reviewBody, setReviewBody] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [mergeMethod, setMergeMethod] = useState('merge');
  const [merging, setMerging] = useState(false);

  navigation.setOptions({ title: `PR #${pullNumber}` });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [prData, filesData, reviewsData, commentsData] = await Promise.all([
        getPullRequest(owner, repo, pullNumber),
        getPullRequestFiles(owner, repo, pullNumber),
        listPullRequestReviews(owner, repo, pullNumber),
        listPullRequestComments(owner, repo, pullNumber),
      ]);
      setPr(prData);
      setFiles(filesData);
      setReviews(reviewsData);
      setComments(commentsData);
    } catch (e) {
      setError(e.message || 'Failed to load pull request');
    } finally {
      setLoading(false);
    }
  }, [owner, repo, pullNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmitReview = async () => {
    setSubmittingReview(true);
    try {
      await createPullRequestReview(owner, repo, pullNumber, { body: reviewBody, event: reviewEvent });
      setReviewModalVisible(false);
      setReviewBody('');
      load();
      Alert.alert('Submitted', 'Your review was submitted.');
    } catch (e) {
      Alert.alert('Failed to submit review', e.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      await createPullRequestComment(owner, repo, pullNumber, newComment.trim());
      setNewComment('');
      load();
    } catch (e) {
      Alert.alert('Failed to post comment', e.message);
    } finally {
      setPostingComment(false);
    }
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      await mergePullRequest(owner, repo, pullNumber, { mergeMethod });
      setMergeModalVisible(false);
      Alert.alert('Merged', `PR #${pullNumber} was merged successfully.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e.status === 405
        ? 'This PR is not mergeable right now (conflicts or failing required checks).'
        : e.status === 409
        ? 'The branch changed since this was checked - reload and try again.'
        : e.message;
      Alert.alert('Merge failed', msg);
    } finally {
      setMerging(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error || !pr) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOpen = pr.state === 'open';
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.headerCard} contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.prTitle}>{pr.title}</Text>
        <Text style={styles.prMeta}>
          #{pr.number} by {pr.user?.login} · {pr.head.ref} → {pr.base.ref}
        </Text>
        <View style={styles.statsRow}>
          <Text style={styles.additionsText}>+{totalAdditions}</Text>
          <Text style={styles.deletionsText}>-{totalDeletions}</Text>
          <Text style={styles.filesChangedText}>{files.length} file{files.length === 1 ? '' : 's'} changed</Text>
        </View>
        {!!pr.body && <Text style={styles.prBody}>{pr.body}</Text>}

        {isOpen && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.reviewButton} onPress={() => setReviewModalVisible(true)}>
              <Text style={styles.reviewButtonText}>Review</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mergeButton} onPress={() => setMergeModalVisible(true)}>
              <Text style={styles.mergeButtonText}>Merge</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tabButton, view === 'files' && styles.tabButtonActive]} onPress={() => setView('files')}>
          <Text style={styles.tabButtonText}>Files ({files.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, view === 'reviews' && styles.tabButtonActive]} onPress={() => setView('reviews')}>
          <Text style={styles.tabButtonText}>Reviews ({reviews.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, view === 'comments' && styles.tabButtonActive]} onPress={() => setView('comments')}>
          <Text style={styles.tabButtonText}>Comments ({comments.length})</Text>
        </TouchableOpacity>
      </View>

      {view === 'files' && (
        <FlatList
          data={files}
          keyExtractor={(item) => item.sha + item.filename}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => {
            const isExpanded = expandedFile === item.filename;
            return (
              <View style={styles.fileCard}>
                <TouchableOpacity
                  style={styles.fileHeader}
                  onPress={() => setExpandedFile(isExpanded ? null : item.filename)}
                >
                  <Text style={styles.filePath} numberOfLines={1}>{item.filename}</Text>
                  <Text style={styles.fileStats}>
                    <Text style={styles.additionsText}>+{item.additions}</Text>
                    {' '}
                    <Text style={styles.deletionsText}>-{item.deletions}</Text>
                  </Text>
                </TouchableOpacity>
                {isExpanded && <PatchView patch={item.patch} style={styles.patchContainer} />}
              </View>
            );
          }}
        />
      )}

      {view === 'reviews' && (
        <FlatList
          data={reviews}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.md }}
          ListEmptyComponent={<Text style={styles.emptyText}>No reviews yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.reviewCard}>
              <View style={styles.reviewHeaderRow}>
                <Text style={styles.reviewAuthor}>{item.user?.login}</Text>
                <Text style={[
                  styles.reviewState,
                  item.state === 'APPROVED' && styles.reviewStateApproved,
                  item.state === 'CHANGES_REQUESTED' && styles.reviewStateChanges,
                ]}>
                  {item.state.replace(/_/g, ' ')}
                </Text>
              </View>
              {!!item.body && <Text style={styles.reviewBody}>{item.body}</Text>}
            </View>
          )}
        />
      )}

      {view === 'comments' && (
        <View style={styles.flex}>
          <FlatList
            data={comments}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: spacing.md }}
            ListEmptyComponent={<Text style={styles.emptyText}>No comments yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.commentCard}>
                <Text style={styles.commentAuthor}>{item.user?.login}</Text>
                <Text style={styles.commentBody}>{item.body}</Text>
              </View>
            )}
          />
          <View style={styles.commentInputBar}>
            <TextInput
              style={styles.commentInput}
              placeholder="Write a comment..."
              placeholderTextColor={colors.fgSubtle}
              value={newComment}
              onChangeText={setNewComment}
              multiline
            />
            <TouchableOpacity onPress={handlePostComment} disabled={postingComment} style={styles.postButton}>
              {postingComment ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.postButtonText}>Post</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={reviewModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Submit Review</Text>
            <View style={styles.reviewEventRow}>
              {[
                { key: 'APPROVE', label: 'Approve' },
                { key: 'REQUEST_CHANGES', label: 'Request Changes' },
                { key: 'COMMENT', label: 'Comment' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.reviewEventChip, reviewEvent === opt.key && styles.reviewEventChipActive]}
                  onPress={() => setReviewEvent(opt.key)}
                >
                  <Text style={[styles.reviewEventChipText, reviewEvent === opt.key && styles.reviewEventChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.modalTextArea}
              placeholder="Leave a comment (optional for approve)"
              placeholderTextColor={colors.fgSubtle}
              value={reviewBody}
              onChangeText={setReviewBody}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setReviewModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={handleSubmitReview} disabled={submittingReview}>
                {submittingReview ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Submit</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={mergeModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Merge Pull Request</Text>
            <View style={styles.reviewEventRow}>
              {['merge', 'squash', 'rebase'].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.reviewEventChip, mergeMethod === m && styles.reviewEventChipActive]}
                  onPress={() => setMergeMethod(m)}
                >
                  <Text style={[styles.reviewEventChipText, mergeMethod === m && styles.reviewEventChipTextActive]}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setMergeModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={handleMerge} disabled={merging}>
                {merging ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Merge</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  flex: { flex: 1 },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  headerCard: { maxHeight: 260, borderBottomColor: colors.border, borderBottomWidth: 1 },
  prTitle: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700' },
  prMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  additionsText: { color: colors.success, fontFamily: typography.mono, fontSize: typography.sizeSm, fontWeight: '600' },
  deletionsText: { color: colors.danger, fontFamily: typography.mono, fontSize: typography.sizeSm, fontWeight: '600' },
  filesChangedText: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  prBody: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: spacing.sm, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  reviewButton: { flex: 1, padding: spacing.sm, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  reviewButtonText: { color: colors.accent, fontWeight: '600' },
  mergeButton: { flex: 1, padding: spacing.sm, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  mergeButtonText: { color: '#fff', fontWeight: '600' },
  tabBar: { flexDirection: 'row', borderBottomColor: colors.border, borderBottomWidth: 1 },
  tabButton: { flex: 1, padding: spacing.md, alignItems: 'center' },
  tabButtonActive: { borderBottomColor: colors.accent, borderBottomWidth: 2 },
  tabButtonText: { color: colors.fgDefault, fontSize: typography.sizeSm },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  fileCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, marginBottom: spacing.sm, overflow: 'hidden',
  },
  fileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  filePath: { color: colors.fgDefault, fontFamily: typography.mono, fontSize: typography.sizeSm, flex: 1 },
  fileStats: { fontSize: typography.sizeSm, marginLeft: spacing.sm },
  patchContainer: { maxHeight: 300, borderTopColor: colors.border, borderTopWidth: 1 },
  reviewCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  reviewHeaderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  reviewAuthor: { color: colors.fgDefault, fontWeight: '600' },
  reviewState: { color: colors.fgMuted, fontSize: typography.sizeSm, fontWeight: '600' },
  reviewStateApproved: { color: colors.success },
  reviewStateChanges: { color: colors.danger },
  reviewBody: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: spacing.xs },
  commentCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  commentAuthor: { color: colors.fgDefault, fontWeight: '600', fontSize: typography.sizeSm },
  commentBody: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: spacing.xs },
  commentInputBar: { flexDirection: 'row', padding: spacing.sm, borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm },
  commentInput: {
    flex: 1, backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, padding: spacing.sm, color: colors.fgDefault, maxHeight: 100,
  },
  postButton: { backgroundColor: colors.accentEmphasis, borderRadius: 8, paddingHorizontal: spacing.md, justifyContent: 'center' },
  postButtonText: { color: '#fff', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.bgSubtle, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: spacing.lg, borderColor: colors.border, borderWidth: 1,
  },
  modalTitle: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700', marginBottom: spacing.md },
  reviewEventRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  reviewEventChip: { borderColor: colors.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  reviewEventChipActive: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  reviewEventChipText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  reviewEventChipTextActive: { color: '#fff', fontWeight: '600' },
  modalTextArea: {
    backgroundColor: colors.bgInset, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, color: colors.fgDefault, padding: spacing.md, minHeight: 80, textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalCancelButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  modalCancelText: { color: colors.fgMuted },
  modalSaveButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  modalSaveText: { color: '#fff', fontWeight: '600' },
});
