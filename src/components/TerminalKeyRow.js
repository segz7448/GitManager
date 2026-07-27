import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme';

/**
 * The extra-keys row Termux itself shows above its keyboard, styled to
 * match. Since this app talks to Termux one full command line at a time
 * (not a live keystroke stream - see the transport notes in
 * services/termux.js), these keys act on the command being composed in
 * the input box rather than sending raw bytes to a live PTY:
 *  - ESC clears the line, TAB inserts a tab character
 *  - arrows move the cursor within the input (up/down instead recall
 *    command history, since there's no multi-line cursor to move
 *    vertically in a single-line input)
 *  - HOME/END jump to the start/end of the line
 *  - PGUP/PGDN scroll the output log
 *  - CTRL/ALT are sticky modifiers: CTRL+C stops the active running
 *    command (the real equivalent of a terminal's Ctrl+C), ALT+Left/
 *    Right jumps the cursor by a word
 */
export default function TerminalKeyRow({
  ctrlActive,
  altActive,
  onToggleCtrl,
  onToggleAlt,
  onEsc,
  onTab,
  onArrow,
  onHome,
  onEnd,
  onPageUp,
  onPageDown,
}) {
  const Key = ({ label, onPress, active, wide }) => (
    <TouchableOpacity
      style={[styles.key, wide && styles.keyWide, active && styles.keyActive]}
      onPress={onPress}
    >
      <Text style={[styles.keyText, active && styles.keyTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.rowContent}
      keyboardShouldPersistTaps="always"
    >
      <Key label="ESC" onPress={onEsc} />
      <Key label="TAB" onPress={onTab} />
      <Key label="◁" onPress={() => onArrow('left')} />
      <Key label="▷" onPress={() => onArrow('right')} />
      <Key label="△" onPress={() => onArrow('up')} />
      <Key label="▽" onPress={() => onArrow('down')} />
      <Key label="HOME" onPress={onHome} wide />
      <Key label="END" onPress={onEnd} wide />
      <Key label="PGUP" onPress={onPageUp} wide />
      <Key label="PGDN" onPress={onPageDown} wide />
      <Key label="CTRL" onPress={onToggleCtrl} active={ctrlActive} wide />
      <Key label="ALT" onPress={onToggleAlt} active={altActive} wide />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: '#000000',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    maxHeight: 44,
  },
  rowContent: { paddingHorizontal: 4, alignItems: 'center' },
  key: {
    minWidth: 40,
    height: 34,
    marginHorizontal: 2,
    borderRadius: 4,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  keyWide: { minWidth: 52 },
  keyActive: { backgroundColor: colors.accentEmphasis },
  keyText: { color: '#d0d0d0', fontSize: 12, fontWeight: '600' },
  keyTextActive: { color: '#fff' },
});
