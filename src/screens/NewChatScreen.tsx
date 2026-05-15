/**
 * New Chat screen.
 *
 * Behaviour:
 *   1. Reads the device address book (asks for permission first).
 *   2. Cross-references contact phones/emails with Firestore users.
 *   3. Renders two sections:
 *      • "On VibeChat" — tap to start a 1:1 chat instantly.
 *      • "Invite to VibeChat" — tap to fire an SMS with the install link.
 *   4. Single search bar filters both sections by name, phone digits, or
 *      email substring (case-insensitive).
 *   5. "New Group" entry at the top stays.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuthContext } from '../contexts/AuthContext';
import {
  ensureOneToOneRoom,
  findUserByEmail,
  findUsersForContacts,
  searchVibeChatUsers,
} from '../services/firestoreService';
import {
  getDeviceContacts,
  hasContactsPermission,
  requestContactsPermission,
  type DeviceContact,
} from '../services/contactsService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { UserProfile } from '../types/models';

/** Replace with your real install URL once you have one (App Store/Play). */
const INVITE_URL = 'https://app.link.com/vibechat';

interface Props {
  onBack: () => void;
  onRoomReady: (roomId: string, title: string, otherUid: string) => void;
  onCreateGroup: () => void;
}

type Row =
  | { kind: 'section'; key: string; title: string; sub?: string }
  | { kind: 'match'; key: string; contact: DeviceContact; profile: UserProfile }
  | { kind: 'invite'; key: string; contact: DeviceContact }
  | { kind: 'divider'; key: string; label: string }
  | { kind: 'manual'; key: string }
  | { kind: 'tip'; key: string };

export function NewChatScreen({ onBack, onRoomReady, onCreateGroup }: Props) {
  const { user } = useAuthContext();
  const currentUser = user!;

  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [matches, setMatches] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState<string | null>(null); // contact.id of row being opened
  const [error, setError] = useState('');

  // Direct Firestore search — runs when the user types something so we can
  // find VibeChat users who aren't in the local address book.
  const [directResults, setDirectResults] = useState<UserProfile[]>([]);
  const [searchingDirect, setSearchingDirect] = useState(false);
  const [searchedSelf, setSearchedSelf] = useState(false);

  const loadContacts = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      let granted = await hasContactsPermission();
      if (!granted) granted = await requestContactsPermission();
      if (!granted) {
        setPermission('denied');
        setLoading(false);
        return;
      }
      setPermission('granted');

      const list = await getDeviceContacts();
      // Aggregate every email + last-10 phone slug for matching.
      const allEmails = list.flatMap(c => c.emails);
      const allPhones = list.flatMap(c => c.phoneLast10s);
      const matchMap = await findUsersForContacts(allEmails, allPhones);

      // Drop the current user from the matches (so we don't show "yourself").
      for (const [k, p] of [...matchMap]) {
        if (p.uid === currentUser.uid) matchMap.delete(k);
      }

      setContacts(list);
      setMatches(matchMap);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load contacts.');
    } finally {
      setLoading(false);
    }
  }, [currentUser.uid]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Debounced direct user search whenever the query changes.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setDirectResults([]);
      setSearchedSelf(false);
      return;
    }
    // Quick self-check so we can hint the user instead of just "no matches".
    const myEmail = (currentUser.email ?? '').toLowerCase();
    const myPhone = (currentUser.phoneNumber ?? '').replace(/\D/g, '');
    const qDigits = q.replace(/\D/g, '');
    const isSelf =
      (q.includes('@') && q.toLowerCase() === myEmail) ||
      (qDigits.length >= 10 && myPhone.endsWith(qDigits.slice(-10)));
    setSearchedSelf(isSelf);

    let cancelled = false;
    setSearchingDirect(true);
    const t = setTimeout(async () => {
      try {
        const found = await searchVibeChatUsers(q, currentUser.uid);
        if (!cancelled) setDirectResults(found);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Search failed.');
      } finally {
        if (!cancelled) setSearchingDirect(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, currentUser.uid, currentUser.email, currentUser.phoneNumber]);

  /** Resolve a profile for a contact, if any of its emails/phones match. */
  function profileFor(c: DeviceContact): UserProfile | null {
    for (const e of c.emails) {
      const hit = matches.get(e.toLowerCase());
      if (hit) return hit;
    }
    for (const p of c.phoneLast10s) {
      const hit = matches.get(p);
      if (hit) return hit;
    }
    return null;
  }

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    const filteredContacts = contacts.filter(c => {
      if (!q) return true;
      if (c.displayName.toLowerCase().includes(q)) return true;
      if (c.emails.some(e => e.toLowerCase().includes(q))) return true;
      if (qDigits && c.phones.some(p => p.replace(/\D/g, '').includes(qDigits))) return true;
      return false;
    });

    const onAppContacts: DeviceContact[] = [];
    const offAppContacts: DeviceContact[] = [];
    for (const c of filteredContacts) {
      (profileFor(c) ? onAppContacts : offAppContacts).push(c);
    }

    // Collect the uids we've already shown via contacts so we don't list
    // the same user twice when the direct search returns them too.
    const shownUids = new Set<string>();
    for (const c of onAppContacts) {
      const p = profileFor(c);
      if (p) shownUids.add(p.uid);
    }
    const directOnly = directResults.filter(p => !shownUids.has(p.uid));

    const out: Row[] = [];
    const totalOnApp = onAppContacts.length + directOnly.length;
    if (totalOnApp > 0) {
      out.push({
        kind: 'section',
        key: 'sec-on',
        title: 'On VibeChat',
        sub: `${totalOnApp}`,
      });
      for (const c of onAppContacts) {
        const p = profileFor(c)!;
        out.push({ kind: 'match', key: `m-${c.id}-${p.uid}`, contact: c, profile: p });
      }
      // Direct-search hits without a matching device contact — synthesise a
      // minimal DeviceContact wrapper so the render path is the same.
      for (const p of directOnly) {
        const fakeContact: DeviceContact = {
          id: `direct-${p.uid}`,
          displayName: p.displayName || p.email || 'VibeChat user',
          phones: p.phoneNumber ? [p.phoneNumber] : [],
          phoneLast10s: p.phoneLast10 ? [p.phoneLast10] : [],
          emails: p.email ? [p.email] : [],
        };
        out.push({
          kind: 'match',
          key: `d-${p.uid}`,
          contact: fakeContact,
          profile: p,
        });
      }
    }
    if (offAppContacts.length) {
      out.push({
        kind: 'section',
        key: 'sec-invite',
        title: 'Invite to VibeChat',
        sub: `${offAppContacts.length}`,
      });
      for (const c of offAppContacts) {
        out.push({ kind: 'invite', key: `i-${c.id}`, contact: c });
      }
    }
    if (!q) {
      // Manual email fallback at the bottom when not searching, with a
      // proper divider rule so it visually separates from the lists above.
      out.push({ kind: 'divider', key: 'div-or', label: 'Or invite by email' });
      out.push({ kind: 'manual', key: 'manual' });
      out.push({ kind: 'tip', key: 'tip' });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, matches, query, directResults]);

  async function openChatWith(profile: UserProfile, contactId: string) {
    if (opening) return;
    setOpening(contactId);
    try {
      const roomId = await ensureOneToOneRoom(currentUser.uid, profile.uid);
      onRoomReady(roomId, profile.displayName || profile.email, profile.uid);
    } catch (e: any) {
      setError(e?.message ?? 'Could not open chat.');
    } finally {
      setOpening(null);
    }
  }

  function inviteContact(c: DeviceContact) {
    const phone = c.phones[0];
    if (!phone) return;
    const body = `Hey! Join me on VibeChat — chat, photos, and videos in one app. Download: ${INVITE_URL}`;
    // iOS uses "sms:NUMBER&body=" (with &), Android uses "sms:NUMBER?body=".
    const url =
      Platform.OS === 'ios'
        ? `sms:${encodeURIComponent(phone)}&body=${encodeURIComponent(body)}`
        : `sms:${encodeURIComponent(phone)}?body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(err => setError(err?.message ?? 'Could not open Messages.'));
  }

  // Manual email lookup (kept from the previous flow as a fallback).
  const [manualEmail, setManualEmail] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  async function startManualByEmail() {
    const target = manualEmail.trim().toLowerCase();
    if (!target) return;
    if (target === (currentUser.email ?? '').toLowerCase()) {
      setError("You can't message yourself.");
      return;
    }
    setError('');
    setManualBusy(true);
    try {
      const other = await findUserByEmail(target);
      if (!other) {
        setError('No VibeChat account uses that email.');
        return;
      }
      const roomId = await ensureOneToOneRoom(currentUser.uid, other.uid);
      onRoomReady(roomId, other.displayName || other.email, other.uid);
    } catch (e: any) {
      setError(e?.message ?? 'Could not open chat.');
    } finally {
      setManualBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New Chat</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name, phone, or email"
          placeholderTextColor={colors.textLight}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={6}>
            <Text style={styles.clearIcon}>✕</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        onPress={onCreateGroup}
        style={({ pressed }) => [styles.groupCard, pressed && { opacity: 0.85 }]}>
        <View style={styles.groupIcon}>
          <Text style={styles.groupIconText}>👥</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.groupTitle}>New Group</Text>
          <Text style={styles.groupSub}>Start a group chat with multiple people</Text>
        </View>
        <Text style={styles.groupChevron}>›</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {permission === 'denied' ? (
        <View style={styles.permissionWrap}>
          <Text style={styles.permTitle}>Contacts permission needed</Text>
          <Text style={styles.permBody}>
            VibeChat needs access to your contacts to find friends. We never share
            your contact list — matching happens privately against the email and
            phone you signed up with.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.permBtn, pressed && { opacity: 0.85 }]}
            onPress={() => Linking.openSettings()}>
            <Text style={styles.permBtnText}>Open settings</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.key}
          contentContainerStyle={{ paddingBottom: spacing.xxl + spacing.lg }}
          renderItem={({ item }) => {
            if (item.kind === 'section') {
              return (
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>{item.title}</Text>
                  {item.sub ? (
                    <View style={styles.sectionBadge}>
                      <Text style={styles.sectionBadgeText}>{item.sub}</Text>
                    </View>
                  ) : null}
                </View>
              );
            }
            if (item.kind === 'divider') {
              return (
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerLabel}>{item.label}</Text>
                  <View style={styles.dividerLine} />
                </View>
              );
            }
            if (item.kind === 'tip') {
              return (
                <View style={styles.tipCard}>
                  <Text style={styles.tipIcon}>💡</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tipTitle}>Can't find someone?</Text>
                    <Text style={styles.tipBody}>
                      Friends without VibeChat can still get an invite via SMS — tap
                      Invite next to their name above.
                    </Text>
                  </View>
                </View>
              );
            }
            if (item.kind === 'match') {
              const { contact, profile } = item;
              const busy = opening === contact.id;
              return (
                <Pressable
                  onPress={() => openChatWith(profile, contact.id)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: colors.surfaceMuted },
                  ]}>
                  {profile.photoURL ? (
                    <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarFallbackText}>
                        {(profile.displayName || contact.displayName || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {profile.displayName || contact.displayName}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {profile.email || contact.phones[0] || ''}
                    </Text>
                  </View>
                  {busy ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <View style={styles.badgeOn}>
                      <Text style={styles.badgeOnText}>Chat</Text>
                    </View>
                  )}
                </Pressable>
              );
            }
            if (item.kind === 'invite') {
              const { contact } = item;
              const canInvite = contact.phones.length > 0;
              return (
                <View style={styles.row}>
                  <View style={[styles.avatar, styles.avatarMuted]}>
                    <Text style={styles.avatarFallbackText}>
                      {contact.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {contact.displayName}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {contact.phones[0] ?? contact.emails[0] ?? ''}
                    </Text>
                  </View>
                  <Pressable
                    disabled={!canInvite}
                    onPress={() => inviteContact(contact)}
                    style={({ pressed }) => [
                      styles.inviteBtn,
                      !canInvite && { opacity: 0.4 },
                      pressed && { opacity: 0.85 },
                    ]}>
                    <Text style={styles.inviteBtnText}>Invite</Text>
                  </Pressable>
                </View>
              );
            }
            // Manual email entry — styled as a card.
            return (
              <View style={styles.manualCard}>
                <Text style={styles.manualLabel}>Invite by email address</Text>
                <Text style={styles.manualHint}>
                  Already on VibeChat but not in your contacts? Look them up directly.
                </Text>
                <View style={styles.manualRow}>
                  <View style={styles.manualInputWrap}>
                    <Text style={styles.manualInputIcon}>✉️</Text>
                    <TextInput
                      style={styles.manualInput}
                      value={manualEmail}
                      onChangeText={setManualEmail}
                      placeholder="friend@example.com"
                      placeholderTextColor={colors.textLight}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      onSubmitEditing={startManualByEmail}
                      returnKeyType="go"
                    />
                  </View>
                  <Pressable
                    onPress={startManualByEmail}
                    disabled={manualBusy || !manualEmail.trim()}
                    style={({ pressed }) => [
                      styles.manualBtn,
                      (manualBusy || !manualEmail.trim()) && { opacity: 0.55 },
                      pressed && { opacity: 0.85 },
                    ]}>
                    {manualBusy ? (
                      <ActivityIndicator color={colors.textOnPrimary} />
                    ) : (
                      <Text style={styles.manualBtnText}>Go</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              {searchingDirect ? (
                <>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.emptyBody, { marginTop: spacing.sm }]}>
                    Searching VibeChat…
                  </Text>
                </>
              ) : searchedSelf ? (
                <>
                  <Text style={styles.emptyTitle}>That's you 🙂</Text>
                  <Text style={styles.emptyBody}>
                    You can't start a chat with yourself.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>No matches</Text>
                  <Text style={styles.emptyBody}>
                    Try a different name, phone number, or email.
                  </Text>
                </>
              )}
            </View>
          }
        />
      )}
    </KeyboardAvoidingView>
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

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    gap: spacing.sm,
  },
  searchIcon: { fontSize: 14, opacity: 0.6 },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    fontSize: fontSize.md,
    color: colors.text,
  },
  clearIcon: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 4 },

  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupIconText: { fontSize: 20 },
  groupTitle: { color: colors.primary, fontWeight: '700', fontSize: fontSize.md },
  groupSub: { color: colors.textMuted, fontSize: fontSize.xs + 1, marginTop: 2 },
  groupChevron: { color: colors.primary, fontSize: 22, fontWeight: '300', paddingRight: 4 },

  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    textAlign: 'center',
  },

  permissionWrap: { padding: spacing.xl, alignItems: 'center' },
  permTitle: { fontSize: fontSize.md + 1, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  permBody: {
    fontSize: fontSize.sm + 1,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  permBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  permBtnText: { color: colors.textOnPrimary, fontWeight: '700' },

  loadingWrap: { padding: spacing.xxl, alignItems: 'center' },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionBadge: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },

  // "Or invite by email" rule
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.sm + 2,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs + 1,
    fontWeight: '600',
  },

  // Tip helper card
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  tipIcon: { fontSize: 18, marginTop: 1 },
  tipTitle: {
    color: '#92400E',
    fontWeight: '700',
    fontSize: fontSize.sm + 1,
    marginBottom: 2,
  },
  tipBody: {
    color: '#A16207',
    fontSize: fontSize.xs + 1,
    lineHeight: 17,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    gap: spacing.md,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMuted: {
    backgroundColor: '#C4B5FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: { color: colors.headerText, fontWeight: '700', fontSize: fontSize.md + 1 },
  rowName: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowSub: { color: colors.textMuted, fontSize: fontSize.xs + 2, marginTop: 2 },

  badgeOn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  badgeOnText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.xs + 1 },

  inviteBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  inviteBtnText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.xs + 1 },

  manualCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  manualLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: 4,
  },
  manualHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs + 1,
    marginBottom: spacing.md,
    lineHeight: 17,
  },
  manualRow: { flexDirection: 'row', gap: spacing.sm },
  manualInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  manualInputIcon: { fontSize: 14, marginRight: spacing.sm, opacity: 0.7 },
  manualInput: {
    flex: 1,
    paddingVertical: spacing.md - 2,
    fontSize: fontSize.md,
    color: colors.text,
  },
  manualBtn: {
    minWidth: 64,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualBtnText: { color: colors.textOnPrimary, fontWeight: '700' },

  emptyWrap: { padding: spacing.xxl, alignItems: 'center' },
  emptyTitle: { color: colors.text, fontWeight: '700', fontSize: fontSize.md + 1, marginBottom: spacing.xs },
  emptyBody: { color: colors.textMuted, fontSize: fontSize.sm + 1, textAlign: 'center' },
});
