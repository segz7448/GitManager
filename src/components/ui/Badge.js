import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii } from '../../theme';

const TONES = {
  neutral: { bg: '#21262d', fg: colors.fgMuted, dot: colors.fgMuted },
  accent: { bg: '#0d2848', fg: colors.accent, dot: colors.accent },
  success: { bg: '#0d2818', fg: colors.success, dot: colors.success },
  danger: { bg: '#3d1210', fg: colors.danger, dot: colors.danger },
  warning: { bg: '#3d2b02', fg: colors.warning, dot: colors.warning },
  done: { bg: '#2a1a47', fg: colors.done, dot: colors.done },
};

export default function Badge({ label, tone = 'neutral', dot = false, small = false }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <View style={[styles.base, { backgroundColor: t.bg }, small && styles.small]}>
      {dot && <View style={[styles.dot, { backgroundColor: t.dot }]} />}
      <Text style={[styles.text, { color: t.fg }, small && styles.textSmall]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  small: { paddingHorizontal: spacing.xs, paddingVertical: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  text: { fontSize: typography.sizeSm, fontWeight: '600' },
  textSmall: { fontSize: 10 },
});
