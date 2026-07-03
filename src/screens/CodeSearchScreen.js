import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { searchCode } from '../services/github';
import { colors, spacing, typography } from '../theme';

export default function CodeSearchScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [scopeOwner, setScopeOwner] = useState('');
  const [scopeRepo, setScopeRepo] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  const runSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const opts = {};
      if (scopeOwner.trim() && scopeRepo.trim()) {
        opts.owner = scopeOwner.trim();
        opts.repo = scopeRepo.trim();
      }
      const data = await searchCode(query.trim(), opts);
      setResults(data.items || []);
      setTotalCount(data.total_count || 0);
    } catch (e) {
      if (e.status === 422 && !scopeOwner) {
        setError('GitHub code search requires at least one qualifier. Try scoping to a specific owner/repo below.');
      } else if (e.status === 403) {
        setError('Rate limited on code search (GitHub allows ~10 searches/min). Wait a moment and try again.');
      } else {
        setError(e.message || 'Search failed');
      }
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const openFile = (item) => {
    const [owner, repo] = item.repository.full_name.split('/');
    navigation.navigate('FileEditor', {
      owner,
      repo,
      path: item.path,
      sha: item.sha,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Search code..."
          placeholderTextColor={colors.fgSubtle}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={runSearch} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchButtonText}>Go</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.scopeRow}>
        <TextInput
          style={[styles.scopeInput, { flex: 1 }]}
          placeholder="owner (optional)"
          placeholderTextColor={colors.fgSubtle}
          value={scopeOwner}
          onChangeText={setScopeOwner}
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.scopeInput, { flex: 1 }]}
          placeholder="repo (optional)"
          placeholderTextColor={colors.fgSubtle}
          value={scopeRepo}
          onChangeText={setScopeRepo}
          autoCapitalize="none"
        />
      </View>
      <Text style={styles.hint}>
        Scoping to owner + repo avoids GitHub's search restrictions and gives more relevant results.
      </Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {results && (
        <Text style={styles.countText}>{totalCount} result{totalCount === 1 ? '' : 's'}</Text>
      )}

      <FlatList
        data={results || []}
        keyExtractor={(item) => item.sha + item.path}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.resultCard} onPress={() => openFile(item)}>
            <Text style={styles.resultPath} numberOfLines={1}>{item.path}</Text>
            <Text style={styles.resultRepo}>{item.repository.full_name}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading && results !== null ? (
            <Text style={styles.emptyText}>No matches found.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  searchBar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  input: {
    flex: 1, backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.fgDefault,
  },
  searchButton: { backgroundColor: colors.accentEmphasis, borderRadius: 8, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  searchButtonText: { color: '#fff', fontWeight: '600' },
  scopeRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  scopeInput: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, color: colors.fgDefault, fontSize: typography.sizeSm,
  },
  hint: { color: colors.fgSubtle, fontSize: typography.sizeSm, paddingHorizontal: spacing.md, marginTop: spacing.xs },
  errorText: { color: colors.warning, fontSize: typography.sizeSm, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  countText: { color: colors.fgMuted, fontSize: typography.sizeSm, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  resultCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  resultPath: { color: colors.accent, fontFamily: typography.mono, fontSize: typography.sizeSm },
  resultRepo: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 2 },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
});
