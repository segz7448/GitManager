import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getContents, deleteFile, createOrUpdateFile, listBranches, commitMultipleFiles, getRepo } from '../services/github';
import { useStaging } from '../context/StagingContext';
import { colors, spacing, typography } from '../theme';

export default function RepoDetailScreen({ route, navigation }) {
  const { owner, repo, path: initialPath = '' } = route.params;
  const [path, setPath] = useState(initialPath);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState(null);
  const [branchModalVisible, setBranchModalVisible] = useState(false);

  const [newFileModalVisible, setNewFileModalVisible] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [importing, setImporting] = useState(false);

  navigation.setOptions({
    title: path ? path.split('/').pop() : repo,
    headerRight: () => (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {!path && (
          <TouchableOpacity
            onPress={() => navigation.navigate('RepoSettings', { owner, repo })}
            style={{ marginRight: spacing.md }}
          >
            <Text style={{ color: colors.accent, fontSize: 16 }}>⚙</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => setBranchModalVisible(true)} style={{ marginRight: spacing.sm }}>
          <Text style={{ color: colors.accent }}>{branch || 'branch'}</Text>
        </TouchableOpacity>
      </View>
    ),
  });

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await getContents(owner, repo, path, branch || undefined);
      const sorted = Array.isArray(data)
        ? [...data].sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
        : [data];
      setItems(sorted);
    } catch (e) {
      setError(e.message || 'Failed to load contents');
    } finally {
      setLoading(false);
    }
  }, [owner, repo, path, branch]);

  useEffect(() => {
    load();
  }, [load]);

  const [defaultBranch, setDefaultBranch] = useState('main');
  const { getStagedCount } = useStaging();
  const stagedCount = getStagedCount(owner, repo);

  useEffect(() => {
    listBranches(owner, repo).then(setBranches).catch(() => {});
    getRepo(owner, repo).then((r) => setDefaultBranch(r.default_branch)).catch(() => {});
  }, [owner, repo]);

  const handleItemPress = (item) => {
    if (item.type === 'dir') {
      navigation.push('RepoDetail', { owner, repo, path: item.path });
    } else {
      navigation.navigate('FileEditor', { owner, repo, path: item.path, sha: item.sha, branch });
    }
  };

  const handleDelete = (item) => {
    Alert.alert('Delete file', `Delete "${item.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFile(owner, repo, item.path, {
              message: `Delete ${item.path}`,
              sha: item.sha,
              branch,
            });
            load();
          } catch (e) {
            Alert.alert('Delete failed', e.message);
          }
        },
      },
    ]);
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    const fullPath = path ? `${path}/${newFileName.trim()}` : newFileName.trim();
    try {
      await createOrUpdateFile(owner, repo, fullPath, {
        message: `Create ${fullPath}`,
        content: '',
        branch,
      });
      setNewFileModalVisible(false);
      setNewFileName('');
      load();
    } catch (e) {
      Alert.alert('Failed to create file', e.message);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    // Git has no concept of an empty folder - it only tracks files. The
    // standard workaround is to commit a placeholder file inside it.
    const folderPath = path ? `${path}/${newFolderName.trim()}` : newFolderName.trim();
    const placeholderPath = `${folderPath}/.gitkeep`;
    try {
      await createOrUpdateFile(owner, repo, placeholderPath, {
        message: `Create ${folderPath}/`,
        content: '',
        branch,
      });
      setNewFolderModalVisible(false);
      setNewFolderName('');
      load();
    } catch (e) {
      Alert.alert('Failed to create folder', e.message);
    }
  };

  const handleImportFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const assets = result.assets || [];
      if (assets.length === 0) return;

      setImporting(true);

      const BINARY_EXT = new Set([
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'zip', 'gz', 'tar',
        'jar', 'apk', 'aab', 'so', 'dex', 'ttf', 'otf', 'woff', 'woff2', 'pdf',
        'mp3', 'mp4', 'wav',
      ]);

      const files = [];
      for (const asset of assets) {
        const ext = (asset.name.split('.').pop() || '').toLowerCase();
        const targetPath = path ? `${path}/${asset.name}` : asset.name;
        if (BINARY_EXT.has(ext)) {
          const base64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          files.push({ path: targetPath, binaryBase64: base64 });
        } else {
          const text = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          files.push({ path: targetPath, content: text });
        }
      }

      await commitMultipleFiles(
        owner,
        repo,
        branch || defaultBranch,
        files,
        `Import ${files.length} file(s)`
      );

      load();
      Alert.alert('Imported', `${files.length} file(s) committed successfully.`);
    } catch (e) {
      Alert.alert('Import failed', e.message);
    } finally {
      setImporting(false);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => handleItemPress(item)}
      onLongPress={() => item.type === 'file' && handleDelete(item)}
    >
      <Text style={styles.icon}>{item.type === 'dir' ? '📁' : '📄'}</Text>
      <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
      {item.type === 'file' && (
        <Text style={styles.size}>{formatBytes(item.size)}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.actionBarWrap}>
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('ZipUpload', { owner, repo, path, branch })}
          >
            <Text style={styles.actionButtonText}>Upload ZIP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleImportFiles}
            disabled={importing}
          >
            {importing ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text style={styles.actionButtonText}>Import Files</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Actions', { owner, repo })}
          >
            <Text style={styles.actionButtonText}>Actions</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setNewFileModalVisible(true)}
          >
            <Text style={styles.actionButtonText}>New File</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setNewFolderModalVisible(true)}
          >
            <Text style={styles.actionButtonText}>New Folder</Text>
          </TouchableOpacity>
        </View>
        {stagedCount > 0 && (
          <TouchableOpacity
            style={styles.stagedBanner}
            onPress={() => navigation.navigate('StagedChanges', { owner, repo, branch: branch || defaultBranch })}
          >
            <Text style={styles.stagedBannerText}>
              {stagedCount} staged change{stagedCount === 1 ? '' : 's'} - tap to review & commit
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.accent} />
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.sha || item.path}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.md }}
        />
      )}

      <Modal visible={branchModalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setBranchModalVisible(false)}
        >
          <View style={styles.branchList}>
            {branches.map((b) => (
              <TouchableOpacity
                key={b.name}
                style={styles.branchItem}
                onPress={() => {
                  setBranch(b.name);
                  setBranchModalVisible(false);
                }}
              >
                <Text style={styles.branchText}>{b.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={newFileModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.newFileCard}>
            <Text style={styles.modalTitle}>New File</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="filename.ext"
              placeholderTextColor={colors.fgSubtle}
              value={newFileName}
              onChangeText={setNewFileName}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setNewFileModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCreateButton} onPress={handleCreateFile}>
                <Text style={styles.modalCreateText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={newFolderModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.newFileCard}>
            <Text style={styles.modalTitle}>New Folder</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="folder-name"
              placeholderTextColor={colors.fgSubtle}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoCapitalize="none"
            />
            <Text style={styles.folderHint}>
              Git doesn't track empty folders - a .gitkeep placeholder file will be added inside.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setNewFolderModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCreateButton} onPress={handleCreateFolder}>
                <Text style={styles.modalCreateText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  actionBarWrap: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  stagedBanner: {
    backgroundColor: 'rgba(210,153,34,0.15)',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    alignItems: 'center',
  },
  stagedBannerText: { color: colors.warning, fontSize: typography.sizeSm, fontWeight: '600' },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  actionButtonText: { color: colors.accent, fontSize: typography.sizeSm, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomColor: colors.borderMuted,
    borderBottomWidth: 1,
  },
  icon: { fontSize: 18, marginRight: spacing.sm },
  name: { color: colors.fgDefault, flex: 1, fontSize: typography.sizeMd },
  size: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  centerBox: { alignItems: 'center', marginTop: spacing.xl },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  branchList: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.sm,
    minWidth: 200,
    maxHeight: 300,
  },
  branchItem: { padding: spacing.md },
  branchText: { color: colors.fgDefault },
  newFileCard: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.lg,
    width: '85%',
  },
  modalTitle: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700', marginBottom: spacing.md },
  modalInput: {
    backgroundColor: colors.bgInset,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.fgDefault,
    padding: spacing.md,
  },
  folderHint: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: spacing.sm, lineHeight: 16 },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalCancelButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  modalCancelText: { color: colors.fgMuted },
  modalCreateButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  modalCreateText: { color: '#fff', fontWeight: '600' },
});
