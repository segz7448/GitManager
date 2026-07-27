import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, BackHandler, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, spacing, typography } from '../theme';

// VS Code Web (what a codespace's web_url actually opens) is a full
// desktop-oriented editor UI - sidebar, tabs, panel, command palette -
// that Microsoft builds and doesn't ship a distinct "mobile mode" for.
// This screen can't redesign that UI (it's not this app's markup to
// change), but it can make the *container* around it behave properly on
// a phone: a correct mobile viewport so text/buttons aren't tiny by
// default, pinch-to-zoom enabled so cramped panels are still reachable,
// the Android back button navigating within the page instead of
// exiting, and a reload/external-browser fallback if the in-app WebView
// ever struggles with something this specific web app needs.
const MOBILE_VIEWPORT_JS = `
  (function() {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1, maximum-scale=3, user-scalable=yes';
  })();
  true;
`;

export default function CodespaceWebViewScreen({ route, navigation }) {
  const { webUrl, displayName } = route.params;
  const webViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  navigation.setOptions({ title: displayName || 'Codespace' });

  const handleBackPress = useCallback(() => {
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
      return true;
    }
    return false;
  }, [canGoBack]);

  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => sub.remove();
  }, [handleBackPress]);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => webViewRef.current?.reload()} style={styles.toolbarButton}>
          <Text style={styles.toolbarButtonText}>Reload</Text>
        </TouchableOpacity>
        <Text style={styles.toolbarHint} numberOfLines={1}>{webUrl}</Text>
        <TouchableOpacity onPress={() => Linking.openURL(webUrl)} style={styles.toolbarButton}>
          <Text style={styles.toolbarButtonText}>Open in Browser</Text>
        </TouchableOpacity>
      </View>

      {loadError ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoadError(null);
              setLoading(true);
              webViewRef.current?.reload();
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL(webUrl)} style={{ marginTop: spacing.md }}>
            <Text style={styles.fallbackLink}>Open in external browser instead</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: webUrl }}
          style={styles.webview}
          injectedJavaScript={MOBILE_VIEWPORT_JS}
          onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={({ nativeEvent }) => {
            setLoading(false);
            setLoadError(nativeEvent.description || 'Failed to load the codespace.');
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.centerContainer}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.loadingText}>Connecting to codespace…</Text>
            </View>
          )}
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          domStorageEnabled
          javaScriptEnabled
        />
      )}
      {loading && !loadError && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1, backgroundColor: colors.bgSubtle,
  },
  toolbarButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  toolbarButtonText: { color: colors.accent, fontSize: typography.sizeSm, fontWeight: '600' },
  toolbarHint: { flex: 1, color: colors.fgSubtle, fontSize: 11, textAlign: 'center' },
  webview: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  loadingText: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: spacing.md },
  loadingOverlay: {
    position: 'absolute', top: 44, left: 0, right: 0, alignItems: 'center', paddingTop: spacing.md,
  },
  errorText: { color: colors.danger, textAlign: 'center', marginBottom: spacing.md },
  retryButton: { backgroundColor: colors.accentEmphasis, borderRadius: 8, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  fallbackLink: { color: colors.accent, fontSize: typography.sizeSm },
});
