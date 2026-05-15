/**
 * VibeChat design tokens — deep violet, monochromatic, sophisticated.
 *
 * Aligned to the published design system reference:
 *   • Brand:  Primary #5B21B6, P600 #6D28D9, P500 #7C3AED, Accent #C026D3
 *   • Hero gradient: 135° from #4C1D95 → #5B21B6 → #7C3AED
 *   • Avatars: 8-color palette keyed off the initial letter
 *   • Semantic: Success / Online / Warning / Danger
 *   • Neutrals: Text scale + soft/border/bg
 */

export const colors = {
  // Brand
  primary: '#5B21B6',          // deep violet (anchor)
  primaryDeep: '#4C1D95',      // gradient start
  primaryStrong: '#6D28D9',    // 600
  primarySoft: '#EDE9FE',      // tint bg (chips, hovers, cards)
  primary500: '#7C3AED',       // brighter violet (gradient end, accents)
  accent: '#C026D3',           // magenta (highlights, badges)

  // Hero gradient stops (deep violet plate).
  heroFrom: '#4C1D95',
  heroMid: '#5B21B6',
  heroTo: '#7C3AED',

  // Brand gradient (matches the logo's purple → magenta disc).
  brandFrom: '#1E1B4B',  // dark indigo at the top of the screen
  brandMid:  '#6D28D9',  // violet
  brandTo:   '#C026D3',  // magenta accent (the logo's bottom-right hue)

  // Header
  headerDark: '#5B21B6',
  headerText: '#FFFFFF',
  headerSub: 'rgba(255,255,255,0.85)',

  // Surfaces
  bg: '#FAFAFA',
  bgSoft: '#F4F4F5',
  chatBg: '#F4F4F5',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F4F5',
  divider: '#E4E4E7',

  // Bubbles
  bubbleMine: '#5B21B6',
  bubbleMineText: '#FFFFFF',
  bubbleTheirs: '#FFFFFF',
  bubbleTheirsText: '#18181B',
  bubbleMeta: 'rgba(255,255,255,0.78)',
  bubbleMetaTheirs: '#A1A1AA',

  // Text scale
  text: '#18181B',
  text2: '#52525B',
  textMuted: '#52525B',
  text3: '#A1A1AA',
  textLight: '#A1A1AA',
  textOnPrimary: '#FFFFFF',
  link: '#6D28D9',

  // Semantic
  success: '#059669',
  online: '#10B981',
  warning: '#D97706',
  error: '#DC2626',
  errorBg: '#FEE2E2',

  // Shadow
  shadow: 'rgba(76,29,149,0.16)',
};

/** 8 avatar tints, picked by hashing a seed (uid / displayName). */
export const avatarPalette = [
  '#18181B', // slate
  '#DC2626', // red
  '#EA580C', // orange
  '#DB2777', // pink
  '#0891B2', // cyan
  '#2563EB', // blue
  '#059669', // green
  '#6D28D9', // violet
];

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  display: 34,
  hero: 44,
};
