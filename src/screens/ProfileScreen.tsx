import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { logout, type AuthUser } from '../services/authService';
import { firebaseAuth } from '../config/firebase';
import { getUserProfile, updateUserProfile } from '../services/firestoreService';
import { uploadProfileImage } from '../services/storageService';
import { colors, fontSize, radius, spacing } from '../theme';

interface Props {
  user: AuthUser;
  onBack: () => void;
}

export function ProfileScreen({ user, onBack }: Props) {
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [photoURL, setPhotoURL] = useState<string | undefined>(user.photoURL ?? undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await getUserProfile(user.uid);
      if (cancelled) return;
      if (profile) {
        setDisplayName(profile.displayName ?? '');
        setPhotoURL(profile.photoURL ?? undefined);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  async function pickAndUploadPhoto() {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setUploading(true);
    try {
      const url = await uploadProfileImage(user.uid, asset.uri);
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
      Alert.alert('Display name required');
      return;
    }
    setSaving(true);
    try {
      await updateUserProfile(user.uid, { displayName: name });
      await firebaseAuth().currentUser?.updateProfile({ displayName: name });
      Alert.alert('Saved', 'Your profile was updated.');
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={colors.primaryDark} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.body}>
        <Pressable
          onPress={pickAndUploadPhoto}
          style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.85 }]}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>
                {(displayName || user.email || '?').charAt(0).toUpperCase()}
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
          placeholderTextColor="#999"
        />

        <Text style={styles.fieldLabel}>Email</Text>
        <View style={[styles.input, styles.readonly]}>
          <Text style={styles.readonlyText}>{user.email}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
          onPress={handleSave}
          disabled={saving}>
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
      </View>
    </View>
  );
}

const AVATAR_SIZE = 120;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },

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

  body: { padding: spacing.xl, alignItems: 'stretch' },

  avatarWrap: { alignSelf: 'center', marginBottom: spacing.xl },
  avatarImg: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: { color: colors.headerText, fontSize: 44, fontWeight: '700' },
  avatarOverlay: {
    position: 'absolute',
    inset: 0,
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

  saveBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  saveBtnText: { color: colors.textOnPrimary, fontWeight: '600', fontSize: fontSize.lg - 1 },

  signOutBtn: { marginTop: spacing.lg, alignItems: 'center', paddingVertical: spacing.md },
  signOutText: { color: colors.error, fontWeight: '600', fontSize: fontSize.md },
});
