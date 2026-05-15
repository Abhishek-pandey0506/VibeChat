/**
 * Login screen — dark violet hero with a chat-bubble showcase at the top,
 * the brand mark + value prop, and a single white "Continue with Google"
 * pill button. Terms + Privacy in the footer.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { signInWithGoogle } from '../services/authService';
import { colors, fontSize, radius, spacing } from '../theme';

const GOOGLE_ICON = require('../assets/google-g.png');
const LOGO = require('../assets/Logo.png');

interface Props {
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}

interface DemoBubble {
  side: 'left' | 'right';
  text: string;
}

const DEMO_BUBBLES: DemoBubble[] = [
  { side: 'left', text: 'Heyy 👋' },
  { side: 'right', text: 'Just landed!' },
  { side: 'left', text: 'Welcome home 🌟' },
  { side: 'right', text: 'See you soon ❤️' },
];

export function LoginScreen({ onOpenTerms, onOpenPrivacy }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogle() {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      if (e?.code !== 'CANCELED') {
        setError(e?.message ?? 'Google sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient
      // Slightly darker magenta at the bottom (#831843) keeps the white
      // subhead readable while still pulling the brand's pink accent in.
      colors={[colors.brandFrom, colors.brandMid, '#9D174D']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.brandFrom} translucent />

      {/* Decorative dotted backdrop, very subtle */}
      <View style={styles.dotsLayer} pointerEvents="none">
        {Array.from({ length: 40 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.bgDot,
              {
                top: (i * 51) % 700 + 60,
                left: ((i * 97) % 360) + 8,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.bubbles}>
        {DEMO_BUBBLES.map((b, i) => (
          <View
            key={i}
            style={[
              styles.bubbleRow,
              b.side === 'right' ? { justifyContent: 'flex-end' } : null,
            ]}>
            <View
              style={[
                styles.bubble,
                b.side === 'right' ? styles.bubbleMine : styles.bubbleTheirs,
              ]}>
              <Text
                style={[
                  styles.bubbleText,
                  b.side === 'right' ? styles.bubbleTextMine : styles.bubbleTextTheirs,
                ]}>
                {b.text}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.brandBlock}>
        <View style={styles.brandRow}>
          <Image source={LOGO} style={styles.icon} resizeMode="contain" />
          <Text style={styles.brand}>
            Vibe<Text style={{ color: '#F9A8D4' }}>Chat</Text>
          </Text>
        </View>

        <Text style={styles.headline}>
          Chat that{'\n'}
          <Text style={styles.headlineAccent}>feels right.</Text>
        </Text>
        <Text style={styles.subhead}>
          End-to-end encrypted messaging with the people who matter. No ads. No noise.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleGoogle}
          disabled={loading}
          style={({ pressed }) => [
            styles.googleBtn,
            pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
            loading && { opacity: 0.7 },
          ]}>
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Image source={GOOGLE_ICON} style={styles.googleIcon} resizeMode="contain" />
              <Text style={styles.googleText}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.fineprint}>
          By continuing you agree to our{' '}
          <Text style={styles.fineprintLink} onPress={onOpenTerms}>
            Terms
          </Text>{' '}
          and{' '}
          <Text style={styles.fineprintLink} onPress={onOpenPrivacy}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  dotsLayer: { ...StyleSheet.absoluteFillObject },
  bgDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  bubbles: {
    paddingHorizontal: spacing.xl,
    paddingTop: 100,
    gap: spacing.md,
  },
  bubbleRow: { flexDirection: 'row' },
  bubble: {
    maxWidth: '72%',
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.xl,
  },
  bubbleMine: {
    backgroundColor: colors.primary500,
    borderBottomRightRadius: 6,
  },
  bubbleTheirs: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderBottomLeftRadius: 6,
  },
  bubbleText: { fontSize: fontSize.md + 1, fontWeight: '600' },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleTextTheirs: { color: colors.text },

  brandBlock: {
    marginTop: 'auto',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginBottom: spacing.lg,
  },
  icon: {
    width: 44,
    height: 44,
  },
  brand: {
    color: '#fff',
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  headline: {
    color: '#FFFFFF',
    fontSize: fontSize.hero,
    fontWeight: '800',
    lineHeight: 50,
    letterSpacing: -1.2,
    marginBottom: spacing.md,
  },
  headlineAccent: { color: '#F9A8D4' /* bright pink — reads against magenta */ },
  subhead: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: fontSize.md + 1,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },

  error: {
    color: '#FCA5A5',
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  googleIcon: { width: 22, height: 22 },
  googleText: {
    color: colors.text,
    fontSize: fontSize.lg - 1,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  fineprint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: fontSize.xs + 1,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  fineprintLink: { color: '#FFFFFF', fontWeight: '700', textDecorationLine: 'underline' },
});
