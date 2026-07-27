import React from 'react';
import { Text } from 'react-native';
import { parseAnsi } from '../utils/ansiParser';

/**
 * Renders a string that may contain ANSI color codes as styled text,
 * the way a real terminal would show colored git/test/linter output
 * instead of raw `\x1b[32m` bytes.
 */
export default function AnsiText({ children, style, dimColor = '#8b949e' }) {
  const segments = parseAnsi(children || '');
  if (segments.length === 0) return null;

  return (
    <Text style={style}>
      {segments.map((seg, i) => (
        <Text
          key={i}
          style={{
            color: seg.dim ? dimColor : seg.color || undefined,
            backgroundColor: seg.backgroundColor || undefined,
            fontWeight: seg.bold ? '700' : undefined,
          }}
        >
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}
