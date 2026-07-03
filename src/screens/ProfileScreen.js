import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Image, TouchableOpacity, Linking } from 'react-native';
import { getAuthenticatedUser } from '../services/github';
import { colors, spacing, typography } from '../theme';

export default function ProfileScreen() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAuthenticatedUser()
      .then(setUser)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error || !user) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error || 'Failed to load profile'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.header}>
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>{user.login.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.name}>{user.name || user.login}</Text>
        <Text style={styles.handle}>@{user.login}</Text>
        {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{user.public_repos}</Text>
          <Text style={styles.statLabel}>Repos</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{user.followers}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{user.following}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
      </View>

      <View style={styles.detailsCard}>
        {!!user.company && <DetailRow icon="🏢" text={user.company} />}
        {!!user.location && <DetailRow icon="📍" text={user.location} />}
        {!!user.email && <DetailRow icon="✉️" text={user.email} />}
        {!!user.blog && (
          <TouchableOpacity onPress={() => Linking.openURL(user.blog.startsWith('http') ? user.blog : `https://${user.blog}`)}>
            <DetailRow icon="🔗" text={user.blog} linkStyle />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.viewOnGithubButton}
        onPress={() => Linking.openURL(user.html_url)}
      >
        <Text style={styles.viewOnGithubText}>View on GitHub</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function DetailRow({ icon, text, linkStyle }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailIcon}>{icon}</Text>
      <Text style={[styles.detailText, linkStyle && { color: colors.accent }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.danger },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: spacing.md },
  avatarFallback: { backgroundColor: colors.accentEmphasis, alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: '#fff', fontSize: 36, fontWeight: '700' },
  name: { color: colors.fgDefault, fontSize: typography.sizeXl, fontWeight: '700' },
  handle: { color: colors.fgMuted, fontSize: typography.sizeMd, marginTop: 2 },
  bio: { color: colors.fgMuted, fontSize: typography.sizeSm, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.lg },
  statBox: { alignItems: 'center' },
  statValue: { color: colors.fgDefault, fontSize: typography.sizeXl, fontWeight: '700' },
  statLabel: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: 2 },
  detailsCard: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.lg,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  detailIcon: { marginRight: spacing.sm, width: 24 },
  detailText: { color: colors.fgDefault, fontSize: typography.sizeSm },
  viewOnGithubButton: {
    borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    padding: spacing.md, alignItems: 'center',
  },
  viewOnGithubText: { color: colors.accent, fontWeight: '600' },
});
