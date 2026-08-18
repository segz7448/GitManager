import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radii } from '../../theme';

export default function Input({
  icon,
  style,
  inputStyle,
  mono = false,
  ...textInputProps
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, focused && styles.wrapFocused, style]}>
      {icon && <Ionicons name={icon} size={16} color={colors.fgSubtle} style={styles.icon} />}
      <TextInput
        style={[styles.input, mono && styles.mono, inputStyle]}
        placeholderTextColor={colors.fgSubtle}
        onFocus={(e) => {
          setFocused(true);
          textInputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          textInputProps.onBlur?.(e);
        }}
        {...textInputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInset,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  wrapFocused: { borderColor: colors.accent },
  icon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    color: colors.fgDefault,
    fontSize: typography.sizeMd,
    paddingVertical: spacing.md,
  },
  mono: { fontFamily: typography.mono },
});
