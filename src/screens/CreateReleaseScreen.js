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
import { listBranches, createRelease, getRepo } from '../services/github';
import { colors, spacing, typography } from '../theme';

export default function CreateReleaseScreen({ route, navigation }) {
  const { owner, repo } = route.params;
  const [branches, setBranches] = useState([]);
  const [targetBranch, setTargetBranch] = useState(null);
  const [tagName, setTagName] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [draft, setDraft] = useState(false);
  const [prerelease, setPrerelease] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  navigation.setOptions({ title: 'New Release' });

  useEffect(() => {
    (async () => {
      try {
        const [branchData, repoData] = await Promise.all([listBranches(owner, repo), getRepo(owner, repo)]);
        setBranches(branchData);
        setTargetBranch(repoData.default_branch);
      } catch (e) {
        Alert.alert('Failed to load branches', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [owner, repo]);

  const handleCreate = async () => {
    if (!tagName.trim()) {
      Alert.alert('Tag required', 'Enter a tag name, e.g. v1.0.0');
      return;
    }
    setCreating(true);
    try {
      const release = await createRelease(owner, repo, {
        tagName: tagName.trim(),
        targetCommitish: targetBranch,
        name: name.trim() || tagName.trim(),
        body,
        draft,
        prerelease,
      });
      Alert.alert('Created', `Release ${release.tag_name} was created.`, [
        {
          text: 'View',
          onPress: () => navigation.replace('ReleaseDetail', { owner, repo, releaseId: release.id }),
        },
      ]);
    } catch (e) {
      Alert.alert('Failed to create release', e.message);
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
      <Text style={styles.label}>Tag</Text>
      <TextInput
        style={styles.input}
        placeholder="v1.0.0"
        placeholderTextColor={colors.fgSubtle}
        value={tagName}
        onChangeText={setTagName}
        autoCapitalize="none"
      />
      <Text style={styles.hint}>
        If this tag doesn't exist yet, GitHub creates it automatically pointing at the target branch below.
      </Text>

      <Text style={styles.label}>Target branch</Text>
      <View style={styles.chipRow}>
        {branches.map((b) => (
          <TouchableOpacity
            key={b.name}
            style={[styles.chip, targetBranch === b.name && styles.chipActive]}
            onPress={() => setTargetBranch(b.name)}
          >
            <Text style={[styles.chipText, targetBranch === b.name && styles.chipTextActive]}>{b.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Release title</Text>
      <TextInput
        style={styles.input}
        placeholder="Defaults to the tag name if left blank"
        placeholderTextColor={colors.fgSubtle}
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="What's new in this release?"
        placeholderTextColor={colors.fgSubtle}
        value={body}
        onChangeText={setBody}
        multiline
      />

      <TouchableOpacity style={styles.toggleRow} onPress={() => setDraft(!draft)}>
        <View style={[styles.checkbox, draft && styles.checkboxChecked]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Save as draft</Text>
          <Text style={styles.toggleSubtext}>Only visible to you until published.</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.toggleRow} onPress={() => setPrerelease(!prerelease)}>
        <View style={[styles.checkbox, prerelease && styles.checkboxChecked]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>This is a pre-release</Text>
          <Text style={styles.toggleSubtext}>Marked as not production-ready.</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.createButton} onPress={handleCreate} disabled={creating}>
        {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Create Release</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.fgMuted, fontSize: typography.sizeSm, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  hint: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: spacing.xs, lineHeight: 16 },
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderColor: colors.border, borderWidth: 1.5, marginRight: spacing.sm },
  checkboxChecked: { backgroundColor: colors.accentEmphasis, borderColor: colors.accentEmphasis },
  toggleLabel: { color: colors.fgDefault },
  toggleSubtext: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 2 },
  createButton: {
    backgroundColor: colors.successEmphasis, borderRadius: 10, padding: spacing.md,
    alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl,
  },
  createButtonText: { color: '#fff', fontWeight: '700', fontSize: typography.sizeMd },
});
