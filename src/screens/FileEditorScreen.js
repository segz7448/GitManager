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
} from 'react-native';
import { CodeEditor } from '@actualwave/react-native-codeditor';
import * as FileSystem from 'expo-file-system';
import { getFileContent, createOrUpdateFile } from '../services/github';
import { colors, spacing, typography } from '../theme';

// iOS needs the bundle-relative path to editor.html computed at runtime.
// Android resolves it automatically from android_asset.
const IOS_EDITOR_URI =
  Platform.OS === 'ios' ? (FileSystem.bundleDirectory ?? '') + 'assets/codeditor/editor.html' : undefined;

const EXT_LANGUAGE_MAP = {
  js: 'javascript', jsx: 'javascript', ts: 'javascript', tsx: 'javascript',
  json: 'javascript', java: 'java', kt: 'kotlin', kts: 'kotlin',
  py: 'python', rb: 'ruby', xml: 'xml', gradle: 'groovy',
  yml: 'yaml', yaml: 'yaml', md: 'markdown', html: 'xml', css: 'css',
  swift: 'swift', sh: 'shell', c: 'c', cpp: 'cpp', h: 'cpp',
};

function guessLanguage(path) {
  const ext = path.split('.').pop().toLowerCase();
  return EXT_LANGUAGE_MAP[ext] || 'javascript';
}

export default function FileEditorScreen({ route, navigation }) {
  const { owner, repo, path, sha: initialSha, branch } = route.params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [content, setContent] = useState('');
  const [sha, setSha] = useState(initialSha);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewport, setViewport] = useState(null);
  const currentContentRef = useRef('');

  navigation.setOptions({
    title: path.split('/').pop(),
    headerRight: () => (
      <TouchableOpacity onPress={handleSave} disabled={!dirty || saving} style={{ marginRight: spacing.sm }}>
        {saving ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <Text style={{ color: dirty ? colors.accent : colors.fgSubtle, fontWeight: '600' }}>Save</Text>
        )}
      </TouchableOpacity>
    ),
  });

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await getFileContent(owner, repo, path, branch || undefined);
      setContent(data.decodedContent);
      currentContentRef.current = data.decodedContent;
      setSha(data.sha);
      setDirty(false);
    } catch (e) {
      setError(e.message || 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [owner, repo, path, branch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await createOrUpdateFile(owner, repo, path, {
        message: `Update ${path}`,
        content: currentContentRef.current,
        sha,
        branch,
      });
      setSha(result.content.sha);
      setDirty(false);
      Alert.alert('Saved', `${path} was committed successfully.`);
    } catch (e) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
});
