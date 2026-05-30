export interface ThemeColors {
  // Backgrounds
  bg: string;
  bgCard: string;
  bgElevated: string;
  bgOverlay: string;          // modal/sheet overlay tint
  bgInput: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;

  // Borders / dividers
  border: string;
  borderSubtle: string;

  // Surface overlays (rgba)
  surfaceLight: string;       // rgba bianco/nero leggero su card
  surfaceMedium: string;

  // Gradients (tuple per LinearGradient)
  gradientBg: readonly [string, string, string];
  gradientBgAlt: readonly [string, string, string];
  gradientCard: readonly [string, string];
  gradientOverlay: readonly [string, string];   // hero image overlay

  // Navigation bar
  navBg: string;              // Android fallback (iOS usa BlurView)
  navBorder: string;

  // Accents — invariati tra temi
  cyan:   string;
  purple: string;
  blue:   string;
  orange: string;
  pink:   string;
  green:  string;
  red:    string;
}

export const dark: ThemeColors = {
  bg:           '#050816',
  bgCard:       '#0D1221',
  bgElevated:   '#111827',
  bgOverlay:    'rgba(5,8,22,0.85)',
  bgInput:      'rgba(255,255,255,0.05)',

  text:          '#F7F8FF',
  textSecondary: '#8A93B6',
  textMuted:     '#4B5563',
  textDisabled:  '#2D3748',

  border:        'rgba(163,177,255,0.12)',
  borderSubtle:  'rgba(255,255,255,0.06)',

  surfaceLight:  'rgba(255,255,255,0.05)',
  surfaceMedium: 'rgba(255,255,255,0.10)',

  gradientBg:      ['#050816', '#090E1E', '#070812'],
  gradientBgAlt:   ['#050816', '#0B1230', '#180828'],
  gradientCard:    ['rgba(17,22,45,0.98)', 'rgba(10,14,28,0.98)'],
  gradientOverlay: ['rgba(5,8,22,0)', 'rgba(5,8,22,0.95)'],

  navBg:     'rgba(10,14,30,0.92)',
  navBorder: 'rgba(163,177,255,0.14)',

  cyan:   '#67E8F9',
  purple: '#8B5CFF',
  blue:   '#4F7CFF',
  orange: '#FF9B5E',
  pink:   '#F472FF',
  green:  '#00FF9C',
  red:    '#FF5C79',
};

export const light: ThemeColors = {
  bg:           '#E8ECF5',
  bgCard:       '#FFFFFF',
  bgElevated:   '#D8DEF0',
  bgOverlay:    'rgba(232,236,245,0.92)',
  bgInput:      'rgba(0,0,0,0.04)',

  text:          '#080C14',
  textSecondary: '#3D4566',
  textMuted:     '#6B7490',
  textDisabled:  '#A0A8C0',

  border:        'rgba(0,0,0,0.10)',
  borderSubtle:  'rgba(0,0,0,0.05)',

  surfaceLight:  'rgba(0,0,0,0.03)',
  surfaceMedium: 'rgba(0,0,0,0.07)',

  gradientBg:      ['#E8ECF5', '#EDF0F8', '#E8ECF5'],
  gradientBgAlt:   ['#E8ECF5', '#ECF0FA', '#EAE8F5'],
  gradientCard:    ['rgba(255,255,255,0.98)', 'rgba(232,236,245,0.98)'],
  gradientOverlay: ['rgba(232,236,245,0)', 'rgba(232,236,245,0.95)'],

  navBg:     'rgba(232,236,245,0.92)',
  navBorder: 'rgba(0,0,0,0.08)',

  cyan:   '#67E8F9',
  purple: '#8B5CFF',
  blue:   '#4F7CFF',
  orange: '#FF9B5E',
  pink:   '#F472FF',
  green:  '#00FF9C',
  red:    '#FF5C79',
};
