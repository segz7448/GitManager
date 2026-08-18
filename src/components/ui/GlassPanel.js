import React from 'react';
import { StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radii } from '../../theme';

/**
 * Frosted-glass surface (Android supports expo-blur via a native blur
 * effect on API 31+, falling back to a translucent tint below that -
 * either way it reads as "glass" rather than a flat modal box).
 */
export default function GlassPanel({ children, style, intensity = 40, tint = 'dark', rounded = true }) {
  return (
    <BlurView
      intensity={intensity}
      tint={tint}
      style={[styles.base, rounded && styles.rounded, style]}
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle + 'cc',
  },
  rounded: { borderRadius: radii.xl },
});
