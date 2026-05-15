/**
 * New Group creation screen.
 *
 * Candidate sourcing — we DO NOT dump the whole user directory. Members
 * come from places the user actually knows:
 *   1. Device contacts that are also on VibeChat (matched via email /
 *      phoneLast10).
 *   2. People the user has chatted with before (pulled from their rooms).
 *   3. Any name/phone/email the user types into the search box — falls back
 *      to a Firestore lookup so they can grab someone not in those lists.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuthContext } from '../contexts/AuthContext';
import {
  createGroupRoom,
  findUsersForContacts,
  getUserProfile,
  searchVibeChatUsers,
  subscribeUserRooms,
} from '../services/firestoreService';
import {
  getDeviceContacts,
  hasContactsPermission,
  requestContactsPermission,
} from '../services/contactsService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { ChatRoom, UserProfile } from '../types/models';

interface Props {
  onBack: () => void;
  onGroupReady: (roomId: string, title: string) => void;
}

export function CreateGroupScreen({ onBack, onGroupReady }: Props) {
  const { user } = useAuthContext();
  const currentUser = user!;

  // Candidate pool: union of contact matches + chat partners.
  const [candidates, setCandidates] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Direct Firestore search for users not in candidates.
  const [directHits, setDirectHits] = useState<UserProfile[]>([]);
  const [searchingDirect, setSearchingDirect] = useState(false);

  // ─── Load candidates: contacts + chat partners ──────────────────────
  const loadCandidates = useCallback(async () => {
    setLoading(true);
    const pool: Record<string, UserProfile> = {};
    try {
      // 1. Device contacts → VibeChat matches.
      let granted = await hasContactsPermission();
      if (!granted) granted = await requestContactsPermission();
      if (granted) {
        try {
          const contacts = await getDeviceContacts();
          const emails = contacts.flatMap(c => c.emails);
          const phones = contacts.flatMap(c => c.phoneLast10s);
          if (emails.length || phones.length) {
            const matchMap = await findUsersForContacts(emails, phones);
            for (const profile of matchMap.values()) {
              if (profile.uid !== currentUser.uid) pool[profile.uid] = profile;
            }
          }
        } catch (e) {
          console.warn('[CreateGroup] contacts load failed', e);
        }
      }
    } catch (e) {
      console.warn('[CreateGroup] permission flow failed', e);
    }

    setCandidates(prev => ({ ...prev, ...pool }));
    setLoading(false);
  }, [currentUser.uid]);

  // 2. Chat partners — subscribe to rooms once, fan-out fetch profiles
  //    for everyone the user has chatted with.
  useEffect(() => {
    const unsub = subscribeUserRooms(currentUser.uid, async (rooms: ChatRoom[]) => {
      const otherUids = new Set<string>();
      for (const r of rooms) {
        for (const p of r.participants) {
          if (p !== currentUser.uid) otherUids.add(p);
        }
      }
      // Fetch missing profiles.
      const missing = [...otherUids].filter(uid => !candidates[uid]);
      if (missing.length === 0) return;
      const fetched: Record<string, UserProfile> = {};
      await Promise.all(
        missing.map(async uid => {
          const p = await getUserProfile(uid);
          if (p) fetched[uid] = p;
        }),
      );
      if (Object.keys(fetched).length) {
        setCandidates(prev => ({ ...prev, ...fetched }));
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.uid]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  // 3. Direct Firestore search whenever the query changes (debounced).
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setDirectHits([]);
      return;
    }
    let cancelled = false;
    setSearchingDirect(true);
    const t = setTimeout(async () => {
      try {
        const found = await searchVibeChatUsers(q, currentUser.uid);
        if (!cancelled) setDirectHits(found);
      } catch (e: any) {
        if (!cancelled) console.warn('[CreateGroup] direct search failed', e);
      } finally {
        if (!cancelled) setSearchingDirect(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, currentUser.uid]);

  // ─── Filter / display logic ─────────────────────────────────────────
  const filteredCandidates = useMemo<UserProfile[]>(() => {
    const list = Object.values(candidates);
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    if (!q) {
      return list.sort((a, b) =>
        (a.displayName ?? a.email ?? '').localeCompare(b.displayName ?? b.email ?? ''),
      );
    }
    return list.filter(u => {
      if ((u.displayName ?? '').toLowerCase().includes(q)) return true;
      if ((u.email ?? '').toLowerCase().includes(q)) return true;
      if (qDigits) {
        const phoneDigits = (u.phoneNumber ?? '').replace(/\D/g, '');
        if (phoneDigits.includes(qDigits)) return true;
      }
      return false;
    });
  }, [candidates, search]);

  // Dedupe direct hits against the candidate filter.
  const directOnly = useMemo<UserProfile[]>(() => {
    const seen = new Set(filteredCandidates.map(u => u.uid));
    return directHits.filter(u => !seen.has(u.uid));
  }, [directHits, filteredCandidates]);

  const selectedUsers = useMemo<UserProfile[]>(() => {
    const all = { ...candidates };
    for (const u of directHits) all[u.uid] = u;
    return [...selected].map(uid => all[uid]).filter(Boolean);
  }, [candidates, directHits, selected]);

  function toggle(uid: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function handleCreate() {
    if (selected.size < 1) {
      setError('Add at least one member.');
      return;
    }
    const name = groupName.trim() || 'New group';
    setError('');
    setCreating(true);
    try {
      const roomId = await createGroupRoom(currentUser.uid, [...selected], name);
      onGroupReady(roomId, name);
    } catch (e: any) {
      setError(e?.message ?? 'Could not create group.');
    } finally {
      setCreating(false);
    }
  }

  const canCreate = selected.size > 0 && !creating;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New Group</Text>
        <Pressable
          onPress={handleCreate}
          disabled={!canCreate}
          hitSlop={10}
          style={({ pressed }) => [
            styles.headerAction,
            !canCreate && { opacity: 0.45 },
            pressed && { opacity: 0.6 },
          ]}>
          {creating ? (
            <ActivityIndicator color={colors.headerText} />
          ) : (
            <Text style={styles.headerActionText}>Create</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.topRow}>
        <View style={styles.groupAvatar}>
          <Text style={styles.groupAvatarIcon}>👥</Text>
        </View>
        <View style={{ flex: 1 }}>
          <TextInput
            style={styles.nameInput}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Group name"
            placeholderTextColor={colors.textLight}
            maxLength={50}
          />
          <Text style={styles.counter}>
            {selected.size} {selected.size === 1 ? 'member' : 'members'} selected
            {selected.size > 0 ? ` · ${selected.size + 1} total` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, phone, or email"
          placeholderTextColor={colors.textLight}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={6}>
            <Text style={styles.clearIcon}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* Selected chips */}
      {selectedUsers.length > 0 && (
        <View style={styles.chipsBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}>
            {selectedUsers.map(u => (
              <Pressable
                key={u.uid}
                onPress={() => toggle(u.uid)}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
                <View style={styles.chipAvatar}>
                  <Text style={styles.chipAvatarText}>
                    {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.chipText} numberOfLines={1}>
                  {(u.displayName || u.email || '').split(' ')[0]}
                </Text>
                <Text style={styles.chipX}>✕</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredCandidates}
          keyExtractor={u => u.uid}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: spacing.xxl + spacing.lg }}
          ListHeaderComponent={
            filteredCandidates.length > 0 ? (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {search ? 'From your contacts and chats' : 'Add members'}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={
            <View style={styles.center}>
              {search ? (
                searchingDirect ? (
                  <>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={[styles.emptyBody, { marginTop: spacing.sm }]}>
                      Searching VibeChat…
                    </Text>
                  </>
                ) : null
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Nobody to add yet</Text>
                  <Text style={styles.emptyBody}>
                    Once you have contacts on VibeChat or have chatted with someone,
                    they'll appear here.
                  </Text>
                </>
              )}
            </View>
          }
          ListFooterComponent={
            search && directOnly.length > 0 ? (
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Other VibeChat users</Text>
                </View>
                {directOnly.map(u => (
                  <View key={u.uid}>
                    {renderRow(u)}
                    <View style={styles.sep} />
                  </View>
                ))}
              </View>
            ) : null
          }
        />
      )}
    </KeyboardAvoidingView>
  );

  function renderRow(item: UserProfile) {
    const isSelected = selected.has(item.uid);
    return (
      <Pressable
        onPress={() => toggle(item.uid)}
        style={({ pressed }) => [
          styles.row,
          isSelected && styles.rowSelected,
          pressed && { opacity: 0.9 },
        ]}>
        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(item.displayName || item.email || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.displayName || item.email}
          </Text>
          {item.email ? (
            <Text style={styles.rowSub} numberOfLines={1}>
              {item.email}
            </Text>
          ) : null}
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
        </View>
      </Pressable>
    );
  }
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
  headerAction: { paddingHorizontal: spacing.md, minWidth: 60, alignItems: 'flex-end' },
  headerActionText: { color: colors.headerText, fontWeight: '700', fontSize: fontSize.md },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  groupAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarIcon: { fontSize: 26 },
  nameInput: {
    fontSize: fontSize.lg - 1,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.divider,
  },
  counter: {
    fontSize: fontSize.xs + 1,
    color: colors.textMuted,
    marginTop: 4,
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
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

  chipsBar: { height: 50, marginTop: spacing.md },
  chipsRow: {
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingLeft: 4,
    paddingRight: spacing.md,
    gap: 6,
  },
  chipAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipAvatarText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  chipText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: fontSize.sm + 1,
    maxWidth: 100,
  },
  chipX: { color: colors.primary, fontSize: 12, fontWeight: '700' },

  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    textAlign: 'center',
  },

  center: { padding: spacing.xxl, alignItems: 'center' },
  emptyTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: fontSize.md + 1,
    marginBottom: spacing.xs,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm + 1,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    gap: spacing.md,
  },
  rowSelected: { backgroundColor: colors.primarySoft },
  sep: { height: 1, backgroundColor: colors.divider, marginLeft: 76 },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarText: { color: colors.headerText, fontWeight: '700', fontSize: fontSize.md + 1 },
  rowTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowSub: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },

  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxTick: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
