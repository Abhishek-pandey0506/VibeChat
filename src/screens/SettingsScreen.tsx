import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useAuthContext } from '../contexts/AuthContext';
import { getUserProfile } from '../services/firestoreService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { UserProfile } from '../types/models';

interface Props {
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
}

interface SettingsRowProps {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  rightSlot?: React.ReactNode;
  destructive?: boolean;
}

function SettingsRow({ icon, label, value, onPress, rightSlot, destructive }: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress && !rightSlot}
      style={({ pressed }) => [styles.row, pressed && onPress && { opacity: 0.7 }]}>
      <View style={styles.rowIconWrap}>
        <Text style={styles.rowIcon}>{icon}</Text>
      </View>
      <Text style={[styles.rowLabel, destructive && { color: colors.error }]}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {rightSlot}
        {onPress && !rightSlot ? <Text style={styles.rowChevron}>›</Text> : null}
      </View>
    </Pressable>
  );
}

export function SettingsScreen({ onBack, onOpenProfile, onOpenTerms, onOpenPrivacy }: Props) {
  const { user } = useAuthContext();
  const currentUser = user!;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getUserProfile(currentUser.uid);
      if (!cancelled) setProfile(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser.uid]);

  const initials = (profile?.displayName || currentUser.displayName || currentUser.email || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s.charAt(0).toUpperCase())
    .join('') || '?';
  const photoURL = profile?.photoURL ?? currentUser.photoURL;
  const name = profile?.displayName ?? currentUser.displayName ?? 'VibeChat user';

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.headerBtn}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Pressable
          onPress={onOpenProfile}
          style={({ pressed }) => [styles.userRow, pressed && { opacity: 0.85 }]}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.userAvatar} />
          ) : (
            <View style={[styles.userAvatar, styles.userAvatarFallback]}>
              <Text style={styles.userAvatarText}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.userName} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.userHint}>tap to edit profile</Text>
          </View>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <SettingsRow icon="👤" label="Privacy" value="Everyone" onPress={() => {}} />
          <View style={styles.sep} />
          <SettingsRow icon="🛡️" label="Security" value="2FA on" onPress={() => {}} />
          <View style={styles.sep} />
          <SettingsRow
            icon="🔔"
            label="Notifications"
            rightSlot={
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ true: colors.primary, false: colors.divider }}
                thumbColor="#fff"
              />
            }
          />
        </View>

        <Text style={styles.sectionLabel}>CHATS</Text>
        <View style={styles.card}>
          <SettingsRow icon="🎨" label="Theme" value="Light" onPress={() => {}} />
          <View style={styles.sep} />
          <SettingsRow icon="☁️" label="Chat backup" value="Today" onPress={() => {}} />
          <View style={styles.sep} />
          <SettingsRow icon="⭐" label="Starred messages" onPress={() => {}} />
        </View>

        <Text style={styles.sectionLabel}>SUPPORT</Text>
        <View style={styles.card}>
          <SettingsRow icon="❓" label="Help center" onPress={() => {}} />
          <View style={styles.sep} />
          <SettingsRow icon="🌐" label="Language" value="English" onPress={() => {}} />
          <View style={styles.sep} />
          <SettingsRow icon="📄" label="Privacy policy" onPress={onOpenPrivacy} />
          <View style={styles.sep} />
          <SettingsRow icon="📜" label="Terms of service" onPress={onOpenTerms} />
        </View>

        <Text style={styles.versionText}>VibeChat · v0.0.1</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bgSoft },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerBtn: { width: 36, alignItems: 'center' },
  back: { color: colors.text, fontSize: 32, lineHeight: 32, fontWeight: '500' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },

  body: { padding: spacing.lg, paddingBottom: spacing.xxl + spacing.lg },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
  },
  userAvatar: { width: 48, height: 48, borderRadius: 24 },
  userAvatarFallback: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { color: colors.primary, fontWeight: '800', fontSize: 18 },
  userName: { color: colors.text, fontSize: fontSize.md + 1, fontWeight: '700' },
  userHint: { color: colors.textMuted, fontSize: fontSize.xs + 1, marginTop: 2 },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 4,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2,
    gap: spacing.md,
  },
  rowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIcon: { fontSize: 15 },
  rowLabel: { flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowValue: { color: colors.textMuted, fontSize: fontSize.sm + 1 },
  rowChevron: { color: colors.textLight, fontSize: 22, lineHeight: 22 },
  sep: { height: 1, backgroundColor: colors.divider, marginLeft: 32 + spacing.md + spacing.md },

  versionText: {
    color: colors.textLight,
    fontSize: fontSize.xs + 1,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
