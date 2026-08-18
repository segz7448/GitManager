import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radii, elevation } from '../../theme';
import { haptic } from '../../utils/haptics';

/**
 * Base surface used everywhere: list rows, detail panels, modal sheets.
 * Pass onPress to make it tappable (adds haptic + press feedback).
 */
export default function Card({ children, style, onPress, inset = false, level = 'sm', disabled }) {
  const surfaceStyle = [
    styles.base,
    inset ? styles.inset : styles.subtle,
    elevation[level],
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        disabled={disabled}
        onPress={() => {
          haptic.tap();
          onPress();
        }}
        style={({ pressed }) => [...surfaceStyle, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={surfaceStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  subtle: { backgroundColor: colors.bgSubtle, borderColor: colors.border },
  inset: { backgroundColor: colors.bgInset, borderColor: colors.borderMuted },
  pressed: { opacity: 0.8, transform: [{ scale: 0.995 }] },
});
