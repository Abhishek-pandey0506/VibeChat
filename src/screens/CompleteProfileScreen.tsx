/**
 * Complete-your-profile onboarding form.
 *
 * Layout:
 *   1. Top brand bar: VibeChat icon + wordmark, REQUIRED pill on the right.
 *   2. "Signed in as ..." confirmation card with the user's email + green check.
 *   3. Big heading + sub.
 *   4. Dashed-circle avatar placeholder with camera badge ("Tap to add photo · required").
 *   5. Display name field (autofilled, inline validation ✓ when valid).
 *   6. Email field (locked, gray, lock icon).
 *   7. Phone — IN country chip + 10-digit number field.
 *   8. Save and continue button.
 */

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useAuthContext } from '../contexts/AuthContext';
import { firebaseAuth } from '../config/firebase';
import { updateUserProfile } from '../services/firestoreService';
import { describeStorageError, setProfilePhotoFromBase64 } from '../services/storageService';
import { colors, fontSize, radius, spacing } from '../theme';
import { initialOf } from '../utils/avatar';

const LOGO = require('../assets/Logo.png');

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

  const nameValid = displayName.trim().length >= 2;
  const phoneDigits = phone.replace(/\D/g, '');
  // Indian mobile numbers are exactly 10 digits and must start with 6, 7,
  // 8, or 9. Leading 0-5 are reserved for landline/operator prefixes and
  // never appear as the first digit of a mobile MSISDN.
  const phoneValid = phoneDigits.length === 10 && /^[6-9]/.test(phoneDigits);
  const canSubmit = nameValid && phoneValid;

  const initial = useMemo(
    () => initialOf(displayName || currentUser.email),
    [displayName, currentUser.email],
  );

  async function handlePickPhoto() {
    if (uploading || saving) return;
    try {
      // Aggressive resize + base64 — we store the data URL directly in
      // Firestore so we never touch Firebase Storage (which requires the
      // Blaze plan since Oct 2024). 256×256 @ q=0.6 lands well under the
      // 700 KB safety cap defined in setProfilePhotoFromBase64.
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
      const dataUrl = await setProfilePhotoFromBase64(
        currentUser.uid,
        asset.base64,
        asset.type ?? 'image/jpeg',
      );
      setPhotoURL(dataUrl);
      // Firebase Auth's photoURL field has a tight size limit and won't
      // accept a long data URL — silently skip if the SDK rejects it. The
      // canonical source for the avatar is users/{uid}.photoURL anyway.
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
    if (!nameValid) {
      setError('Please enter your name.');
      return;
    }
    // Any phone problem — wrong length or wrong leading digit — collapses
    // to the same short red message. The inline helper under the field
    // already explains the rule, so we don't need to repeat it here.
    if (!phoneValid) {
      setError('Incorrect phone number');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const name = displayName.trim();
      await updateUserProfile(currentUser.uid, {
        displayName: name,
        phoneNumber: `${country}${phoneDigits}`,
        ...(photoURL ? { photoURL } : {}),
      });
      if (name !== currentUser.displayName) {
        await firebaseAuth().currentUser?.updateProfile({ displayName: name });
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Light body — system status bar icons need to be dark to remain
          readable. The previous default ("light-content") was inherited from
          earlier brand-gradient screens and made the time/battery icons fade
          into the near-white background. */}
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={false}
      />

      {/* Pinned brand bar — stays anchored to the top while the form
          scrolls. The REQUIRED pill was removed (it duplicated the per-field
          asterisks). A thin divider under the bar separates it visually from
          the scrolling content. */}
      <View style={styles.brandBar}>
        <View style={styles.brandLeft}>
          <Image source={LOGO} style={styles.brandIcon} resizeMode="contain" />
          <Text style={styles.brandWord}>
            Vibe<Text style={{ color: colors.primary }}>Chat</Text>
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Signed-in card */}
        <View style={styles.signedInCard}>
          <View style={styles.signedAvatar}>
            <Text style={styles.signedAvatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.signedLabel}>Signed in as</Text>
            <Text style={styles.signedEmail} numberOfLines={1}>
              {currentUser.email}
            </Text>
          </View>
          <View style={styles.checkCircle}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
        </View>

        <Text style={styles.title}>
          Complete your{'\n'}profile to continue
        </Text>
        <Text style={styles.subtitle}>
          We need your name, phone, and a photo so friends can find and recognize you.
        </Text>

        {/* Avatar picker */}
        <Pressable
          onPress={handlePickPhoto}
          disabled={uploading || saving}
          style={({ pressed }) => [styles.avatarOuter, pressed && { opacity: 0.85 }]}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarDashed}>
              <Text style={styles.avatarInitial}>{initial}</Text>
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
          Tap to add a photo · <Text style={styles.optional}>optional</Text>
        </Text>

        {/* Display name */}
        <FieldLabel>
          Display name <Text style={styles.req}>*</Text>
        </FieldLabel>
        <View
          style={[
            styles.inputWrap,
            nameValid && styles.inputWrapValid,
          ]}>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={colors.text3}
            maxLength={50}
          />
          {nameValid ? <Text style={styles.fieldTick}>✓</Text> : null}
        </View>

        {/* Email */}
        <FieldLabel>Email</FieldLabel>
        <View style={[styles.inputWrap, styles.inputDisabled]}>
          <Text style={styles.lockedText} numberOfLines={1}>
            {currentUser.email}
          </Text>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>
        <Text style={styles.helper}>From your Google account · can't be changed.</Text>

        {/* Phone */}
        <FieldLabel>
          Phone number <Text style={styles.req}>*</Text>
        </FieldLabel>
        <View style={styles.phoneRow}>
          <View style={styles.countryChip}>
            {/* Real flag emoji instead of the previous "IN" letter pair.
                The U+1F1EE U+1F1F3 regional indicators render as 🇮🇳 on
                both Android (System UI emoji) and iOS. */}
            <Text style={styles.countryFlag}>🇮🇳</Text>
            <Text style={styles.countryCode}>{country}</Text>
          </View>
          <View style={[styles.inputWrap, styles.phoneInputWrap]}>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={t => {
                const digits = t.replace(/\D/g, '').slice(0, 10);
                setPhone(digits);
                // Live validation — fire the inline error as soon as the
                // user types something invalid, so they don't have to tap
                // Save to discover the problem. Empty field clears it.
                if (digits.length === 0) {
                  setError('');
                } else if (!/^[6-9]/.test(digits)) {
                  setError('Incorrect phone number');
                } else if (digits.length < 10) {
                  setError('');
                } else {
                  setError('');
                }
              }}
              keyboardType="number-pad"
              placeholder="9876 543 210"
              placeholderTextColor={colors.text3}
              maxLength={10}
            />
          </View>
        </View>

        {/* Plain red text — no background card, no icon. Just a one-liner
            below the field that says what's wrong. */}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Button stays tappable even when fields are invalid — handleSave
            shows the specific error message instead. A disabled button leaves
            the user guessing what's wrong. */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.submit,
            !canSubmit && styles.submitDimmed,
            pressed && { opacity: 0.92 },
          ]}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Save and continue   ›</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl + spacing.lg,
  },

  // Pinned brand bar — sits above the ScrollView, so it stays put while the
  // form scrolls. The hairline border below it visually separates the
  // fixed chrome from the scrolling content.
  brandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: { width: 40, height: 40 },
  brandWord: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  signedInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    marginBottom: spacing.xl,
  },
  signedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signedAvatarText: { color: '#fff', fontWeight: '800', fontSize: fontSize.md },
  signedLabel: { color: colors.text2, fontSize: fontSize.xs + 1, fontWeight: '600' },
  signedEmail: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: 1 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: colors.success, fontWeight: '800', fontSize: 18 },

  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
    lineHeight: 38,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md + 1,
    color: colors.text2,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },

  avatarOuter: {
    alignSelf: 'center',
    width: 140,
    height: 140,
    marginBottom: spacing.sm,
  },
  avatarImg: { width: 140, height: 140, borderRadius: 70 },
  avatarDashed: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.divider,
    backgroundColor: colors.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: colors.text3, fontSize: 46, fontWeight: '800' },
  avatarOverlay: {
    position: 'absolute',
    inset: 0,
    borderRadius: 70,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  cameraIcon: { fontSize: 14 },
  avatarHint: {
    color: colors.text2,
    fontSize: fontSize.sm + 1,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  optional: { color: colors.primary, fontWeight: '700' },

  fieldLabel: {
    fontSize: fontSize.sm + 1,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    marginTop: spacing.md,
  },
  req: { color: colors.error },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    backgroundColor: colors.surface,
  },
  inputWrapValid: { borderColor: colors.primary },
  inputDisabled: { backgroundColor: colors.bgSoft, borderColor: colors.divider },
  input: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    fontSize: fontSize.md + 1,
    color: colors.text,
    fontWeight: '600',
  },
  lockedText: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    fontSize: fontSize.md + 1,
    color: colors.text2,
    fontWeight: '600',
  },
  lockIcon: { fontSize: 14, opacity: 0.5 },
  fieldTick: { color: colors.success, fontWeight: '800', fontSize: 18, marginLeft: 6 },

  helper: {
    color: colors.text3,
    fontSize: fontSize.xs + 1,
    marginTop: 6,
  },

  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.divider,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  // Sized for the 🇮🇳 emoji — bigger than the old "IN" text and no
  // letter-spacing (it'd push the two regional-indicator codepoints apart
  // and they'd stop joining into a flag glyph on some Androids).
  countryFlag: {
    fontSize: fontSize.lg,
  },
  countryCode: { color: colors.text, fontSize: fontSize.md + 1, fontWeight: '800' },
  phoneInputWrap: { flex: 1 },

  // Plain red error message — sits below the phone field. No card, no
  // icon, just one line of red text in the normal flow of the form.
  error: {
    color: colors.error,
    fontSize: fontSize.sm + 1,
    fontWeight: '600',
    marginTop: spacing.sm,
  },

  submit: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md + 4,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  // Visual hint that the form isn't complete yet, while still letting the
  // user tap so handleSave can pinpoint what's wrong.
  submitDimmed: { backgroundColor: colors.text3, shadowOpacity: 0 },
  submitText: {
    color: '#fff',
    fontSize: fontSize.lg - 1,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
