/**
 * Read-only view of another user's profile, opened from the chat header.
 * Shows their avatar, name, presence, contact info, and a Block/Unblock
 * button. Cannot edit anything else — that's the owner's ProfileScreen.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuthContext } from '../contexts/AuthContext';
import {
  blockUser,
  getUserProfile,
  subscribeBlockRelation,
  subscribeUserPresence,
  unblockUser,
} from '../services/firestoreService';
import { formatLastSeen } from '../services/presenceService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { UserProfile } from '../types/models';

interface Props {
  otherUid: string;
  onBack: () => void;
}

export function UserProfileViewScreen({ otherUid, onBack }: Props) {
  const { user } = useAuthContext();
  const currentUser = user!;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [presence, setPresence] = useState<{ online: boolean; lastSeenMs: number | null }>({
    online: false,
    lastSeenMs: null,
  });
  const [block, setBlock] = useState({ iBlocked: false, theyBlocked: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getUserProfile(otherUid);
      if (!cancelled) {
        setProfile(p);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [otherUid]);

  useEffect(() => {
    const u = subscribeUserPresence(otherUid, setPresence);
    return u;
  }, [otherUid]);

  useEffect(() => {
    const u = subscribeBlockRelation(currentUser.uid, otherUid, setBlock);
    return u;
  }, [currentUser.uid, otherUid]);

  async function toggleBlock() {
    if (busy) return;
    const action = block.iBlocked ? 'Unblock' : 'Block';
    const confirmTitle = `${action} ${profile?.displayName ?? 'this user'}?`;
    const confirmBody = block.iBlocked
      ? "They'll be able to message you again."
      : "They won't be able to send you messages. You can unblock them anytime.";

    Alert.alert(confirmTitle, confirmBody, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: block.iBlocked ? 'default' : 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            if (block.iBlocked) {
              await unblockUser(currentUser.uid, otherUid);
            } else {
              await blockUser(currentUser.uid, otherUid);
            }
          } catch (e: any) {
            Alert.alert('Could not update', e?.message ?? 'Try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Text style={styles.errorText}>This user no longer exists.</Text>
        <Pressable onPress={onBack} style={styles.backCta}>
          <Text style={styles.backCtaText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const presenceLabel = presence.online
    ? 'online'
    : formatLastSeen(presence.lastSeenMs) ?? 'offline';

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.heroBg} />

        <View style={styles.avatarWrap}>
          {profile.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>
                {(profile.displayName || profile.email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {presence.online && <View style={styles.onlineDot} />}
        </View>

        <Text style={styles.name}>{profile.displayName || 'VibeChat user'}</Text>
        <Text style={styles.presence}>{presenceLabel}</Text>

        {block.theyBlocked && (
          <View style={styles.warnRow}>
            <Text style={styles.warnText}>This user has blocked you.</Text>
          </View>
        )}

        <View style={styles.infoCard}>
          {profile.email ? (
            <Pressable
              onPress={() => Linking.openURL(`mailto:${profile.email}`)}
              style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.7 }]}>
              <Text style={styles.infoIcon}>✉️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {profile.email}
                </Text>
              </View>
            </Pressable>
          ) : null}
          {profile.phoneNumber ? (
            <>
              <View style={styles.sep} />
              <Pressable
                onPress={() => Linking.openURL(`tel:${profile.phoneNumber}`)}
                style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.7 }]}>
                <Text style={styles.infoIcon}>📱</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {profile.phoneNumber}
                  </Text>
                </View>
              </Pressable>
            </>
          ) : null}
        </View>

        <Pressable
          onPress={toggleBlock}
          disabled={busy}
          style={({ pressed }) => [
            styles.blockBtn,
            block.iBlocked ? styles.unblockBtn : styles.blockBtnDanger,
            pressed && { opacity: 0.85 },
            busy && { opacity: 0.6 },
          ]}>
          {busy ? (
            <ActivityIndicator color={block.iBlocked ? colors.primary : '#fff'} />
          ) : (
            <Text
              style={[
                styles.blockBtnText,
                block.iBlocked ? styles.unblockBtnText : styles.blockBtnTextDanger,
              ]}>
              {block.iBlocked ? 'Unblock user' : 'Block user'}
            </Text>
          )}
        </Pressable>

        <Text style={styles.blockHint}>
          {block.iBlocked
            ? "You won't see their messages or presence until you unblock."
            : 'Blocking hides their messages and stops them reaching you here.'}
        </Text>
      </ScrollView>
    </View>
  );
}

const AVATAR_SIZE = 120;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { color: colors.textMuted, marginBottom: spacing.lg },
  backCta: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.primary, borderRadius: radius.md },
  backCtaText: { color: colors.textOnPrimary, fontWeight: '700' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.headerDark,
    zIndex: 2,
  },
  back: { color: colors.headerText, fontSize: 28, width: 28, textAlign: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.headerText,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },

  body: { paddingBottom: spacing.xxl + spacing.lg, alignItems: 'center' },

  heroBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: colors.headerDark,
  },

  avatarWrap: { marginTop: 56, position: 'relative' },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: colors.bg,
  },
  avatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: colors.headerText, fontSize: 48, fontWeight: '800' },
  onlineDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.online,
    borderWidth: 3,
    borderColor: colors.bg,
  },

  name: {
    marginTop: spacing.md,
    fontSize: fontSize.xl + 2,
    fontWeight: '800',
    color: colors.text,
  },
  presence: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: fontSize.sm + 1,
  },

  warnRow: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.errorBg,
    borderRadius: radius.pill,
  },
  warnText: { color: colors.error, fontSize: fontSize.sm, fontWeight: '600' },

  infoCard: {
    width: '100%',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  infoIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  infoLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs + 1,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: { color: colors.text, fontSize: fontSize.md, marginTop: 2 },
  sep: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.xl + spacing.sm },

  blockBtn: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  blockBtnDanger: { backgroundColor: colors.error },
  blockBtnText: { fontWeight: '700', fontSize: fontSize.md + 1 },
  blockBtnTextDanger: { color: '#fff' },
  unblockBtn: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  unblockBtnText: { color: colors.primary },
  blockHint: {
    color: colors.textLight,
    fontSize: fontSize.xs + 1,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
});
