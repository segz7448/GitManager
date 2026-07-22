import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Linking, FlatList, Modal, TextInput } from 'react-native';
import {
  isRepoStarred,
  starRepo,
  unstarRepo,
  getRepoSubscription,
  setRepoSubscription,
  deleteRepoSubscription,
  listCollaborators,
  addCollaborator,
  removeCollaborator,
  listWebhooks,
  createWebhook,
  deleteWebhook,
  pingWebhook,
} from '../services/github';
import { colors, spacing, typography } from '../theme';

export default function RepoGitHubScreen({ route, navigation }) {
  const { owner, repo } = route.params;
  const [starred, setStarred] = useState(null);
  const [starLoading, setStarLoading] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [watchLoading, setWatchLoading] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [collabModalVisible, setCollabModalVisible] = useState(false);
  const [newCollabUsername, setNewCollabUsername] = useState('');
  const [addingCollab, setAddingCollab] = useState(false);
  const [webhooks, setWebhooks] = useState([]);
  const [webhookModalVisible, setWebhookModalVisible] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookSecret, setNewWebhookSecret] = useState('');
  const [addingWebhook, setAddingWebhook] = useState(false);
  const [pingingId, setPingingId] = useState(null);

  navigation.setOptions({ title: 'GitHub Management' });

  const refresh = useCallback(async () => {
    isRepoStarred(owner, repo).then(setStarred).catch(() => setStarred(false));
    getRepoSubscription(owner, repo).then(setSubscription).catch(() => {});
    listCollaborators(owner, repo).then(setCollaborators).catch(() => setCollaborators([]));
    listWebhooks(owner, repo).then(setWebhooks).catch(() => setWebhooks([]));
  }, [owner, repo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleToggleStar = async () => {
    setStarLoading(true);
    try {
      if (starred) {
        await unstarRepo(owner, repo);
        setStarred(false);
      } else {
        await starRepo(owner, repo);
        setStarred(true);
      }
    } catch (e) {
      Alert.alert('Failed to update star', e.message);
    } finally {
      setStarLoading(false);
    }
  };

  const handleSetWatch = async (mode) => {
    // mode: 'watching' | 'ignoring' | 'not-watching' (default participating-only)
    setWatchLoading(true);
    try {
      if (mode === 'not-watching') {
        await deleteRepoSubscription(owner, repo);
        setSubscription({ subscribed: false, ignored: false });
      } else if (mode === 'watching') {
        const sub = await setRepoSubscription(owner, repo, { subscribed: true, ignored: false });
        setSubscription(sub);
      } else {
        const sub = await setRepoSubscription(owner, repo, { subscribed: false, ignored: true });
        setSubscription(sub);
      }
    } catch (e) {
      Alert.alert('Failed to update watch setting', e.message);
    } finally {
      setWatchLoading(false);
    }
  };

  const handleAddCollaborator = async () => {
    const username = newCollabUsername.trim();
    if (!username) return;
    setAddingCollab(true);
    try {
      await addCollaborator(owner, repo, username, 'push');
      setNewCollabUsername('');
      Alert.alert('Invited', `${username} was invited as a collaborator (they'll need to accept the invitation).`);
      refresh();
    } catch (e) {
      Alert.alert('Failed to add collaborator', e.message);
    } finally {
      setAddingCollab(false);
    }
  };

  const handleRemoveCollaborator = (username) => {
    Alert.alert('Remove collaborator?', `Remove ${username}'s access to this repository?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeCollaborator(owner, repo, username);
            refresh();
          } catch (e) {
            Alert.alert('Failed to remove collaborator', e.message);
          }
        },
      },
    ]);
  };

  const handleAddWebhook = async () => {
    const url = newWebhookUrl.trim();
    if (!url) return;
    setAddingWebhook(true);
    try {
      await createWebhook(owner, repo, { url, secret: newWebhookSecret.trim() || undefined });
      setNewWebhookUrl('');
      setNewWebhookSecret('');
      setWebhookModalVisible(false);
      refresh();
      Alert.alert('Added', 'Webhook created. It will fire on pushes to this repo.');
    } catch (e) {
      Alert.alert('Failed to add webhook', e.message);
    } finally {
      setAddingWebhook(false);
    }
  };

  const handlePingWebhook = async (hook) => {
    setPingingId(hook.id);
    try {
      await pingWebhook(owner, repo, hook.id);
      Alert.alert('Ping sent', 'Check the webhook\'s "Recent Deliveries" on github.com to confirm it was received.');
    } catch (e) {
      Alert.alert('Failed to ping webhook', e.message);
    } finally {
      setPingingId(null);
    }
  };

  const handleDeleteWebhook = (hook) => {
    Alert.alert('Delete this webhook?', `Remove the webhook pointing to ${hook.config?.url}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWebhook(owner, repo, hook.id);
            refresh();
          } catch (e) {
            Alert.alert('Failed to delete webhook', e.message);
          }
        },
      },
    ]);
  };

  const watchMode = subscription?.subscribed ? 'watching' : subscription?.ignored ? 'ignoring' : 'not-watching';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.sectionTitle}>Issues & discussion</Text>
      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('RepoIssues', { owner, repo })}>
        <Text style={styles.rowText}>Issues</Text>
        <Text style={styles.rowArrow}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.row}
        onPress={() => Linking.openURL(`https://github.com/${owner}/${repo}/discussions`)}
      >
        <Text style={styles.rowText}>Discussions (opens on github.com)</Text>
        <Text style={styles.rowArrow}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.row}
        onPress={() => Linking.openURL(`https://github.com/${owner}/${repo}/projects`)}
      >
        <Text style={styles.rowText}>Project boards (opens on github.com)</Text>
        <Text style={styles.rowArrow}>›</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Star & watch</Text>
      <TouchableOpacity style={styles.row} onPress={handleToggleStar} disabled={starLoading || starred === null}>
        {starLoading || starred === null ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <Text style={styles.rowText}>{starred ? '★ Starred (tap to unstar)' : '☆ Star this repository'}</Text>
        )}
      </TouchableOpacity>

      <View style={styles.watchOptionsRow}>
        {[
          { key: 'watching', label: 'Watching' },
          { key: 'not-watching', label: 'Participating only' },
          { key: 'ignoring', label: 'Ignoring' },
        ].map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.watchChip, watchMode === opt.key && styles.watchChipActive]}
            onPress={() => handleSetWatch(opt.key)}
            disabled={watchLoading}
          >
            <Text style={[styles.watchChipText, watchMode === opt.key && styles.watchChipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Collaborators</Text>
      <TouchableOpacity style={styles.row} onPress={() => setCollabModalVisible(true)}>
        <Text style={styles.rowText}>+ Add collaborator</Text>
      </TouchableOpacity>
      <FlatList
        data={collaborators}
        keyExtractor={(c) => String(c.id)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.collabRow}>
            <Text style={styles.collabName}>{item.login}</Text>
            <Text style={styles.collabRole}>{item.role_name || (item.permissions?.admin ? 'admin' : '')}</Text>
            <TouchableOpacity onPress={() => handleRemoveCollaborator(item.login)}>
              <Text style={styles.collabRemove}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No collaborators found (or you may not have permission to view them).</Text>}
      />

      <Modal visible={collabModalVisible} transparent animationType="fade" onRequestClose={() => setCollabModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add collaborator</Text>
            <TextInput
              style={styles.input}
              placeholder="GitHub username"
              placeholderTextColor={colors.fgSubtle}
              value={newCollabUsername}
              onChangeText={setNewCollabUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setCollabModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={handleAddCollaborator} disabled={addingCollab}>
                {addingCollab ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmButtonText}>Invite</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Text style={styles.sectionTitle}>Webhooks</Text>
      <TouchableOpacity style={styles.row} onPress={() => setWebhookModalVisible(true)}>
        <Text style={styles.rowText}>+ Add webhook</Text>
      </TouchableOpacity>
      <FlatList
        data={webhooks}
        keyExtractor={(w) => String(w.id)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.webhookRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.webhookUrl} numberOfLines={1}>{item.config?.url}</Text>
              <Text style={styles.webhookMeta}>
                {(item.events || []).join(', ')} · {item.active ? 'active' : 'disabled'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => handlePingWebhook(item)} disabled={pingingId === item.id} style={{ marginRight: spacing.md }}>
              {pingingId === item.id ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.webhookPing}>Ping</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteWebhook(item)}>
              <Text style={styles.collabRemove}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No webhooks configured (or you may not have permission to view them).</Text>}
      />

      <Modal visible={webhookModalVisible} transparent animationType="fade" onRequestClose={() => setWebhookModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add webhook</Text>
            <TextInput
              style={styles.input}
              placeholder="https://example.com/webhook"
              placeholderTextColor={colors.fgSubtle}
              value={newWebhookUrl}
              onChangeText={setNewWebhookUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TextInput
              style={[styles.input, { marginTop: spacing.sm }]}
              placeholder="Secret (optional)"
              placeholderTextColor={colors.fgSubtle}
              value={newWebhookSecret}
              onChangeText={setNewWebhookSecret}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text style={styles.webhookHint}>Fires on pushes to this repo, sent as JSON.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setWebhookModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={handleAddWebhook} disabled={addingWebhook || !newWebhookUrl.trim()}>
                {addingWebhook ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmButtonText}>Add</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  sectionTitle: { color: colors.fgSubtle, fontSize: typography.sizeSm, fontWeight: '700', textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  rowText: { color: colors.fgDefault, fontSize: typography.sizeSm, flex: 1 },
  rowArrow: { color: colors.fgSubtle, fontSize: typography.sizeLg },
  watchOptionsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  watchChip: { flex: 1, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: spacing.sm, alignItems: 'center' },
  watchChipActive: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  watchChipText: { color: colors.fgMuted, fontSize: 11 },
  watchChipTextActive: { color: '#fff', fontWeight: '600' },
  collabRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  collabName: { color: colors.fgDefault, fontSize: typography.sizeSm, flex: 1 },
  collabRole: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginRight: spacing.md },
  collabRemove: { color: colors.danger, fontSize: typography.sizeSm, fontWeight: '600' },
  webhookRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  webhookUrl: { color: colors.fgDefault, fontSize: typography.sizeSm, fontFamily: typography.mono },
  webhookMeta: { color: colors.fgSubtle, fontSize: 11, marginTop: 2 },
  webhookPing: { color: colors.accent, fontSize: typography.sizeSm, fontWeight: '600' },
  webhookHint: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: spacing.sm },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: colors.bgSubtle, borderRadius: 12, borderColor: colors.border, borderWidth: 1, padding: spacing.lg, width: '85%' },
  modalTitle: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700', marginBottom: spacing.md },
  input: {
    color: colors.fgDefault, borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  cancelButtonText: { color: colors.fgMuted },
  confirmButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.accentEmphasis },
  confirmButtonText: { color: '#fff', fontWeight: '600' },
});
