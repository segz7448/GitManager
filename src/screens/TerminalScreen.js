import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { getTermuxStatus, runShellCommand } from '../services/termux';
import { colors, spacing, typography } from '../theme';

export default function TerminalScreen() {
  const [status, setStatus] = useState(null); // { termuxInstalled, hasPermission }
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [command, setCommand] = useState('');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]); // [{command, stdout, stderr, exitCode, errmsg, timestamp}]
  const scrollRef = useRef(null);

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

  const handleRun = async () => {
    const cmd = command.trim();
    if (!cmd) return;
    setRunning(true);
    setCommand('');

    const entry = { command: cmd, timestamp: Date.now(), pending: true };
    setHistory((prev) => [...prev, entry]);

    try {
      const result = await runShellCommand(cmd);
      setHistory((prev) =>
        prev.map((h) => (h === entry ? { ...h, ...result, pending: false } : h))
      );
    } catch (e) {
      setHistory((prev) =>
        prev.map((h) =>
          h === entry ? { ...h, pending: false, error: e.message || 'Command failed' } : h
        )
      );
    } finally {
      setRunning(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
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
          <Text style={styles.code}>echo "allow-external-apps=true" {'>>'} ~/.termux/termux.properties{'\n'}termux-reload-settings</Text>
          {'\n\n'}2. Grant the permission in Android Settings → Apps → GitManager → Permissions.
        </Text>
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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.terminal}
        contentContainerStyle={{ padding: spacing.md }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {history.length === 0 && (
          <Text style={styles.hintText}>
            Commands run in your real Termux environment — actual bash, actual git, your actual
            filesystem. Try: git -C ~/GitManager status
          </Text>
        )}
        {history.map((h, idx) => (
          <View key={idx} style={styles.entry}>
            <Text style={styles.promptLine}>$ {h.command}</Text>
            {h.pending && <ActivityIndicator style={{ marginTop: spacing.xs }} color={colors.accent} size="small" />}
            {h.error && <Text style={styles.errorLine}>{h.error}</Text>}
            {h.stdout ? <Text style={styles.stdoutLine}>{h.stdout}</Text> : null}
            {h.stderr ? <Text style={styles.stderrLine}>{h.stderr}</Text> : null}
            {!h.pending && !h.error && (
              <Text style={styles.exitLine}>
                exit {h.exitCode}{h.errmsg ? ` · ${h.errmsg}` : ''}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={styles.inputBar}>
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
          editable={!running}
        />
        <TouchableOpacity onPress={handleRun} disabled={running || !command.trim()} style={styles.runButton}>
          {running ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.runButtonText}>Run</Text>}
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
  setupButtonText: { color: '#fff', fontWeight: '600' },
  retryText: { color: colors.accent, fontSize: typography.sizeSm },
  terminal: { flex: 1 },
  hintText: { color: colors.fgSubtle, fontSize: typography.sizeSm, fontFamily: typography.mono, lineHeight: 18 },
  entry: { marginBottom: spacing.md },
  promptLine: { color: colors.accent, fontFamily: typography.mono, fontSize: 13, fontWeight: '700' },
  stdoutLine: { color: '#c9d1d9', fontFamily: typography.mono, fontSize: 12, marginTop: 2, lineHeight: 16 },
  stderrLine: { color: colors.warning, fontFamily: typography.mono, fontSize: 12, marginTop: 2, lineHeight: 16 },
  errorLine: { color: colors.danger, fontFamily: typography.mono, fontSize: 12, marginTop: 2 },
  exitLine: { color: colors.fgSubtle, fontFamily: typography.mono, fontSize: 11, marginTop: 4 },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.sm,
    borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.bgSubtle,
  },
  promptSymbol: { color: colors.accent, fontFamily: typography.mono, fontWeight: '700', marginHorizontal: spacing.sm },
  input: {
    flex: 1, color: colors.fgDefault, fontFamily: typography.mono, fontSize: 13,
    paddingVertical: spacing.sm,
  },
  runButton: { backgroundColor: colors.successEmphasis, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginLeft: spacing.sm },
  runButtonText: { color: '#fff', fontWeight: '600', fontSize: typography.sizeSm },
});
