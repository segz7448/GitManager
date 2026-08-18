import React from 'react';
import { Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radii, gradients } from '../../theme';
import { haptic } from '../../utils/haptics';

const SIZES = {
  sm: { paddingVertical: 8, fontSize: typography.sizeSm, iconSize: 14 },
  md: { paddingVertical: 12, fontSize: typography.sizeMd, iconSize: 16 },
  lg: { paddingVertical: 15, fontSize: typography.sizeLg, iconSize: 18 },
};

/**
 * variant: 'primary' | 'success' | 'danger' | 'secondary' | 'ghost'
 * size: 'sm' | 'md' | 'lg'
 */
export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
  hapticStyle = 'tap',
}) {
  const dims = SIZES[size] || SIZES.md;
  const isFilled = variant === 'primary' || variant === 'success' || variant === 'danger';
  const isGhost = variant === 'ghost';

  const handlePress = () => {
    if (disabled || loading) return;
    if (hapticStyle && haptic[hapticStyle]) haptic[hapticStyle]();
    onPress?.();
  };

  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={isFilled ? '#fff' : colors.accent} size="small" />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Ionicons
              name={icon}
              size={dims.iconSize}
              color={isFilled ? '#fff' : variant === 'secondary' ? colors.fgDefault : colors.accent}
              style={styles.iconLeft}
            />
          )}
          <Text
            style={[
              styles.text,
              { fontSize: dims.fontSize },
              isFilled && styles.textFilled,
              variant === 'secondary' && styles.textSecondary,
              isGhost && styles.textGhost,
              textStyle,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {icon && iconPosition === 'right' && (
            <Ionicons
              name={icon}
              size={dims.iconSize}
              color={isFilled ? '#fff' : variant === 'secondary' ? colors.fgDefault : colors.accent}
              style={styles.iconRight}
            />
          )}
        </>
      )}
    </>
  );

  const baseStyle = [
    styles.base,
    { paddingVertical: dims.paddingVertical },
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
    style,
  ];

  if (isFilled) {
    const gradientColors =
      variant === 'success' ? gradients.success : variant === 'danger' ? gradients.danger : gradients.accent;
    return (
      <Pressable onPress={handlePress} disabled={disabled || loading} style={({ pressed }) => [pressed && styles.pressed]}>
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={baseStyle}>
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        baseStyle,
        variant === 'secondary' && styles.secondary,
        isGhost && styles.ghostBox,
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
  },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  secondary: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghostBox: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.sm,
  },
  text: { fontWeight: '600' },
  textFilled: { color: '#fff' },
  textSecondary: { color: colors.fgDefault },
  textGhost: { color: colors.accent },
  iconLeft: { marginRight: spacing.xs },
  iconRight: { marginLeft: spacing.xs },
});
