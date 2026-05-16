import { Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { GradientHeader } from '../components/GradientHeader';
import { colors, fontSize, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

interface Section {
  n: string;
  title: string;
  body?: string;
  bullets?: { label: string; text: string }[];
}

const SECTIONS: Section[] = [
  {
    n: '01',
    title: 'What we collect',
    bullets: [
      { label: 'Account info', text: 'name, email, optional photo from Google.' },
      { label: 'Phone number', text: 'set once so contacts can find you.' },
      { label: 'Messages', text: 'text, photos, video stored so recipients can receive them.' },
      { label: 'Device info', text: 'push token, app version, basic diagnostic logs.' },
      { label: 'Presence', text: 'online status and last-seen so chats feel live.' },
    ],
  },
  {
    n: '02',
    title: 'How we use it',
    body:
      "To deliver messages, keep your account secure, and send push notifications. We don't sell your data, and we never use message content to train AI.",
  },
  {
    n: '03',
    title: 'Storage & security',
    body:
      'Stored in Google Firebase with industry-standard encryption in transit and at rest. Strict security rules ensure only you and your chat participants can read your data.',
  },
  {
    n: '04',
    title: 'Sharing',
    body:
      'Messages are shared with the chat participants you pick. We use service providers (push notifications, analytics) bound by data-protection agreements. Nothing else.',
  },
  {
    n: '05',
    title: 'Your choices',
    body:
      "Edit your profile anytime, sign out from any device, or delete your account from Profile → Danger zone. Deleting removes your profile + photos. Your messages stay in other people's chats.",
  },
];

export function PrivacyScreen({ onBack }: Props) {
  return (
    <View style={styles.flex}>
      {/* Match the gradient's dark indigo start so the system status bar
          blends seamlessly with the header instead of leaving a white strip
          with hard-to-read icons (the time/battery were near-invisible
          against the previous light background). */}
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.brandFrom}
        translucent={false}
      />
      <GradientHeader style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Privacy policy</Text>
        <View style={{ width: 28 }} />
      </GradientHeader>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Last updated</Text>
          <View style={styles.metaDot} />
          <Text style={styles.metaValue}>May 2026</Text>
        </View>

        <Text style={styles.hero}>
          Your data,{'\n'}
          <Text style={styles.heroAccent}>your control.</Text>
        </Text>
        <Text style={styles.heroSub}>
          We collect as little as possible — only what's needed to deliver chat.
        </Text>

        {SECTIONS.map(s => (
          <View key={s.n} style={styles.section}>
            <View style={styles.numChip}>
              <Text style={styles.numChipText}>{s.n}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              {s.body ? <Text style={styles.sectionBody}>{s.body}</Text> : null}
              {s.bullets
                ? s.bullets.map((b, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>
                        <Text style={styles.bulletLabel}>{b.label}</Text> — {b.text}
                      </Text>
                    </View>
                  ))
                : null}
            </View>
          </View>
        ))}

        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Questions?</Text>
          <Text style={styles.contactBody}>
            Reach our team at{' '}
            <Text
              style={styles.contactLink}
              onPress={() => Linking.openURL('mailto:amalstack06@gmail.com')}>
              amalstack06@gmail.com
            </Text>{' '}
            — we usually reply within a day.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  back: { color: colors.headerText, fontSize: 28, width: 28, textAlign: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.headerText,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },

  body: { padding: spacing.xl, paddingBottom: spacing.xxl },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metaLabel: {
    color: colors.text3,
    fontSize: fontSize.xs + 1,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.text3 },
  metaValue: { color: colors.text, fontSize: fontSize.sm + 1, fontWeight: '600' },

  hero: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1.2,
    lineHeight: 44,
    marginBottom: spacing.sm,
  },
  heroAccent: { color: colors.primary },
  heroSub: {
    color: colors.text2,
    fontSize: fontSize.md + 1,
    marginBottom: spacing.xl + 4,
    lineHeight: 22,
  },

  section: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  numChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numChipText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: fontSize.md,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionBody: { color: colors.text2, fontSize: fontSize.md - 1, lineHeight: 21 },

  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: 6,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    color: colors.text2,
    fontSize: fontSize.md - 1,
    lineHeight: 21,
  },
  bulletLabel: { color: colors.text, fontWeight: '700' },

  contactCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  contactTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  contactBody: { color: colors.text2, fontSize: fontSize.md - 1, lineHeight: 21 },
  contactLink: {
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
