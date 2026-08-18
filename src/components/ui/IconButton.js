import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function IconButton({
  name,
  size = 20,
  color = colors.fgDefault,
  onPress,
  style,
  variant = 'plain', // 'plain' | 'subtle'
  disabled = false,
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        variant === 'subtle' && styles.subtle,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      hitSlop={8}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  subtle: { backgroundColor: colors.bgSubtle, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.35 },
});
