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
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  getRelease,
  deleteRelease,
  uploadReleaseAsset,
  deleteReleaseAsset,
  getToken,
} from '../services/github';
import { colors, spacing, typography } from '../theme';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function guessMimeType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const map = {
    apk: 'application/vnd.android.package-archive',
    zip: 'application/zip',
    txt: 'text/plain',
    json: 'application/json',
    pdf: 'application/pdf',
  };
  return map[ext] || 'application/octet-stream';
}

export default function ReleaseDetailScreen({ route, navigation }) {
  const { owner, repo, releaseId } = route.params;
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [uploading, setUploading] = useState(false);

  navigation.setOptions({ title: 'Release' });

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getRelease(owner, repo, releaseId);
      setRelease(data);
    } catch (e) {
      setError(e.message || 'Failed to load release');
    } finally {
      setLoading(false);
    }
  }, [owner, repo, releaseId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownloadAsset = async (asset) => {
    setDownloadingId(asset.id);
    setDownloadProgress('0%');
    try {
      const token = await getToken();
      const destUri = FileSystem.cacheDirectory + asset.name;

      const downloadResumable = FileSystem.createDownloadResumable(
        asset.url, // API url (not browser_download_url) - needed for private repos, requires Accept: octet-stream
        destUri,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/octet-stream',
          },
        },
        (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            const pct = Math.round((progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100);
            setDownloadProgress(`${pct}%`);
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result || result.status !== 200) {
        throw new Error(`Download failed with status ${result?.status ?? 'unknown'}`);
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(destUri, {
          mimeType: guessMimeType(asset.name),
          dialogTitle: asset.name.endsWith('.apk') ? 'Install APK' : 'Save file',
        });
      } else {
        Alert.alert('Downloaded', `Saved to ${destUri}`);
      }
    } catch (e) {
      Alert.alert('Download failed', e.message);
    } finally {
      setDownloadingId(null);
      setDownloadProgress('');
    }
  };

  const handleUploadAsset = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];

      setUploading(true);
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await uploadReleaseAsset(release.upload_url, asset.name, guessMimeType(asset.name), base64);
      load();
      Alert.alert('Uploaded', `${asset.name} was attached to this release.`);
    } catch (e) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAsset = (asset) => {
    Alert.alert('Delete asset', `Delete "${asset.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteReleaseAsset(owner, repo, asset.id);
            load();
          } catch (e) {
            Alert.alert('Failed to delete', e.message);
          }
        },
      },
    ]);
  };

  const handleDeleteRelease = () => {
    Alert.alert('Delete release', 'This cannot be undone. The git tag itself is not deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRelease(owner, repo, releaseId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Failed to delete', e.message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error || !release) {
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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.releaseName}>{release.name || release.tag_name}</Text>
      <Text style={styles.releaseMeta}>{release.tag_name} · {release.target_commitish}</Text>
      {!!release.body && <Text style={styles.releaseBody}>{release.body}</Text>}

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>Assets ({release.assets.length})</Text>
        <TouchableOpacity onPress={handleUploadAsset} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.addLink}>+ Upload</Text>
          )}
        </TouchableOpacity>
      </View>

      {release.assets.length === 0 ? (
        <Text style={styles.emptyText}>No assets attached to this release.</Text>
      ) : (
        release.assets.map((asset) => (
          <View key={asset.id} style={styles.assetCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.assetName} numberOfLines={1}>{asset.name}</Text>
              <Text style={styles.assetMeta}>{formatBytes(asset.size)} · {asset.download_count} downloads</Text>
            </View>
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => handleDownloadAsset(asset)}
              disabled={downloadingId === asset.id}
            >
              {downloadingId === asset.id ? (
                <Text style={styles.downloadButtonText}>{downloadProgress}</Text>
              ) : (
                <Text style={styles.downloadButtonText}>
                  {asset.name.endsWith('.apk') ? 'Install' : 'Download'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteAsset(asset)} style={{ marginLeft: spacing.sm }}>
              <Text style={styles.deleteLink}>✕</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <TouchableOpacity style={styles.deleteReleaseButton} onPress={handleDeleteRelease}>
        <Text style={styles.deleteReleaseButtonText}>Delete Release</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  releaseName: { color: colors.fgDefault, fontSize: typography.sizeXl, fontWeight: '700' },
  releaseMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 4 },
  releaseBody: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: spacing.md, lineHeight: 18 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionLabel: { color: colors.fgMuted, fontSize: typography.sizeSm, textTransform: 'uppercase' },
  addLink: { color: colors.accent, fontSize: typography.sizeSm },
  emptyText: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  assetCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  assetName: { color: colors.fgDefault, fontFamily: typography.mono, fontSize: typography.sizeSm },
  assetMeta: { color: colors.fgSubtle, fontSize: 11, marginTop: 2 },
  downloadButton: { backgroundColor: colors.successEmphasis, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  downloadButtonText: { color: '#fff', fontWeight: '600', fontSize: typography.sizeSm },
  deleteLink: { color: colors.danger, fontSize: typography.sizeMd },
  deleteReleaseButton: { borderColor: colors.danger, borderWidth: 1, borderRadius: 8, padding: spacing.md, alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl },
  deleteReleaseButtonText: { color: colors.danger, fontWeight: '600' },
});
