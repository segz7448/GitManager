import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import * as ExpoBlur from 'expo-blur';

// BlurTargetView + the blurTarget prop only exist in expo-blur's SDK 55+
// line (package.json now pins the matching ~57.0.2 release - see the PR
// notes). Feature-detecting here means that if anyone's local install ever
// drifts back to an older expo-blur, this degrades to a plain translucent
// panel instead of crashing on an undefined component, the same class of
// bug that took down app launch before (see index.js).
const { BlurView } = ExpoBlur;
const BlurTargetView = ExpoBlur.BlurTargetView || View;
const hasLiveBlur = Boolean(ExpoBlur.BlurTargetView);

/**
 * A genuine live-blur glass panel, shown briefly on cold start while
 * AuthContext checks for a stored token (see App.js's RootNavigator).
 *
 * Unlike the app icon (which Android forces to be a flat, static image —
 * see the notes in the git history / PR description for why), this is
 * real-time: three colored blobs drift continuously behind a BlurTargetView,
 * and the BlurView panel re-blurs that live content every frame using
 * Android's RenderNode blur API (SDK 31+, via expo-blur's
 * 'dimezisBlurViewSdk31Plus' method - falls back to a plain translucent
 * panel with no blur on pre-Android-12 devices, which is a platform
 * limitation, not a bug).
 */
function useDrift(duration, delay) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [value, duration, delay]);
  return value;
}

export default function GlassSplash() {
  const blurTarget = useRef(null);

  const red = useDrift(3400, 0);
  const orange = useDrift(4200, 250);
  const blue = useDrift(3800, 500);

  const redStyle = {
    transform: [
      { translateX: red.interpolate({ inputRange: [0, 1], outputRange: [-36, 44] }) },
      { translateY: red.interpolate({ inputRange: [0, 1], outputRange: [-24, 30] }) },
    ],
  };
  const orangeStyle = {
    transform: [
      { translateX: orange.interpolate({ inputRange: [0, 1], outputRange: [46, -32] }) },
      { translateY: orange.interpolate({ inputRange: [0, 1], outputRange: [28, -38] }) },
    ],
  };
  const blueStyle = {
    transform: [
      { translateX: blue.interpolate({ inputRange: [0, 1], outputRange: [-30, 48] }) },
      { translateY: blue.interpolate({ inputRange: [0, 1], outputRange: [40, -22] }) },
    ],
  };

  return (
    <View style={styles.root}>
      <BlurTargetView ref={blurTarget} style={StyleSheet.absoluteFill}>
        <Animated.View style={[styles.blob, styles.blobRed, redStyle]} />
        <Animated.View style={[styles.blob, styles.blobOrange, orangeStyle]} />
        <Animated.View style={[styles.blob, styles.blobBlue, blueStyle]} />
      </BlurTargetView>

      <BlurView
        {...(hasLiveBlur ? { blurTarget, blurMethod: 'dimezisBlurViewSdk31Plus' } : null)}
        intensity={92}
        tint="dark"
        style={styles.card}
      >
        <View style={styles.glyphStack}>
          <Text style={[styles.glyph, styles.glyphBlue]}>G</Text>
          <Text style={[styles.glyph, styles.glyphOrange]}>G</Text>
          <Text style={[styles.glyph, styles.glyphRed]}>G</Text>
          <Text style={[styles.glyph, styles.glyphMain]}>G</Text>
        </View>
      </BlurView>
    </View>
  );
}

const CARD = 176;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  blob: { position: 'absolute', width: 280, height: 280, borderRadius: 140 },
  blobRed: { backgroundColor: '#ff3b30', top: '16%', left: '8%', opacity: 0.8 },
  blobOrange: { backgroundColor: '#ff9500', bottom: '14%', right: '6%', opacity: 0.8 },
  blobBlue: { backgroundColor: '#0a84ff', top: '42%', right: '22%', opacity: 0.8 },
  card: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -CARD / 2,
    marginLeft: -CARD / 2,
    width: CARD,
    height: CARD,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphStack: { alignItems: 'center', justifyContent: 'center' },
  glyph: {
    position: 'absolute',
    fontSize: 92,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  glyphMain: { color: '#ffffff' },
  glyphRed: { color: '#ff3b30', opacity: 0.65, top: 3, left: -3 },
  glyphOrange: { color: '#ff9500', opacity: 0.65, top: 3, left: 3 },
  glyphBlue: { color: '#0a84ff', opacity: 0.65, top: -4, left: 0 },
});
