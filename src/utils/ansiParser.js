/**
 * Parses a string containing ANSI escape sequences (the color/style
 * codes real shell commands emit - e.g. `git status`, `ls --color`,
 * linters, test runners) into an array of styled text segments a
 * renderer can turn into colored <Text> runs.
 *
 * Only SGR sequences (`\x1b[...m` - the ones that set color/bold/reset)
 * are turned into styling. Everything else CSI-shaped (`\x1b[...<letter>`
 * that isn't `m` - cursor movement, clear-screen, hide-cursor, etc.) is
 * stripped rather than rendered, since a scrolling log view has no
 * meaningful way to represent "move cursor up 2 lines" the way a real
 * terminal grid does. Stripping keeps stray escape bytes from showing up
 * as garbled text instead of just disappearing cleanly.
 */

const CSI_PATTERN = /\x1b\[([0-9;]*)([a-zA-Z])/g;

const FG_COLORS = {
  30: '#000000', 31: '#cc4444', 32: '#44cc44', 33: '#cccc44',
  34: '#4488cc', 35: '#cc44cc', 36: '#44cccc', 37: '#cccccc',
  90: '#666666', 91: '#ff6666', 92: '#66ff66', 93: '#ffff66',
  94: '#6699ff', 95: '#ff66ff', 96: '#66ffff', 97: '#ffffff',
};

const BG_COLORS = {
  40: '#000000', 41: '#cc4444', 42: '#44cc44', 43: '#cccc44',
  44: '#4488cc', 45: '#cc44cc', 46: '#44cccc', 47: '#cccccc',
  100: '#666666', 101: '#ff6666', 102: '#66ff66', 103: '#ffff66',
  104: '#6699ff', 105: '#ff66ff', 106: '#66ffff', 107: '#ffffff',
};

function freshStyle() {
  return { color: null, backgroundColor: null, bold: false, dim: false };
}

/**
 * Returns an array of { text, color, backgroundColor, bold, dim }.
 * `color`/`backgroundColor` are null when unset (renderer should fall
 * back to its own default text color).
 */
export function parseAnsi(input) {
  if (!input) return [];

  const segments = [];
  let style = freshStyle();
  let lastIndex = 0;
  let match;

  CSI_PATTERN.lastIndex = 0;
  while ((match = CSI_PATTERN.exec(input)) !== null) {
    const plainText = input.slice(lastIndex, match.index);
    if (plainText) {
      segments.push({ text: plainText, ...style });
    }

    const [, paramsStr, letter] = match;
    if (letter === 'm') {
      const params = paramsStr.length ? paramsStr.split(';').map((p) => parseInt(p, 10)) : [0];
      style = applySgrParams(style, params);
    }

    lastIndex = CSI_PATTERN.lastIndex;
  }

  const remaining = input.slice(lastIndex);
  if (remaining) {
    segments.push({ text: remaining, ...style });
  }

  return segments;
}

function applySgrParams(currentStyle, params) {
  let style = { ...currentStyle };
  for (const code of params) {
    if (code === 0) {
      style = freshStyle();
    } else if (code === 1) {
      style.bold = true;
    } else if (code === 2) {
      style.dim = true;
    } else if (code === 22) {
      style.bold = false;
      style.dim = false;
    } else if (code === 39) {
      style.color = null;
    } else if (code === 49) {
      style.backgroundColor = null;
    } else if (FG_COLORS[code]) {
      style.color = FG_COLORS[code];
    } else if (BG_COLORS[code]) {
      style.backgroundColor = BG_COLORS[code];
    }
  }
  return style;
}

/**
 * Strips all ANSI/CSI escape sequences without extracting styling -
 * useful anywhere plain text is needed (e.g. copying output, or a
 * plain-text fallback render).
 */
export function stripAnsi(input) {
  if (!input) return '';
  return input.replace(CSI_PATTERN, '');
}
