import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme';

/**
 * Renders a raw unified-diff `patch` string exactly as GitHub's
 * /pulls/{number}/files endpoint returns it - this is already a diff, so
 * unlike DiffView (which computes a diff from two full texts), this just
 * colors the existing +/- lines.
 */
export default function PatchView({ patch, style }) {
  if (!patch) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.binaryText}>
          No text diff available (binary file, or the file is too large to diff).
        </Text>
      </View>
    );
  }

  const lines = patch.split('\n');

  return (
    <ScrollView style={[styles.container, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {lines.map((line, idx) => {
            const isAdded = line.startsWith('+') && !line.startsWith('+++');
            const isRemoved = line.startsWith('-') && !line.startsWith('---');
            const isHunkHeader = line.startsWith('@@');
            return (
              <View
                key={idx}
                style={[
                  styles.row,
                  isAdded && styles.rowAdded,
                  isRemoved && styles.rowRemoved,
                  isHunkHeader && styles.rowHunk,
                ]}
              >
                <Text
                  style={[
                    styles.lineText,
                    isAdded && styles.lineTextAdded,
                    isRemoved && styles.lineTextRemoved,
                    isHunkHeader && styles.lineTextHunk,
                  ]}
                >
                  {line || ' '}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bgInset },
  binaryText: { color: colors.fgSubtle, padding: spacing.md, fontStyle: 'italic', fontSize: typography.sizeSm },
  row: { paddingHorizontal: spacing.sm },
  rowAdded: { backgroundColor: 'rgba(63,185,80,0.15)' },
  rowRemoved: { backgroundColor: 'rgba(248,81,73,0.15)' },
  rowHunk: { backgroundColor: 'rgba(88,166,255,0.1)' },
  lineText: {
    color: '#c9d1d9',
    fontFamily: typography.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  lineTextAdded: { color: '#7ee787' },
  lineTextRemoved: { color: '#ffa198' },
  lineTextHunk: { color: colors.accent },
});
