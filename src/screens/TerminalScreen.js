import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
  FlatList,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { getTermuxStatus, startBackgroundCommand, pollJob, killJob, cleanupJob } from '../services/termux';
import { createSession, updateSession, listSessions, deleteSession } from '../db/terminalSessions';
import { colors, spacing, typography } from '../theme';

const SETUP_COMMANDS = 'mkdir -p ~/.termux\necho "allow-external-apps=true" >> ~/.termux/termux.properties\ntermux-reload-settings';
const POLL_INTERVAL_MS = 1500;

function isAllowExternalAppsError(text) {
  return !!text && text.toLowerCase().includes('allow-external-apps');
}

export default function TerminalScreen() {
  const [status, setStatus] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [sessions, setSessions] = useState([]); // local tab list, mirrors terminal_sessions table
  const [activeJobId, setActiveJobId] = useState(null);
  const [command, setCommand] = useState('');
  const [starting, setStarting] = useState(false);
  const scrollRef = useRef(null);
  const pollTimersRef = useRef({}); // jobId -> interval handle

  const checkStatus = async () => {
    setCheckingStatus(true);
    try {
      const s = await getTermuxStatus();
      setStatus(s);
    } catch (e) {
      setStatus({ termuxInstalled: false, hasPermission: false, error: e.message });
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  // On mount, restore any sessions from previous app launches and resume
  // polling the ones that weren't finished yet - this is what makes
  // sessions "persistent" across the app being closed and reopened.
  useEffect(() => {
    listSessions().then((existing) => {
      setSessions(existing);
      if (existing.length > 0) setActiveJobId(existing[existing.length - 1].jobId);
      existing.forEach((s) => {
        if (s.status !== 'finished') startPolling(s.jobId);
      });
    });
    return () => {
      Object.values(pollTimersRef.current).forEach(clearInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPolling = useCallback((jobId) => {
    if (pollTimersRef.current[jobId]) return; // already polling
    const tick = async () => {
      try {
        const result = await pollJob(jobId);
        setSessions((prev) =>
          prev.map((s) =>
            s.jobId === jobId
              ? { ...s, lastLog: result.log, status: result.running ? 'running' : 'finished', exitCode: result.exitCode }
              : s
          )
        );
        await updateSession(jobId, {
          lastLog: result.log,
          status: result.running ? 'running' : 'finished',
          exitCode: result.exitCode,
        });
        if (!result.running) {
          clearInterval(pollTimersRef.current[jobId]);
          delete pollTimersRef.current[jobId];
        }
      } catch (e) {
        clearInterval(pollTimersRef.current[jobId]);
        delete pollTimersRef.current[jobId];
      }
    };
    pollTimersRef.current[jobId] = setInterval(tick, POLL_INTERVAL_MS);
    tick(); // immediate first poll instead of waiting a full interval
  }, []);

  const handleRun = async () => {
    const cmd = command.trim();
    if (!cmd) return;
    setStarting(true);
    setCommand('');
    try {
      const jobId = await createSession(cmd, cmd.length > 24 ? `${cmd.slice(0, 24)}…` : cmd);
      const newSession = {
        jobId, tabLabel: cmd, command: cmd, status: 'starting', lastLog: '', exitCode: null,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      setSessions((prev) => [...prev, newSession]);
      setActiveJobId(jobId);

      await startBackgroundCommand(jobId, cmd);
      await updateSession(jobId, { status: 'running' });
      setSessions((prev) => prev.map((s) => (s.jobId === jobId ? { ...s, status: 'running' } : s)));
      startPolling(jobId);
    } catch (e) {
      Alert.alert('Failed to start command', e.message);
    } finally {
      setStarting(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleKillActive = () => {
    if (!activeJobId) return;
    Alert.alert('Stop this command?', 'This sends a kill signal to the running process.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: async () => {
          try {
            await killJob(activeJobId);
          } catch (e) {
            Alert.alert('Failed to stop', e.message);
          }
        },
      },
    ]);
  };

  const handleCloseTab = (jobId) => {
    Alert.alert('Close this tab?', "This stops watching this command and removes its log. If it's still running in the background, it will keep running in Termux.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close',
        style: 'destructive',
        onPress: async () => {
          if (pollTimersRef.current[jobId]) {
            clearInterval(pollTimersRef.current[jobId]);
            delete pollTimersRef.current[jobId];
          }
          await deleteSession(jobId);
          cleanupJob(jobId).catch(() => {});
          setSessions((prev) => {
            const next = prev.filter((s) => s.jobId !== jobId);
            if (activeJobId === jobId) setActiveJobId(next.length > 0 ? next[next.length - 1].jobId : null);
            return next;
          });
        },
      },
    ]);
  };

  const handleNewTab = () => {
    setActiveJobId(null);
  };

  if (checkingStatus) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!status?.termuxInstalled) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.setupTitle}>Termux not found</Text>
        <Text style={styles.setupText}>
          This feature runs commands in your real Termux app via Android's RUN_COMMAND intent.
          Install Termux first.
        </Text>
        <TouchableOpacity
          style={styles.setupButton}
          onPress={() => Linking.openURL('https://f-droid.org/packages/com.termux/')}
        >
          <Text style={styles.setupButtonText}>Get Termux (F-Droid)</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={checkStatus} style={{ marginTop: spacing.md }}>
          <Text style={styles.retryText}>I've installed it — recheck</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!status?.hasPermission) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.setupTitle}>Permission needed</Text>
        <Text style={styles.setupText}>
          GitManager needs the "Run commands in Termux environment" permission, and Termux needs
          external apps allowed. Two steps:
          {'\n\n'}1. In Termux, run:{'\n'}
          <Text style={styles.code}>{SETUP_COMMANDS}</Text>
          {'\n\n'}2. Grant the permission in Android Settings → Apps → GitManager → Permissions.
        </Text>
        <TouchableOpacity
          style={styles.copyButton}
          onPress={async () => {
            await Clipboard.setStringAsync(SETUP_COMMANDS);
            Alert.alert('Copied', 'Paste this into Termux with your volume-down + V, or long-press to paste.');
          }}
        >
          <Text style={styles.copyButtonText}>Copy setup commands</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.setupButton}
          onPress={() => Linking.openSettings()}
        >
          <Text style={styles.setupButtonText}>Open App Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={checkStatus} style={{ marginTop: spacing.md }}>
          <Text style={styles.retryText}>I've done this — recheck</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeSession = sessions.find((s) => s.jobId === activeJobId) || null;
  const setupErrorText = activeSession && isAllowExternalAppsError(activeSession.lastLog) ? activeSession.lastLog : null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <FlatList
        horizontal
        data={sessions}
        keyExtractor={(s) => s.jobId}
        style={styles.tabsRow}
        contentContainerStyle={{ paddingHorizontal: spacing.sm }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.tab, activeJobId === item.jobId && styles.tabActive]}
            onPress={() => setActiveJobId(item.jobId)}
            onLongPress={() => handleCloseTab(item.jobId)}
          >
            <View style={[styles.tabDot, item.status === 'running' ? styles.tabDotRunning : item.status === 'finished' ? (item.exitCode === 0 ? styles.tabDotSuccess : styles.tabDotError) : styles.tabDotStarting]} />
            <Text style={[styles.tabText, activeJobId === item.jobId && styles.tabTextActive]} numberOfLines={1}>
              {item.tabLabel}
            </Text>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <TouchableOpacity style={styles.newTabButton} onPress={handleNewTab}>
            <Text style={styles.newTabButtonText}>+ New</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        ref={scrollRef}
        style={styles.terminal}
        contentContainerStyle={{ padding: spacing.md }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {!activeSession ? (
          <Text style={styles.hintText}>
            Commands run in your real Termux environment — actual bash, actual git, your actual
            filesystem. Output streams in by polling a log file every {POLL_INTERVAL_MS / 1000}s
            (Android's RUN_COMMAND has no live-streaming channel, so this is the closest
            equivalent). Try: git -C ~/GitManager status
          </Text>
        ) : setupErrorText ? (
          <View style={styles.setupCallout}>
            <Text style={styles.setupCalloutTitle}>One-time Termux setup needed</Text>
            <Text style={styles.setupCalloutText}>
              Run this inside the Termux app itself (not here), then try again:
            </Text>
            <Text style={styles.code}>{SETUP_COMMANDS}</Text>
            <TouchableOpacity
              style={styles.copyButtonSmall}
              onPress={async () => {
                await Clipboard.setStringAsync(SETUP_COMMANDS);
                Alert.alert('Copied', 'Paste this into Termux.');
              }}
            >
              <Text style={styles.copyButtonText}>Copy commands</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.promptLine}>$ {activeSession.command}</Text>
            {(activeSession.status === 'starting' || activeSession.status === 'running') && (
              <ActivityIndicator style={{ marginTop: spacing.xs, alignSelf: 'flex-start' }} color={colors.accent} size="small" />
            )}
            <Text style={styles.stdoutLine}>{activeSession.lastLog || ''}</Text>
            {activeSession.status === 'finished' && (
              <Text style={styles.exitLine}>
                exit {activeSession.exitCode ?? 'unknown'}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        {activeSession && activeSession.status === 'running' && (
          <TouchableOpacity onPress={handleKillActive} style={styles.stopButton}>
            <Text style={styles.stopButtonText}>Stop</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.promptSymbol}>$</Text>
        <TextInput
          style={styles.input}
          placeholder="git -C ~/myrepo push"
          placeholderTextColor={colors.fgSubtle}
          value={command}
          onChangeText={setCommand}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleRun}
          editable={!starting}
        />
        <TouchableOpacity onPress={handleRun} disabled={starting || !command.trim()} style={styles.runButton}>
          {starting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.runButtonText}>Run</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgInset },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  setupTitle: { color: colors.fgDefault, fontSize: typography.sizeLg, fontWeight: '700', marginBottom: spacing.md },
  setupText: { color: colors.fgMuted, fontSize: typography.sizeSm, lineHeight: 20, textAlign: 'left' },
  code: { fontFamily: typography.mono, color: colors.accent, fontSize: 12 },
  setupButton: { backgroundColor: colors.accentEmphasis, borderRadius: 8, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  copyButton: { borderColor: colors.accent, borderWidth: 1, borderRadius: 8, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  copyButtonSmall: { backgroundColor: colors.accentEmphasis, borderRadius: 6, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, marginTop: spacing.sm, alignSelf: 'flex-start' },
  copyButtonText: { color: '#fff', fontWeight: '600', fontSize: typography.sizeSm },
  setupCallout: {
    backgroundColor: colors.bgSubtle, borderColor: colors.warning, borderWidth: 1,
    borderRadius: 8, padding: spacing.sm, marginTop: spacing.xs,
  },
  setupCalloutTitle: { color: colors.warning, fontWeight: '700', fontSize: typography.sizeSm },
  setupCalloutText: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 4, marginBottom: spacing.xs },
  setupButtonText: { color: '#fff', fontWeight: '600' },
  retryText: { color: colors.accent, fontSize: typography.sizeSm },
  tabsRow: { maxHeight: 44, borderBottomColor: colors.border, borderBottomWidth: 1, backgroundColor: colors.bgSubtle },
  tab: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, marginVertical: spacing.xs,
    marginRight: spacing.xs, borderRadius: 6, maxWidth: 140,
  },
  tabActive: { backgroundColor: colors.bgInset },
  tabDot: { width: 6, height: 6, borderRadius: 3, marginRight: spacing.xs },
  tabDotStarting: { backgroundColor: colors.fgSubtle },
  tabDotRunning: { backgroundColor: colors.warning },
  tabDotSuccess: { backgroundColor: colors.success },
  tabDotError: { backgroundColor: colors.danger },
  tabText: { color: colors.fgMuted, fontSize: 12, fontFamily: typography.mono },
  tabTextActive: { color: colors.fgDefault, fontWeight: '700' },
  newTabButton: { justifyContent: 'center', paddingHorizontal: spacing.sm },
  newTabButtonText: { color: colors.accent, fontWeight: '600', fontSize: 12 },
  terminal: { flex: 1 },
  hintText: { color: colors.fgSubtle, fontSize: typography.sizeSm, fontFamily: typography.mono, lineHeight: 18 },
  promptLine: { color: colors.accent, fontFamily: typography.mono, fontSize: 13, fontWeight: '700' },
  stdoutLine: { color: '#c9d1d9', fontFamily: typography.mono, fontSize: 12, marginTop: 2, lineHeight: 16 },
  exitLine: { color: colors.fgSubtle, fontFamily: typography.mono, fontSize: 11, marginTop: 4 },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.sm,
    borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.bgSubtle,
  },
  stopButton: { backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginRight: spacing.sm },
  stopButtonText: { color: '#fff', fontWeight: '600', fontSize: 11 },
  promptSymbol: { color: colors.accent, fontFamily: typography.mono, fontWeight: '700', marginRight: spacing.sm },
  input: {
    flex: 1, color: colors.fgDefault, fontFamily: typography.mono, fontSize: 13,
    paddingVertical: spacing.sm,
  },
  runButton: { backgroundColor: colors.successEmphasis, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginLeft: spacing.sm },
  runButtonText: { color: '#fff', fontWeight: '600', fontSize: typography.sizeSm },
});
