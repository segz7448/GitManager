import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import JSZip from 'jszip';
import {
  listRunJobs,
  getJobLogsText,
  getWorkflowRun,
  rerunWorkflow,
  cancelWorkflowRun,
  listRunArtifacts,
  getToken,
} from '../services/github';
import { parseLogErrors, findFailingStep } from '../utils/logParser';
import {
  requestNotificationPermission,
  isRunWatched,
  addRunToWatchlist,
  removeRunFromWatchlist,
} from '../services/notifications';
import { colors, spacing, typography, statusColors } from '../theme';

const API_BASE = 'https://api.github.com';
const RUN_POLL_INTERVAL_MS = 8000;
const LOG_POLL_INTERVAL_MS = 5000;

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
  const [failingStepSummary, setFailingStepSummary] = useState(null);
  const [view, setView] = useState('jobs'); // 'jobs' | 'log' | 'errors' | 'artifacts'
  const [isStreaming, setIsStreaming] = useState(false);

  const [artifacts, setArtifacts] = useState([]);
  const [installingId, setInstallingId] = useState(null);
  const [installProgress, setInstallProgress] = useState('');
  const [isWatched, setIsWatched] = useState(false);

  const hasAutoOpenedRef = useRef(false);
  const runPollTimerRef = useRef(null);
  const logPollTimerRef = useRef(null);
  const selectedJobRef = useRef(null);
  const logScrollRef = useRef(null);

  navigation.setOptions({ title: runName || `Run #${runId}` });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [runData, jobsData, artifactsData] = await Promise.all([
        getWorkflowRun(owner, repo, runId),
        listRunJobs(owner, repo, runId),
        listRunArtifacts(owner, repo, runId).catch(() => ({ artifacts: [] })),
      ]);
      setRun(runData);
      setJobs(jobsData.jobs || []);
      setArtifacts(artifactsData.artifacts || []);
      return { runData, jobsData };
    } catch (e) {
      setError(e.message || 'Failed to load run');
      return null;
    } finally {
      setLoading(false);
    }
  }, [owner, repo, runId]);

  // Initial load + auto-open the failing job/step so the person doesn't
  // have to hunt for it after a failed run.
  useEffect(() => {
    (async () => {
      const result = await load();
      if (!result || hasAutoOpenedRef.current) return;
      const { runData, jobsData } = result;
      if (runData.status === 'completed' && runData.conclusion === 'failure') {
        const failedJob = (jobsData.jobs || []).find((j) => j.conclusion === 'failure');
        if (failedJob) {
          hasAutoOpenedRef.current = true;
          openJobLogs(failedJob, { autoOpenErrors: true });
        }
      }
    })();
  }, [load]);

  // Poll the run itself while it's still in progress, so job statuses and
  // the job list update live without the person pulling to refresh.
  useEffect(() => {
    const isActive = run && run.status !== 'completed';
    if (isActive) {
      runPollTimerRef.current = setInterval(() => {
        load();
      }, RUN_POLL_INTERVAL_MS);
    }
    return () => {
      if (runPollTimerRef.current) clearInterval(runPollTimerRef.current);
    };
  }, [run?.status, load]);

  const openJobLogs = async (job, { autoOpenErrors = false } = {}) => {
    setSelectedJob(job);
    selectedJobRef.current = job;
    setView(autoOpenErrors ? 'errors' : 'log');
    setLogLoading(true);
    setLogText(null);
    setParsedErrors([]);
    setFailingStepSummary(null);
    try {
      const text = await getJobLogsText(owner, repo, job.id);
      setLogText(text);
      setParsedErrors(parseLogErrors(text));
      setFailingStepSummary(findFailingStep(text));
    } catch (e) {
      Alert.alert('Failed to load logs', e.message);
      setView('jobs');
    } finally {
      setLogLoading(false);
    }

    const jobIsLive = job.status === 'in_progress' || job.status === 'queued';
    setIsStreaming(jobIsLive);
    if (logPollTimerRef.current) clearInterval(logPollTimerRef.current);
    if (jobIsLive) {
      logPollTimerRef.current = setInterval(async () => {
        try {
          // Re-check the job's current status via the jobs list so we know
          // when to stop polling once it completes.
          const jobsData = await listRunJobs(owner, repo, runId);
          const updatedJob = (jobsData.jobs || []).find((j) => j.id === job.id);
          const text = await getJobLogsText(owner, repo, job.id);
          setLogText(text);
          setParsedErrors(parseLogErrors(text));
          setFailingStepSummary(findFailingStep(text));

          if (updatedJob && updatedJob.status === 'completed') {
            setIsStreaming(false);
            setJobs(jobsData.jobs || []);
            clearInterval(logPollTimerRef.current);
          }
        } catch (e) {
          // transient errors during polling are non-fatal - just try again
          // on the next tick
        }
      }, LOG_POLL_INTERVAL_MS);
    }
  };

  useEffect(() => {
    isRunWatched(owner, repo, runId).then(setIsWatched);
  }, [owner, repo, runId]);

  const handleToggleWatch = async () => {
    if (isWatched) {
      await removeRunFromWatchlist(owner, repo, runId);
      setIsWatched(false);
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert(
        'Notifications disabled',
        'Enable notifications for GitManager in Android Settings to get alerted when this run finishes.'
      );
      return;
    }
    await addRunToWatchlist({ owner, repo, runId, runName });
    setIsWatched(true);
    Alert.alert(
      'Watching this run',
      'You\'ll get a notification when it finishes. Background checks happen roughly every 15+ minutes ' +
        '(an Android platform limit) - keep the app backgrounded rather than force-closed for this to work.'
    );
  };

  useEffect(() => {
    return () => {
      if (logPollTimerRef.current) clearInterval(logPollTimerRef.current);
      if (runPollTimerRef.current) clearInterval(runPollTimerRef.current);
    };
  }, []);

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

  const handleDownloadArtifact = async (artifact) => {
    setInstallingId(artifact.id);
    setInstallProgress('Downloading...');
    try {
      const token = await getToken();
      const zipUri = FileSystem.cacheDirectory + `artifact-${artifact.id}.zip`;

      const downloadResult = await FileSystem.downloadAsync(
        `${API_BASE}/repos/${owner}/${repo}/actions/artifacts/${artifact.id}/zip`,
        zipUri,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (downloadResult.status !== 200) {
        throw new Error(`Download failed with status ${downloadResult.status}`);
      }

      setInstallProgress('Extracting...');
      const zipBase64 = await FileSystem.readAsStringAsync(zipUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const zip = await JSZip.loadAsync(zipBase64, { base64: true });

      // Find the first .apk inside (artifact zips can technically contain
      // multiple files, but our build workflow only uploads one APK).
      let apkEntry = null;
      let apkName = null;
      zip.forEach((relativePath, entry) => {
        if (!apkEntry && !entry.dir && relativePath.toLowerCase().endsWith('.apk')) {
          apkEntry = entry;
          apkName = relativePath;
        }
      });

      if (!apkEntry) {
        Alert.alert(
          'No APK found',
          'This artifact doesn\'t contain a .apk file. It may be a different build artifact.'
        );
        return;
      }

      setInstallProgress('Preparing install...');
      const apkBase64 = await apkEntry.async('base64');
      const apkUri = FileSystem.cacheDirectory + apkName;
      await FileSystem.writeAsStringAsync(apkUri, apkBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Clean up the intermediate zip
      await FileSystem.deleteAsync(zipUri, { idempotent: true });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(apkUri, {
          mimeType: 'application/vnd.android.package-archive',
          dialogTitle: 'Install APK',
        });
      } else {
        Alert.alert('Downloaded', `APK saved to ${apkUri}, but sharing isn't available to install it directly.`);
      }
    } catch (e) {
      Alert.alert('Failed to download artifact', e.message);
    } finally {
      setInstallingId(null);
      setInstallProgress('');
    }
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
          {run.status !== 'completed' && (
            <TouchableOpacity onPress={handleToggleWatch} style={styles.headerActionButton}>
              <Text style={styles.headerActionText}>
                {isWatched ? '🔔 Watching' : '🔕 Notify me'}
              </Text>
            </TouchableOpacity>
          )}
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

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, view === 'jobs' && styles.tabButtonActive]}
          onPress={() => setView('jobs')}
        >
          <Text style={styles.tabButtonText}>Jobs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, view === 'artifacts' && styles.tabButtonActive]}
          onPress={() => setView('artifacts')}
        >
          <Text style={styles.tabButtonText}>
            Artifacts {artifacts.length > 0 ? `(${artifacts.length})` : ''}
          </Text>
        </TouchableOpacity>
        {selectedJob && (
          <>
            <TouchableOpacity
              style={[styles.tabButton, view === 'log' && styles.tabButtonActive]}
              onPress={() => setView('log')}
            >
              <Text style={styles.tabButtonText}>
                Raw Log {isStreaming ? '🔴 Live' : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, view === 'errors' && styles.tabButtonActive]}
              onPress={() => setView('errors')}
            >
              <Text style={styles.tabButtonText}>
                Errors {parsedErrors.length > 0 ? `(${parsedErrors.length})` : ''}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

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

      {view === 'artifacts' && (
        <FlatList
          data={artifacts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.md }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No artifacts on this run. Artifacts appear here once the "Upload APK artifact" step
              completes successfully.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.artifactCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.artifactName}>{item.name}</Text>
                <Text style={styles.artifactMeta}>
                  {formatBytes(item.size_in_bytes)} {item.expired ? '· expired' : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.installButton, (item.expired || installingId === item.id) && styles.installButtonDisabled]}
                onPress={() => handleDownloadArtifact(item)}
                disabled={item.expired || installingId === item.id}
              >
                {installingId === item.id ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.installButtonText}>  {installProgress}</Text>
                  </View>
                ) : (
                  <Text style={styles.installButtonText}>{item.expired ? 'Expired' : 'Download & Install'}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {view === 'log' && (
        <View style={styles.flex}>
          <View style={styles.logActionBar}>
            {isStreaming && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>Streaming</Text>
              </View>
            )}
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
            <ScrollView
              ref={logScrollRef}
              style={styles.logScroll}
              contentContainerStyle={{ padding: spacing.md }}
              onContentSizeChange={() => {
                if (isStreaming) logScrollRef.current?.scrollToEnd({ animated: true });
              }}
            >
              <Text selectable style={styles.logText}>{logText}</Text>
            </ScrollView>
          )}
        </View>
      )}

      {view === 'errors' && (
        <ScrollView contentContainerStyle={{ padding: spacing.md }}>
          {failingStepSummary && (
            <View style={styles.failingStepBanner}>
              <Text style={styles.failingStepLabel}>Failed at step</Text>
              <Text style={styles.failingStepName}>
                {failingStepSummary.step || 'Unknown step'}
              </Text>
              {parsedErrors.length === 0 && (
                <Text style={styles.failingStepSnippet} selectable>
                  {failingStepSummary.snippet}
                </Text>
              )}
            </View>
          )}
          {parsedErrors.length === 0 ? (
            <Text style={styles.emptyText}>
              {failingStepSummary
                ? "No specific error pattern recognized, but the raw output around the failure is shown above."
                : 'No recognized error patterns found in this log.'}
            </Text>
          ) : (
            parsedErrors.map((err, idx) => (
              <View key={idx} style={styles.errorCard}>
                <View style={styles.errorCardHeader}>
                  <Text style={styles.errorCategory}>{err.category}</Text>
                  <Text style={styles.errorLineNum}>line {err.lineNumber}</Text>
                </View>
                {!!err.step && <Text style={styles.errorStep}>{err.step}</Text>}
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

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  artifactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  artifactName: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600' },
  artifactMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 2 },
  installButton: {
    backgroundColor: colors.successEmphasis, borderRadius: 8,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginLeft: spacing.sm,
  },
  installButtonDisabled: { opacity: 0.5 },
  installButtonText: { color: '#fff', fontWeight: '600', fontSize: typography.sizeSm },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  jobName: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600' },
  jobMeta: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: 2, textTransform: 'capitalize' },
  logActionBar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderBottomColor: colors.border, borderBottomWidth: 1, alignItems: 'center' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', marginRight: 'auto', paddingHorizontal: spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger, marginRight: 6 },
  liveBadgeText: { color: colors.danger, fontSize: typography.sizeSm, fontWeight: '700' },
  logActionButton: {
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  logActionText: { color: colors.accent, fontSize: typography.sizeSm },
  logScroll: { flex: 1, backgroundColor: colors.bgInset },
  logText: { color: '#c9d1d9', fontFamily: typography.mono, fontSize: 11, lineHeight: 16 },
  emptyText: { color: colors.fgSubtle, textAlign: 'center', marginTop: spacing.xl },
  failingStepBanner: {
    backgroundColor: colors.bgInset,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  failingStepLabel: { color: colors.danger, fontSize: typography.sizeSm, fontWeight: '700', textTransform: 'uppercase' },
  failingStepName: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '600', marginTop: 4, fontFamily: typography.mono },
  failingStepSnippet: { color: '#c9d1d9', fontFamily: typography.mono, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },
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
  errorStep: { color: colors.fgSubtle, fontSize: 11, fontFamily: typography.mono, marginTop: 4 },
  errorTitle: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '700', marginTop: spacing.xs },
  errorCause: { color: colors.fgMuted, fontSize: typography.sizeSm, marginTop: spacing.xs, lineHeight: 18 },
  fixBox: { backgroundColor: colors.bgInset, borderRadius: 8, padding: spacing.sm, marginTop: spacing.sm },
  fixLabel: { color: colors.success, fontSize: typography.sizeSm, fontWeight: '700', marginBottom: 2 },
  fixText: { color: colors.fgDefault, fontSize: typography.sizeSm, lineHeight: 18 },
});
