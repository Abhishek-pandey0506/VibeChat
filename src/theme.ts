/**
 * VibeChat theme — WhatsApp-inspired green palette.
 *
 * Centralised so a future re-skin only touches one file. Screens should
 * import from here instead of hardcoding hex values in StyleSheets.
 */

export const colors = {
  // Brand
  primary: '#25D366',        // WhatsApp light green (FABs, links, accents)
  primaryDark: '#128C7E',    // Teal-green (active states)
  headerDark: '#075E54',     // Dark green chat/list header
  headerText: '#FFFFFF',
  headerSub: 'rgba(255,255,255,0.75)',

  // Surfaces
  bg: '#FFFFFF',
  chatBg: '#ECE5DD',         // The famous cream chat backdrop
  surface: '#FFFFFF',
  surfaceMuted: '#F7F7F7',
  divider: '#E5E5E5',

  // Bubbles
  bubbleMine: '#DCF8C6',     // Light green = sent
  bubbleTheirs: '#FFFFFF',   // White = received
  bubbleMeta: '#667781',     // Timestamp text under bubble

  // Text
  text: '#111B21',
  textMuted: '#667781',
  textOnPrimary: '#FFFFFF',
  link: '#027EB5',

  // Status
  error: '#E53935',
  errorBg: '#FDECEA',
  online: '#25D366',

  // Shadow
  shadow: 'rgba(0,0,0,0.15)',
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
  bubble: 8,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
};
