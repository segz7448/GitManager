import { parseAnsi, stripAnsi } from '../ansiParser';

describe('parseAnsi', () => {
  it('returns a single plain segment for text with no escape codes', () => {
    const segments = parseAnsi('hello world');
    expect(segments).toEqual([{ text: 'hello world', color: null, backgroundColor: null, bold: false, dim: false }]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseAnsi('')).toEqual([]);
    expect(parseAnsi(null)).toEqual([]);
  });

  it('applies a foreground color to text after the color code', () => {
    const segments = parseAnsi('\x1b[32mgreen text\x1b[0m normal');
    expect(segments).toEqual([
      { text: 'green text', color: '#44cc44', backgroundColor: null, bold: false, dim: false },
      { text: ' normal', color: null, backgroundColor: null, bold: false, dim: false },
    ]);
  });

  it('carries bold state independently of color', () => {
    const segments = parseAnsi('\x1b[1m\x1b[31mbold red\x1b[0m');
    expect(segments).toEqual([
      { text: 'bold red', color: '#cc4444', backgroundColor: null, bold: true, dim: false },
    ]);
  });

  it('supports combined SGR params in one escape sequence', () => {
    const segments = parseAnsi('\x1b[1;32mbold green\x1b[0m');
    expect(segments[0]).toEqual({ text: 'bold green', color: '#44cc44', backgroundColor: null, bold: true, dim: false });
  });

  it('resets to default styling on code 0', () => {
    const segments = parseAnsi('\x1b[31mred\x1b[0mplain');
    expect(segments[1]).toEqual({ text: 'plain', color: null, backgroundColor: null, bold: false, dim: false });
  });

  it('drops non-SGR CSI sequences (cursor movement, clear screen) without leaving garbage text', () => {
    const segments = parseAnsi('before\x1b[2J\x1b[Hafter');
    const combined = segments.map((s) => s.text).join('');
    expect(combined).toBe('beforeafter');
  });

  it('applies a background color', () => {
    const segments = parseAnsi('\x1b[41mred bg\x1b[49m');
    expect(segments[0]).toEqual({ text: 'red bg', color: null, backgroundColor: '#cc4444', bold: false, dim: false });
  });

  it('supports bright color variants (90-97 range)', () => {
    const segments = parseAnsi('\x1b[92mbright green\x1b[0m');
    expect(segments[0].color).toBe('#66ff66');
  });

  it('ignores unrecognized SGR codes rather than guessing a color', () => {
    const segments = parseAnsi('\x1b[4munderline?\x1b[0m');
    expect(segments[0]).toEqual({ text: 'underline?', color: null, backgroundColor: null, bold: false, dim: false });
  });
});

describe('stripAnsi', () => {
  it('removes color codes leaving plain text', () => {
    expect(stripAnsi('\x1b[32mgreen\x1b[0m')).toBe('green');
  });

  it('removes non-color CSI sequences too', () => {
    expect(stripAnsi('a\x1b[2Jb\x1b[Hc')).toBe('abc');
  });

  it('returns an empty string for empty/null input', () => {
    expect(stripAnsi('')).toBe('');
    expect(stripAnsi(null)).toBe('');
  });

  it('leaves plain text with no escape codes unchanged', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });
});
