/**
 * New Message screen — matches the third mockup panel.
 *
 * Header: ← back + "New message" title, white surface.
 * Search row.
 * Two big action cards: "New group" and "New contact".
 * Section header "ON VIBECHAT · N CONTACTS" then matched users.
 * Section header "INVITE TO VIBECHAT" then non-VibeChat contacts with
 *   "Invite" pill button.
 * Footer hint: "Can't find someone? Tap Invite and we'll send them an
 *   SMS with a link to join."
 *
 * All the heavy lifting (contact permissions, matching via
 * findUsersForContacts, debounced Firestore search via searchVibeChatUsers,
 * manual email lookup via findUserByEmail, SMS invite linking) is the
 * same as the previous version. Only the chrome changed.
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
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuthContext } from '../contexts/AuthContext';
import {
  ensureOneToOneRoom,
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
  | {
      kind: 'action';
      key: string;
      icon: string;
      title: string;
      sub: string;
      onPress: () => void;
      busy?: boolean;
    }
  | { kind: 'section'; key: string; title: string }
  | { kind: 'match'; key: string; profile: UserProfile; sub: string; contactId?: string }
  | { kind: 'invite'; key: string; contact: DeviceContact }
  | { kind: 'tip'; key: string };

export function NewChatScreen({ onBack, onRoomReady, onCreateGroup }: Props) {
  const { user } = useAuthContext();
  const currentUser = user!;

  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [matches, setMatches] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [directResults, setDirectResults] = useState<UserProfile[]>([]);

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
      const allEmails = list.flatMap(c => c.emails);
      const allPhones = list.flatMap(c => c.phoneLast10s);
      const matchMap = await findUsersForContacts(allEmails, allPhones);
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

  // Re-run the contact permission + load flow on demand. If the user has
  // already denied access at the OS level, the second request will be
  // silently rejected and we kick them out to Settings so they can fix it
  // there.
  async function handleSync() {
    if (loading) return;
    if (permission === 'denied') {
      const granted = await requestContactsPermission();
      if (!granted) {
        Linking.openSettings().catch(() => {});
        return;
      }
    }
    await loadContacts();
  }

  // Debounced direct user search for queries.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setDirectResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const found = await searchVibeChatUsers(q, currentUser.uid);
        if (!cancelled) setDirectResults(found);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Search failed.');
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, currentUser.uid]);

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

    // Dedupe direct hits against contact matches.
    const shownUids = new Set<string>();
    for (const c of onAppContacts) {
      const p = profileFor(c);
      if (p) shownUids.add(p.uid);
    }
    const directOnly = directResults.filter(p => !shownUids.has(p.uid));

    const out: Row[] = [];

    // Action cards — only when not searching, to give the search results
    // the whole screen.
    if (!q) {
      out.push({
        kind: 'action',
        key: 'new-group',
        icon: '👥',
        title: 'New group',
        sub: 'Chat with multiple people',
        onPress: onCreateGroup,
      });
      // Sync — re-runs contact permission + load. Useful when the user
      // added new contacts on their device and wants the matches to
      // refresh, or when they previously denied permission and now want
      // to grant it.
      out.push({
        kind: 'action',
        key: 'sync-contacts',
        icon: '🔄',
        title: 'Sync contacts',
        sub:
          permission === 'denied'
            ? 'Grant access to find friends on VibeChat'
            : 'Refresh from your device address book',
        onPress: handleSync,
        busy: loading,
      });
    }

    const totalOnApp = onAppContacts.length + directOnly.length;
    if (totalOnApp > 0) {
      out.push({
        kind: 'section',
        key: 'sec-on',
        title: `On VibeChat · ${totalOnApp} ${totalOnApp === 1 ? 'contact' : 'contacts'}`,
      });
      for (const c of onAppContacts) {
        const p = profileFor(c)!;
        const sub = p.email || c.phones[0] || '';
        out.push({
          kind: 'match',
          key: `m-${c.id}-${p.uid}`,
          profile: p,
          sub,
          contactId: c.id,
        });
      }
      for (const p of directOnly) {
        out.push({
          kind: 'match',
          key: `d-${p.uid}`,
          profile: p,
          sub: p.email || p.phoneNumber || '',
        });
      }
    }

    if (offAppContacts.length) {
      out.push({ kind: 'section', key: 'sec-invite', title: 'Invite to VibeChat' });
      for (const c of offAppContacts) {
        out.push({ kind: 'invite', key: `i-${c.id}`, contact: c });
      }
    }

    if (!q && offAppContacts.length > 0) {
      out.push({ kind: 'tip', key: 'tip' });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, matches, query, directResults, loading, permission]);

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
    const url =
      Platform.OS === 'ios'
        ? `sms:${encodeURIComponent(phone)}&body=${encodeURIComponent(body)}`
        : `sms:${encodeURIComponent(phone)}?body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(err => setError(err?.message ?? 'Could not open Messages.'));
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New message</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, phone, or email"
          placeholderTextColor={colors.text3}
          autoCapitalize="none"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={6}>
            <Text style={styles.clearIcon}>✕</Text>
          </Pressable>
        ) : null}
      </View>

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
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.key}
          contentContainerStyle={{ paddingBottom: spacing.xxl + spacing.lg }}
          renderItem={({ item }) => {
            if (item.kind === 'action') {
              return (
                <Pressable
                  onPress={item.onPress}
                  disabled={item.busy}
                  style={({ pressed }) => [
                    styles.actionRow,
                    pressed && { backgroundColor: colors.surfaceMuted },
                  ]}>
                  <View style={styles.actionIconWrap}>
                    {item.busy ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={styles.actionIcon}>{item.icon}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionTitle}>{item.title}</Text>
                    <Text style={styles.actionSub}>{item.sub}</Text>
                  </View>
                  <Text style={styles.actionChevron}>›</Text>
                </Pressable>
              );
            }
            if (item.kind === 'section') {
              return (
                <Text style={styles.sectionTitle}>{item.title.toUpperCase()}</Text>
              );
            }
            if (item.kind === 'tip') {
              return (
                <Text style={styles.footerTip}>
                  Can't find someone? Tap{' '}
                  <Text style={styles.footerTipBold}>Invite</Text> and we'll send
                  them an SMS with a link to join.
                </Text>
              );
            }
            if (item.kind === 'match') {
              const { profile, sub, contactId } = item;
              const busy = opening === (contactId ?? profile.uid);
              const initial = (profile.displayName || profile.email || '?')
                .charAt(0)
                .toUpperCase();
              return (
                <Pressable
                  onPress={() => openChatWith(profile, contactId ?? profile.uid)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.contactRow,
                    pressed && { backgroundColor: colors.surfaceMuted },
                  ]}>
                  {profile.photoURL ? (
                    <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarText}>{initial}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {profile.displayName || profile.email}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {sub}
                    </Text>
                  </View>
                  {busy ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <View style={styles.chatIconWrap}>
                      <Text style={styles.chatIcon}>💬</Text>
                    </View>
                  )}
                </Pressable>
              );
            }
            // invite
            const c = item.contact;
            const canInvite = c.phones.length > 0;
            const initial = c.displayName.charAt(0).toUpperCase();
            return (
              <View style={styles.contactRow}>
                <View style={[styles.avatar, styles.avatarMuted]}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {c.displayName}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {c.phones[0] ?? c.emails[0] ?? ''}
                  </Text>
                </View>
                <Pressable
                  disabled={!canInvite}
                  onPress={() => inviteContact(c)}
                  style={({ pressed }) => [
                    styles.inviteBtn,
                    !canInvite && { opacity: 0.4 },
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Text style={styles.inviteBtnText}>Invite</Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            query ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No matches</Text>
                <Text style={styles.emptyBody}>
                  Try a different name, phone number, or email.
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  back: { color: colors.text, fontSize: 32, fontWeight: '300' },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg + 1,
    fontWeight: '700',
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
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

  // Big "New group" / "New contact" cards
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: { fontSize: 20 },
  actionTitle: { color: colors.text, fontSize: fontSize.md + 1, fontWeight: '700' },
  actionSub: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  actionChevron: { color: colors.text3, fontSize: 24, fontWeight: '300' },

  sectionTitle: {
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.7,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },

  contactRow: {
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
    backgroundColor: '#FB7185',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: fontSize.md + 1 },
  rowName: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowSub: { color: colors.textMuted, fontSize: fontSize.xs + 2, marginTop: 2 },

  // Small chat-bubble icon on the right of matched contacts
  chatIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatIcon: { fontSize: 16 },

  inviteBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.divider,
  },
  inviteBtnText: { color: colors.text, fontWeight: '700', fontSize: fontSize.sm + 1 },

  // Footer hint below invites
  footerTip: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    lineHeight: 19,
  },
  footerTipBold: { color: colors.text, fontWeight: '700' },

  permissionWrap: { padding: spacing.xl, alignItems: 'center' },
  permTitle: {
    fontSize: fontSize.md + 1,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
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
  permBtnText: { color: '#fff', fontWeight: '700' },

  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    textAlign: 'center',
  },

  center: { padding: spacing.xxl, alignItems: 'center' },
  emptyWrap: { padding: spacing.xxl, alignItems: 'center' },
  emptyTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: fontSize.md + 1,
    marginBottom: spacing.xs,
  },
  emptyBody: { color: colors.textMuted, fontSize: fontSize.sm + 1, textAlign: 'center' },
});
