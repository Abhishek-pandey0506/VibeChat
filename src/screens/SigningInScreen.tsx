/**
 * Intermediate loader shown right after Google Sign-In succeeds, while we
 * wait for the Firestore profile subscription to deliver the first
 * snapshot. Matches mockup #4 — gradient app icon, "Signing you in" title,
 * three pulse dots, and a three-step checklist that animates from pending
 * to done as the underlying auth + profile fetch progresses.
 *
 * The progression here is purely cosmetic (we don't have observable
 * per-step events) but the staggered timing reassures the user that
 * something is happening.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../theme';

const LOGO = require('../assets/Logo.png');

type StepState = 'done' | 'active' | 'pending';

interface Step {
  label: string;
  state: StepState;
}

export function SigningInScreen() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const ticks = [600, 1300]; // milestones to reach steps 1 → 2
    const timers = ticks.map((ms, idx) =>
      setTimeout(() => setStep(idx + 1), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const steps: Step[] = [
    { label: 'Authenticated with Google', state: step >= 1 ? 'done' : 'active' },
    {
      label: 'Created your account',
      state: step >= 2 ? 'done' : step === 1 ? 'active' : 'pending',
    },
    {
      label: 'Setting up your profile',
      state: step >= 2 ? 'active' : 'pending',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Signing you in</Text>
        <Text style={styles.sub}>Just a moment…</Text>
        <View style={styles.dotsRow}>
          <Dot delay={0} />
          <Dot delay={150} />
          <Dot delay={300} />
        </View>
      </View>

      <View style={styles.checklistCard}>
        {steps.map((s, i) => (
          <View key={i} style={styles.checkRow}>
            {s.state === 'done' ? (
              <View style={[styles.checkDot, styles.checkDotDone]}>
                <Text style={styles.checkTick}>✓</Text>
              </View>
            ) : s.state === 'active' ? (
              <View style={[styles.checkDot, styles.checkDotActive]} />
            ) : (
              <View style={[styles.checkDot, styles.checkDotPending]} />
            )}
            <Text
              style={[
                styles.checkLabel,
                s.state === 'pending' && styles.checkLabelMuted,
              ]}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [delay, v]);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] });
  return (
    <Animated.View
      style={[styles.dot, { opacity, transform: [{ scale }] }]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 120,
  },
  center: { alignItems: 'center' },
  logo: { width: 110, height: 110, marginBottom: spacing.lg },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  sub: { color: colors.text2, fontSize: fontSize.md + 1, marginTop: spacing.xs },
  dotsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },

  checklistCard: {
    marginTop: 'auto',
    marginBottom: spacing.xxl,
    width: '100%',
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.bgSoft,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 6,
  },
  checkDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  checkDotDone: { backgroundColor: colors.success },
  checkDotActive: { backgroundColor: colors.primary, opacity: 0.4 },
  checkDotPending: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.divider },
  checkTick: { color: '#fff', fontWeight: '800', fontSize: 13 },
  checkLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  checkLabelMuted: { color: colors.text3, fontWeight: '500' },
});
