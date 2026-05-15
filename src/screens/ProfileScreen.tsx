import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { GradientHeader } from '../components/GradientHeader';
import { useAuthContext } from '../contexts/AuthContext';
import { firebaseAuth } from '../config/firebase';
import { deleteAccount } from '../services/authService';
import { getUserProfile, updateUserProfile } from '../services/firestoreService';
import { describeStorageError, setProfilePhotoFromBase64 } from '../services/storageService';
import { colors, fontSize, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

const STATUS_OPTIONS = ['Available', 'Busy', 'Away', 'Do not disturb'] as const;
type Status = (typeof STATUS_OPTIONS)[number];

function splitPhone(stored?: string): { country: string; digits: string } {
  if (!stored) return { country: '+91', digits: '' };
  const cleaned = stored.replace(/[^\d+]/g, '');
  if (cleaned.replace(/\D/g, '').length >= 10) {
    const digits = cleaned.slice(-10);
    let country = cleaned.slice(0, -10);
    if (!country) country = '+91';
    if (!country.startsWith('+')) country = `+${country.replace(/\D/g, '')}`;
    return { country, digits };
  }
  return { country: '+91', digits: cleaned.replace(/\D/g, '') };
}

function handleFromName(name: string, email?: string | null): string {
  const base = (name || (email ?? '').split('@')[0] || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return `@${base || 'user'}`;
}

export function ProfileScreen({ onBack }: Props) {
  const { user, signOut } = useAuthContext();
  const currentUser = user!;

  const [displayName, setDisplayName] = useState(currentUser.displayName ?? '');
  const [photoURL, setPhotoURL] = useState<string | undefined>(currentUser.photoURL ?? undefined);
  const [country, setCountry] = useState('+91');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [status, setStatus] = useState<Status>('Available');
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      includeBase64: true,
      maxWidth: 256,
      maxHeight: 256,
      quality: 0.6,
    });
    const asset = result.assets?.[0];
    if (!asset?.base64) return;
    setUploading(true);
    try {
      const dataUrl = await setProfilePhotoFromBase64(
        currentUser.uid,
        asset.base64,
        asset.type ?? 'image/jpeg',
      );
      setPhotoURL(dataUrl);
      try {
        await firebaseAuth().currentUser?.updateProfile({ photoURL: dataUrl });
      } catch {
        /* photoURL too long for Auth — fine, Firestore has it */
      }
    } catch (e: any) {
      Alert.alert('Upload failed', describeStorageError(e));
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

  async function runDelete() {
    setDeleteConfirmOpen(false);
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (e: any) {
      setDeleting(false);
      Alert.alert('Could not delete account', e?.message ?? 'Something went wrong.');
    }
  }

  if (loading) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const initials = (displayName || currentUser.email || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s.charAt(0).toUpperCase())
    .join('') || '?';
  const handle = handleFromName(displayName, currentUser.email);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.headerBtn}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <Pressable
          onPress={() => setDeleteConfirmOpen(true)}
          hitSlop={10}
          style={styles.headerBtn}
          disabled={deleting}>
          <View style={styles.trashIcon}>
            <View style={styles.trashHandle} />
            <View style={styles.trashLid} />
            <View style={styles.trashBody}>
              <View style={styles.trashStripe} />
              <View style={styles.trashStripe} />
              <View style={styles.trashStripe} />
            </View>
          </View>
        </Pressable>
      </GradientHeader>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.heroRow}>
          <Pressable
            onPress={pickAndUploadPhoto}
            disabled={uploading || saving}
            style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.85 }]}>
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>{initials}</Text>
              </View>
            )}
            {uploading ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <View style={styles.pencilBadge}>
                <Text style={styles.pencilBadgeText}>✎</Text>
              </View>
            )}
          </Pressable>
          <View style={styles.heroText}>
            <Text style={styles.heroName} numberOfLines={1}>
              {displayName || 'Your name'}
            </Text>
            <Text style={styles.heroHandle} numberOfLines={1}>
              {handle}
            </Text>
          </View>
        </View>

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
        <View style={[styles.input, styles.inputReadonly]}>
          <Text style={styles.readonlyText} numberOfLines={1}>
            {currentUser.email}
          </Text>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>

        <Text style={styles.fieldLabel}>Phone number</Text>
        <View style={styles.phoneRow}>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={country}
            onChangeText={t => setCountry(t.startsWith('+') ? t : `+${t.replace(/\D/g, '')}`)}
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

        <Text style={styles.fieldLabel}>Status</Text>
        <Pressable
          onPress={() => setStatusPickerOpen(true)}
          style={({ pressed }) => [styles.input, styles.inputRow, pressed && { opacity: 0.85 }]}>
          <Text style={styles.inputValue}>{status}</Text>
          <Text style={styles.chevron}>▾</Text>
        </Pressable>

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
          disabled={deleting}
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.signOutText}>⤴  Sign out</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={deleteConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmOpen(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !deleting && setDeleteConfirmOpen(false)}>
          <Pressable style={styles.deleteCard} onPress={() => {}}>
            <View style={styles.deleteIconRing}>
              <Text style={styles.deleteIcon}>⚠️</Text>
            </View>
            <Text style={styles.deleteTitle}>Delete your account?</Text>
            <Text style={styles.deleteBody}>
              This permanently removes your profile, photos, presence, and chat history on
              this device. Your messages already sent will remain in other people's chats.
              This action cannot be undone.
            </Text>
            <View style={styles.deleteActions}>
              <Pressable
                onPress={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85 }]}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={runDelete}
                disabled={deleting}
                style={({ pressed }) => [
                  styles.confirmDeleteBtn,
                  pressed && { opacity: 0.85 },
                  deleting && { opacity: 0.7 },
                ]}>
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmDeleteBtnText}>Delete forever</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={statusPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setStatusPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Set status</Text>
            {STATUS_OPTIONS.map(opt => (
              <Pressable
                key={opt}
                onPress={() => {
                  setStatus(opt);
                  setStatusPickerOpen(false);
                }}
                style={({ pressed }) => [
                  styles.modalOption,
                  pressed && { backgroundColor: colors.surfaceMuted },
                ]}>
                <Text style={[styles.modalOptionText, status === opt && styles.modalOptionTextActive]}>
                  {opt}
                </Text>
                {status === opt && <Text style={styles.modalTick}>✓</Text>}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const AVATAR_SIZE = 72;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2,
  },
  headerBtn: { width: 36, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.headerText, fontSize: 32, lineHeight: 32, fontWeight: '500' },

  trashIcon: { width: 22, alignItems: 'center' },
  trashHandle: {
    width: 8,
    height: 2.5,
    backgroundColor: colors.error,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    marginBottom: 1,
  },
  trashLid: {
    width: 20,
    height: 3,
    backgroundColor: colors.error,
    borderRadius: 1.5,
    marginBottom: 1,
  },
  trashBody: {
    width: 16,
    height: 18,
    backgroundColor: colors.error,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 3,
  },
  trashStripe: {
    width: 1.5,
    height: 10,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.headerText,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },

  body: { padding: spacing.xl, paddingBottom: spacing.xxl + spacing.lg },

  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  avatarImg: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: { color: colors.primary, fontSize: 26, fontWeight: '800' },
  avatarOverlay: {
    position: 'absolute',
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencilBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.bg,
  },
  pencilBadgeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  heroText: { flex: 1 },
  heroName: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  heroHandle: { fontSize: fontSize.sm + 1, color: colors.textMuted, marginTop: 2 },

  fieldLabel: {
    color: colors.text2,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs + 2,
    marginTop: spacing.md + 2,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputReadonly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readonlyText: { flex: 1, color: colors.text2, fontSize: fontSize.md },
  lockIcon: { fontSize: 14, marginLeft: spacing.sm, opacity: 0.6 },
  inputValue: { color: colors.text, fontSize: fontSize.md },
  chevron: { color: colors.textMuted, fontSize: 16 },

  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  codeInput: { width: 80, textAlign: 'center', fontWeight: '700', paddingHorizontal: spacing.sm },
  phoneInput: { flex: 1 },

  error: { color: colors.error, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.md },

  saveBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 4,
    alignItems: 'center',
  },
  saveBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: fontSize.lg - 1 },

  signOutBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    borderWidth: 1.2,
    borderColor: colors.divider,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  signOutText: { color: colors.error, fontWeight: '700', fontSize: fontSize.md + 1 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  deleteCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginHorizontal: spacing.xl,
    marginBottom: 'auto',
    marginTop: 'auto',
    alignItems: 'center',
  },
  deleteIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  deleteIcon: { fontSize: 30 },
  deleteTitle: {
    fontSize: fontSize.lg + 1,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  deleteBody: {
    fontSize: fontSize.sm + 1,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    alignSelf: 'stretch',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.2,
    borderColor: colors.divider,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  cancelBtnText: { color: colors.text, fontWeight: '700', fontSize: fontSize.md },
  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.error,
    alignItems: 'center',
  },
  confirmDeleteBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.md },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl + spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.md + 1,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  modalOptionText: { color: colors.text, fontSize: fontSize.md },
  modalOptionTextActive: { color: colors.primary, fontWeight: '700' },
  modalTick: { color: colors.primary, fontWeight: '800', fontSize: 16 },
});
