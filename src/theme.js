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

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

// Gradient pairs used across the UI kit (LinearGradient `colors` prop).
// Kept close to the base palette so they read as depth, not decoration.
export const gradients = {
  accent: ['#1f6feb', '#58a6ff'],
  success: ['#238636', '#3fb950'],
  danger: ['#8e1519', '#f85149'],
  surface: ['#161b22', '#0d1117'],
  header: ['#161b22e6', '#0d1117f2'],
  sheen: ['#ffffff14', '#ffffff00'],
};

// Elevation presets (RN shadow + Android elevation combined).
export const elevation = {
  none: {},
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
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
