import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme';

/**
 * Subtle top-to-bottom gradient wash instead of a flat background color -
 * cheap way to add depth without touching every screen's layout logic.
 */
export default function Screen({ children, style }) {
  return (
    <View style={[styles.flex, style]}>
      <LinearGradient
        colors={[colors.bgSubtle, colors.bgDefault, colors.bgInset]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
