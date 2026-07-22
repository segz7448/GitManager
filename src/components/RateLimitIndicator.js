import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getRateLimitState, subscribeToRateLimit, isRateLimitLow } from '../services/rateLimitTracker';
import { colors, spacing, typography } from '../theme';

function formatResetTime(resetAt) {
  if (!resetAt) return '';
  const now = Date.now();
  const diffMs = resetAt.getTime() - now;
  if (diffMs <= 0) return 'now';
  const mins = Math.ceil(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  return `at ${resetAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Shows the current GitHub REST API rate limit usage, updating live as
 * requests happen elsewhere in the app. Renders nothing until at least
 * one API call has been made this session (there's nothing to show
 * before that), so it doesn't clutter a fresh app launch.
 */
export default function RateLimitIndicator() {
  const [state, setState] = useState(getRateLimitState());

  useEffect(() => {
    const unsubscribe = subscribeToRateLimit(setState);
    return unsubscribe;
  }, []);

  if (state.limit == null || state.remaining == null) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>
          No API calls made yet this session - usage will show here once you do something that talks to GitHub.
        </Text>
      </View>
    );
  }

  const low = isRateLimitLow();
  const pct = Math.max(0, Math.min(1, state.remaining / state.limit));

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>API usage{state.resource ? ` (${state.resource})` : ''}</Text>
        <Text style={[styles.countText, low && styles.countTextLow]}>
          {state.remaining} / {state.limit}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }, low && styles.fillLow]} />
      </View>
      {low && (
        <Text style={styles.warningText}>
          Running low. Resets {formatResetTime(state.resetAt)} - heavier actions (clone, cherry-pick,
          bulk rename) may fail with a rate-limit error until then.
        </Text>
      )}
      {state.resetAt && !low && (
        <Text style={styles.resetText}>Resets {formatResetTime(state.resetAt)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md,
  },
  emptyText: { color: colors.fgSubtle, fontSize: typography.sizeSm, lineHeight: 18 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.fgMuted, fontSize: typography.sizeSm, textTransform: 'uppercase' },
  countText: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '700' },
  countTextLow: { color: colors.danger },
  track: {
    height: 6, borderRadius: 3, backgroundColor: colors.borderMuted, overflow: 'hidden', marginTop: spacing.sm,
  },
  fill: { height: '100%', backgroundColor: colors.accentEmphasis, borderRadius: 3 },
  fillLow: { backgroundColor: colors.danger },
  warningText: { color: colors.danger, fontSize: typography.sizeSm, marginTop: spacing.sm, lineHeight: 18 },
  resetText: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: spacing.sm },
});
