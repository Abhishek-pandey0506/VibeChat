/**
 * Splash screen rendered by RN while we wait for the auth state listener
 * to fire for the first time (`useAuth.initializing === true`).
 *
 * White background, big centered logo (the wordmark + tagline live inside
 * the PNG itself), and three pulsing purple dots with a "Loading..." label
 * at the bottom — same look as the reference loader.
 *
 * The *native* launch screens (Android: SplashTheme drawable, iOS:
 * LaunchScreen.storyboard) paint the same white + logo so the OS → RN
 * handoff is seamless.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StatusBar, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../theme';

const LOGO = require('../assets/Logo.png');

function LoadingDot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [delay, v]);

  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.25] });

  return (
    <Animated.View style={[styles.dot, { opacity, transform: [{ scale }] }]} />
  );
}

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.center}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </View>

      <View style={styles.loaderWrap}>
        <View style={styles.dots}>
          <LoadingDot delay={0} />
          <LoadingDot delay={150} />
          <LoadingDot delay={300} />
        </View>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { alignItems: 'center' },
  logo: {
    width: 340,
    height: 340,
  },
  loaderWrap: {
    position: 'absolute',
    bottom: 96,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.sm + 2,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary, // #7C3AED — purple/blue accent
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm + 1,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
