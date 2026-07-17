import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { listWorkflows, listBranches, triggerWorkflowDispatch } from '../services/github';
import { colors, spacing, typography } from '../theme';

export default function WorkflowDispatchScreen({ route, navigation }) {
  const { owner, repo } = route.params;
  const [workflows, setWorkflows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [inputRows, setInputRows] = useState([]); // [{key, value}]
  const [triggering, setTriggering] = useState(false);

  navigation.setOptions({ title: 'Run Workflow' });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [wfData, branchData] = await Promise.all([
        listWorkflows(owner, repo),
        listBranches(owner, repo),
      ]);
      const active = (wfData.workflows || []).filter((w) => w.state === 'active');
      setWorkflows(active);
      setBranches(branchData);
      if (active.length > 0) setSelectedWorkflow(active[0]);
      const defaultBranch = branchData.find((b) => b.name === 'main' || b.name === 'master');
      if (defaultBranch) setSelectedBranch(defaultBranch.name);
      else if (branchData.length > 0) setSelectedBranch(branchData[0].name);
    } catch (e) {
      setError(e.message || 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    load();
  }, [load]);

  const addInputRow = () => setInputRows((prev) => [...prev, { key: '', value: '' }]);
  const updateInputRow = (idx, field, val) => {
    setInputRows((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: val } : row)));
  };
  const removeInputRow = (idx) => setInputRows((prev) => prev.filter((_, i) => i !== idx));

  const handleTrigger = async () => {
    if (!selectedWorkflow) {
      Alert.alert('No workflow selected', 'Choose a workflow to run.');
      return;
    }
    const inputs = {};
    for (const row of inputRows) {
      if (row.key.trim()) inputs[row.key.trim()] = row.value;
    }
    setTriggering(true);
    try {
      await triggerWorkflowDispatch(owner, repo, selectedWorkflow.id, selectedBranch, inputs);
      Alert.alert('Triggered', `${selectedWorkflow.name} was queued on ${selectedBranch}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert(
        'Failed to trigger',
        e.message +
          '\n\nNote: the workflow file must contain a "workflow_dispatch:" trigger for this to work.'
      );
    } finally {
      setTriggering(false);
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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.label}>Workflow</Text>
      {workflows.length === 0 ? (
        <Text style={styles.emptyText}>No active workflows found in this repo.</Text>
      ) : (
        <View style={styles.chipRow}>
          {workflows.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={[styles.chip, selectedWorkflow?.id === w.id && styles.chipActive]}
              onPress={() => setSelectedWorkflow(w)}
            >
              <Text style={[styles.chipText, selectedWorkflow?.id === w.id && styles.chipTextActive]} numberOfLines={1}>
                {w.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.label}>Branch</Text>
      <View style={styles.chipRow}>
        {branches.map((b) => (
          <TouchableOpacity
            key={b.name}
            style={[styles.chip, selectedBranch === b.name && styles.chipActive]}
            onPress={() => setSelectedBranch(b.name)}
          >
            <Text style={[styles.chipText, selectedBranch === b.name && styles.chipTextActive]}>{b.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputsHeader}>
        <Text style={styles.label}>Inputs (optional)</Text>
        <TouchableOpacity onPress={addInputRow}>
          <Text style={styles.addLink}>+ Add input</Text>
        </TouchableOpacity>
      </View>
      {inputRows.map((row, idx) => (
        <View key={idx} style={styles.inputRow}>
          <TextInput
            style={[styles.inputField, { flex: 1 }]}
            placeholder="key"
            placeholderTextColor={colors.fgSubtle}
            value={row.key}
            onChangeText={(t) => updateInputRow(idx, 'key', t)}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.inputField, { flex: 1.5 }]}
            placeholder="value"
            placeholderTextColor={colors.fgSubtle}
            value={row.value}
            onChangeText={(t) => updateInputRow(idx, 'value', t)}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => removeInputRow(idx)} style={styles.removeButton}>
            <Text style={styles.removeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity
        style={[styles.triggerButton, triggering && styles.triggerButtonDisabled]}
        onPress={handleTrigger}
        disabled={triggering || !selectedWorkflow}
      >
        {triggering ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.triggerButtonText}>Trigger Run</Text>
        )}
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
  emptyText: { color: colors.fgSubtle, marginBottom: spacing.md },
  label: { color: colors.fgMuted, fontSize: typography.sizeSm, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderColor: colors.border, borderWidth: 1, borderRadius: 20,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, maxWidth: 220,
  },
  chipActive: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  chipText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  inputsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg },
  addLink: { color: colors.accent, fontSize: typography.sizeSm },
  inputRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, alignItems: 'center' },
  inputField: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, padding: spacing.sm, color: colors.fgDefault, fontSize: typography.sizeSm,
  },
  removeButton: { padding: spacing.sm },
  removeButtonText: { color: colors.danger },
  triggerButton: {
    backgroundColor: colors.successEmphasis, borderRadius: 10,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl,
  },
  triggerButtonDisabled: { opacity: 0.6 },
  triggerButtonText: { color: '#fff', fontWeight: '700', fontSize: typography.sizeMd },
});
