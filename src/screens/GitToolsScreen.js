import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, ActivityIndicator } from 'react-native';
import { listBranches, mergeBranch, forkRepo, getRepoTreeRecursive, getFileContent, createCodespace, createOrUpdateFile } from '../services/github';
import { saveLocalClone, getLocalClone } from '../db/localClones';
import { useStaging } from '../context/StagingContext';
import { createStash, listStashes } from '../db/stashes';
import { colors, spacing, typography } from '../theme';
import { detectProjectType, hasExistingWorkflow } from '../workflows/detectProjectType';
import { generateWorkflowYaml } from '../workflows/generateWorkflow';

const BINARY_EXT = new Set(['png','jpg','jpeg','gif','webp','ico','bmp','zip','gz','tar','jar','apk','aab','so','dex','ttf','otf','woff','woff2','pdf','mp3','mp4','wav']);

function isBinaryPath(path) {
  const ext = path.split('.').pop().toLowerCase();
  return BINARY_EXT.has(ext);
}

// Cloning a repo with a very large number of files fetches one blob per
// text file - cap it so tapping "Clone" on a huge monorepo doesn't spend
// several minutes and a large chunk of the token's rate limit.
const MAX_CLONE_FILES = 400;

export default function GitToolsScreen({ route, navigation }) {
  const { owner, repo, branch, defaultBranch } = route.params;
  const [branches, setBranches] = useState([]);
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [merging, setMerging] = useState(false);
  const [forking, setForking] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneProgress, setCloneProgress] = useState('');
  const [existingClone, setExistingClone] = useState(null);
  const [stashCount, setStashCount] = useState(0);
  const [creatingCodespace, setCreatingCodespace] = useState(false);
  const [checkingWorkflow, setCheckingWorkflow] = useState(false);

  const { getStagedForRepo, clearStaged } = useStaging();

  navigation.setOptions({ title: 'Git Tools' });

  const refresh = useCallback(async () => {
    listBranches(owner, repo).then(setBranches).catch(() => {});
    getLocalClone(owner, repo, branch).then(setExistingClone).catch(() => {});
    listStashes(owner, repo).then((s) => setStashCount(s.length)).catch(() => {});
  }, [owner, repo, branch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleMerge = async (head) => {
    setMergeModalVisible(false);
    setMerging(true);
    try {
      const result = await mergeBranch(owner, repo, branch, head, `Merge ${head} into ${branch}`);
      if (result?.merged === false) {
        Alert.alert('Already up to date', `"${branch}" already contains everything from "${head}".`);
      } else {
        Alert.alert('Merged', `"${head}" was merged into "${branch}".`);
      }
    } catch (e) {
      if (e.status === 409) {
        Alert.alert(
          'Merge conflict',
          `GitHub couldn't merge "${head}" into "${branch}" automatically. Open a Pull Request instead so you can resolve the conflict on github.com.`
        );
      } else {
        Alert.alert('Merge failed', e.message);
      }
    } finally {
      setMerging(false);
    }
  };

  const handleFork = () => {
    Alert.alert('Fork this repository?', `This creates a copy of ${owner}/${repo} under your account.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Fork',
        onPress: async () => {
          setForking(true);
          try {
            const forked = await forkRepo(owner, repo);
            Alert.alert(
              'Forked',
              `Created ${forked.full_name}. GitHub finishes copying large repos in the background, so it may take a few seconds to be ready.`,
              [{ text: 'OK', onPress: () => navigation.navigate('RepoDetail', { owner: forked.owner.login, repo: forked.name }) }]
            );
          } catch (e) {
            Alert.alert('Fork failed', e.message);
          } finally {
            setForking(false);
          }
        },
      },
    ]);
  };

  const handleCreateCodespace = () => {
    Alert.alert(
      'Create a codespace?',
      `This creates a cloud dev environment for "${branch}" on GitHub's servers. It runs and bills on GitHub's infrastructure, not this device - actual coding happens in a browser tab once it's ready.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create', onPress: runCreateCodespace },
      ]
    );
  };

  const runCreateCodespace = async () => {
    setCreatingCodespace(true);
    try {
      const codespace = await createCodespace(owner, repo, { ref: branch });
      Alert.alert(
        'Codespace created',
        `"${codespace.display_name || codespace.name}" is being provisioned. Check the Codespaces tab to open it once it's ready.`,
        [{ text: 'OK', onPress: () => navigation.navigate('MainTabs', { screen: 'Codespaces' }) }]
      );
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        Alert.alert(
          'Failed to create codespace',
          `${e.message}\n\nYour token may be missing the "codespace" scope - check Settings → Security.`
        );
      } else {
        Alert.alert('Failed to create codespace', e.message);
      }
    } finally {
      setCreatingCodespace(false);
    }
  };

  const handleSuggestWorkflow = async () => {
    setCheckingWorkflow(true);
    try {
      const tree = await getRepoTreeRecursive(owner, repo, branch);
      const paths = (tree.tree || []).map((t) => t.path);

      if (hasExistingWorkflow(paths)) {
        Alert.alert('Workflow already exists', 'This repo already has a workflow under .github/workflows/ - not suggesting a replacement.');
        return;
      }

      const detected = detectProjectType(paths);
      if (!detected) {
        Alert.alert(
          'Could not detect project type',
          "This repo doesn't match any of the project types this app recognizes (Node.js, Python, Go, Rust, Java, Ruby, PHP, .NET, Docker)."
        );
        return;
      }

      const yaml = generateWorkflowYaml(detected);
      Alert.alert(
        `${detected.label} project detected`,
        `${detected.detail}. Add .github/workflows/build.yml with a starter build/test pipeline?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add workflow',
            onPress: async () => {
              try {
                await createOrUpdateFile(owner, repo, '.github/workflows/build.yml', {
                  message: 'Add CI workflow',
                  content: yaml,
                  branch,
                });
                Alert.alert('Added', '.github/workflows/build.yml was committed.');
              } catch (e) {
                Alert.alert('Failed to add workflow', e.message);
              }
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Failed to check for a workflow', e.message);
    } finally {
      setCheckingWorkflow(false);
    }
  };

  const handleClone = () => {
    Alert.alert(
      'Clone locally?',
      `This downloads ${branch}'s current text files so you can browse them offline. Binary files (images, etc.) are recorded but not downloaded. Large repos may take a while and use some of your token's rate limit.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clone', onPress: runClone },
      ]
    );
  };

  const runClone = async () => {
    setCloning(true);
    setCloneProgress('Fetching file tree…');
    try {
      const tree = await getRepoTreeRecursive(owner, repo, branch);
      const blobs = (tree.tree || []).filter((t) => t.type === 'blob');
      if (blobs.length > MAX_CLONE_FILES) {
        Alert.alert(
          'Repository too large to clone in-app',
          `This branch has ${blobs.length} files, above the ${MAX_CLONE_FILES}-file limit for local cloning. Use "git clone" from a real Git client for full repos this size.`
        );
        return;
      }

      const files = [];
      let totalBytes = 0;
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        setCloneProgress(`Downloading ${i + 1}/${blobs.length}: ${b.path}`);
        if (isBinaryPath(b.path)) {
          files.push({ path: b.path, size: b.size, binary: true });
        } else {
          try {
            const content = await getFileContent(owner, repo, b.path, branch);
            files.push({ path: b.path, size: b.size, binary: false, content: content.decodedContent });
            totalBytes += b.size || 0;
          } catch (e) {
            files.push({ path: b.path, size: b.size, binary: false, content: null, error: e.message });
          }
        }
      }

      await saveLocalClone(owner, repo, branch, files, totalBytes);
      setExistingClone({ files, fileCount: files.length, totalBytes, createdAt: Date.now() });
      Alert.alert('Cloned', `${files.length} files saved locally for offline browsing.`);
    } catch (e) {
      Alert.alert('Clone failed', e.message);
    } finally {
      setCloning(false);
      setCloneProgress('');
    }
  };

  const handleStashCurrent = () => {
    const staged = getStagedForRepo(owner, repo);
    if (staged.length === 0) {
      Alert.alert('Nothing to stash', 'You have no staged changes right now.');
      return;
    }
    Alert.prompt
      ? Alert.prompt('Stash label', 'Optional label for this stash', async (label) => {
          await createStash(owner, repo, branch, label, staged);
          clearStaged(owner, repo);
          refresh();
          Alert.alert('Stashed', `${staged.length} file(s) shelved. Pop them from Stashes below whenever you're ready.`);
        })
      : (async () => {
          await createStash(owner, repo, branch, null, staged);
          clearStaged(owner, repo);
          refresh();
          Alert.alert('Stashed', `${staged.length} file(s) shelved.`);
        })();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.sectionTitle}>Branches & history</Text>
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('CommitHistory', { owner, repo, branch })}
      >
        <Text style={styles.rowText}>Commit history</Text>
        <Text style={styles.rowArrow}>›</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>CI/CD</Text>
      <TouchableOpacity style={styles.row} onPress={handleSuggestWorkflow} disabled={checkingWorkflow}>
        {checkingWorkflow ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <Text style={styles.rowText}>Suggest a CI workflow for this repo</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Merge</Text>
      <TouchableOpacity style={styles.row} onPress={() => setMergeModalVisible(true)} disabled={merging}>
        {merging ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <Text style={styles.rowText}>Merge another branch into "{branch}"</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Stash</Text>
      <TouchableOpacity style={styles.row} onPress={handleStashCurrent}>
        <Text style={styles.rowText}>Stash current staged changes</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Stashes', { owner, repo, branch })}>
        <Text style={styles.rowText}>View stashes {stashCount > 0 ? `(${stashCount})` : ''}</Text>
        <Text style={styles.rowArrow}>›</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Clone & fork</Text>
      <TouchableOpacity style={styles.row} onPress={handleClone} disabled={cloning}>
        {cloning ? (
          <View>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.cloneProgressText}>{cloneProgress}</Text>
          </View>
        ) : (
          <Text style={styles.rowText}>
            {existingClone ? `Re-clone "${branch}" locally` : `Clone "${branch}" locally`}
          </Text>
        )}
      </TouchableOpacity>
      {existingClone && (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('LocalClone', { owner, repo, branch })}
        >
          <Text style={styles.rowText}>
            Browse local clone ({existingClone.fileCount || existingClone.files?.length} files)
          </Text>
          <Text style={styles.rowArrow}>›</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.row} onPress={handleFork} disabled={forking}>
        {forking ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={styles.rowText}>Fork this repository</Text>}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Codespaces</Text>
      <TouchableOpacity style={styles.row} onPress={handleCreateCodespace} disabled={creatingCodespace}>
        {creatingCodespace ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <Text style={styles.rowText}>Create a codespace on "{branch}"</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('MainTabs', { screen: 'Codespaces' })}>
        <Text style={styles.rowText}>View all codespaces</Text>
        <Text style={styles.rowArrow}>›</Text>
      </TouchableOpacity>

      <Modal visible={mergeModalVisible} transparent animationType="fade" onRequestClose={() => setMergeModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMergeModalVisible(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Merge into "{branch}"</Text>
            {branches
              .filter((b) => b.name !== branch)
              .map((b) => (
                <TouchableOpacity key={b.name} style={styles.pickerItem} onPress={() => handleMerge(b.name)}>
                  <Text style={styles.pickerItemText}>{b.name}</Text>
                </TouchableOpacity>
              ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDefault },
  sectionTitle: { color: colors.fgSubtle, fontSize: typography.sizeSm, fontWeight: '700', textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.bgSubtle, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm,
  },
  rowText: { color: colors.fgDefault, fontSize: typography.sizeSm, flex: 1 },
  rowArrow: { color: colors.fgSubtle, fontSize: typography.sizeLg },
  cloneProgressText: { color: colors.fgSubtle, fontSize: 11, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  pickerCard: { backgroundColor: colors.bgSubtle, borderRadius: 12, borderColor: colors.border, borderWidth: 1, padding: spacing.lg, minWidth: '70%', maxHeight: '60%' },
  pickerTitle: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '700', marginBottom: spacing.md },
  pickerItem: { paddingVertical: spacing.sm },
  pickerItemText: { color: colors.fgDefault, fontFamily: typography.mono, fontSize: typography.sizeSm },
});
