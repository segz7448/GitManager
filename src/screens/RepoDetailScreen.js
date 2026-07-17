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
import { getContents, deleteFile, createOrUpdateFile, listBranches, commitMultipleFiles, getRepo, renameOrMoveFile, renameOrMoveFolder, duplicateFile, getRepoTreeRecursive } from '../services/github';
import { useStaging } from '../context/StagingContext';
import { colors, spacing, typography } from '../theme';
import FileRow from '../components/FileRow';
import BranchManagerModal from '../components/BranchManagerModal';
import FileActionsModal from '../components/FileActionsModal';
import { saveRepoListing, getCachedRepoListing } from '../db/repoCache';

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

  const [fileActionsItem, setFileActionsItem] = useState(null);
  const [fileActionsBusy, setFileActionsBusy] = useState(false);

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

  const [cacheNotice, setCacheNotice] = useState(null);

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
      setCacheNotice(null);
      saveRepoListing(owner, repo, branch, path, sorted).catch(() => {});
    } catch (e) {
      // No network / rate-limited / GitHub down: fall back to the last
      // successfully cached listing for this exact repo+branch+path
      // instead of showing a blank error screen with no way to browse.
      const cached = await getCachedRepoListing(owner, repo, branch, path);
      if (cached) {
        setItems(cached.data);
        setCacheNotice(cached.cachedAt);
      } else {
        setError(e.message || 'Failed to load contents');
      }
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

  const refreshBranches = useCallback(() => {
    return listBranches(owner, repo).then(setBranches).catch(() => {});
  }, [owner, repo]);

  useEffect(() => {
    refreshBranches();
    getRepo(owner, repo).then((r) => setDefaultBranch(r.default_branch)).catch(() => {});
  }, [owner, repo, refreshBranches]);

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
            setFileActionsItem(null);
            load();
          } catch (e) {
            Alert.alert('Delete failed', e.message);
          }
        },
      },
    ]);
  };

  const handleRenameOrMove = async (item, newPath) => {
    setFileActionsBusy(true);
    try {
      if (item.type === 'dir') {
        // Folders have no single sha - gather every blob currently under
        // this prefix so we can rewrite each path in one commit.
        const tree = await getRepoTreeRecursive(owner, repo, branch || defaultBranch);
        const prefix = item.path.endsWith('/') ? item.path : `${item.path}/`;
        const entries = (tree.tree || []).filter((t) => t.type === 'blob' && t.path.startsWith(prefix));
        if (entries.length === 0) {
          Alert.alert('Nothing to move', 'This folder appears to be empty (or only contains subfolders GitHub doesn\'t track separately).');
          return;
        }
        await renameOrMoveFolder(owner, repo, branch || defaultBranch, item.path, newPath, entries);
      } else {
        await renameOrMoveFile(owner, repo, branch || defaultBranch, item.path, newPath, item.sha);
      }
      setFileActionsItem(null);
      load();
      Alert.alert('Done', `Renamed/moved to "${newPath}".`);
    } catch (e) {
      Alert.alert('Rename/move failed', e.message);
    } finally {
      setFileActionsBusy(false);
    }
  };

  const handleDuplicate = async (item, destPath) => {
    setFileActionsBusy(true);
    try {
      await duplicateFile(owner, repo, branch || defaultBranch, item.path, destPath, item.sha);
      setFileActionsItem(null);
      load();
      Alert.alert('Duplicated', `Created a copy at "${destPath}".`);
    } catch (e) {
      Alert.alert('Duplicate failed', e.message);
    } finally {
      setFileActionsBusy(false);
    }
  };

  const handleCompareRemote = (item) => {
    setFileActionsItem(null);
    navigation.navigate('CompareRemote', { owner, repo, path: item.path, branch: branch || defaultBranch });
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
    <FileRow
      item={item}
      owner={owner}
      repo={repo}
      branch={branch}
      onPress={() => handleItemPress(item)}
      onLongPress={() => setFileActionsItem(item)}
    />
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
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('PullRequests', { owner, repo })}
          >
            <Text style={styles.actionButtonText}>Pull Requests</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Releases', { owner, repo })}
          >
            <Text style={styles.actionButtonText}>Releases</Text>
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
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('RepoSafety', { owner, repo, branch: branch || defaultBranch })}
          >
            <Text style={styles.actionButtonText}>Safety</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('GitTools', { owner, repo, branch: branch || defaultBranch, defaultBranch })}
          >
            <Text style={styles.actionButtonText}>Git Tools</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('RepoGitHub', { owner, repo })}
          >
            <Text style={styles.actionButtonText}>GitHub</Text>
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
        <>
          {cacheNotice && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineBannerText}>
                Showing cached data from {new Date(cacheNotice).toLocaleString()} - couldn't reach GitHub.
              </Text>
              <TouchableOpacity onPress={load}>
                <Text style={styles.offlineBannerRetry}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          <FlatList
            data={items}
            keyExtractor={(item) => item.sha || item.path}
            renderItem={renderItem}
            contentContainerStyle={{ padding: spacing.md }}
          />
        </>
      )}

      <BranchManagerModal
        visible={branchModalVisible}
        onClose={() => setBranchModalVisible(false)}
        owner={owner}
        repo={repo}
        branches={branches}
        currentBranch={branch || defaultBranch}
        defaultBranch={defaultBranch}
        onSwitch={setBranch}
        onBranchesChanged={refreshBranches}
      />

      <FileActionsModal
        visible={!!fileActionsItem}
        onClose={() => setFileActionsItem(null)}
        item={fileActionsItem}
        busy={fileActionsBusy}
        onRename={handleRenameOrMove}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onCompare={handleCompareRemote}
      />

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
  offlineBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(88,166,255,0.12)',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  offlineBannerText: { color: colors.fgMuted, fontSize: typography.sizeSm, flex: 1, marginRight: spacing.sm },
  offlineBannerRetry: { color: colors.accent, fontWeight: '600', fontSize: typography.sizeSm },
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
