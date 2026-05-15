import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { signInWithGoogle } from '../services/authService';
import { colors, fontSize, radius, spacing } from '../theme';

const LOGO = require('../assets/Logo.png');
const GOOGLE_ICON = require('../assets/google-g.png');

interface Feature {
  icon: string;
  label: string;
  sub: string;
}

const FEATURES: Feature[] = [
  { icon: '🔒', label: 'End-to-end', sub: 'Secure by default' },
  { icon: '⚡', label: 'Realtime', sub: 'Messages in ms' },
  { icon: '🎬', label: 'Rich media', sub: 'Photos & videos' },
];

interface Props {
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}

export function LoginScreen({ onOpenTerms, onOpenPrivacy }: Props) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogle() {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      if (e?.code !== 'CANCELED') {
        setError(e?.message ?? 'Google sign-in failed.');
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Decorative background blobs — softly tinted to add depth without distracting. */}
      <View pointerEvents="none" style={[styles.blob, styles.blobTL]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobBR]} />
      <View pointerEvents="none" style={[styles.dot, styles.dotA]} />
      <View pointerEvents="none" style={[styles.dot, styles.dotB]} />
      <View pointerEvents="none" style={[styles.dot, styles.dotC]} />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <Image source={LOGO} style={styles.brandImage} resizeMode="contain" />
        </View>

        <View style={styles.card}>
          <Text style={styles.welcome}>Welcome 👋</Text>
          <Text style={styles.welcomeSub}>
            Sign in with Google to start chatting with friends — no passwords to remember.
          </Text>

          <View style={styles.features}>
            {FEATURES.map(f => (
              <View key={f.label} style={styles.feature}>
                <View style={styles.featureIconWrap}>
                  <Text style={styles.featureIcon}>{f.icon}</Text>
                </View>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureSub}>{f.sub}</Text>
              </View>
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.googleButtonPressed,
              googleLoading && { opacity: 0.7 },
            ]}
            onPress={handleGoogle}
            disabled={googleLoading}>
            {googleLoading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Image source={GOOGLE_ICON} style={styles.googleIcon} resizeMode="contain" />
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.trustRow}>
            <View style={styles.trustDot} />
            <Text style={styles.trustText}>Powered by Firebase Authentication</Text>
          </View>
        </View>

        <Text style={styles.fineprint}>
          By continuing you agree to the{' '}
          <Text style={styles.fineprintLink} onPress={onOpenTerms}>
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text style={styles.fineprintLink} onPress={onOpenPrivacy}>
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgSoft },

  // Background atmosphere
  blob: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.35,
  },
  blobTL: { top: -80, left: -80, backgroundColor: '#E9D5FF' /* light violet */ },
  blobBR: { bottom: -100, right: -90, backgroundColor: '#FBCFE8' /* light pink */ },
  dot: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.primary,
    opacity: 0.15,
  },
  dotA: { width: 10, height: 10, top: '14%', left: '12%' },
  dotB: { width: 8, height: 8, top: '22%', right: '14%' },
  dotC: { width: 6, height: 6, bottom: '22%', left: '18%' },

  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },

  brandRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  brandImage: { width: 220, height: 160 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl + 4,
    padding: spacing.xl,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  welcome: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  welcomeSub: {
    fontSize: fontSize.sm + 1,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },

  features: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  feature: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  featureIcon: { fontSize: 18 },
  featureLabel: {
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.2,
  },
  featureSub: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },

  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    alignSelf: 'stretch',
    borderWidth: 1.5,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 4,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  googleButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  googleIcon: { width: 22, height: 22 },
  googleText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: fontSize.md + 1,
    letterSpacing: 0.2,
  },

  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  trustDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  trustText: {
    color: colors.textMuted,
    fontSize: fontSize.xs + 1,
    fontWeight: '500',
  },

  fineprint: {
    color: colors.textLight,
    fontSize: fontSize.xs + 1,
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 16,
    paddingHorizontal: spacing.lg,
  },
  fineprintLink: {
    color: colors.primary,
    fontWeight: '600',
  },
});
