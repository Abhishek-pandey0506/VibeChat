/**
 * "You're all set" — post-onboarding success screen. Shown once after the
 * user completes their profile for the first time. From here they can:
 *   • Sync contacts (we ask for the permission and prime the matcher).
 *   • Open Stay-notified prompt (request FCM permission).
 *   • Skip straight to chats.
 */

import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useAuthContext } from '../contexts/AuthContext';
import { requestContactsPermission } from '../services/contactsService';
import { requestNotificationPermission } from '../services/messagingService';
import { colors, fontSize, radius, spacing } from '../theme';
import { initialOf, pickAvatarColor } from '../utils/avatar';

interface Props {
  onGoToChats: () => void;
}

export function AllSetScreen({ onGoToChats }: Props) {
  const { user } = useAuthContext();
  const currentUser = user!;
  const firstName = (currentUser.displayName ?? '').split(' ')[0] || 'there';
  const initial = initialOf(currentUser.displayName ?? currentUser.email);
  const avatarColor = pickAvatarColor(currentUser.uid);

  const [contactsState, setContactsState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [pushState, setPushState] = useState<'idle' | 'busy' | 'done'>('idle');

  async function handleSyncContacts() {
    if (contactsState !== 'idle') return;
    setContactsState('busy');
    try {
      await requestContactsPermission();
      setContactsState('done');
    } catch {
      setContactsState('idle');
    }
  }

  async function handleEnablePush() {
    if (pushState !== 'idle') return;
    setPushState('busy');
    try {
      await requestNotificationPermission();
      setPushState('done');
    } catch {
      setPushState('idle');
    }
  }

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[colors.brandFrom, colors.brandMid, colors.brandTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}>
        <View style={styles.avatarWrap}>
          {currentUser.photoURL ? (
            <Image source={{ uri: currentUser.photoURL }} style={styles.avatarImg} />
          ) : (
            <View style={[styles.avatarImg, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <View style={styles.checkBadge}>
            <Text style={styles.checkBadgeIcon}>✓</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>
          You're all set,
        </Text>
        <Text style={styles.titlePurple}>
          {firstName} <Text style={styles.wave}>👋</Text>
        </Text>
        <Text style={styles.sub}>
          Your account is ready. Here's what you can do now.
        </Text>

        <ActionCard
          icon="👥"
          title="Find friends"
          body="See who you know on VibeChat."
          ctaLabel={
            contactsState === 'done'
              ? 'Synced'
              : contactsState === 'busy'
                ? 'Syncing…'
                : 'Sync contacts'
          }
          disabled={contactsState !== 'idle'}
          onPress={handleSyncContacts}
        />

        <ActionCard
          icon="💬"
          title="Start a chat"
          body="Message anyone in your contacts."
          ctaLabel="Open chats"
          onPress={onGoToChats}
        />

        <ActionCard
          icon="🔔"
          title="Stay notified"
          body="Turn on push so you don't miss messages."
          ctaLabel={
            pushState === 'done'
              ? 'Enabled'
              : pushState === 'busy'
                ? 'Enabling…'
                : 'Enable'
          }
          disabled={pushState !== 'idle'}
          onPress={handleEnablePush}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={onGoToChats}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}>
          <Text style={styles.ctaText}>Go to chats   ›</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ActionCard({
  icon,
  title,
  body,
  ctaLabel,
  disabled,
  onPress,
}: {
  icon: string;
  title: string;
  body: string;
  ctaLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.iconWrap}>
        <Text style={cardStyles.icon}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={cardStyles.title}>{title}</Text>
        <Text style={cardStyles.body}>{body}</Text>
      </View>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          cardStyles.cta,
          disabled && { opacity: 0.55 },
          pressed && { opacity: 0.85 },
        ]}>
        <Text style={cardStyles.ctaText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const HERO_HEIGHT = 320;
const AVATAR_SIZE = 130;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },

  hero: {
    height: HERO_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: { position: 'relative' },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 52, fontWeight: '800' },
  checkBadge: {
    position: 'absolute',
    right: -2,
    bottom: 4,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.online,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#3B0764',
  },
  checkBadgeIcon: { color: '#fff', fontSize: 18, fontWeight: '800' },

  body: {
    padding: spacing.xl,
    paddingBottom: 140,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.8,
  },
  titlePurple: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.8,
    marginTop: 2,
  },
  wave: { fontSize: 30 },
  sub: {
    color: colors.text2,
    fontSize: fontSize.md + 1,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xl,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 4,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: fontSize.lg - 1, letterSpacing: 0.2 },
});

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.divider,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  title: { color: colors.text, fontSize: fontSize.md + 1, fontWeight: '700' },
  body: { color: colors.text2, fontSize: fontSize.sm + 1, marginTop: 2 },
  cta: {
    backgroundColor: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm + 1 },
});
