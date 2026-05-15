/**
 * Centralised brand-gradient header.
 *
 * Every screen that previously used a flat `colors.headerDark` background
 * row can drop this in and get the same indigo → violet → magenta sweep,
 * matching the app icon's gradient.
 */

import type { ReactNode } from 'react';
import LinearGradient from 'react-native-linear-gradient';
import { StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing } from '../theme';

interface Props {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Override the gradient direction/colors if a screen needs something custom. */
  colorsOverride?: string[];
  /** Diagonal "1,1" gives the most brand-like sweep. */
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

export function GradientHeader({
  children,
  style,
  colorsOverride,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
}: Props) {
  return (
    <LinearGradient
      colors={colorsOverride ?? [colors.brandFrom, colors.brandMid, colors.brandTo]}
      start={start}
      end={end}
      style={[styles.header, style]}>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
