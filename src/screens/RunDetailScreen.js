import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { listRunJobs, getJobLogsText, getWorkflowRun, rerunWorkflow, cancelWorkflowRun } from '../services/github';
import { parseLogErrors } from '../utils/logParser';
import { colors, spacing, typography, statusColors } from '../theme';

export default function RunDetailScreen({ route, navigation }) {
  const { owner, repo, runId, runName } = route.params;
  const [run, setRun] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedJob, setSelectedJob] = useState(null);
  const [logText, setLogText] = useState(null);
  const [logLoading, setLogLoading] = useState(false);
  const [parsedErrors, setParsedErrors] = useState([]);
  const [view, setView] = useState('jobs'); // 'jobs' | 'log' | 'errors'

  navigation.setOptions({ title: runName || `Run #${runId}` });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [runData, jobsData] = await Promise.all([
        getWorkflowRun(owner, repo, runId),
        listRunJobs(owner, repo, runId),
      ]);
      setRun(runData);
      setJobs(jobsData.jobs || []);
    } catch (e) {
      setError(e.message || 'Failed to load run');
    } finally {
      setLoading(false);
    }
  }, [owner, repo, runId]);

  useEffect(() => {
    load();
  }, [load]);

  const openJobLogs = async (job) => {
    setSelectedJob(job);
    setView('log');
    setLogLoading(true);
    setLogText(null);
    setParsedErrors([]);
    try {
      const text = await getJobLogsText(owner, repo, job.id);
      setLogText(text);
      const errors = parseLogErrors(text);
      setParsedErrors(errors);
    } catch (e) {
      Alert.alert('Failed to load logs', e.message);
      setView('jobs');
    } finally {
      setLogLoading(false);
    }
  };

  const handleDownloadLog = async () => {
    if (!logText || !selectedJob) return;
    try {
      const fileName = `${repo}-job-${selectedJob.id}.txt`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, logText, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/plain', dialogTitle: 'Save log file' });
      } else {
        Alert.alert('Saved', `Log saved to ${fileUri}`);
      }
    } catch (e) {
      Alert.alert('Download failed', e.message);
    }
  };

  const handleCopyLog = async () => {
    if (!logText) return;
    await Clipboard.setStringAsync(logText);
    Alert.alert('Copied', 'Log content copied to clipboard.');
  };

  const handleRerun = () => {
    Alert.alert('Re-run workflow', 'Trigger a new run of this workflow?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Re-run',
        onPress: async () => {
          try {
            await rerunWorkflow(owner, repo, runId);
            Alert.alert('Triggered', 'The workflow has been re-queued.');
            load();
          } catch (e) {
            Alert.alert('Failed', e.message);
          }
        },
      },
    ]);
  };

  const handleCancel = () => {
    Alert.alert('Cancel run', 'Cancel this in-progress workflow run?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Run',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelWorkflowRun(owner, repo, runId);
            load();
          } catch (e) {
            Alert.alert('Failed', e.message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={load} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.runHeader}>
        <Text style={styles.runStatus}>
          {run.status === 'completed' ? run.conclusion : run.status}
        </Text>
        <View style={styles.runHeaderActions}>
          {run.status !== 'completed' ? (
            <TouchableOpacity onPress={handleCancel} style={styles.headerActionButton}>
              <Text style={styles.headerActionText}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleRerun} style={styles.headerActionButton}>
              <Text style={styles.headerActionText}>Re-run</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {view !== 'jobs' && (
        <View style={styles.tabBar}>
          <TouchableOpacity onPress={() => setView('jobs')} style={styles.tabBackButton}>
            <Text style={styles.tabBackText}>← Jobs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, view === 'log' && styles.tabButtonActive]}
            onPress={() => setView('log')}
          >
            <Text style={styles.tabButtonText}>Raw Log</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, view === 'errors' && styles.tabButtonActive]}
            onPress={() => setView('errors')}
          >
            <Text style={styles.tabButtonText}>
              Errors {parsedErrors.length > 0 ? `(${parsedErrors.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {view === 'jobs' && (
        <FlatList
          data={jobs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item }) => {
            const status = item.status === 'completed' ? item.conclusion : item.status;
            const dotColor = statusColors[status] || colors.fgMuted;
            return (
              <TouchableOpacity style={styles.jobCard} onPress={() => openJobLogs(item)}>
                <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobName}>{item.name}</Text>
                  <Text style={styles.jobMeta}>{status}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {view === 'log' && (
        <View style={styles.flex}>
          <View style={styles.logActionBar}>
            <TouchableOpacity onPress={handleCopyLog} style={styles.logActionButton}>
              <Text style={styles.logActionText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDownloadLog} style={styles.logActionButton}>
              <Text style={styles.logActionText}>Download .txt</Text>
            </TouchableOpacity>
          </View>
          {logLoading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.accent} />
          ) : (
            <ScrollView style={styles.logScroll} contentContainerStyle={{ padding: spacing.md }}>
              <Text selectable style={styles.logText}>{logText}</Text>
            </ScrollView>
          )}
        </View>
      )}

      {view === 'errors' && (
        <ScrollView contentContainerStyle={{ padding: spacing.md }}>
          {parsedErrors.length === 0 ? (
            <Text style={styles.emptyText}>No recognized error patterns found in this log.</Text>
          ) : (
            parsedErrors.map((err, idx) => (
              <View key={idx} style={styles.errorCard}>
                <View style={styles.errorCardHeader}>
                  <Text style={styles.errorCategory}>{err.category}</Text>
                  <Text style={styles.errorLineNum}>line {err.lineNumber}</Text>
                </View>
                <Text style={styles.errorTitle}>{err.title}</Text>
                <Text style={styles.errorCause}>{err.cause}</Text>
                <View style={styles.fixBox}>
                  <Text style={styles.fixLabel}>How to fix</Text>
                  <Text style={styles.fixText}>{err.fix}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  flex: { flex: 1 },
  centerContainer: { flex: 1, backgroundColor: colors.bgDefault, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.danger, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryButton: { marginTop: spacing.md, padding: spacing.sm },
  retryText: { color: colors.accent },
  runHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  runStatus: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600', textTransform: 'capitalize' },
  runHeaderActions: { flexDirection: 'row' },
  headerActionButton: { padding: spacing.sm },
  headerActionText: { color: colors.accent, fontWeight: '600' },
  tabBar: { flexDirection: 'row', borderBottomColor: colors.border, borderBottomWidth: 1 },
  tabBackButton: { padding: spacing.md, justifyContent: 'center' },
  tabBackText: { color: colors.fgMuted },
  tabButton: { flex: 1, padding: spacing.md, alignItems: 'center' },
  tabButtonActive: { borderBottomColor: colors.accent, borderBottomWidth: 2 },
  tabButtonText: { color: colors.fgDefault, fontSize: typography.sizeSm },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  jobName: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600' },
  jobMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 2, textTransform: 'capitalize' },
  logActionBar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1 },
  logActionButton: {
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  logActionText: { color: colors.accent, fontSize: typography.sizeSm },
  logScroll: { flex: 1, backgroundColor: colors.bgInset },
  logText: { color: '#c9d1d9', fontFamily: typography.mono, fontSize: 11, lineHeight: 16 },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  errorCard: {
    backgroundColor: colors.bgSubtle,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorCardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  errorCategory: { color: colors.warning, fontSize: typography.sizeSm, fontWeight: '600', textTransform: 'uppercase' },
  errorLineNum: { color: colors.fgSubtle, fontSize: typography.sizeSm },
  errorTitle: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '700', marginTop: spacing.xs },
  errorCause: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: spacing.xs, lineHeight: 18 },
  fixBox: { backgroundColor: colors.bgInset, borderRadius: 8, padding: spacing.sm, marginTop: spacing.sm },
  fixLabel: { color: colors.success, fontSize: typography.sizeSm, fontWeight: '700', marginBottom: 2 },
  fixText: { color: colors.fgDefault, fontSize: typography.sizeSm, lineHeight: 18 },
});
