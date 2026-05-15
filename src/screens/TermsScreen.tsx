import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

export function TermsScreen({ onBack }: Props) {
  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.updated}>Last updated: May 2026</Text>

        <Section title="1. Acceptance of Terms">
          By creating an account or using VibeChat ("Service"), you agree to these
          Terms of Service. If you don't agree, please don't use the Service.
        </Section>

        <Section title="2. Your Account">
          You sign in with a Google account. You're responsible for keeping that
          Google account secure. You must be at least 13 years old (16 in some
          jurisdictions) to use VibeChat.
        </Section>

        <Section title="3. Acceptable Use">
          You agree not to use VibeChat to send unlawful, harmful, harassing,
          defamatory, or infringing content. You won't attempt to access other
          users' accounts, interfere with the Service, or use it to send bulk
          unsolicited messages.
        </Section>

        <Section title="4. Your Content">
          You retain ownership of the messages, photos, and videos you send. By
          sending them you grant VibeChat a limited license to store and
          transmit that content to the recipients you choose, solely to operate
          the Service.
        </Section>

        <Section title="5. Privacy">
          Our handling of your data is described in our Privacy Policy. Please
          read it carefully before using the Service.
        </Section>

        <Section title="6. Service Availability">
          We do our best to keep VibeChat running, but the Service is provided
          "as is" without warranties. We may add, change, or remove features at
          any time.
        </Section>

        <Section title="7. Termination">
          You can sign out and stop using VibeChat at any time. We may suspend
          or terminate accounts that violate these Terms or applicable law.
        </Section>

        <Section title="8. Limitation of Liability">
          To the maximum extent permitted by law, VibeChat is not liable for
          indirect, incidental, or consequential damages arising from your use
          of the Service.
        </Section>

        <Section title="9. Changes to These Terms">
          We may update these Terms. If the changes are material we'll let you
          know inside the app. Continued use after the change means you accept
          the updated Terms.
        </Section>

        <Section title="10. Contact">
          Questions? Reach us at amalstack06@gmail.com.
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
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
    backgroundColor: colors.headerDark,
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
  updated: {
    color: colors.textLight,
    fontSize: fontSize.sm,
    marginBottom: spacing.lg,
    fontStyle: 'italic',
  },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md + 1,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  sectionBody: {
    color: colors.textMuted,
    fontSize: fontSize.md - 1,
    lineHeight: 22,
  },
});
