import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { loginWithEmail, signInWithGoogle } from '../services/authService';
import { colors, fontSize, radius, spacing } from '../theme';

interface Props {
  onGoRegister: () => void;
}

export function LoginScreen({ onGoRegister }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await loginWithEmail(email.trim(), password);
    } catch (e: any) {
      setError(friendlyError(e?.code));
    } finally {
      setLoading(false);
    }
  }

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
      <View style={styles.container}>
        <View style={styles.logoWrap}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>V</Text>
          </View>
          <Text style={styles.title}>VibeChat</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#999"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
          returnKeyType="go"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={handleLogin}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.divider} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.googleButton, pressed && { opacity: 0.85 }]}
          onPress={handleGoogle}
          disabled={googleLoading}>
          {googleLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Image
                source={{
                  uri: 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg',
                }}
                style={styles.googleIcon}
              />
              <Text style={styles.googleText}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={onGoRegister} style={styles.link}>
          <Text style={styles.linkText}>
            Don't have an account? <Text style={styles.linkBold}>Register</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function friendlyError(code?: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.';
    default:
      return 'Sign in failed. Please try again.';
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl + 4,
    backgroundColor: colors.bg,
  },
  logoWrap: { alignItems: 'center', marginBottom: spacing.xl + 8 },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoText: { color: colors.headerText, fontSize: 32, fontWeight: '800' },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.headerDark,
  },
  subtitle: { fontSize: fontSize.md, color: colors.textMuted, marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    marginBottom: spacing.md,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
  },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: colors.textOnPrimary, fontSize: fontSize.lg - 1, fontWeight: '600' },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: spacing.md,
  },
  divider: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { color: colors.textMuted, fontSize: fontSize.sm },

  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  googleIcon: { width: 20, height: 20 },
  googleText: { color: colors.text, fontWeight: '600', fontSize: fontSize.md },

  link: { marginTop: spacing.xl, alignItems: 'center' },
  linkText: { color: colors.textMuted, fontSize: fontSize.sm + 1 },
  linkBold: { color: colors.primaryDark, fontWeight: '700' },
});
