import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';
import { Screen, Card, Button, IconButton, Avatar, Badge, SectionLabel } from '../components/ui';
import {
  isFcmSupported,
  isPushEnabled,
  getStoredFcmToken,
  enablePushNotifications,
  disablePushNotifications,
} from '../services/fcm';

export default function SettingsScreen({ navigation }) {
  const { username, logout } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushToken, setPushToken] = useState(null);
  const [pushBusy, setPushBusy] = useState(false);

  const refreshPushState = useCallback(async () => {
    const enabled = await isPushEnabled();
    setPushEnabled(enabled);
    if (enabled) setPushToken(await getStoredFcmToken());
  }, []);

  useEffect(() => {
    refreshPushState();
  }, [refreshPushState]);

  const handleLogout = () => {
    Alert.alert('Disconnect account', 'Remove the stored token from this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: logout },
    ]);
  };

  const handleTogglePush = async () => {
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await disablePushNotifications();
        setPushEnabled(false);
        setPushToken(null);
      } else {
        const token = await enablePushNotifications();
        if (!token) {
          Alert.alert(
            'Notifications disabled',
            'Enable notifications for GitManager in Android Settings, then try again.'
          );
          return;
        }
        setPushEnabled(true);
        setPushToken(token);
      }
    } catch (e) {
      Alert.alert('Push notifications', e.message || 'Something went wrong setting this up.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleCopyToken = async () => {
    if (!pushToken) return;
    await Clipboard.setStringAsync(pushToken);
    Alert.alert('Copied', 'FCM device token copied to clipboard.');
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

        <SectionLabel style={styles.sectionSpacing}>Notifications</SectionLabel>
        <Card level="md" style={styles.pushCard}>
          <View style={styles.pushHeaderRow}>
            <View style={styles.pushIconWrap}>
              <Ionicons name="notifications-outline" size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pushTitle}>Push notifications (FCM)</Text>
              <Text style={styles.pushSubtitle}>
                {pushEnabled
                  ? 'This device is registered to receive pushes.'
                  : 'Get pushes even when the app is fully closed.'}
              </Text>
            </View>
            <Badge label={pushEnabled ? 'On' : 'Off'} tone={pushEnabled ? 'success' : 'neutral'} dot />
          </View>

          {!isFcmSupported() && (
            <Text style={styles.pushWarning}>FCM isn't supported on this platform.</Text>
          )}

          <Button
            title={pushEnabled ? 'Turn off push notifications' : 'Enable push notifications'}
            onPress={handleTogglePush}
            loading={pushBusy}
            variant={pushEnabled ? 'secondary' : 'primary'}
            icon={pushEnabled ? 'notifications-off-outline' : 'notifications-outline'}
            fullWidth
            style={styles.pushButton}
          />

          {pushEnabled && pushToken && (
            <View style={styles.tokenBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tokenLabel}>Device token</Text>
                <Text style={styles.tokenValue} numberOfLines={1}>
                  {pushToken}
                </Text>
              </View>
              <IconButton name="copy-outline" variant="subtle" size={16} onPress={handleCopyToken} />
            </View>
          )}

          <Text style={styles.pushHint}>
            No send-side is wired up yet - this just registers the device. Paste the token above
            into the Firebase console (Cloud Messaging → Send test message) to try it, or send to
            it from your own server later.
          </Text>
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
  pushCard: { marginBottom: spacing.lg },
  pushHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  pushIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0d2848',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  pushTitle: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '700' },
  pushSubtitle: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 2 },
  pushWarning: { color: colors.warning, fontSize: typography.sizeSm, marginBottom: spacing.sm },
  pushButton: { marginTop: spacing.xs },
  tokenBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInset,
    borderColor: colors.borderMuted,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  tokenLabel: { color: colors.fgSubtle, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  tokenValue: { color: colors.fgMuted, fontSize: typography.sizeSm, fontFamily: typography.mono, marginTop: 2 },
  pushHint: { color: colors.fgSubtle, fontSize: 11, lineHeight: 16, marginTop: spacing.md },
  rowCard: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowText: { color: colors.fgDefault, fontSize: typography.sizeSm, flex: 1 },
  logoutButton: { marginBottom: spacing.xl },
  footer: { alignItems: 'center' },
  footerText: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  footerSubtext: { color: colors.fgSubtle, fontSize: typography.sizeSm, textAlign: 'center', marginTop: spacing.xs, lineHeight: 16 },
});
