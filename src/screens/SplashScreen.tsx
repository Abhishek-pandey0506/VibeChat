/**
 * Splash screen — rendered while we wait for the auth listener to fire for
 * the first time. White background, centered gradient app icon, wordmark,
 * tagline, and a ring loader at the bottom with "Loading…" text.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StatusBar, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../theme';

const LOGO = require('../assets/Logo.png');

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.center}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={styles.wordmark}>
          Vibe<Text style={{ color: colors.primary }}>Chat</Text>
        </Text>
        <Text style={styles.tag}>Chat. Connect. Vibe.</Text>
      </View>

      <View style={styles.loaderRow}>
        <RingLoader />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    </View>
  );
}

function RingLoader() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    a.start();
    return () => a.stop();
  }, [v]);
  const spin = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]} />
  );
}

const ICON_SIZE = 92;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center' },

  logo: {
    width: 128,
    height: 128,
    marginBottom: spacing.md + 4,
  },

  wordmark: {
    fontSize: fontSize.display,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  tag: {
    fontSize: fontSize.md,
    color: colors.text3,
    marginTop: spacing.xs,
  },

  loaderRow: {
    position: 'absolute',
    bottom: spacing.xxl + spacing.lg,
    alignItems: 'center',
  },
  ring: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: colors.primarySoft,
    borderTopColor: colors.primary,
  },
  loadingText: {
    color: colors.text3,
    fontSize: fontSize.sm + 1,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
});
