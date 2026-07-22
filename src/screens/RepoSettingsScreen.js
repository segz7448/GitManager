import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import {
  getRepo,
  updateRepo,
  deleteRepo,
  transferRepo,
  getBranchProtection,
  setBranchProtection,
  deleteBranchProtection,
  getRepoSecretsPublicKey,
  listRepoSecrets,
  createOrUpdateRepoSecret,
  deleteRepoSecret,
  listRepoVariables,
  createRepoVariable,
  updateRepoVariable,
  deleteRepoVariable,
} from '../services/github';
import { encryptSecretValue } from '../utils/secretEncryption';
import { colors, spacing, typography } from '../theme';

export default function RepoSettingsScreen({ route, navigation }) {
  const { owner, repo } = route.params;

  const [repoData, setRepoData] = useState(null);
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);

  const [secrets, setSecrets] = useState([]);
  const [variables, setVariables] = useState([]);
  const [secretsLoading, setSecretsLoading] = useState(true);
  const [variablesLoading, setVariablesLoading] = useState(true);

  const [secretModalVisible, setSecretModalVisible] = useState(false);
  const [newSecretName, setNewSecretName] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');
  const [savingSecret, setSavingSecret] = useState(false);

  const [variableModalVisible, setVariableModalVisible] = useState(false);
  const [editingVariable, setEditingVariable] = useState(null); // null = new
  const [newVariableName, setNewVariableName] = useState('');
  const [newVariableValue, setNewVariableValue] = useState('');
  const [savingVariable, setSavingVariable] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferUsername, setTransferUsername] = useState('');
  const [transferring, setTransferring] = useState(false);

  const [protection, setProtection] = useState(null); // null = none configured
  const [protectionLoading, setProtectionLoading] = useState(true);
  const [protectionSaving, setProtectionSaving] = useState(false);
  const [requireReviews, setRequireReviews] = useState(false);
  const [approvalCount, setApprovalCount] = useState(1);
  const [enforceAdmins, setEnforceAdmins] = useState(false);
  const [requireStatusChecks, setRequireStatusChecks] = useState(false);

  navigation.setOptions({ title: `Settings · ${repo}` });

  const loadRepo = useCallback(async () => {
    try {
      const data = await getRepo(owner, repo);
      setRepoData(data);
      setDescription(data.description || '');
      setIsPrivate(data.private);
    } catch (e) {
      Alert.alert('Failed to load repo', e.message);
    } finally {
      setLoading(false);
    }
  }, [owner, repo]);

  const loadSecrets = useCallback(async () => {
    setSecretsLoading(true);
    try {
      const data = await listRepoSecrets(owner, repo);
      setSecrets(data.secrets || []);
    } catch (e) {
      // secrets require admin access - fail quietly with empty list
      setSecrets([]);
    } finally {
      setSecretsLoading(false);
    }
  }, [owner, repo]);

  const loadVariables = useCallback(async () => {
    setVariablesLoading(true);
    try {
      const data = await listRepoVariables(owner, repo);
      setVariables(data.variables || []);
    } catch (e) {
      setVariables([]);
    } finally {
      setVariablesLoading(false);
    }
  }, [owner, repo]);

  const loadProtection = useCallback(async (branch) => {
    setProtectionLoading(true);
    try {
      const data = await getBranchProtection(owner, repo, branch);
      setProtection(data);
      if (data) {
        setRequireReviews(!!data.required_pull_request_reviews);
        setApprovalCount(data.required_pull_request_reviews?.required_approving_review_count || 1);
        setEnforceAdmins(!!data.enforce_admins?.enabled);
        setRequireStatusChecks(!!data.required_status_checks);
      } else {
        setRequireReviews(false);
        setApprovalCount(1);
        setEnforceAdmins(false);
        setRequireStatusChecks(false);
      }
    } catch (e) {
      // Reading protection can 403 for users without admin access to the
      // repo - treat that the same as "unknown", not a hard error, since
      // the rest of the settings screen is still usable.
      setProtection(null);
    } finally {
      setProtectionLoading(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    loadRepo();
    loadSecrets();
    loadVariables();
  }, [loadRepo, loadSecrets, loadVariables]);

  useEffect(() => {
    if (repoData?.default_branch) {
      loadProtection(repoData.default_branch);
    }
  }, [repoData?.default_branch, loadProtection]);

  const handleToggleVisibility = async () => {
    const newValue = !isPrivate;
    Alert.alert(
      newValue ? 'Make private?' : 'Make public?',
      newValue
        ? 'Only you and people you explicitly grant access will be able to see this repo.'
        : 'Anyone on the internet will be able to see this repo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setSavingVisibility(true);
            try {
              await updateRepo(owner, repo, { private: newValue });
              setIsPrivate(newValue);
            } catch (e) {
              Alert.alert('Failed to update visibility', e.message);
            } finally {
              setSavingVisibility(false);
            }
          },
        },
      ]
    );
  };

  const handleSaveDescription = async () => {
    setSavingDescription(true);
    try {
      await updateRepo(owner, repo, { description });
    } catch (e) {
      Alert.alert('Failed to update description', e.message);
    } finally {
      setSavingDescription(false);
    }
  };

  const handleAddSecret = async () => {
    if (!newSecretName.trim() || !newSecretValue) {
      Alert.alert('Missing fields', 'Enter both a name and a value.');
      return;
    }
    setSavingSecret(true);
    try {
      const { key, key_id } = await getRepoSecretsPublicKey(owner, repo);
      const encrypted = encryptSecretValue(newSecretValue, key);
      await createOrUpdateRepoSecret(owner, repo, newSecretName.trim().toUpperCase(), encrypted, key_id);
      setSecretModalVisible(false);
      setNewSecretName('');
      setNewSecretValue('');
      loadSecrets();
    } catch (e) {
      Alert.alert('Failed to save secret', e.message);
    } finally {
      setSavingSecret(false);
    }
  };

  const handleDeleteSecret = (name) => {
    Alert.alert('Delete secret', `Delete "${name}"? Workflows using it will fail until replaced.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRepoSecret(owner, repo, name);
            loadSecrets();
          } catch (e) {
            Alert.alert('Failed to delete', e.message);
          }
        },
      },
    ]);
  };

  const openNewVariableModal = () => {
    setEditingVariable(null);
    setNewVariableName('');
    setNewVariableValue('');
    setVariableModalVisible(true);
  };

  const openEditVariableModal = (variable) => {
    setEditingVariable(variable);
    setNewVariableName(variable.name);
    setNewVariableValue(variable.value);
    setVariableModalVisible(true);
  };

  const handleSaveVariable = async () => {
    if (!newVariableName.trim()) {
      Alert.alert('Missing name', 'Enter a variable name.');
      return;
    }
    setSavingVariable(true);
    try {
      if (editingVariable) {
        await updateRepoVariable(owner, repo, editingVariable.name, newVariableValue);
      } else {
        await createRepoVariable(owner, repo, newVariableName.trim().toUpperCase(), newVariableValue);
      }
      setVariableModalVisible(false);
      loadVariables();
    } catch (e) {
      Alert.alert('Failed to save variable', e.message);
    } finally {
      setSavingVariable(false);
    }
  };

  const handleDeleteVariable = (name) => {
    Alert.alert('Delete variable', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRepoVariable(owner, repo, name);
            loadVariables();
          } catch (e) {
            Alert.alert('Failed to delete', e.message);
          }
        },
      },
    ]);
  };

  const handleSaveProtection = async () => {
    if (!repoData?.default_branch) return;
    setProtectionSaving(true);
    try {
      await setBranchProtection(owner, repo, repoData.default_branch, {
        requireReviews,
        requiredApprovingReviewCount: approvalCount,
        enforceAdmins,
        requireStatusChecks,
        // Preserve any existing required status check contexts rather
        // than silently clearing them just because this simplified UI
        // doesn't have a context picker.
        statusCheckContexts: protection?.required_status_checks?.contexts || [],
        strictStatusChecks: protection?.required_status_checks?.strict ?? true,
      });
      Alert.alert('Saved', `Branch protection updated for "${repoData.default_branch}".`);
      loadProtection(repoData.default_branch);
    } catch (e) {
      Alert.alert('Failed to save branch protection', e.message);
    } finally {
      setProtectionSaving(false);
    }
  };

  const handleRemoveProtection = () => {
    if (!repoData?.default_branch) return;
    Alert.alert(
      'Remove branch protection?',
      `This removes all protection rules from "${repoData.default_branch}", including required reviews and status checks.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setProtectionSaving(true);
            try {
              await deleteBranchProtection(owner, repo, repoData.default_branch);
              setProtection(null);
              setRequireReviews(false);
              setEnforceAdmins(false);
              setRequireStatusChecks(false);
              Alert.alert('Removed', `Branch protection removed from "${repoData.default_branch}".`);
            } catch (e) {
              Alert.alert('Failed to remove branch protection', e.message);
            } finally {
              setProtectionSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteRepo = () => {
    Alert.alert(
      'Delete this repository?',
      `"${owner}/${repo}" and all of its issues, pull requests, releases, and history will be permanently deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteRepo(owner, repo);
              navigation.navigate('RepoList');
            } catch (e) {
              Alert.alert('Failed to delete repository', e.message);
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleTransferRepo = async () => {
    const newOwner = transferUsername.trim();
    if (!newOwner) return;
    setTransferring(true);
    try {
      await transferRepo(owner, repo, newOwner);
      setTransferModalVisible(false);
      setTransferUsername('');
      Alert.alert(
        'Transfer requested',
        `A transfer request was sent for "${owner}/${repo}" to "${newOwner}". If "${newOwner}" is a personal account, they need to accept it by email within 24 hours before the transfer actually completes.`
      );
      navigation.navigate('RepoList');
    } catch (e) {
      Alert.alert('Failed to transfer repository', e.message);
    } finally {
      setTransferring(false);
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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.sectionLabel}>General</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          style={styles.textInput}
          value={description}
          onChangeText={setDescription}
          onBlur={handleSaveDescription}
          placeholder="Repository description"
          placeholderTextColor={colors.fgSubtle}
        />
        {savingDescription && <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: spacing.xs }} />}

        <TouchableOpacity style={styles.toggleRow} onPress={handleToggleVisibility} disabled={savingVisibility}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Visibility</Text>
            <Text style={styles.fieldValue}>{isPrivate ? 'Private' : 'Public'}</Text>
          </View>
          {savingVisibility ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.toggleAction}>Change</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>Actions Secrets</Text>
        <TouchableOpacity onPress={() => setSecretModalVisible(true)}>
          <Text style={styles.addLink}>+ New secret</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hintText}>
        Values are encrypted on this device before being sent - GitHub never returns them again,
        so there's nothing to display here except the names.
      </Text>
      <View style={styles.card}>
        {secretsLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : secrets.length === 0 ? (
          <Text style={styles.emptyText}>No secrets yet.</Text>
        ) : (
          secrets.map((s) => (
            <View key={s.name} style={styles.itemRow}>
              <Text style={styles.itemName}>{s.name}</Text>
              <TouchableOpacity onPress={() => handleDeleteSecret(s.name)}>
                <Text style={styles.deleteLink}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>Actions Variables</Text>
        <TouchableOpacity onPress={openNewVariableModal}>
          <Text style={styles.addLink}>+ New variable</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        {variablesLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : variables.length === 0 ? (
          <Text style={styles.emptyText}>No variables yet.</Text>
        ) : (
          variables.map((v) => (
            <TouchableOpacity key={v.name} style={styles.itemRow} onPress={() => openEditVariableModal(v)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{v.name}</Text>
                <Text style={styles.itemValue} numberOfLines={1}>{v.value}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDeleteVariable(v.name)}>
                <Text style={styles.deleteLink}>Delete</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </View>

      <Text style={styles.sectionLabel}>
        Branch Protection {repoData?.default_branch ? `("${repoData.default_branch}")` : ''}
      </Text>
      {protectionLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginBottom: spacing.md }} />
      ) : (
        <View style={styles.protectionCard}>
          <TouchableOpacity style={styles.protectionRow} onPress={() => setRequireReviews((v) => !v)}>
            <View style={[styles.checkbox, requireReviews && styles.checkboxChecked]}>
              {requireReviews && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.protectionRowText}>Require pull request reviews before merging</Text>
          </TouchableOpacity>
          {requireReviews && (
            <View style={styles.approvalCountRow}>
              <Text style={styles.approvalCountLabel}>Required approvals:</Text>
              {[1, 2, 3].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.approvalChip, approvalCount === n && styles.approvalChipActive]}
                  onPress={() => setApprovalCount(n)}
                >
                  <Text style={[styles.approvalChipText, approvalCount === n && styles.approvalChipTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity style={styles.protectionRow} onPress={() => setRequireStatusChecks((v) => !v)}>
            <View style={[styles.checkbox, requireStatusChecks && styles.checkboxChecked]}>
              {requireStatusChecks && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.protectionRowText}>Require status checks to pass before merging</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.protectionRow} onPress={() => setEnforceAdmins((v) => !v)}>
            <View style={[styles.checkbox, enforceAdmins && styles.checkboxChecked]}>
              {enforceAdmins && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.protectionRowText}>Also enforce these rules for administrators</Text>
          </TouchableOpacity>

          <View style={styles.protectionActionsRow}>
            {protection && (
              <TouchableOpacity style={styles.protectionRemoveButton} onPress={handleRemoveProtection} disabled={protectionSaving}>
                <Text style={styles.protectionRemoveButtonText}>Remove protection</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.protectionSaveButton} onPress={handleSaveProtection} disabled={protectionSaving}>
              {protectionSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.protectionSaveButtonText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.sectionLabel}>Danger Zone</Text>
      <View style={styles.dangerCard}>
        <View style={styles.dangerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dangerRowTitle}>Transfer ownership</Text>
            <Text style={styles.dangerRowDetail}>Move this repo to another user or organization.</Text>
          </View>
          <TouchableOpacity style={styles.dangerButtonOutline} onPress={() => setTransferModalVisible(true)}>
            <Text style={styles.dangerButtonOutlineText}>Transfer</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.dangerRow, styles.dangerRowLast]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dangerRowTitle}>Delete this repository</Text>
            <Text style={styles.dangerRowDetail}>Permanently deletes {owner}/{repo} and everything in it.</Text>
          </View>
          <TouchableOpacity style={styles.dangerButtonFilled} onPress={handleDeleteRepo} disabled={deleting}>
            {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.dangerButtonFilledText}>Delete</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* New secret modal */}
      <Modal visible={secretModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Secret</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="SECRET_NAME"
              placeholderTextColor={colors.fgSubtle}
              value={newSecretName}
              onChangeText={setNewSecretName}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Value"
              placeholderTextColor={colors.fgSubtle}
              value={newSecretValue}
              onChangeText={setNewSecretValue}
              secureTextEntry
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setSecretModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={handleAddSecret} disabled={savingSecret}>
                {savingSecret ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* New/edit variable modal */}
      <Modal visible={variableModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingVariable ? 'Edit Variable' : 'New Variable'}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="VARIABLE_NAME"
              placeholderTextColor={colors.fgSubtle}
              value={newVariableName}
              onChangeText={setNewVariableName}
              autoCapitalize="characters"
              editable={!editingVariable}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Value"
              placeholderTextColor={colors.fgSubtle}
              value={newVariableValue}
              onChangeText={setNewVariableValue}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setVariableModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={handleSaveVariable} disabled={savingVariable}>
                {savingVariable ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Transfer ownership modal */}
      <Modal visible={transferModalVisible} animationType="slide" transparent onRequestClose={() => setTransferModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Transfer Ownership</Text>
            <Text style={styles.transferHint}>
              Enter the username or organization to transfer {owner}/{repo} to. If it's a personal
              account, they'll need to accept a confirmation email within 24 hours.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="new-owner-username"
              placeholderTextColor={colors.fgSubtle}
              value={transferUsername}
              onChangeText={setTransferUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setTransferModalVisible(false);
                  setTransferUsername('');
                }}
                disabled={transferring}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDangerButton}
                onPress={handleTransferRepo}
                disabled={transferring || !transferUsername.trim()}
              >
                {transferring ? <ActivityIndicator color="#fff" /> : <Text style={styles.dangerButtonFilledText}>Transfer</Text>}
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
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { color: colors.fgMuted, fontSize: typography.sizeSm, textTransform: 'uppercase', marginBottom: spacing.sm, marginTop: spacing.md },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addLink: { color: colors.accent, fontSize: typography.sizeSm },
  hintText: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginBottom: spacing.sm, lineHeight: 16 },
  card: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.md,
  },
  fieldLabel: { color: colors.fgMuted, fontSize: typography.sizeSm },
  fieldValue: { color: colors.fgDefault, fontSize: typography.sizeMd, marginTop: 2 },
  textInput: {
    backgroundColor: colors.bgInset, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, padding: spacing.sm, color: colors.fgDefault, marginTop: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.md,
    paddingTop: spacing.md, borderTopColor: colors.borderMuted, borderTopWidth: 1,
  },
  toggleAction: { color: colors.accent, fontSize: typography.sizeSm, fontWeight: '600' },
  emptyText: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomColor: colors.borderMuted, borderBottomWidth: 1,
  },
  itemName: { color: colors.fgDefault, fontFamily: typography.mono, fontSize: typography.sizeSm },
  itemValue: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 2 },
  deleteLink: { color: colors.danger, fontSize: typography.sizeSm },
  protectionCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.md,
  },
  protectionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  protectionRowText: { color: colors.fgDefault, fontSize: typography.sizeSm, flex: 1 },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border,
    marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  checkboxTick: { color: '#fff', fontSize: 13, fontWeight: '700' },
  approvalCountRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.xl, paddingBottom: spacing.sm, gap: spacing.sm },
  approvalCountLabel: { color: colors.fgMuted, fontSize: typography.sizeSm },
  approvalChip: { width: 28, height: 28, borderRadius: 14, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  approvalChipActive: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  approvalChipText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  approvalChipTextActive: { color: '#fff', fontWeight: '700' },
  protectionActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  protectionRemoveButton: { flex: 1, padding: spacing.sm, alignItems: 'center', borderRadius: 8, borderColor: colors.danger, borderWidth: 1 },
  protectionRemoveButtonText: { color: colors.danger, fontSize: typography.sizeSm, fontWeight: '600' },
  protectionSaveButton: { flex: 1, padding: spacing.sm, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  protectionSaveButtonText: { color: '#fff', fontSize: typography.sizeSm, fontWeight: '700' },
  dangerCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.danger, borderWidth: 1,
    borderRadius: 10, marginBottom: spacing.md, overflow: 'hidden',
  },
  dangerRow: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md,
    borderBottomColor: colors.danger, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dangerRowLast: { borderBottomWidth: 0 },
  dangerRowTitle: { color: colors.fgDefault, fontSize: typography.sizeSm, fontWeight: '600' },
  dangerRowDetail: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 2 },
  dangerButtonOutline: {
    borderColor: colors.danger, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginLeft: spacing.sm,
  },
  dangerButtonOutlineText: { color: colors.danger, fontSize: typography.sizeSm, fontWeight: '600' },
  dangerButtonFilled: {
    backgroundColor: colors.danger, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginLeft: spacing.sm,
  },
  dangerButtonFilledText: { color: '#fff', fontSize: typography.sizeSm, fontWeight: '700' },
  modalDangerButton: {
    flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.danger,
  },
  transferHint: { color: colors.fgMuted, fontSize: typography.sizeSm, lineHeight: 18, marginBottom: spacing.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.bgSubtle, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: spacing.lg, borderColor: colors.border, borderWidth: 1,
  },
  modalTitle: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700', marginBottom: spacing.md },
  modalInput: {
    backgroundColor: colors.bgInset, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, color: colors.fgDefault, padding: spacing.md, marginBottom: spacing.sm,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalCancelButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  modalCancelText: { color: colors.fgMuted },
  modalSaveButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  modalSaveText: { color: '#fff', fontWeight: '600' },
});
