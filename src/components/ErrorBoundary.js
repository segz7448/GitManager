import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing, typography } from '../theme';

/**
 * A single top-level error boundary wrapping the whole app. React error
 * boundaries only catch errors thrown during render (not in event
 * handlers or async code, which are already caught individually via
 * try/catch + Alert.alert throughout this app's screens) - this is
 * specifically the safety net for the case that was previously missing
 * entirely: an unexpected render-time crash anywhere taking down the
 * whole app to a white screen or an OS-level crash, with no way back in
 * without force-closing and reopening.
 *
 * This is intentionally a single app-wide boundary rather than one per
 * screen - React Navigation doesn't make per-route boundaries simple to
 * wire up without touching every screen registration, and a single
 * top-level catch already turns "the app is dead" into "tap Try Again",
 * which is the meaningful improvement here.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, errorInfo?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              The app hit an unexpected error and this screen couldn't render. Your repos and
              local data are unaffected - this only interrupted the current view.
            </Text>
            {this.state.error?.message ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{this.state.error.message}</Text>
              </View>
            ) : null}
            <TouchableOpacity style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.fgDefault, fontSize: typography.sizeXl, fontWeight: '700', marginBottom: spacing.md, textAlign: 'center' },
  subtitle: { color: colors.fgMuted, fontSize: typography.sizeSm, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  errorBox: {
    backgroundColor: colors.bgSubtle, borderColor: colors.danger, borderWidth: 1,
    borderRadius: 8, padding: spacing.md, marginBottom: spacing.lg, width: '100%',
  },
  errorText: { color: colors.danger, fontFamily: typography.mono, fontSize: 12 },
  button: { backgroundColor: colors.accentEmphasis, borderRadius: 10, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: typography.sizeMd },
});
