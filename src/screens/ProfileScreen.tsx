import { useEffect, useState } from 'react';
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
import { getUserProfile, updateUserProfile } from '../services/firestoreService';
import { uploadProfileImage } from '../services/storageService';
import { colors, fontSize, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

/**
 * Split a stored phoneNumber (e.g. "+919876543210") back into country code
 * and 10-digit national number for editing. Defensive against odd formats.
 */
function splitPhone(stored?: string): { country: string; digits: string } {
  if (!stored) return { country: '+91', digits: '' };
  const cleaned = stored.replace(/[^\d+]/g, '');
  // Take the last 10 digits as the local number; everything before is the
  // country code.
  if (cleaned.replace(/\D/g, '').length >= 10) {
    const digits = cleaned.slice(-10);
    let country = cleaned.slice(0, -10);
    if (!country) country = '+91';
    if (!country.startsWith('+')) country = `+${country.replace(/\D/g, '')}`;
    return { country, digits };
  }
  return { country: '+91', digits: cleaned.replace(/\D/g, '') };
}

export function ProfileScreen({ onBack }: Props) {
  const { user, signOut } = useAuthContext();
  const currentUser = user!;

  const [displayName, setDisplayName] = useState(currentUser.displayName ?? '');
  const [photoURL, setPhotoURL] = useState<string | undefined>(currentUser.photoURL ?? undefined);
  const [country, setCountry] = useState('+91');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await getUserProfile(currentUser.uid);
      if (cancelled) return;
      if (profile) {
        setDisplayName(profile.displayName ?? '');
        setPhotoURL(profile.photoURL ?? undefined);
        const { country: c, digits } = splitPhone(profile.phoneNumber);
        setCountry(c);
        setPhoneDigits(digits);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser.uid]);

  async function pickAndUploadPhoto() {
    if (uploading || saving) return;
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setUploading(true);
    try {
      const url = await uploadProfileImage(currentUser.uid, asset.uri);
      setPhotoURL(url);
      await firebaseAuth().currentUser?.updateProfile({ photoURL: url });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    const name = displayName.trim();
    if (!name) {
      setError('Display name is required.');
      return;
    }
    // Phone is optional on Profile (already set during onboarding) but if the
    // user typed something it must be a valid 10-digit number.
    if (phoneDigits && phoneDigits.length !== 10) {
      setError('Phone number must be exactly 10 digits.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const patch: Parameters<typeof updateUserProfile>[1] = { displayName: name };
      if (phoneDigits.length === 10) {
        patch.phoneNumber = `${country}${phoneDigits}`;
      }
      await updateUserProfile(currentUser.uid, patch);
      if (name !== currentUser.displayName) {
        await firebaseAuth().currentUser?.updateProfile({ displayName: name });
      }
      Alert.alert('Saved', 'Your profile was updated.');
    } catch (e: any) {
      setError(e?.message ?? 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={pickAndUploadPhoto}
          disabled={uploading || saving}
          style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.85 }]}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>
                {(displayName || currentUser.email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {uploading ? (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : (
            <View style={styles.cameraBadge}>
              <Text style={styles.cameraBadgeText}>📷</Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.fieldLabel}>Display name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={colors.textLight}
          maxLength={50}
        />

        <Text style={styles.fieldLabel}>Email</Text>
        <View style={[styles.input, styles.readonly]}>
          <Text style={styles.readonlyText}>{currentUser.email}</Text>
        </View>

        <Text style={styles.fieldLabel}>Phone number</Text>
        <View style={styles.phoneRow}>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={country}
            onChangeText={t =>
              setCountry(t.startsWith('+') ? t : `+${t.replace(/\D/g, '')}`)
            }
            keyboardType="phone-pad"
            maxLength={5}
          />
          <TextInput
            style={[styles.input, styles.phoneInput]}
            value={phoneDigits}
            onChangeText={t => setPhoneDigits(t.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            placeholder="9876543210"
            placeholderTextColor={colors.textLight}
            maxLength={10}
          />
        </View>
        <Text style={styles.hint}>Must be exactly 10 digits.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            pressed && { opacity: 0.9 },
            (saving || uploading) && { opacity: 0.7 },
          ]}
          onPress={handleSave}
          disabled={saving || uploading}>
          {saving ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.saveBtnText}>Save changes</Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const AVATAR_SIZE = 120;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    backgroundColor: colors.headerDark,
  },
  back: { color: colors.headerText, fontSize: fontSize.lg - 1, fontWeight: '600', width: 60 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.headerText,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },

  body: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl + spacing.lg,
  },

  avatarWrap: { alignSelf: 'center', marginBottom: spacing.xl, width: AVATAR_SIZE, height: AVATAR_SIZE },
  avatarImg: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: { color: colors.headerText, fontSize: 44, fontWeight: '700' },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AVATAR_SIZE / 2,
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  cameraBadgeText: { fontSize: 16 },

  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
  },
  readonly: { justifyContent: 'center' },
  readonlyText: { color: colors.textMuted, fontSize: fontSize.md },

  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  codeInput: {
    width: 80,
    textAlign: 'center',
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
  },
  phoneInput: { flex: 1 },

  hint: {
    color: colors.textLight,
    fontSize: fontSize.xs + 1,
    marginTop: 6,
  },

  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.md,
  },

  saveBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  saveBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fontSize.lg - 1 },

  signOutBtn: { marginTop: spacing.lg, alignItems: 'center', paddingVertical: spacing.md },
  signOutText: { color: colors.error, fontWeight: '600', fontSize: fontSize.md },
});
