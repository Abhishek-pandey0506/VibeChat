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
  TextInput,
  View,
} from 'react-native';
import { registerWithEmail, signInWithGoogle } from '../services/authService';
import { colors, fontSize, radius, spacing } from '../theme';

interface Props {
  onGoLogin: () => void;
}

export function RegisterScreen({ onGoLogin }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password || !confirm) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await registerWithEmail(email.trim(), password, name.trim());
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
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join VibeChat today</Text>

        <TextInput
          style={styles.input}
          placeholder="Display name"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
        />
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
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor="#999"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
          onSubmitEditing={handleRegister}
          returnKeyType="go"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={handleRegister}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
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

        <Pressable onPress={onGoLogin} style={styles.link}>
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkBold}>Sign In</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyError(code?: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/weak-password':
      return 'Password is too weak.';
    default:
      return 'Registration failed. Please try again.';
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl + 4,
    backgroundColor: colors.bg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
    color: colors.headerDark,
  },
  subtitle: {
    fontSize: fontSize.md,
    textAlign: 'center',
    color: colors.textMuted,
    marginBottom: spacing.xl + 8,
  },
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
