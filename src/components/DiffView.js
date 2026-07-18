import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { diffLines } from 'diff';
import { colors, spacing, typography } from '../theme';

/**
 * Renders a unified line diff between two strings, GitHub-style.
 */
export default function DiffView({ oldText, newText, style }) {
  const parts = diffLines(oldText || '', newText || '');

  const rows = [];
  parts.forEach((part, partIdx) => {
    const lines = part.value.split('\n');
    // split('\n') on a trailing-newline string produces one trailing empty
    // entry - drop it so we don't render a phantom blank line.
    if (lines[lines.length - 1] === '') lines.pop();

    lines.forEach((line, lineIdx) => {
      rows.push({
        key: `${partIdx}-${lineIdx}`,
        text: line,
        type: part.added ? 'added' : part.removed ? 'removed' : 'context',
      });
    });
  });

  return (
    <ScrollView style={[styles.container, style]} horizontal={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {rows.map((row) => (
            <View
              key={row.key}
              style={[
                styles.row,
                row.type === 'added' && styles.rowAdded,
                row.type === 'removed' && styles.rowRemoved,
              ]}
            >
              <Text style={styles.gutter}>
                {row.type === 'added' ? '+' : row.type === 'removed' ? '-' : ' '}
              </Text>
              <Text
                style={[
                  styles.lineText,
                  row.type === 'added' && styles.lineTextAdded,
                  row.type === 'removed' && styles.lineTextRemoved,
                ]}
              >
                {row.text || ' '}
              </Text>
            </View>
          ))}
          {rows.length === 0 && (
            <Text style={styles.noChangesText}>No changes</Text>
          )}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bgInset },
  row: { flexDirection: 'row', paddingHorizontal: spacing.sm },
  rowAdded: { backgroundColor: 'rgba(63,185,80,0.15)' },
  rowRemoved: { backgroundColor: 'rgba(248,81,73,0.15)' },
  gutter: {
    width: 16,
    color: colors.fgSubtle,
    fontFamily: typography.mono,
    fontSize: 12,
  },
  lineText: {
    color: '#c9d1d9',
    fontFamily: typography.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  lineTextAdded: { color: '#7ee787' },
  lineTextRemoved: { color: '#ffa198' },
  noChangesText: { color: colors.fgSubtle, padding: spacing.md, fontStyle: 'italic' },
});
