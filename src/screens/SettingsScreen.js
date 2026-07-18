import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';

export default function SettingsScreen({ navigation }) {
  const { username, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Disconnect account', 'Remove the stored token from this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{username || 'unknown'}</Text>
      </View>

      <TouchableOpacity style={styles.securityRow} onPress={() => navigation.navigate('Security')}>
        <Text style={styles.securityRowText}>Security · token expiration, scopes, accounts</Text>
        <Text style={styles.securityRowArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.dangerButton} onPress={handleLogout}>
        <Text style={styles.dangerButtonText}>Disconnect Account</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>GitManager · Personal build tool</Text>
        <Text style={styles.footerSubtext}>
          All requests go directly from this device to api.github.com. No third-party servers involved.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  card: {
    backgroundColor: colors.bgSubtle,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  label: { color: colors.fgMuted, fontSize: typography.sizeSm, textTransform: 'uppercase' },
  value: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '600', marginTop: spacing.xs },
  securityRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.lg,
  },
  securityRowText: { color: colors.fgDefault, fontSize: typography.sizeSm, flex: 1 },
  securityRowArrow: { color: colors.fgSubtle, fontSize: typography.sizeLg },
  dangerButton: {
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    alignItems: 'center',
  },
  dangerButtonText: { color: colors.danger, fontWeight: '600' },
  footer: { marginTop: spacing.xl, alignItems: 'center' },
  footerText: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  footerSubtext: { color: colors.fgSubtle, fontSize: typography.sizeSm, textAlign: 'center', marginTop: spacing.xs, lineHeight: 16 },
});
