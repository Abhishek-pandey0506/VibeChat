import { Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { GradientHeader } from '../components/GradientHeader';
import { colors, fontSize, radius, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

const SECTIONS = [
  {
    n: '01',
    title: 'Acceptance',
    body:
      "By creating an account or using VibeChat, you agree to these Terms. If you don't agree, please don't use the Service.",
  },
  {
    n: '02',
    title: 'Your account',
    body:
      'You sign in with Google and are responsible for keeping it secure. You must be at least 13 (16 in some regions).',
  },
  {
    n: '03',
    title: 'Acceptable use',
    body:
      "No unlawful, harassing, defamatory or infringing content. Don't try to access other accounts, interfere with the Service, or send bulk unsolicited messages.",
  },
  {
    n: '04',
    title: 'Your content',
    body:
      'You own your messages, photos and videos. By sending them you grant us a limited license to store and transmit them to the recipients you choose — solely to run the Service.',
  },
  {
    n: '05',
    title: 'Service availability',
    body:
      'We do our best to keep VibeChat running, but it\'s provided "as is." Features may be added, changed, or removed.',
  },
  {
    n: '06',
    title: 'Termination',
    body:
      'You can sign out anytime. We may suspend accounts that violate these Terms or applicable law.',
  },
];

export function TermsScreen({ onBack }: Props) {
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
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Terms of service</Text>
        <View style={{ width: 28 }} />
      </GradientHeader>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Last updated</Text>
          <View style={styles.metaDot} />
          <Text style={styles.metaValue}>May 2026</Text>
        </View>

        <Text style={styles.hero}>
          The rules,{'\n'}
          <Text style={styles.heroAccent}>simply.</Text>
        </Text>
        <Text style={styles.heroSub}>
          Plain-language terms. No legalese theatre.
        </Text>

        {SECTIONS.map(s => (
          <View key={s.n} style={styles.section}>
            <View style={styles.numChip}>
              <Text style={styles.numChipText}>{s.n}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              <Text style={styles.sectionBody}>{s.body}</Text>
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

  body: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },

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
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.text3,
  },
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

  section: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
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
  sectionBody: {
    color: colors.text2,
    fontSize: fontSize.md - 1,
    lineHeight: 21,
  },

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
  contactBody: {
    color: colors.text2,
    fontSize: fontSize.md - 1,
    lineHeight: 21,
  },
  contactLink: {
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
