import { Platform } from 'react-native';

// ── Palette ───────────────────────────────────────────────────────────────────
export const C = {
  // Backgrounds — off-black, not pure #000
  bg:           '#0A0A0A',
  bgElevated:   '#111111',
  bgCard:       '#161616',
  bgInput:      '#1C1C1C',
  bgOverlay:    'rgba(10, 10, 10, 0.92)',
  bgCanvas:     '#07080C',
  bgCanvas2:    '#11131A',

  // Brand accent — neon green, single accent rule
  accent:       '#00FF9C',
  accentDim:    'rgba(0, 255, 156, 0.12)',
  accentGlow:   'rgba(0, 255, 156, 0.06)',
  accentStrong: 'rgba(0, 255, 156, 0.25)',
  accentSoft:   '#7DFFD0',
  accentWarm:   '#D7FF64',
  accentIce:    '#63D6FF',

  // Text — warm-tinted grays (consistent hue family)
  textPrimary:   '#F5F5F5',
  textSecondary: '#9A9A9A',
  textMuted:     '#858585',
  textOnAccent:  '#001A0D',

  // Borders — subtle, consistent warm-gray tint
  border:       'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.13)',
  borderAccent: 'rgba(0, 255, 156, 0.30)',
  borderCanvas: 'rgba(125, 255, 208, 0.16)',

  // Glass surfaces
  glass:        'rgba(255, 255, 255, 0.04)',
  glassMid:     'rgba(255, 255, 255, 0.07)',
  glassStrong:  'rgba(255, 255, 255, 0.11)',
  glassAccent:  'rgba(0, 255, 156, 0.09)',
  glassDark:    'rgba(4, 6, 12, 0.74)',

  // Status
  error:   '#FF4444',
  warning: '#FF9500',
  success: '#00FF9C',
} as const;

// ── Typography scale ──────────────────────────────────────────────────────────
export const T = {
  // Display — hero moments, large numbers
  displayXL: { fontSize: 42, fontWeight: '800' as const, letterSpacing: -2.0, lineHeight: 48 },
  displayL:  { fontSize: 34, fontWeight: '800' as const, letterSpacing: -1.5, lineHeight: 40 },
  displayM:  { fontSize: 28, fontWeight: '700' as const, letterSpacing: -1.0, lineHeight: 34 },

  // Headlines
  h1: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.6, lineHeight: 30 },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.4, lineHeight: 26 },
  h3: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: 23 },
  h4: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.1, lineHeight: 21 },

  // Body
  bodyL: { fontSize: 16, fontWeight: '400' as const, lineHeight: 25 },
  body:  { fontSize: 14, fontWeight: '400' as const, lineHeight: 22 },
  bodyS: { fontSize: 13, fontWeight: '400' as const, lineHeight: 20 },

  // Labels — UI chrome
  labelL: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.1 },
  label:  { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.3 },
  labelS: { fontSize: 10, fontWeight: '500' as const, letterSpacing: 0.5 },

  // Mono — durations, numbers, stats
  mono: { fontSize: 12, fontWeight: '500' as const, fontVariant: ['tabular-nums'] as any },
} as const;

// ── Spacing ───────────────────────────────────────────────────────────────────
export const S = {
  xxs:  2,
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
  huge: 48,
} as const;

// ── Border radius ─────────────────────────────────────────────────────────────
export const R = {
  xs:   6,
  sm:   10,
  md:   14,
  lg:   18,
  xl:   22,
  xxl:  28,
  full: 999,
} as const;

// ── Elevation / Shadow ────────────────────────────────────────────────────────
// Tinted shadows — carry the hue of what they elevate, not generic black
const _shadow = (color: string, opacity: number, radius: number, y: number) =>
  Platform.select({
    ios:     { shadowColor: color, shadowOffset: { width: 0, height: y }, shadowOpacity: opacity, shadowRadius: radius },
    android: { elevation: Math.round(radius * 0.75) },
  }) ?? {};

export const Elevation = {
  none:   {},
  low:    _shadow('#000000', 0.35, 8,  2),
  mid:    _shadow('#000000', 0.45, 16, 6),
  high:   _shadow('#000000', 0.55, 24, 10),
  // Accent-tinted shadow for cards/players that feature the brand color
  accent: _shadow('#00FF9C', 0.20, 20, 6),
  // Strong dark for overlays
  overlay: _shadow('#000000', 0.70, 32, 16),
} as const;

// ── Animation presets ─────────────────────────────────────────────────────────
export const Spring = {
  snappy:  { tension: 280, friction: 18 },
  bouncy:  { tension: 200, friction: 12 },
  smooth:  { tension: 140, friction: 20 },
  gentle:  { tension: 80,  friction: 22 },
} as const;
