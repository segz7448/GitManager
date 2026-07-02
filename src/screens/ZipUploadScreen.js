import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import { commitMultipleFiles } from '../services/github';
import { colors, spacing, typography } from '../theme';

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp',
  'zip', 'gz', 'tar', 'jar', 'apk', 'aab', 'so', 'dex',
  'ttf', 'otf', 'woff', 'woff2', 'pdf', 'mp3', 'mp4', 'wav',
]);

function isBinaryPath(path) {
  const ext = path.split('.').pop().toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export default function ZipUploadScreen({ route, navigation }) {
  const { owner, repo, path: targetDir, branch: initialBranch } = route.params;
  const branch = initialBranch || 'main';

  const [picking, setPicking] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [fileTree, setFileTree] = useState(null); // [{path, size, binary}]
  const [zipRef, setZipRef] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });

  const handlePickZip = async () => {
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      setExtracting(true);

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const zip = await JSZip.loadAsync(base64, { base64: true });
      const entries = [];
      zip.forEach((relativePath, entry) => {
        if (!entry.dir) {
          entries.push({
            path: targetDir ? `${targetDir}/${relativePath}` : relativePath,
            relativePath,
            binary: isBinaryPath(relativePath),
          });
        }
      });

      if (entries.length === 0) {
        Alert.alert('Empty archive', 'No files found in this zip.');
        setExtracting(false);
        return;
      }

      setFileTree(entries);
      setZipRef(zip);
    } catch (e) {
      Alert.alert('Failed to read zip', e.message);
    } finally {
      setPicking(false);
      setExtracting(false);
    }
  };

  const handleCommit = async () => {
    if (!zipRef || !fileTree) return;
    setCommitting(true);
    try {
      const files = [];
      for (const entry of fileTree) {
        const zipEntry = zipRef.file(entry.relativePath);
        if (entry.binary) {
          const base64Content = await zipEntry.async('base64');
          files.push({ path: entry.path, binaryBase64: base64Content });
        } else {
          const textContent = await zipEntry.async('string');
          files.push({ path: entry.path, content: textContent });
        }
      }

      await commitMultipleFiles(
        owner,
        repo,
        branch,
        files,
        `Upload ${fileTree.length} file(s) from zip`,
        (current, total, label) => setProgress({ current, total, label })
      );

      Alert.alert('Success', `Committed ${files.length} files to ${branch}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Commit failed', e.message);
    } finally {
      setCommitting(false);
      setProgress({ current: 0, total: 0, label: '' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Target: {owner}/{repo}{targetDir ? `/${targetDir}` : ''} on branch "{branch}"
        </Text>
      </View>

      {!fileTree ? (
        <View style={styles.pickArea}>
          <TouchableOpacity
            style={styles.pickButton}
            onPress={handlePickZip}
            disabled={picking || extracting}
          >
            {picking || extracting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.pickButtonText}>Choose ZIP File</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.hint}>
            The zip will be unpacked in memory on your device. Nothing is uploaded until you
            confirm the commit below.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={fileTree}
            keyExtractor={(item) => item.path}
            contentContainerStyle={{ padding: spacing.md }}
            ListHeaderComponent={
              <Text style={styles.countText}>{fileTree.length} files ready to commit</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.fileRow}>
                <Text style={styles.fileIcon}>{item.binary ? '🗎' : '📄'}</Text>
                <Text style={styles.filePath} numberOfLines={1}>{item.path}</Text>
              </View>
            )}
          />
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => { setFileTree(null); setZipRef(null); }}
              disabled={committing}
            >
              <Text style={styles.cancelButtonText}>Choose Different File</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.commitButton}
              onPress={handleCommit}
              disabled={committing}
            >
              {committing ? (
                <View style={styles.committingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.commitButtonText}>
                    {progress.total ? ` ${progress.current}/${progress.total}` : ' Committing...'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.commitButtonText}>Commit to Repo</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  header: {
    padding: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  headerText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  pickArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  pickButton: {
    backgroundColor: colors.accentEmphasis,
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  pickButtonText: { color: '#fff', fontWeight: '600', fontSize: typography.sizeMd },
  hint: { color: colors.fgSubtle, fontSize: typography.sizeSm, textAlign: 'center', marginTop: spacing.lg },
  countText: { color: colors.fgMuted, marginBottom: spacing.sm, fontSize: typography.sizeSm },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomColor: colors.borderMuted,
    borderBottomWidth: 1,
  },
  fileIcon: { marginRight: spacing.sm },
  filePath: { color: colors.fgDefault, flex: 1, fontFamily: typography.mono, fontSize: typography.sizeSm },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  cancelButton: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: 8,
    borderColor: colors.border,
    borderWidth: 1,
  },
  cancelButtonText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  commitButton: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.successEmphasis,
  },
  commitButtonText: { color: '#fff', fontWeight: '600' },
  committingRow: { flexDirection: 'row', alignItems: 'center' },
});
