import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      Alert.alert('Missing token', 'Paste your GitHub Personal Access Token to continue.');
      return;
    }
    setLoading(true);
    try {
      await login(trimmed);
    } catch (e) {
      Alert.alert('Login failed', e.message || 'Could not verify this token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>GitManager</Text>
        <Text style={styles.subtitle}>Personal GitHub control panel</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Personal Access Token</Text>
          <TextInput
            style={styles.input}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            placeholderTextColor={colors.fgSubtle}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.fgDefault} />
            ) : (
              <Text style={styles.buttonText}>Connect</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Linking.openURL('https://github.com/settings/tokens?type=beta')}
            style={styles.linkRow}
          >
            <Text style={styles.link}>Generate a fine-grained token →</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            Required scopes: repo (full control), workflow, and read:user.{'\n'}
            The token is stored only on this device using secure encrypted storage — never
            transmitted anywhere except directly to api.github.com.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgDefault },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    color: colors.fgDefault,
    fontSize: typography.sizeXxl,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.fgMuted,
    fontSize: typography.sizeMd,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.bgSubtle,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.lg,
  },
  label: {
    color: colors.fgMuted,
    fontSize: typography.sizeSm,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.bgInset,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.fgDefault,
    fontFamily: typography.mono,
    padding: spacing.md,
    fontSize: typography.sizeMd,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.successEmphasis,
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: typography.sizeMd,
  },
  linkRow: { marginTop: spacing.lg, alignItems: 'center' },
  link: { color: colors.accent, fontSize: typography.sizeSm },
  hint: {
    color: colors.fgSubtle,
    fontSize: typography.sizeSm,
    marginTop: spacing.lg,
    lineHeight: 18,
  },
});
