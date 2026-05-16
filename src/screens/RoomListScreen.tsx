/**
 * Messages list — modern white surface matching the mockup.
 *
 * Layout:
 *   • Big "Messages" headline + search & avatar buttons on the right.
 *   • Pill filter chips (All / Unread / Groups / Archived).
 *   • One-line rooms: avatar + title + last-message preview, time on top
 *     right, unread badge on bottom right.
 *   • Floating pencil edit FAB bottom right.
 *
 * State preserved from the previous version: subscribeUserRooms, peer
 * profile fetch for 1:1 titles, unread map, time formatter.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuthContext } from '../contexts/AuthContext';
import {
  getUserProfile,
  subscribeUserProfile,
  subscribeUserRooms,
} from '../services/firestoreService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { ChatRoom, UserProfile } from '../types/models';

interface Props {
  onOpenRoom: (room: RoomListItem) => void;
  onNewChat: () => void;
  onOpenProfile: () => void;
}

/** Room with a precomputed display title for 1:1s. */
export interface RoomListItem extends ChatRoom {
  title: string;
  otherUid?: string;
  photoURL?: string;
  /** Peer email cached so the chat list can search by email. */
  peerEmail?: string;
  /** Peer phone cached so the chat list can search by phone number. */
  peerPhone?: string;
}

type Filter = 'all' | 'unread' | 'groups';

export function RoomListScreen({ onOpenRoom, onNewChat, onOpenProfile }: Props) {
  const { user } = useAuthContext();
  const currentUser = user!;
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profilesByUid, setProfilesByUid] = useState<Record<string, UserProfile>>({});
  // My own Firestore profile — Firebase Auth's `photoURL` field can't
  // hold the base64 data URL we use for avatars (Auth's photoURL has a
  // tight size limit), so the only way to render the user's real photo
  // in the top-right circle is to subscribe to my own users/{uid} doc.
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  // Search bar is hidden by default and slides into view when the user
  // taps the 🔍 button next to the avatar. Filters rooms by the title
  // (peer display name for 1:1s, group name for groups), case-insensitive.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Force the system status bar to white-with-dark-icons whenever this
  // screen is on top. The declarative <StatusBar> tag below also sets it,
  // but the imperative call here is the belt to that suspenders — it
  // overrides any global StatusBar (e.g. App.tsx's purple one) that was
  // pushed earlier in the render tree.
  useEffect(() => {
    StatusBar.setBarStyle('dark-content', true);
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor('#FFFFFF', true);
      StatusBar.setTranslucent(false);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeUserRooms(
      currentUser.uid,
      next => {
        setRooms(next);
        setLoading(false);
      },
      e => {
        setError(e.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [currentUser.uid]);

  // Live my-profile subscription — picks up photo changes (data URL) as
  // soon as they're written by ProfileScreen or CompleteProfileScreen.
  useEffect(() => {
    const unsub = subscribeUserProfile(currentUser.uid, p => setMyProfile(p));
    return unsub;
  }, [currentUser.uid]);

  // Fetch the "other user" profile for each 1:1 room we don't have yet.
  useEffect(() => {
    const otherUids = new Set<string>();
    for (const r of rooms) {
      if (r.isGroup) continue;
      const other = r.participants.find(p => p !== currentUser.uid);
      if (other && !profilesByUid[other]) otherUids.add(other);
    }
    if (otherUids.size === 0) return;

    let cancelled = false;
    (async () => {
      const fetched: Record<string, UserProfile> = {};
      await Promise.all(
        [...otherUids].map(async uid => {
          const profile = await getUserProfile(uid);
          if (profile) fetched[uid] = profile;
        }),
      );
      if (!cancelled) setProfilesByUid(prev => ({ ...prev, ...fetched }));
    })();

    return () => {
      cancelled = true;
    };
  }, [rooms, currentUser.uid, profilesByUid]);

  const items = useMemo<RoomListItem[]>(() => {
    return rooms.map(r => {
      let title: string;
      let otherUid: string | undefined;
      let photoURL: string | undefined;
      let peerEmail: string | undefined;
      let peerPhone: string | undefined;
      if (r.isGroup) {
        title = r.name || 'Group chat';
        photoURL = r.photoURL;
      } else {
        otherUid = r.participants.find(p => p !== currentUser.uid);
        const other = otherUid ? profilesByUid[otherUid] : undefined;
        title = other?.displayName || other?.email || 'Direct message';
        photoURL = other?.photoURL;
        peerEmail = other?.email;
        peerPhone = other?.phoneNumber;
      }
      return { ...r, title, otherUid, photoURL, peerEmail, peerPhone };
    });
  }, [rooms, profilesByUid, currentUser.uid]);

  // Total unread across all rooms — feeds the "Unread N" filter chip.
  const totalUnread = useMemo(
    () => items.reduce((sum, r) => sum + (r.unread?.[currentUser.uid] ?? 0), 0),
    [items, currentUser.uid],
  );

  const filteredItems = useMemo(() => {
    // Step 1 — chip filter.
    let base = items;
    if (filter === 'unread') {
      base = items.filter(r => (r.unread?.[currentUser.uid] ?? 0) > 0);
    } else if (filter === 'groups') {
      base = items.filter(r => r.isGroup);
    }
    // Step 2 — text search across name, email, phone number, AND the
    // last-message preview. Digits in the query are also matched against
    // the digit-only form of the peer's phone so that "9876" still hits a
    // contact saved as "+91 98765 43210".
    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    const qDigits = q.replace(/\D/g, '');
    return base.filter(r => {
      if (r.title.toLowerCase().includes(q)) return true;
      if (r.peerEmail?.toLowerCase().includes(q)) return true;
      if (r.peerPhone?.toLowerCase().includes(q)) return true;
      if (qDigits && r.peerPhone) {
        const peerDigits = r.peerPhone.replace(/\D/g, '');
        if (peerDigits.includes(qDigits)) return true;
      }
      if (r.lastMessage?.text?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [items, filter, currentUser.uid, searchQuery]);

  // Use the Firestore profile (data URL avatars live there) before
  // falling back to the Firebase Auth user's display name / email /
  // photoURL — Auth's photoURL field can't hold base64 data URLs so it's
  // often stale on accounts that updated their photo.
  const myPhotoURL = myProfile?.photoURL ?? currentUser.photoURL ?? undefined;
  const myDisplayName =
    myProfile?.displayName ?? currentUser.displayName ?? currentUser.email;
  const headerInitial = (myDisplayName || '?').charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />

      {/* Top bar — clean white surface, big headline, search + avatar. */}
      <View style={styles.topBar}>
        <Text style={styles.title}>Messages</Text>
        <View style={styles.topActions}>
          <Pressable
            hitSlop={6}
            onPress={() => {
              // Toggle the search bar. Closing it also clears the query so
              // the list resets to the chip-filtered view.
              setSearchOpen(open => {
                const next = !open;
                if (!next) setSearchQuery('');
                return next;
              });
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              searchOpen && styles.iconBtnActive,
              pressed && { opacity: 0.6 },
            ]}>
            <Text style={styles.iconText}>{searchOpen ? '✕' : '🔍'}</Text>
          </Pressable>
          <Pressable
            onPress={onOpenProfile}
            hitSlop={6}
            style={({ pressed }) => [styles.headerAvatar, pressed && { opacity: 0.7 }]}>
            {myPhotoURL ? (
              <Image source={{ uri: myPhotoURL }} style={styles.headerAvatarImg} />
            ) : (
              <Text style={styles.headerAvatarText}>{headerInitial}</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Inline search bar — appears below the title only when the user
          taps the 🔍 button. Auto-focuses for instant typing. */}
      {searchOpen ? (
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search chats"
            placeholderTextColor={colors.text3}
            autoFocus
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
              <Text style={styles.searchClear}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Filter chips — fixed-height wrapper so the horizontal ScrollView
          doesn't stretch vertically and turn each chip into a tall pill. */}
      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}>
          <FilterChip
            label="All"
            active={filter === 'all'}
            onPress={() => setFilter('all')}
          />
          <FilterChip
            label="Unread"
            count={totalUnread > 0 ? totalUnread : undefined}
            active={filter === 'unread'}
            onPress={() => setFilter('unread')}
          />
          <FilterChip
            label="Groups"
            active={filter === 'groups'}
            onPress={() => setFilter('groups')}
          />
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>
            {searchQuery
              ? 'No matches'
              : filter === 'unread'
              ? 'No unread chats'
              : filter === 'groups'
              ? 'No group chats'
              : 'No chats yet'}
          </Text>
          <Text style={styles.emptyBody}>
            {searchQuery
              ? `Nothing matched "${searchQuery}". Try a different name.`
              : filter === 'all'
              ? 'Tap the pencil button to start your first chat.'
              : filter === 'unread'
              ? "You're all caught up."
              : 'Create a group from the new-chat screen.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const unread = item.unread?.[currentUser.uid] ?? 0;
            const previewSender =
              item.lastMessage?.senderId === currentUser.uid ? 'You: ' : '';
            const preview = item.lastMessage?.text
              ? `${previewSender}${item.lastMessage.text}`
              : item.lastMessage?.type === 'image'
              ? `${previewSender}📷 Photo`
              : item.lastMessage?.type === 'video'
              ? `${previewSender}🎬 Video`
              : item.lastMessage?.type === 'document'
              ? `${previewSender}📄 Document`
              : 'No messages yet';
            const timeLabel = item.lastMessage?.createdAt?.toDate
              ? formatRowTime(item.lastMessage.createdAt.toDate())
              : '';
            return (
              <Pressable
                onPress={() => onOpenRoom(item)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.surfaceMuted },
                ]}>
                {item.photoURL ? (
                  <Image source={{ uri: item.photoURL }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarText}>
                      {item.title.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text
                    style={[styles.rowPreview, unread > 0 && styles.rowPreviewUnread]}
                    numberOfLines={1}>
                    {preview}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  {timeLabel ? (
                    <Text
                      style={[styles.rowTime, unread > 0 && styles.rowTimeUnread]}>
                      {timeLabel}
                    </Text>
                  ) : null}
                  {unread > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {unread > 99 ? '99+' : unread}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Pencil edit FAB — bottom right, dark circle to match the mockup. */}
      <Pressable
        onPress={onNewChat}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
        <Text style={styles.fabIcon}>✎</Text>
      </Pressable>
    </View>
  );
}

function FilterChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && { opacity: 0.85 },
      ]}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text style={[styles.chipCount, active && styles.chipCountActive]}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

function formatRowTime(d: Date): string {
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    const h = d.getHours();
    const m = d.getMinutes();
    const hh = h < 10 ? `0${h}` : `${h}`;
    const mm = m < 10 ? `0${m}` : `${m}`;
    return `${hh}:${mm}`;
  }
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  ) {
    return 'Yesterday';
  }
  // Within last 7 days → weekday name; older → calendar date.
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Subtle highlight on the 🔍 button when the search bar is open, so the
  // user sees that toggling the same button again will close it.
  iconBtnActive: { backgroundColor: colors.surfaceMuted },
  iconText: { fontSize: 18, color: colors.text },

  // Inline search field — slides into view between the title and the
  // filter chips when the search button is tapped.
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    marginHorizontal: spacing.lg,
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
  searchClear: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 4 },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarImg: { width: '100%', height: '100%' },
  headerAvatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Filter chips row. The wrapper has a hard height because a horizontal
  // ScrollView otherwise stretches its children cross-axis to fill the
  // parent's vertical space — which turned the chips into full-height
  // capsules.
  chipsWrap: {
    height: 44,
    marginBottom: spacing.md,
  },
  chipsRow: {
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    gap: 6,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  chipLabel: {
    color: colors.text,
    fontSize: fontSize.sm + 1,
    fontWeight: '600',
  },
  chipLabelActive: { color: '#fff' },
  chipCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    marginLeft: 2,
  },
  chipCountActive: { color: '#fff' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: {
    fontSize: fontSize.md + 2,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyBody: { fontSize: fontSize.sm + 1, color: colors.textMuted, textAlign: 'center' },
  error: { color: colors.error, textAlign: 'center' },

  listContent: { paddingBottom: 96 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: fontSize.lg },

  rowTitle: {
    fontSize: fontSize.md + 1,
    fontWeight: '700',
    color: colors.text,
  },
  rowPreview: {
    fontSize: fontSize.sm + 1,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowPreviewUnread: { color: colors.text, fontWeight: '600' },

  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowTime: { fontSize: fontSize.xs + 1, color: colors.textMuted, fontWeight: '500' },
  rowTimeUnread: { color: colors.primary, fontWeight: '700' },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 11,
    paddingHorizontal: 7,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Pencil FAB — dark circle in the corner like the mockup.
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabIcon: { color: '#fff', fontSize: 22, fontWeight: '800' },
});
