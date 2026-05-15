import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../theme';

interface Props {
  onBack: () => void;
}

export function PrivacyScreen({ onBack }: Props) {
  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.updated}>Last updated: May 2026</Text>

        <Section title="Overview">
          This Privacy Policy explains what information VibeChat collects, how
          we use it, and the choices you have. We try to collect as little as
          possible and only what's needed to deliver chat.
        </Section>

        <Section title="Information We Collect">
          {`• Account info — name, email, and (optional) profile photo from your Google account.\n• Phone number — provided once during onboarding, used so contacts can find you.\n• Messages — text, photos, and videos you send, stored so recipients can receive them.\n• Device info — FCM push token, app version, and basic diagnostic logs.\n• Presence — online status and "last seen" timestamps so chats feel live.`}
        </Section>

        <Section title="How We Use It">
          We use this information to deliver messages, keep your account
          secure, send push notifications for new chats, and operate the
          Service. We don't sell your personal information, and we don't use
          your message content to train AI models.
        </Section>

        <Section title="Storage and Security">
          Data is stored in Google Firebase (Firestore, Storage, Authentication)
          with industry-standard encryption in transit and at rest. Access is
          governed by Firestore and Storage security rules — we only let you
          read and write data that belongs to you or the chat rooms you're in.
        </Section>

        <Section title="Sharing">
          Messages are shared with the participants of the chats you choose.
          We may share data with service providers (e.g. Google Cloud) strictly
          to run the Service. We comply with lawful government requests but
          push back against overbroad ones.
        </Section>

        <Section title="Your Choices">
          {`• Edit profile — update your name and photo anytime in Profile.\n• Sign out — clears your session on this device.\n• Delete account — contact support and we'll remove your account and message history.`}
        </Section>

        <Section title="Children">
          VibeChat is not for users under 13 (or under 16 in some jurisdictions).
          If we learn we've collected data from a child below that age we'll
          delete it.
        </Section>

        <Section title="Changes">
          If we materially change this policy we'll notify you in the app and
          update the date above. Continued use after the change means you
          accept it.
        </Section>

        <Section title="Contact">
          Questions, requests, or complaints: amalstack06@gmail.com.
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
