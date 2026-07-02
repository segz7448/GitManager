export const colors = {
  bgDefault: '#0d1117',
  bgSubtle: '#161b22',
  bgInset: '#010409',
  border: '#30363d',
  borderMuted: '#21262d',
  fgDefault: '#e6edf3',
  fgMuted: '#8b949e',
  fgSubtle: '#6e7681',
  accent: '#58a6ff',
  accentEmphasis: '#1f6feb',
  success: '#3fb950',
  successEmphasis: '#238636',
  danger: '#f85149',
  dangerEmphasis: '#da3633',
  warning: '#d29922',
  warningEmphasis: '#9e6a03',
  neutralMuted: '#6e768166',
  done: '#a371f7',
};

export const typography = {
  mono: 'monospace',
  sizeSm: 12,
  sizeMd: 14,
  sizeLg: 16,
  sizeXl: 20,
  sizeXxl: 24,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const statusColors = {
  success: colors.success,
  failure: colors.danger,
  cancelled: colors.fgMuted,
  in_progress: colors.warning,
  queued: colors.fgMuted,
  completed: colors.success,
  action_required: colors.warning,
  skipped: colors.fgSubtle,
};
