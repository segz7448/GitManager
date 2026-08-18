import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors, gradients, typography } from '../../theme';
import { LinearGradient } from 'expo-linear-gradient';

const BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export default function Avatar({ uri, name = '', size = 40 }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/[\s-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || '?';

  if (!uri || failed) {
    return (
      <LinearGradient
        colors={gradients.accent}
        style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
      </LinearGradient>
    );
  }

  return (
    <Image
      source={{ uri }}
      placeholder={{ blurhash: BLURHASH }}
      transition={200}
      style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.bgSubtle },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700' },
});
