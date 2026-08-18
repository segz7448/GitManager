import React from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';
import { Screen, Card, Button, Avatar, SectionLabel } from '../components/ui';

// Push notifications are fully automatic now (see App.js — enabled silently
// on launch, no user-facing toggle) so there is intentionally no
// Notifications section here anymore.
export default function SettingsScreen({ navigation }) {
  const { username, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Disconnect account', 'Remove the stored token from this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Card level="md" style={styles.profileCard}>
          <View style={styles.profileRow}>
            <Avatar name={username || '?'} size={52} />
            <View style={styles.profileText}>
              <SectionLabel style={styles.noMargin}>Signed in as</SectionLabel>
              <Text style={styles.username}>{username || 'unknown'}</Text>
            </View>
          </View>
        </Card>

        <SectionLabel style={styles.sectionSpacing}>Account</SectionLabel>
        <Card onPress={() => navigation.navigate('Security')} style={styles.rowCard}>
          <View style={styles.row}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.fgMuted} />
            <Text style={styles.rowText}>Security · token expiration, scopes, accounts</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.fgSubtle} />
          </View>
        </Card>

        <Button
          title="Disconnect account"
          onPress={handleLogout}
          variant="danger"
          icon="log-out-outline"
          fullWidth
          hapticStyle="warning"
          style={styles.logoutButton}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>GitManager · Personal build tool</Text>
          <Text style={styles.footerSubtext}>
            All requests go directly from this device to api.github.com. No third-party servers involved.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  profileCard: { marginBottom: spacing.lg },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  profileText: { marginLeft: spacing.md },
  noMargin: { marginBottom: 2 },
  username: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700' },
  sectionSpacing: { marginTop: spacing.xs },
  rowCard: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowText: { color: colors.fgDefault, fontSize: typography.sizeSm, flex: 1 },
  logoutButton: { marginBottom: spacing.xl },
  footer: { alignItems: 'center' },
  footerText: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  footerSubtext: { color: colors.fgSubtle, fontSize: typography.sizeSm, textAlign: 'center', marginTop: spacing.xs, lineHeight: 16 },
});
