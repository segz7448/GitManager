import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  getRecoverableEntries,
  discardJournalEntry,
  pruneStaleJournalEntries,
} from '../db/sessionJournal';
import { colors, spacing, typography } from '../theme';

const KIND_LABELS = {
  zip_upload: 'ZIP upload',
  artifact_download: 'Artifact download',
  bulk_commit: 'Bulk file import',
};

function describeEntry(entry) {
  const label = KIND_LABELS[entry.kind] || entry.kind;
  const p = entry.payload || {};
  if (entry.kind === 'zip_upload') {
    return `${label} of "${p.fileName || 'archive'}" to ${p.owner}/${p.repo} didn't finish.`;
  }
  if (entry.kind === 'artifact_download') {
    return `${label} of "${p.artifactName || 'artifact'}" from ${p.owner}/${p.repo} didn't finish.`;
  }
  return `${label} to ${p.owner}/${p.repo} didn't finish.`;
}

/**
 * Shown once at app launch (and dismissible) when the crash-recovery
 * journal has entries left in 'in_progress' or 'failed' state - meaning
 * the app was killed or crashed mid-operation last time. There's nothing
 * to literally "resume" mid-byte-stream, but this at least tells the user
 * clearly what was interrupted instead of silently vanishing, and lets
 * them clear the record and retry from the relevant screen.
 */
export default function RecoveryBanner() {
  const [entries, setEntries] = useState([]);

  const load = useCallback(async () => {
    await pruneStaleJournalEntries();
    const recoverable = await getRecoverableEntries();
    setEntries(recoverable);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = async (id) => {
    await discardJournalEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  if (entries.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {entries.map((entry) => (
        <View key={entry.id} style={styles.banner}>
          <Text style={styles.text}>{describeEntry(entry)}</Text>
          <TouchableOpacity onPress={() => dismiss(entry.id)} style={styles.dismissButton}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    zIndex: 999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
    borderColor: colors.warningEmphasis,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  text: { flex: 1, color: colors.fgDefault, fontSize: typography.sizeSm },
  dismissButton: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  dismissText: { color: colors.accent, fontWeight: '600', fontSize: typography.sizeSm },
});
