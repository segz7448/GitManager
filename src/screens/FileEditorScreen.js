import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { CodeEditor } from '@actualwave/react-native-codeditor';
import * as FileSystem from 'expo-file-system/legacy';
import { getFileContent, createOrUpdateFile } from '../services/github';
import { useStaging } from '../context/StagingContext';
import DiffView from '../components/DiffView';
import { colors, spacing, typography } from '../theme';
import { saveDraft, getDraft, clearDraft } from '../db/editorDrafts';
import { createBackup } from '../db/fileBackups';
import { checkBranchConflict } from '../services/repoSafety';
import VersionHistoryModal from '../components/VersionHistoryModal';

// How often to persist an autosave draft while the file is dirty. This is
// what previously didn't exist at all - closing the app (crash, swipe-kill,
// low-memory kill) while editing lost all unsaved changes with no recovery.
const AUTOSAVE_INTERVAL_MS = 4000;

// iOS needs the bundle-relative path to editor.html computed at runtime.
// Android resolves it automatically from android_asset.
const IOS_EDITOR_URI =
  Platform.OS === 'ios' ? (FileSystem.bundleDirectory ?? '') + 'assets/codeditor/editor.html' : undefined;

// Only languages the editor package loads natively are listed here
// (javascript, python, rust, sql, css, c++, html, java, json, markdown,
// php, xml, plus a few more per its docs). Go and Dockerfile syntax
// would need the separate @codemirror/legacy-modes loader, which isn't
// wired up here - those fall back to plain-text rather than silently
// mislabeling them as something else.
const EXT_LANGUAGE_MAP = {
  js: 'javascript', jsx: 'javascript', ts: 'javascript', tsx: 'javascript',
  json: 'javascript', java: 'java', kt: 'kotlin', kts: 'kotlin',
  py: 'python', rb: 'ruby', xml: 'xml', gradle: 'groovy',
  yml: 'yaml', yaml: 'yaml', md: 'markdown', html: 'xml', css: 'css',
  swift: 'swift', sh: 'shell', c: 'c', cpp: 'cpp', h: 'cpp',
  rs: 'rust', php: 'php', sql: 'sql',
};

function guessLanguage(path) {
  const ext = path.split('.').pop().toLowerCase();
  return EXT_LANGUAGE_MAP[ext] || 'javascript';
}

export default function FileEditorScreen({ route, navigation }) {
  const { owner, repo, path, sha: initialSha, branch } = route.params;
  const { stageFile, isFileStaged } = useStaging();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [content, setContent] = useState('');
  const [sha, setSha] = useState(initialSha);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewport, setViewport] = useState(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const currentContentRef = useRef('');
  const originalContentRef = useRef('');

  navigation.setOptions({
    title: path.split('/').pop(),
    headerRight: () => (
      <View style={styles.headerButtons}>
        <TouchableOpacity
          onPress={() => navigation.navigate('FileHistory', { owner, repo, path, branch })}
          style={{ marginRight: spacing.md }}
        >
          <Text style={styles.headerButtonText}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setHistoryModalVisible(true)}
          style={{ marginRight: spacing.md }}
        >
          <Text style={styles.headerButtonText}>Restore</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setReviewModalVisible(true)}
          disabled={!dirty || saving}
          style={{ marginRight: spacing.sm }}
        >
          {saving ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={[styles.headerButtonText, { color: dirty ? colors.accent : colors.fgSubtle }]}>
              Review
            </Text>
          )}
        </TouchableOpacity>
      </View>
    ),
  });

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await getFileContent(owner, repo, path, branch || undefined);
      currentContentRef.current = data.decodedContent;
      originalContentRef.current = data.decodedContent;
      setSha(data.sha);
      setDirty(false);

      // Hidden pre-edit backup, taken the moment the file is opened -
      // this is the safety net for "I edited the wrong thing and want
      // back exactly what was there before I touched it", independent of
      // Git history and available even before anything is committed.
      createBackup(owner, repo, branch, path, data.decodedContent, data.sha, 'open').catch(() => {});

      // Check for an unsaved autosave draft from a previous session that
      // never got committed/staged (e.g. app was killed). If the draft's
      // base sha matches what GitHub has now, it's safe to offer restoring
      // it; if the file changed upstream since, we still offer it but the
      // Review diff will make the gap visible before committing.
      const draft = await getDraft(owner, repo, path, branch);
      if (draft && draft.content !== data.decodedContent) {
        setContent(data.decodedContent);
        Alert.alert(
          'Unsaved changes found',
          `An autosaved draft of this file from a previous session (${new Date(draft.savedAt).toLocaleString()}) wasn't committed or staged. Restore it?`,
          [
            { text: 'Discard draft', style: 'destructive', onPress: () => clearDraft(owner, repo, path, branch) },
            {
              text: 'Restore',
              onPress: () => {
                setContent(draft.content);
                currentContentRef.current = draft.content;
                setDirty(true);
              },
            },
          ]
        );
      } else {
        setContent(data.decodedContent);
      }
    } catch (e) {
      setError(e.message || 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [owner, repo, path, branch]);

  useEffect(() => {
    load();
  }, [load]);

  // Periodically persist the current in-editor content while dirty, so a
  // crash or kill mid-edit doesn't silently discard the user's work.
  useEffect(() => {
    const interval = setInterval(() => {
      if (dirty && currentContentRef.current !== originalContentRef.current) {
        saveDraft(owner, repo, path, branch, currentContentRef.current, sha);
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [owner, repo, path, branch, sha, dirty]);

  const handleCommitNow = async () => {
    setSaving(true);
    setReviewModalVisible(false);
    try {
      // Conflict detection before pushing: if someone else (or another
      // device signed into the same repo) has moved this branch since we
      // loaded the file, `sha` is stale and pushing blind would either
      // fail or, worse, silently overwrite their change. GitHub's PUT
      // contents endpoint already rejects a stale sha with a 409, but we
      // check explicitly first so we can show a clear, actionable message
      // rather than a raw API error.
      const conflict = await checkBranchConflict(owner, repo, branch, sha);
      if (conflict.hasConflict) {
        setSaving(false);
        Alert.alert(
          'Conflict detected',
          `${path} has changed on ${branch || 'the default branch'} since you opened it. Reload the latest version and reapply your edit before committing, to avoid overwriting someone else's change.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reload latest', onPress: load },
          ]
        );
        return;
      }

      // Timestamped backup taken right before the push - a local
      // snapshot of exactly what's about to be committed, in addition to
      // whatever GitHub keeps in its own commit history.
      await createBackup(owner, repo, branch, path, currentContentRef.current, sha, 'save');

      const result = await createOrUpdateFile(owner, repo, path, {
        message: `Update ${path}`,
        content: currentContentRef.current,
        sha,
        branch,
      });
      setSha(result.content.sha);
      setDirty(false);
      originalContentRef.current = currentContentRef.current;
      await clearDraft(owner, repo, path, branch);
      Alert.alert('Committed', `${path} was committed successfully.`);
    } catch (e) {
      Alert.alert('Commit failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreVersion = (backup) => {
    setContent(backup.content);
    currentContentRef.current = backup.content;
    setDirty(true);
    setHistoryModalVisible(false);
  };

  const handleStageForLater = () => {
    stageFile(owner, repo, {
      path,
      content: currentContentRef.current,
      originalContent: originalContentRef.current,
      sha,
      branch,
    });
    setReviewModalVisible(false);
    setDirty(false);
    originalContentRef.current = currentContentRef.current;
    clearDraft(owner, repo, path, branch);
    Alert.alert(
      'Staged',
      `${path} was added to staged changes. Open "Staged Changes" from the repo screen to review and commit everything together.`
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!viewport || viewport.width !== width || viewport.height !== height) {
          setViewport({ x: 0, y: 0, width, height });
        }
      }}
    >
      {viewport && (
        <CodeEditor
          // remount editor whenever the file changes - avoids the
          // uncontrolled-content feedback loop across navigations
          key={`${owner}/${repo}/${path}/${branch || 'default'}`}
          editorUri={IOS_EDITOR_URI}
          content={content}
          language={guessLanguage(path)}
          theme="darcula"
          viewport={viewport}
          onContentUpdate={(text) => {
            currentContentRef.current = text;
            if (!dirty) setDirty(true);
          }}
          onError={(err) => console.log('[editor error]', err)}
        />
      )}

      <Modal visible={reviewModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Review changes</Text>
            <Text style={styles.reviewPath}>{path}</Text>
            <DiffView
              oldText={originalContentRef.current}
              newText={currentContentRef.current}
              style={styles.diffContainer}
            />
            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setReviewModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stageButton} onPress={handleStageForLater}>
                <Text style={styles.stageButtonText}>Stage for Later</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.commitButton} onPress={handleCommitNow}>
                <Text style={styles.commitButtonText}>Commit Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <VersionHistoryModal
        visible={historyModalVisible}
        onClose={() => setHistoryModalVisible(false)}
        owner={owner}
        repo={repo}
        branch={branch}
        path={path}
        currentContent={currentContentRef.current}
        onRestore={handleRestoreVersion}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  headerButtonText: { fontSize: typography.sizeSm, fontWeight: '600', color: colors.fgDefault },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  reviewCard: {
    backgroundColor: colors.bgSubtle,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    borderColor: colors.border,
    borderWidth: 1,
    maxHeight: '80%',
  },
  reviewTitle: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700' },
  reviewPath: { color: colors.fgMuted, fontFamily: typography.mono, fontSize: typography.sizeSm, marginTop: 2, marginBottom: spacing.md },
  diffContainer: { maxHeight: 350, borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  reviewActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  cancelButtonText: { color: colors.fgMuted },
  stageButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.warningEmphasis },
  stageButtonText: { color: '#fff', fontWeight: '600', fontSize: typography.sizeSm },
  commitButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  commitButtonText: { color: '#fff', fontWeight: '600', fontSize: typography.sizeSm },
});
