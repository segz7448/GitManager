import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { colors, spacing, typography } from '../theme';

/**
 * Long-press action sheet for a file or folder row. Rename/move share one
 * text input (a full path edit covers both - moving is just renaming to
 * a path with a different directory prefix, which is how Git itself
 * treats it under the hood).
 */
export default function FileActionsModal({
  visible,
  onClose,
  item, // { name, path, type, sha }
  busy,
  onRename,
  onDuplicate,
  onDelete,
  onCompare,
}) {
  const [mode, setMode] = useState(null); // null | 'rename' | 'duplicate'
  const [inputValue, setInputValue] = useState('');

  // The parent closes this modal (setting fileActionsItem to null) as
  // soon as a rename/duplicate call is kicked off, without going through
  // this component's own close() - so without this effect, `mode` would
  // stay stuck on 'rename'/'duplicate' and the next long-press on a
  // different file would skip straight past the action list.
  useEffect(() => {
    if (!visible) {
      setMode(null);
      setInputValue('');
    }
  }, [visible]);

  const openRename = () => {
    setInputValue(item.path);
    setMode('rename');
  };

  const openDuplicate = () => {
    const parts = item.path.split('/');
    const base = parts.pop();
    const dotIdx = base.lastIndexOf('.');
    const dupName = dotIdx > 0 ? `${base.slice(0, dotIdx)}-copy${base.slice(dotIdx)}` : `${base}-copy`;
    setInputValue([...parts, dupName].join('/'));
    setMode('duplicate');
  };

  const close = () => {
    setMode(null);
    setInputValue('');
    onClose();
  };

  if (!item) return null;

  if (mode === 'rename' || mode === 'duplicate') {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.title}>{mode === 'rename' ? 'Rename / move' : 'Duplicate'}</Text>
            <Text style={styles.subtitle}>{item.path}</Text>
            <TextInput
              style={styles.input}
              value={inputValue}
              onChangeText={setInputValue}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              placeholder="new/path/to/file.ext"
              placeholderTextColor={colors.fgSubtle}
            />
            <Text style={styles.hint}>
              {mode === 'rename'
                ? 'Edit the full path to rename in place or move to a different folder.'
                : 'Edit the path for the new copy.'}
            </Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={close} disabled={busy}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                disabled={busy || !inputValue.trim() || inputValue.trim() === item.path}
                onPress={() => {
                  if (mode === 'rename') onRename(item, inputValue.trim());
                  else onDuplicate(item, inputValue.trim());
                }}
              >
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmButtonText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={close}>
        <View style={styles.card}>
          <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
          <TouchableOpacity style={styles.actionRow} onPress={openRename}>
            <Text style={styles.actionText}>Rename / move</Text>
          </TouchableOpacity>
          {item.type === 'file' && (
            <>
              <TouchableOpacity style={styles.actionRow} onPress={openDuplicate}>
                <Text style={styles.actionText}>Duplicate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionRow} onPress={() => onCompare(item)}>
                <Text style={styles.actionText}>Compare against remote</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={styles.actionRow} onPress={() => onDelete(item)}>
            <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: colors.bgSubtle, borderRadius: 12, borderColor: colors.border, borderWidth: 1,
    padding: spacing.lg, minWidth: '75%',
  },
  title: { color: colors.fgDefault, fontSize: typography.sizeMd, fontWeight: '700', marginBottom: spacing.sm },
  subtitle: { color: colors.fgSubtle, fontFamily: typography.mono, fontSize: typography.sizeSm, marginBottom: spacing.md },
  actionRow: { paddingVertical: spacing.md, borderTopColor: colors.borderMuted, borderTopWidth: 1 },
  actionText: { color: colors.fgDefault, fontSize: typography.sizeSm },
  deleteText: { color: colors.danger },
  input: {
    color: colors.fgDefault, borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, fontFamily: typography.mono, fontSize: typography.sizeSm,
  },
  hint: { color: colors.fgSubtle, fontSize: typography.sizeSm, marginTop: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  cancelButton: { flex: 1, padding: spacing.sm, alignItems: 'center', borderRadius: 8, borderColor: colors.border, borderWidth: 1 },
  cancelButtonText: { color: colors.fgMuted, fontSize: typography.sizeSm },
  confirmButton: { flex: 1, padding: spacing.sm, alignItems: 'center', borderRadius: 8, backgroundColor: colors.accentEmphasis },
  confirmButtonText: { color: '#fff', fontSize: typography.sizeSm, fontWeight: '600' },
});
