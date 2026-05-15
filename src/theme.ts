/**
 * VibeChat theme — purple/magenta palette pulled from the brand mockups
 * ("Chat. Connect. Vibe."). Replaces the earlier WhatsApp green skin.
 *
 * Screens import from here instead of hardcoding hex values; a future
 * re-skin only touches this file.
 */

export const colors = {
  // Brand
  primary: '#7C3AED',         // VibeChat purple (buttons, FAB, links)
  primaryDeep: '#6D28D9',     // Pressed / dark surface accents
  primarySoft: '#EDE9FE',     // Tint backgrounds (chips, hover)
  accent: '#EC4899',          // Magenta accent (gradient highlights, badges)

  headerDark: '#7C3AED',      // Top header bg
  headerText: '#FFFFFF',
  headerSub: 'rgba(255,255,255,0.85)',

  // Surfaces
  bg: '#FFFFFF',
  bgSoft: '#F5F3FF',          // App background tint (auth screens, profile)
  chatBg: '#F5F3FF',          // Chat backdrop
  surface: '#FFFFFF',
  surfaceMuted: '#F4F4F8',
  divider: '#ECE9F2',

  // Bubbles
  bubbleMine: '#7C3AED',      // Purple = sent
  bubbleMineText: '#FFFFFF',
  bubbleTheirs: '#FFFFFF',    // White card = received
  bubbleTheirsText: '#1F1F2E',
  bubbleMeta: 'rgba(255,255,255,0.75)',
  bubbleMetaTheirs: '#8B8FA3',

  // Text
  text: '#1F1F2E',
  textMuted: '#6B7280',
  textLight: '#9CA3AF',
  textOnPrimary: '#FFFFFF',
  link: '#7C3AED',

  // Status
  error: '#EF4444',
  errorBg: '#FEE2E2',
  success: '#10B981',
  online: '#22C55E',

  // Shadow
  shadow: 'rgba(76, 29, 149, 0.12)', // tinted toward purple
};

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
  display: 32,
};
