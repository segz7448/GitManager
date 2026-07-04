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

  useEffect(() => {
    loadRepo();
    loadSecrets();
    loadVariables();
  }, [loadRepo, loadSecrets, loadVariables]);

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
