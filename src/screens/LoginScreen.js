import React, { useState, useRef, useEffect } from 'react';
import {
  Text,
  StyleSheet,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography, radii, gradients } from '../theme';
import { Screen, Card, Input, Button } from '../components/ui';

export default function LoginScreen() {
  const { login } = useAuth();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(rise, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);

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
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }] }}>
            <View style={styles.brandRow}>
              <LinearGradient colors={gradients.accent} style={styles.logo}>
                <Ionicons name="git-branch" size={30} color="#fff" />
              </LinearGradient>
              <Text style={styles.title}>GitManager</Text>
              <Text style={styles.subtitle}>Your personal GitHub control panel</Text>
            </View>

            <Card level="lg" style={styles.card}>
              <Text style={styles.label}>Personal access token</Text>
              <Input
                icon="key-outline"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                mono
                style={styles.input}
              />

              <Button
                title="Connect"
                onPress={handleLogin}
                loading={loading}
                fullWidth
                icon="arrow-forward-circle-outline"
                iconPosition="right"
                hapticStyle="success"
                style={styles.connectButton}
              />

              <Button
                title="Generate a fine-grained token"
                variant="ghost"
                size="sm"
                icon="open-outline"
                iconPosition="right"
                onPress={() => Linking.openURL('https://github.com/settings/tokens?type=beta')}
                style={styles.linkButton}
              />

              <View style={styles.hintRow}>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.fgSubtle} />
                <Text style={styles.hint}>
                  {' '}Required scopes: repo, workflow, read:user. Stored only on this device in
                  encrypted storage - never transmitted anywhere except directly to api.github.com.
                </Text>
              </View>
            </Card>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  brandRow: { alignItems: 'center', marginBottom: spacing.xl },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { color: colors.fgDefault, fontSize: typography.sizeXxl, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.fgMuted, fontSize: typography.sizeMd, marginTop: spacing.xs },
  card: { marginTop: spacing.sm },
  label: {
    color: colors.fgMuted,
    fontSize: typography.sizeSm,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  input: { marginBottom: spacing.lg },
  connectButton: { marginTop: spacing.xs },
  linkButton: { alignSelf: 'center', marginTop: spacing.md },
  hintRow: { flexDirection: 'row', marginTop: spacing.lg, alignItems: 'flex-start' },
  hint: { color: colors.fgSubtle, fontSize: typography.sizeSm, lineHeight: 18, flex: 1 },
});
