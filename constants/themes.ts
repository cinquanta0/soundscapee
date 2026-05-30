export interface ThemeColors {
  // Backgrounds
  bg: string;
  bgCard: string;
  bgElevated: string;
  bgOverlay: string;
  bgInput: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;

  // Icon colors
  iconInactive: string;   // navbar / tab icon inattivo

  // Accent usable as text/icon (contrasto garantito su bg)
  textAccent: string;     // in dark = cyan, in light = teal scuro leggibile

  // Borders / dividers
  border: string;
  borderSubtle: string;

  // Surface overlays
  surfaceLight: string;
  surfaceMedium: string;

  // Gradients
  gradientBg: readonly [string, string, string];
  gradientBgAlt: readonly [string, string, string];
  gradientCard: readonly [string, string];
  gradientOverlay: readonly [string, string];

  // Navigation bar
  navBg: string;
  navBorder: string;

  // Chat bubbles
  bubbleMine:       string;
  bubbleMineText:   string;
  bubbleMineBorder: string;
  bubbleTheirs:       string;
  bubbleTheirsText:   string;
  bubbleTheirsBorder: string;

  // Green leggibile come testo (non fosforescente)
  greenText: string;

  // Accents decorativi (sfondo, badge, bordi) — NON usare come testo su bianco
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
  textSecondary: '#B0BCDE',   // era #8A93B6 — contrasto 8:1 su #050816
  textMuted:     '#8899BB',   // era #4B5563 — contrasto 5:1 su #050816
  textDisabled:  '#4A5568',

  iconInactive:  'rgba(255,255,255,0.55)',
  textAccent:    '#67E8F9',

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

  bubbleMine:         'rgba(16,28,50,0.96)',
  bubbleMineText:     '#F7F8FF',
  bubbleMineBorder:   'rgba(103,232,249,0.28)',
  bubbleTheirs:         'rgba(23,17,49,0.96)',
  bubbleTheirsText:     '#F7F8FF',
  bubbleTheirsBorder:   'rgba(139,92,255,0.28)',

  greenText: '#22C55E',

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
  textSecondary: '#1E2540',   // molto scuro — massimo contrasto
  textMuted:     '#3A4260',   // scuro — leggibile anche piccolo
  textDisabled:  '#8A93B6',

  iconInactive:  '#3A4260',   // icone inattive scure su sfondo chiaro
  textAccent:    '#0A6B7A',   // teal scuro — contrasto 7:1 su bianco

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

  bubbleMine:         '#DBEAFE',
  bubbleMineText:     '#1E3A5F',
  bubbleMineBorder:   'rgba(79,124,255,0.30)',
  bubbleTheirs:         '#EDE9FE',
  bubbleTheirsText:     '#3B1F6E',
  bubbleTheirsBorder:   'rgba(139,92,255,0.30)',

  greenText: '#16A34A',

  cyan:   '#67E8F9',
  purple: '#8B5CFF',
  blue:   '#4F7CFF',
  orange: '#FF9B5E',
  pink:   '#F472FF',
  green:  '#00FF9C',
  red:    '#FF5C79',
};
