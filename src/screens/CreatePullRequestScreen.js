import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { listBranches, createPullRequest, getRepo } from '../services/github';
import { colors, spacing, typography } from '../theme';

export default function CreatePullRequestScreen({ route, navigation }) {
  const { owner, repo } = route.params;
  const [branches, setBranches] = useState([]);
  const [base, setBase] = useState(null);
  const [head, setHead] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  navigation.setOptions({ title: 'New Pull Request' });

  useEffect(() => {
    (async () => {
      try {
        const [branchData, repoData] = await Promise.all([listBranches(owner, repo), getRepo(owner, repo)]);
        setBranches(branchData);
        setBase(repoData.default_branch);
        const nonDefault = branchData.find((b) => b.name !== repoData.default_branch);
        if (nonDefault) setHead(nonDefault.name);
      } catch (e) {
        Alert.alert('Failed to load branches', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [owner, repo]);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Enter a title for this pull request.');
      return;
    }
    if (base === head) {
      Alert.alert('Invalid branches', 'Base and head branches must be different.');
      return;
    }
    setCreating(true);
    try {
      const pr = await createPullRequest(owner, repo, { title: title.trim(), head, base, body });
      Alert.alert('Created', `PR #${pr.number} was created.`, [
        {
          text: 'View',
          onPress: () => navigation.replace('PullRequestDetail', { owner, repo, pullNumber: pr.number }),
        },
      ]);
    } catch (e) {
      Alert.alert('Failed to create PR', e.message);
    } finally {
      setCreating(false);
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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.label}>Merge into (base)</Text>
      <View style={styles.chipRow}>
        {branches.map((b) => (
          <TouchableOpacity
            key={b.name}
            style={[styles.chip, base === b.name && styles.chipActive]}
            onPress={() => setBase(b.name)}
          >
            <Text style={[styles.chipText, base === b.name && styles.chipTextActive]}>{b.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>From (head)</Text>
      <View style={styles.chipRow}>
        {branches.map((b) => (
          <TouchableOpacity
            key={b.name}
            style={[styles.chip, head === b.name && styles.chipActive]}
            onPress={() => setHead(b.name)}
          >
            <Text style={[styles.chipText, head === b.name && styles.chipTextActive]}>{b.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder="Add a helpful title"
        placeholderTextColor={colors.fgSubtle}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Describe your changes"
        placeholderTextColor={colors.fgSubtle}
        value={body}
        onChangeText={setBody}
        multiline
      />

      <TouchableOpacity style={styles.createButton} onPress={handleCreate} disabled={creating}>
        {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Create Pull Request</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.fgMuted, fontSize: typography.sizeSm, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chipActive: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  chipText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, padding: spacing.md, color: colors.fgDefault,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  createButton: {
    backgroundColor: colors.successEmphasis, borderRadius: 10, padding: spacing.md,
    alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl,
  },
  createButtonText: { color: '#fff', fontWeight: '700', fontSize: typography.sizeMd },
});
