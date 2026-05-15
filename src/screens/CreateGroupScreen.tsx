/**
 * New Group creation screen — matches the fourth mockup panel.
 *
 * Header: ✕ close, "New group" title, purple "Create" button on the right.
 * Top: camera-placeholder square, "GROUP NAME" label + text input.
 * "N selected · M total" counter.
 * Horizontally scrolling chips of selected users (× to deselect).
 * Search bar.
 * "ADD MEMBERS" section.
 * Member rows with avatar + name + sub + circular checkbox (purple when
 *   selected with a tick, hollow when not).
 *
 * Logic preserved verbatim: candidate sourcing from contacts + chats,
 * debounced direct search, multi-select set, createGroupRoom call.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
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

  const [candidates, setCandidates] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  // Base64 data URL for the group photo. We use the same in-Firestore
  // workaround as profile photos so we don't depend on Firebase Storage
  // (which requires the Blaze plan since Oct 2024).
  const [groupPhotoDataUrl, setGroupPhotoDataUrl] = useState<string | undefined>();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [directHits, setDirectHits] = useState<UserProfile[]>([]);

  async function pickGroupPhoto() {
    if (photoBusy || creating) return;
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: true,
        maxWidth: 256,
        maxHeight: 256,
        quality: 0.6,
      });
      const asset = result.assets?.[0];
      if (!asset?.base64) return;
      setPhotoBusy(true);
      // Soft size cap — keep the encoded data URL well under Firestore's
      // 1 MB doc limit (the room doc still has participants, unread, etc.).
      const sizeBytes = Math.ceil((asset.base64.length * 3) / 4);
      if (sizeBytes > 500 * 1024) {
        Alert.alert(
          'Image too large',
          `That photo is ${Math.round(sizeBytes / 1024)} KB. Please pick a smaller image.`,
        );
        return;
      }
      const mime = asset.type ?? 'image/jpeg';
      setGroupPhotoDataUrl(`data:${mime};base64,${asset.base64}`);
    } catch (e: any) {
      Alert.alert('Photo failed', e?.message ?? 'Could not pick photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    const pool: Record<string, UserProfile> = {};
    try {
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

  useEffect(() => {
    const unsub = subscribeUserRooms(currentUser.uid, async (rooms: ChatRoom[]) => {
      const otherUids = new Set<string>();
      for (const r of rooms) {
        for (const p of r.participants) {
          if (p !== currentUser.uid) otherUids.add(p);
        }
      }
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

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setDirectHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const found = await searchVibeChatUsers(q, currentUser.uid);
        if (!cancelled) setDirectHits(found);
      } catch (e) {
        if (!cancelled) console.warn('[CreateGroup] direct search failed', e);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, currentUser.uid]);

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

  const directOnly = useMemo<UserProfile[]>(() => {
    const seen = new Set(filteredCandidates.map(u => u.uid));
    return directHits.filter(u => !seen.has(u.uid));
  }, [directHits, filteredCandidates]);

  // The combined member list shown under "ADD MEMBERS".
  const allMembers = useMemo<UserProfile[]>(() => {
    return [...filteredCandidates, ...directOnly];
  }, [filteredCandidates, directOnly]);

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
    const name = groupName.trim();
    if (!name) {
      setError('Group name is required.');
      return;
    }
    if (selected.size < 1) {
      setError('Add at least one member.');
      return;
    }
    setError('');
    setCreating(true);
    try {
      const roomId = await createGroupRoom(
        currentUser.uid,
        [...selected],
        name,
        groupPhotoDataUrl,
      );
      onGroupReady(roomId, name);
    } catch (e: any) {
      setError(e?.message ?? 'Could not create group.');
    } finally {
      setCreating(false);
    }
  }

  // Both a name and at least one member are now required. The button stays
  // tappable (so the user can still hit it and see the inline error) but
  // dims when the form isn't ready.
  const nameValid = groupName.trim().length > 0;
  const canCreate = nameValid && selected.size > 0 && !creating;
  const totalCount = selected.size + 1; // +1 for the creator

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
          <Text style={styles.close}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New group</Text>
        <Pressable
          onPress={handleCreate}
          disabled={!canCreate}
          hitSlop={10}
          style={({ pressed }) => [
            styles.createBtn,
            !canCreate && styles.createBtnDisabled,
            pressed && canCreate && { opacity: 0.85 },
          ]}>
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>Create</Text>
          )}
        </Pressable>
      </View>

      {/* Group name section */}
      <View style={styles.nameRow}>
        <Pressable
          onPress={pickGroupPhoto}
          disabled={photoBusy || creating}
          style={({ pressed }) => [styles.cameraSquare, pressed && { opacity: 0.85 }]}>
          {groupPhotoDataUrl ? (
            <Image source={{ uri: groupPhotoDataUrl }} style={styles.cameraImg} />
          ) : photoBusy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.cameraIcon}>📷</Text>
          )}
          {/* Small pencil badge to hint that the square is tappable. */}
          {!photoBusy ? (
            <View style={styles.cameraBadge}>
              <Text style={styles.cameraBadgeIcon}>✎</Text>
            </View>
          ) : null}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.nameLabel}>
            GROUP NAME <Text style={styles.requiredStar}>*</Text>
          </Text>
          <TextInput
            style={styles.nameInput}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Group name"
            placeholderTextColor={colors.text3}
            maxLength={50}
          />
        </View>
      </View>

      {/* Counter */}
      <Text style={styles.counter}>
        {selected.size} selected · {totalCount} total
      </Text>

      {/* Selected chips — wrapped in a fixed-height container because a
          bare horizontal ScrollView otherwise stretches to fill the rest
          of the column, leaving a giant empty band between the chips and
          the search bar. */}
      {selectedUsers.length > 0 ? (
        <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}>
          {selectedUsers.map(u => {
            const initial = (u.displayName || u.email || '?').charAt(0).toUpperCase();
            const firstName = (u.displayName || u.email || '').split(' ')[0];
            return (
              <Pressable
                key={u.uid}
                onPress={() => toggle(u.uid)}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
                <View style={styles.chipAvatar}>
                  {u.photoURL ? (
                    <Image source={{ uri: u.photoURL }} style={styles.chipAvatarImg} />
                  ) : (
                    <Text style={styles.chipAvatarText}>{initial}</Text>
                  )}
                </View>
                <Text style={styles.chipText} numberOfLines={1}>
                  {firstName}
                </Text>
                <Text style={styles.chipX}>✕</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        </View>
      ) : null}

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search users"
          placeholderTextColor={colors.text3}
          autoCapitalize="none"
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} hitSlop={6}>
            <Text style={styles.clearIcon}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={allMembers}
          keyExtractor={u => u.uid}
          contentContainerStyle={{ paddingBottom: spacing.xxl + spacing.lg }}
          ListHeaderComponent={
            allMembers.length > 0 ? (
              <Text style={styles.sectionTitle}>ADD MEMBERS</Text>
            ) : null
          }
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>
                {search ? 'No matches' : 'Nobody to add yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {search
                  ? 'Try a different name, phone, or email.'
                  : 'Once you have contacts on VibeChat or have chatted with someone, they\'ll appear here.'}
              </Text>
            </View>
          }
        />
      )}
    </KeyboardAvoidingView>
  );

  function renderRow(item: UserProfile) {
    const isSelected = selected.has(item.uid);
    const initial = (item.displayName || item.email || '?').charAt(0).toUpperCase();
    return (
      <Pressable
        onPress={() => toggle(item.uid)}
        style={({ pressed }) => [
          styles.row,
          pressed && { backgroundColor: colors.surfaceMuted },
        ]}>
        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.displayName || item.email}
          </Text>
          {(item.email || item.phoneNumber) ? (
            <Text style={styles.rowSub} numberOfLines={1}>
              {item.phoneNumber || item.email}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.checkbox,
            isSelected ? styles.checkboxSelected : styles.checkboxEmpty,
          ]}>
          {isSelected ? <Text style={styles.checkboxTick}>✓</Text> : null}
        </View>
      </Pressable>
    );
  }
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
  close: { color: colors.text, fontSize: 22, fontWeight: '500' },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg + 1,
    fontWeight: '700',
  },
  createBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  createBtnDisabled: { opacity: 0.45 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm + 1 },

  // GROUP NAME row
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  cameraSquare: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
  },
  cameraImg: { width: '100%', height: '100%' },
  cameraIcon: { fontSize: 22, opacity: 0.6 },
  // Small pencil badge in the bottom-right corner of the camera square so
  // users immediately read it as "tap to edit / pick photo".
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  cameraBadgeIcon: { color: '#fff', fontSize: 9, fontWeight: '800' },
  nameLabel: {
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  requiredStar: { color: colors.error },
  nameInput: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: 2,
  },

  counter: {
    color: colors.textMuted,
    fontSize: fontSize.sm + 1,
    fontWeight: '500',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },

  // Selected chip row. Wrapper has a hard height because a horizontal
  // ScrollView otherwise stretches its children cross-axis to fill the
  // parent's vertical space — which left a giant empty gap below the
  // chips, between them and the search bar.
  chipsWrap: {
    height: 40,
    marginBottom: spacing.sm,
  },
  chipsRow: {
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingLeft: 4,
    paddingRight: spacing.md,
    gap: 6,
  },
  chipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipAvatarImg: { width: '100%', height: '100%' },
  chipAvatarText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  chipText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: fontSize.sm,
    maxWidth: 90,
  },
  chipX: { color: colors.primary, fontSize: 11, fontWeight: '700' },

  // Search
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

  // Section header
  sectionTitle: {
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.7,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },

  // Member row
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
  avatarText: { color: '#fff', fontWeight: '700', fontSize: fontSize.md + 1 },
  rowTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowSub: { color: colors.textMuted, fontSize: fontSize.xs + 2, marginTop: 2 },

  // Round checkbox — purple fill with ✓ when selected, hollow border when not
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxEmpty: {
    borderWidth: 1.5,
    borderColor: colors.divider,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
  },
  checkboxTick: { color: '#fff', fontWeight: '800', fontSize: 14 },

  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
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
  emptyBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm + 1,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },
});
