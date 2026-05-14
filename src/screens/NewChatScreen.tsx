import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AuthUser } from '../services/authService';
import { ensureOneToOneRoom, findUserByEmail } from '../services/firestoreService';
import { colors, fontSize, radius, spacing } from '../theme';

interface Props {
  user: AuthUser;
  onBack: () => void;
  onRoomReady: (roomId: string, title: string, otherUid: string) => void;
}

export function NewChatScreen({ user, onBack, onRoomReady }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleStart() {
    const target = email.trim().toLowerCase();
    if (!target) {
      setError('Enter an email address.');
      return;
    }
    if (target === (user.email ?? '').toLowerCase()) {
      setError("You can't message yourself.");
      return;
    }
    setError('');
    setLoading(true);
    try {
      const other = await findUserByEmail(target);
      if (!other) {
        setError('No user found with that email.');
        return;
      }
      const roomId = await ensureOneToOneRoom(user.uid, other.uid);
      onRoomReady(roomId, other.displayName || other.email, other.uid);
    } catch (e: any) {
      setError(e?.message ?? 'Could not start chat.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New chat</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>Recipient email</Text>
        <TextInput
          style={styles.input}
          placeholder="friend@example.com"
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={handleStart}
          returnKeyType="go"
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleStart}
          disabled={loading}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Start chat</Text>
          )}
        </Pressable>

        <Text style={styles.hint}>
          The other person must already have a VibeChat account.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  back: { color: '#4f46e5', fontSize: 16, fontWeight: '600', width: 60 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#1a1a2e' },

  body: { padding: 24, gap: 12 },
  label: { fontSize: 13, color: '#555', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  error: { color: '#e53935', fontSize: 13, textAlign: 'center' },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { color: '#888', fontSize: 12, textAlign: 'center', marginTop: 6 },
});
