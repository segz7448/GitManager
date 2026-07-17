import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { getTokenInfo } from '../services/github';
import { listAccounts, removeAccount } from '../db/accounts';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';

// Recommended scopes for this app to function fully, used only to flag
// gaps to the user - it does not block usage on a missing scope, since
// some features (e.g. read-only browsing) work fine without all of them.
const RECOMMENDED_SCOPES = ['repo', 'workflow', 'read:user'];

const EXPIRY_WARNING_DAYS = 14;

function daysUntil(date) {
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function SecurityScreen({ navigation }) {
  const { username, switchAccount } = useAuth();
  const [tokenInfo, setTokenInfo] = useState(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [tokenError, setTokenError] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [addAccountModalVisible, setAddAccountModalVisible] = useState(false);
  const [switchingId, setSwitchingId] = useState(null);

  navigation.setOptions({ title: 'Security' });

  const loadTokenInfo = useCallback(async () => {
    setLoadingToken(true);
    setTokenError(null);
    try {
      const info = await getTokenInfo();
      setTokenInfo(info);
    } catch (e) {
      setTokenError(e.message);
    } finally {
      setLoadingToken(false);
    }
  }, []);

  const loadAccounts = useCallback(() => {
    listAccounts().then(setAccounts);
  }, []);

  useEffect(() => {
    loadTokenInfo();
    loadAccounts();
  }, [loadTokenInfo, loadAccounts]);

  const handleSwitch = (accountId) => {
    if (switchingId) return;
    setSwitchingId(accountId);
    switchAccount(accountId)
      .then(() => {
        loadTokenInfo();
        loadAccounts();
        Alert.alert('Switched', 'Now signed in with this account.');
      })
      .catch((e) => Alert.alert('Failed to switch account', e.message))
      .finally(() => setSwitchingId(null));
  };

  const handleRemoveAccount = (account) => {
    if (account.username === username) {
      Alert.alert('Cannot remove', 'This is your currently active account. Switch to a different one first.');
      return;
    }
    Alert.alert('Remove this saved account?', `This deletes ${account.username}'s saved token from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeAccount(account.id);
          loadAccounts();
        },
      },
    ]);
  };

  const expiryWarning = tokenInfo?.expiresAt
    ? (() => {
        const days = daysUntil(tokenInfo.expiresAt);
        if (days < 0) return { level: 'expired', days };
        if (days <= EXPIRY_WARNING_DAYS) return { level: 'warning', days };
        return { level: 'ok', days };
      })()
    : null;

  const missingScopes = tokenInfo?.scopes
    ? RECOMMENDED_SCOPES.filter((s) => !tokenInfo.scopes.includes(s))
    : [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.sectionTitle}>Current token</Text>
      {loadingToken ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.md }} />
      ) : tokenError ? (
        <Text style={styles.errorText}>{tokenError}</Text>
      ) : tokenInfo ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Signed in as</Text>
          <Text style={styles.cardValue}>{tokenInfo.user.login}</Text>

          {tokenInfo.isFineGrained ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                This is a fine-grained token. GitHub doesn't expose its exact permission set via
                API headers the way it does for classic tokens - check its permissions on
                github.com/settings/tokens if unsure.
              </Text>
            </View>
          ) : tokenInfo.scopes ? (
            <View style={styles.infoRow}>
              <Text style={styles.cardLabel}>Scopes</Text>
              <Text style={styles.scopesText}>{tokenInfo.scopes.join(', ') || 'none'}</Text>
              {missingScopes.length > 0 && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    Missing recommended scope{missingScopes.length > 1 ? 's' : ''}: {missingScopes.join(', ')}.
                    Some features may not work without {missingScopes.length > 1 ? 'them' : 'it'}.
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {tokenInfo.expiresAt ? (
            <View style={styles.infoRow}>
              <Text style={styles.cardLabel}>Expires</Text>
              <Text
                style={[
                  styles.expiryText,
                  expiryWarning?.level === 'expired' && styles.expiryTextDanger,
                  expiryWarning?.level === 'warning' && styles.expiryTextWarning,
                ]}
              >
                {tokenInfo.expiresAt.toLocaleDateString()}
                {expiryWarning?.level === 'expired' && ' · already expired'}
                {expiryWarning?.level === 'warning' && ` · in ${expiryWarning.days} day${expiryWarning.days === 1 ? '' : 's'}`}
              </Text>
              {expiryWarning?.level !== 'ok' && (
                <View style={expiryWarning?.level === 'expired' ? styles.dangerBox : styles.warningBox}>
                  <Text style={expiryWarning?.level === 'expired' ? styles.dangerText : styles.warningText}>
                    {expiryWarning?.level === 'expired'
                      ? 'This token has expired and API calls will start failing (if they aren\'t already). Generate a new one and reconnect.'
                      : `This token expires soon. Generate a new one on github.com/settings/tokens before it does, to avoid a sudden loss of access.`}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.infoRow}>
              <Text style={styles.cardLabel}>Expires</Text>
              <Text style={styles.expiryText}>No expiration set</Text>
            </View>
          )}

          <TouchableOpacity onPress={loadTokenInfo} style={styles.refreshButton}>
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Accounts</Text>
      {accounts.map((account) => (
        <View key={account.id} style={styles.accountRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountName}>
              {account.username} {account.username === username ? '(active)' : ''}
            </Text>
            <Text style={styles.accountMeta}>
              Added {new Date(account.addedAt).toLocaleDateString()}
            </Text>
          </View>
          {account.username !== username && (
            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => handleSwitch(account.id)}
              disabled={switchingId === account.id}
            >
              {switchingId === account.id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.switchButtonText}>Switch</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => handleRemoveAccount(account)} style={{ marginLeft: spacing.sm }}>
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.addAccountButton} onPress={() => setAddAccountModalVisible(true)}>
        <Text style={styles.addAccountButtonText}>+ Add another account</Text>
      </TouchableOpacity>

      <AddAccountModal
        visible={addAccountModalVisible}
        onClose={() => setAddAccountModalVisible(false)}
        onAdded={() => {
          setAddAccountModalVisible(false);
          loadAccounts();
          loadTokenInfo();
        }}
      />
    </ScrollView>
  );
}

/**
 * Separate component so it can call useAuth() (a hook) - it needs the
 * real login() function to verify and register the new token.
 */
function AddAccountModal({ visible, onClose, onAdded }) {
  const { login } = useAuth();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      await login(trimmed);
      setToken('');
      onAdded();
    } catch (e) {
      Alert.alert('Failed to add account', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Add another account</Text>
          <Text style={styles.modalSubtitle}>
            Paste a Personal Access Token for the account you want to add. This becomes the active
            account immediately after being added.
          </Text>
          <TextInput
            style={styles.tokenInput}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            placeholderTextColor={colors.fgSubtle}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={handleAdd} disabled={loading || !token.trim()}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmButtonText}>Add</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  sectionTitle: { color: colors.fgSubtle, fontSize: typography.sizeSm, fontWeight: '700', textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  errorText: { color: colors.danger, fontSize: typography.sizeSm },
  card: { backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: spacing.lg },
  cardLabel: { color: colors.fgMuted, fontSize: typography.sizeSm, textTransform: 'uppercase' },
  cardValue: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700', marginTop: 2 },
  infoRow: { marginTop: spacing.md },
  infoText: { color: colors.fgMuted, fontSize: typography.sizeSm, lineHeight: 18 },
  scopesText: { color: colors.fgDefault, fontFamily: typography.mono, fontSize: typography.sizeSm, marginTop: 2 },
  expiryText: { color: colors.fgDefault, fontSize: typography.sizeSm, marginTop: 2 },
  expiryTextWarning: { color: colors.warning, fontWeight: '700' },
  expiryTextDanger: { color: colors.danger, fontWeight: '700' },
  warningBox: { backgroundColor: 'rgba(210,153,34,0.12)', borderColor: colors.warning, borderWidth: 1, borderRadius: 8, padding: spacing.sm, marginTop: spacing.sm },
  warningText: { color: colors.warning, fontSize: typography.sizeSm, lineHeight: 18 },
  dangerBox: { backgroundColor: 'rgba(248,81,73,0.12)', borderColor: colors.danger, borderWidth: 1, borderRadius: 8, padding: spacing.sm, marginTop: spacing.sm },
  dangerText: { color: colors.danger, fontSize: typography.sizeSm, lineHeight: 18 },
  refreshButton: { marginTop: spacing.md, alignSelf: 'flex-start' },
  refreshButtonText: { color: colors.accent, fontSize: typography.sizeSm, fontWeight: '600' },
  accountRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  accountName: { color: colors.fgDefault, fontSize: typography.sizeSm, fontWeight: '600' },
  accountMeta: { color: colors.fgSubtle, fontSize: 11, marginTop: 2 },
  switchButton: { backgroundColor: colors.accentEmphasis, borderRadius: 6, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  switchButtonText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  removeText: { color: colors.danger, fontSize: typography.sizeSm },
  addAccountButton: { padding: spacing.md, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1, borderStyle: 'dashed' },
  addAccountButtonText: { color: colors.accent, fontWeight: '600', fontSize: typography.sizeSm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: colors.bgSubtle, borderRadius: 12, borderColor: colors.border, borderWidth: 1, padding: spacing.lg, width: '90%' },
  modalTitle: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700', marginBottom: spacing.sm },
  modalSubtitle: { color: colors.fgMuted, fontSize: typography.sizeSm, marginBottom: spacing.md, lineHeight: 18 },
  tokenInput: {
    backgroundColor: colors.bgInset, borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    color: colors.fgDefault, fontFamily: typography.mono, padding: spacing.md,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cancelButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  cancelButtonText: { color: colors.fgMuted },
  confirmButton: { flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: 8, backgroundColor: colors.successEmphasis },
  confirmButtonText: { color: '#fff', fontWeight: '600' },
});
