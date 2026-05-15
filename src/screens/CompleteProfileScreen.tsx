/**
 * Shown ONCE after Google sign-in if the user's Firestore profile doesn't
 * have a phone number yet. App.tsx gates the rest of the app behind this.
 *
 * - Name: autofilled from the Google profile, editable.
 * - Email: autofilled, locked (Google is the source of truth).
 * - Phone: required; persisted to users/{uid}.phoneNumber on save.
 * - Profile photo: OPTIONAL — Google's photo is shown by default; user
 *   can tap to replace it with one from their gallery.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { launchImageLibrary } from 'react-native-image-picker';
import { useAuthContext } from '../contexts/AuthContext';
import { firebaseAuth } from '../config/firebase';
import { updateUserProfile } from '../services/firestoreService';
import { uploadProfileImage } from '../services/storageService';
import { colors, fontSize, radius, spacing } from '../theme';

export function CompleteProfileScreen() {
  const { user } = useAuthContext();
  const currentUser = user!;

  const [displayName, setDisplayName] = useState(currentUser.displayName ?? '');
  const [country, setCountry] = useState('+91');
  const [phone, setPhone] = useState('');
  const [photoURL, setPhotoURL] = useState<string | undefined>(
    currentUser.photoURL ?? undefined,
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handlePickPhoto() {
    if (uploading || saving) return;
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.85,
      });
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setUploading(true);
      const url = await uploadProfileImage(currentUser.uid, asset.uri);
      setPhotoURL(url);
      // Mirror to the Firebase Auth profile so other parts of the app see it.
      await firebaseAuth().currentUser?.updateProfile({ photoURL: url });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Please try a different photo.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    const name = displayName.trim();
    const digits = phone.replace(/\D/g, '');
    if (!name) {
      setError('Please enter your name.');
      return;
    }
    if (digits.length !== 10) {
      setError('Phone number must be exactly 10 digits.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const fullPhone = `${country}${digits}`;
      await updateUserProfile(currentUser.uid, {
        displayName: name,
        phoneNumber: fullPhone,
        // photoURL is optional — only include it if we have one.
        ...(photoURL ? { photoURL } : {}),
      });
      if (name !== currentUser.displayName) {
        await firebaseAuth().currentUser?.updateProfile({ displayName: name });
      }
      // App.tsx watches the Firestore profile and routes away from this
      // screen automatically once phoneNumber appears.
    } catch (e: any) {
      setError(e?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const initial = (displayName || currentUser.email || '?').charAt(0).toUpperCase();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Complete your profile</Text>
        <Text style={styles.headerSub}>Just one more step</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={handlePickPhoto}
          disabled={uploading || saving}
          style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.85 }]}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackText}>{initial}</Text>
            </View>
          )}

          {uploading ? (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : (
            <View style={styles.cameraBadge}>
              <Text style={styles.cameraIcon}>📷</Text>
            </View>
          )}
        </Pressable>
        <Text style={styles.avatarHint}>
          Tap to change photo · <Text style={styles.optional}>optional</Text>
        </Text>

        <Text style={styles.label}>Your name</Text>
        <View style={styles.inputWrap}>
          <Text style={styles.inputIcon}>👤</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={colors.textLight}
            maxLength={50}
          />
        </View>
        <Text style={styles.hint}>You can change this anytime in Profile.</Text>

        <Text style={styles.label}>Email</Text>
        <View style={[styles.inputWrap, styles.inputDisabled]}>
          <Text style={styles.inputIcon}>✉️</Text>
          <Text style={styles.inputLockedText} numberOfLines={1}>
            {currentUser.email}
          </Text>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>
        <Text style={styles.hint}>Tied to your Google account — can't be changed.</Text>

        <Text style={styles.label}>Phone number</Text>
        <View style={styles.phoneRow}>
          <View style={[styles.inputWrap, styles.codeWrap]}>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={country}
              onChangeText={t =>
                setCountry(t.startsWith('+') ? t : `+${t.replace(/\D/g, '')}`)
              }
              keyboardType="phone-pad"
              maxLength={5}
            />
          </View>
          <View style={[styles.inputWrap, { flex: 1 }]}>
            <Text style={styles.inputIcon}>📱</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={t => setPhone(t.replace(/\D/g, '').slice(0, 10))}
              keyboardType="number-pad"
              placeholder="9876543210"
              placeholderTextColor={colors.textLight}
              maxLength={10}
            />
          </View>
        </View>
        <Text style={styles.hint}>10-digit number. Friends can find you by phone.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleSave}
          disabled={saving || uploading}
          style={({ pressed }) => [
            styles.saveBtn,
            pressed && { opacity: 0.9 },
            (saving || uploading) && { opacity: 0.7 },
          ]}>
          {saving ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.saveBtnText}>Save and continue</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const AVATAR_SIZE = 100;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg + 4,
    backgroundColor: colors.headerDark,
  },
  headerTitle: {
    color: colors.headerText,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  headerSub: {
    color: colors.headerSub,
    fontSize: fontSize.sm + 1,
    marginTop: 2,
  },

  body: { padding: spacing.xl, paddingBottom: spacing.xxl + spacing.lg },

  avatarWrap: {
    alignSelf: 'center',
    marginBottom: spacing.xs,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: colors.headerText,
    fontSize: 42,
    fontWeight: '700',
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  cameraIcon: { fontSize: 14 },
  avatarHint: {
    color: colors.textLight,
    fontSize: fontSize.xs + 1,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  optional: { color: colors.primary, fontWeight: '700' },

  label: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  inputDisabled: { opacity: 0.85 },
  inputIcon: { fontSize: 16, marginRight: spacing.sm },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  inputLockedText: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  lockIcon: { fontSize: 14, opacity: 0.6, marginLeft: spacing.sm },

  hint: {
    color: colors.textLight,
    fontSize: fontSize.xs + 1,
    marginTop: 6,
    marginBottom: spacing.lg,
  },

  phoneRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  codeWrap: { width: 90 },
  codeInput: { textAlign: 'center', fontWeight: '700' },

  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
  },

  saveBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 4,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  saveBtnText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.lg - 1,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
