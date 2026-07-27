import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Switch,
} from 'react-native';
import {
  listCodespaces,
  startCodespace,
  stopCodespace,
  deleteCodespace,
} from '../services/github';
import { setAutoRestart, listAutoRestartNames } from '../db/codespaceAutoRestart';
import { colors, spacing, typography } from '../theme';

// How often to check on codespaces with auto-restart enabled while this
// screen is open. This is a foreground-only loop - see backgroundTasks.js
// for what happens while the app isn't open (subject to Android's ~15
// minute floor on background task intervals).
const AUTO_RESTART_POLL_MS = 45 * 1000;

const STATE_COLORS = {
  Available: 'success',
  Starting: 'warning',
  Provisioning: 'warning',
  ShuttingDown: 'warning',
  Shutdown: 'fgSubtle',
  Stopping: 'warning',
  Failed: 'danger',
  Deleted: 'fgSubtle',
  Unknown: 'fgSubtle',
};

function formatRelativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CodespacesScreen({ navigation }) {
  const [codespaces, setCodespaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actioningName, setActioningName] = useState(null);
  const [autoRestartNames, setAutoRestartNames] = useState(new Set());
  const restartingRef = useRef(new Set()); // names currently being auto-restarted, to avoid duplicate calls

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await listCodespaces({ perPage: 50 });
      setCodespaces(result.codespaces || []);
    } catch (e) {
      setError(e.message || 'Failed to load codespaces');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    listAutoRestartNames().then((names) => setAutoRestartNames(new Set(names)));
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  // Foreground auto-restart loop: while any codespace has this enabled,
  // periodically check its state and start it back up if GitHub has
  // stopped it. This does NOT prevent the stop from happening (see the
  // toggle's own label/description below for why) - it just closes the
  // gap between "GitHub stopped it" and "it's running again" without the
  // user needing to notice and tap Start themselves.
  useEffect(() => {
    if (autoRestartNames.size === 0) return;

    const interval = setInterval(async () => {
      try {
        const result = await listCodespaces({ perPage: 50 });
        const latest = result.codespaces || [];
        setCodespaces(latest);
        for (const cs of latest) {
          if (
            autoRestartNames.has(cs.name) &&
            cs.state === 'Shutdown' &&
            !restartingRef.current.has(cs.name)
          ) {
            restartingRef.current.add(cs.name);
            startCodespace(cs.name)
              .then((updated) => {
                setCodespaces((prev) => prev.map((c) => (c.name === updated.name ? updated : c)));
              })
              .catch(() => {})
              .finally(() => restartingRef.current.delete(cs.name));
          }
        }
      } catch (e) {
        // Transient network/rate-limit issue - just try again next tick.
      }
    }, AUTO_RESTART_POLL_MS);

    return () => clearInterval(interval);
  }, [autoRestartNames]);

  const handleToggleAutoRestart = async (codespace) => {
    const nowEnabled = !autoRestartNames.has(codespace.name);
    setAutoRestartNames((prev) => {
      const next = new Set(prev);
      if (nowEnabled) next.add(codespace.name);
      else next.delete(codespace.name);
      return next;
    });
    await setAutoRestart(codespace.name, nowEnabled);
    if (nowEnabled) {
      Alert.alert(
        'Auto-restart enabled',
        `While GitManager is open, if GitHub stops "${codespace.display_name || codespace.name}" for being idle, it'll be started back up automatically - usually within a minute of being detected stopped. This can't prevent the idle stop itself (only real activity inside the codespace does that), just shorten how long it stays stopped.`
      );
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleOpen = (codespace) => {
    if (codespace.state !== 'Available') {
      Alert.alert(
        'Codespace not running',
        'Start it first, then open it once it shows "Available".'
      );
      return;
    }
    navigation.navigate('CodespaceWebView', {
      webUrl: codespace.web_url,
      displayName: codespace.display_name || codespace.name,
    });
  };

  const handleStart = async (codespace) => {
    setActioningName(codespace.name);
    try {
      const updated = await startCodespace(codespace.name);
      setCodespaces((prev) => prev.map((c) => (c.name === codespace.name ? updated : c)));
    } catch (e) {
      Alert.alert('Failed to start', e.message);
    } finally {
      setActioningName(null);
    }
  };

  const handleStop = async (codespace) => {
    setActioningName(codespace.name);
    try {
      const updated = await stopCodespace(codespace.name);
      setCodespaces((prev) => prev.map((c) => (c.name === codespace.name ? updated : c)));
    } catch (e) {
      Alert.alert('Failed to stop', e.message);
    } finally {
      setActioningName(null);
    }
  };

  const handleDelete = (codespace) => {
    Alert.alert(
      'Delete this codespace?',
      `This permanently deletes "${codespace.display_name || codespace.name}" and any uncommitted work inside it. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActioningName(codespace.name);
            try {
              await deleteCodespace(codespace.name);
              setCodespaces((prev) => prev.filter((c) => c.name !== codespace.name));
            } catch (e) {
              Alert.alert('Failed to delete', e.message);
            } finally {
              setActioningName(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          {error.toLowerCase().includes('scope') || error.includes('403') ? (
            <Text style={styles.errorHint}>
              Your token may be missing the "codespace" scope. Check Settings → Security.
            </Text>
          ) : null}
          <TouchableOpacity onPress={load} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={codespaces}
          keyExtractor={(c) => c.name}
          contentContainerStyle={{ padding: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListHeaderComponent={
            codespaces.length > 0 ? (
              <View style={styles.infoCard}>
                <Text style={styles.infoCardText}>
                  "Auto-restart" checks periodically while GitManager is open and starts a
                  codespace back up if GitHub has stopped it for being idle. It can't stop the
                  idle timeout from happening in the first place - only real activity inside the
                  codespace does that - it just shortens how long it stays stopped.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={styles.emptyText}>
                No codespaces yet. Create one from a repository's Git Tools menu.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity onPress={() => handleOpen(item)}>
                <View style={styles.headerRow}>
                  <View style={[styles.stateDot, { backgroundColor: colors[STATE_COLORS[item.state] || 'fgSubtle'] }]} />
                  <Text style={styles.repoName} numberOfLines={1}>
                    {item.repository?.full_name || 'unknown repo'}
                  </Text>
                </View>
                <Text style={styles.displayName} numberOfLines={1}>
                  {item.display_name || item.name}
                </Text>
                <Text style={styles.meta}>
                  {item.state} · {item.git_status?.ref || 'unknown branch'} · {item.machine?.display_name || 'default machine'}
                </Text>
                <Text style={styles.metaSubtle}>
                  Last used {formatRelativeTime(item.last_used_at)}
                </Text>
                {(item.git_status?.has_uncommitted_changes || item.git_status?.has_unpushed_changes) && (
                  <Text style={styles.uncommittedWarning}>
                    ⚠ Has {item.git_status?.has_uncommitted_changes ? 'uncommitted' : 'unpushed'} changes
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.actionsRow}>
                {item.state === 'Available' ? (
                  <TouchableOpacity
                    style={styles.stopButton}
                    onPress={() => handleStop(item)}
                    disabled={actioningName === item.name}
                  >
                    {actioningName === item.name ? (
                      <ActivityIndicator color={colors.warning} size="small" />
                    ) : (
                      <Text style={styles.stopButtonText}>Stop</Text>
                    )}
                  </TouchableOpacity>
                ) : item.state === 'Shutdown' ? (
                  <TouchableOpacity
                    style={styles.startButton}
                    onPress={() => handleStart(item)}
                    disabled={actioningName === item.name}
                  >
                    {actioningName === item.name ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.startButtonText}>Start</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.transitionalState}>
                    <ActivityIndicator color={colors.fgSubtle} size="small" />
                    <Text style={styles.transitionalText}>{item.state}…</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.openButton}
                  onPress={() => handleOpen(item)}
                  disabled={item.state !== 'Available'}
                >
                  <Text style={[styles.openButtonText, item.state !== 'Available' && styles.disabledText]}>
                    Open
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)} disabled={actioningName === item.name}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.autoRestartRow}>
                <Text style={styles.autoRestartLabel}>Auto-restart if GitHub stops it</Text>
                <Switch
                  value={autoRestartNames.has(item.name)}
                  onValueChange={() => handleToggleAutoRestart(item)}
                  trackColor={{ false: colors.borderMuted, true: colors.accentEmphasis }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  centerBox: { alignItems: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  errorText: { color: colors.danger, textAlign: 'center' },
  errorHint: { color: colors.fgSubtle, fontSize: typography.sizeSm, textAlign: 'center', marginTop: spacing.sm },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', lineHeight: 20 },
  infoCard: {
    backgroundColor: 'rgba(88,166,255,0.08)', borderColor: colors.accent, borderWidth: 1,
    borderRadius: 8, padding: spacing.sm, marginBottom: spacing.md,
  },
  infoCardText: { color: colors.fgMuted, fontSize: typography.sizeSm, lineHeight: 18 },
  card: {
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  stateDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  repoName: { color: colors.fgMuted, fontSize: typography.sizeSm, flex: 1 },
  displayName: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '700', marginTop: 4 },
  meta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 4 },
  metaSubtle: { color: colors.fgSubtle, fontSize: 11, marginTop: 2 },
  uncommittedWarning: { color: colors.warning, fontSize: typography.sizeSm, marginTop: spacing.sm },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  startButton: { backgroundColor: colors.successEmphasis, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  startButtonText: { color: '#fff', fontSize: typography.sizeSm, fontWeight: '600' },
  stopButton: { borderColor: colors.warning, borderWidth: 1, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  stopButtonText: { color: colors.warning, fontSize: typography.sizeSm, fontWeight: '600' },
  transitionalState: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  transitionalText: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  openButton: { flex: 1, alignItems: 'flex-end' },
  openButtonText: { color: colors.accent, fontSize: typography.sizeSm, fontWeight: '600' },
  disabledText: { color: colors.fgSubtle },
  deleteText: { color: colors.danger, fontSize: typography.sizeSm, fontWeight: '600' },
  autoRestartRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.sm, paddingTop: spacing.sm, borderTopColor: colors.borderMuted, borderTopWidth: 1,
  },
  autoRestartLabel: { color: colors.fgMuted, fontSize: typography.sizeSm, flex: 1, marginRight: spacing.sm },
});
