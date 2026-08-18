import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import Button from './Button';

export default function EmptyState({ icon = 'file-tray-outline', title, subtitle, actionLabel, onAction }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={30} color={colors.fgSubtle} />
      </View>
      {!!title && <Text style={styles.title}>{title}</Text>}
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {!!actionLabel && (
        <Button title={actionLabel} onPress={onAction} variant="secondary" size="sm" style={styles.action} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.xl * 1.5, paddingHorizontal: spacing.xl },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '600', textAlign: 'center' },
  subtitle: {
    color: colors.fgSubtle,
    fontSize: typography.sizeSm,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  action: { marginTop: spacing.lg },
});
