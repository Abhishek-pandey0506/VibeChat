/**
 * Deterministic avatar-color picker — keeps the same person's fallback disc
 * the same color across sessions and screens.
 */

import { avatarPalette } from '../theme';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function pickAvatarColor(seed: string | null | undefined): string {
  if (!seed) return avatarPalette[7]; // violet default
  return avatarPalette[hash(seed) % avatarPalette.length];
}

export function initialOf(text: string | null | undefined): string {
  if (!text) return '?';
  const t = text.trim();
  if (!t) return '?';
  // For "Abhay Pandey" → "AP"; for "Abhay" → "A"; for emails → first letter.
  const parts = t.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return t.charAt(0).toUpperCase();
}
