import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type AuthUser } from '../services/authService';
import { getUserProfile, subscribeUserRooms } from '../services/firestoreService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { ChatRoom, UserProfile } from '../types/models';

interface Props {
  user: AuthUser;
  onOpenRoom: (room: RoomListItem) => void;
  onNewChat: () => void;
  onOpenProfile: () => void;
}

/** Room with a precomputed display title for 1:1s. */
export interface RoomListItem extends ChatRoom {
  title: string;
  /** uid of the other 1:1 participant, undefined for groups. */
  otherUid?: string;
  photoURL?: string;
}

export function RoomListScreen({ user, onOpenRoom, onNewChat, onOpenProfile }: Props) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Cache of other-participant profiles so we can show their displayName.
  const [profilesByUid, setProfilesByUid] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    const unsub = subscribeUserRooms(
      user.uid,
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
  }, [user.uid]);

  // Fetch the "other user" profile for each 1:1 room we don't already have.
  useEffect(() => {
    const otherUids = new Set<string>();
    for (const r of rooms) {
      if (r.isGroup) continue;
      const other = r.participants.find(p => p !== user.uid);
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
  }, [rooms, user.uid, profilesByUid]);

  const items = useMemo<RoomListItem[]>(() => {
    return rooms.map(r => {
      let title: string;
      let otherUid: string | undefined;
      let photoURL: string | undefined;
      if (r.isGroup) {
        title = r.name || 'Group chat';
      } else {
        otherUid = r.participants.find(p => p !== user.uid);
        const other = otherUid ? profilesByUid[otherUid] : undefined;
        title = other?.displayName || other?.email || 'Direct message';
        photoURL = other?.photoURL;
      }
      return { ...r, title, otherUid, photoURL };
    });
  }, [rooms, profilesByUid, user.uid]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <Pressable
          onPress={onOpenProfile}
          hitSlop={8}
          style={({ pressed }) => [styles.headerAvatar, pressed && { opacity: 0.7 }]}>
          {user.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.headerAvatarImg} />
          ) : (
            <Text style={styles.headerAvatarText}>
              {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primaryDark} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No chats yet</Text>
          <Text style={styles.emptyBody}>Tap the green button to start your first chat.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={r => r.id}
          contentContainerStyle={{ paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            const unread = item.unread?.[user.uid] ?? 0;
            const previewSender =
              item.lastMessage?.senderId === user.uid ? 'You: ' : '';
            const preview = item.lastMessage?.text
              ? `${previewSender}${item.lastMessage.text}`
              : 'No messages yet';
            const timeLabel = item.lastMessage?.createdAt?.toDate
              ? formatRowTime(item.lastMessage.createdAt.toDate())
              : '';
            return (
              <Pressable
                onPress={() => onOpenRoom(item)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#F2F2F2' }]}>
                {item.photoURL ? (
                  <Image source={{ uri: item.photoURL }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.title.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTopLine}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {timeLabel ? (
                      <Text style={[styles.rowTime, unread > 0 && styles.rowTimeUnread]}>
                        {timeLabel}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.rowBottomLine}>
                    <Text
                      style={[styles.rowPreview, unread > 0 && styles.rowPreviewUnread]}
                      numberOfLines={1}>
                      {preview}
                    </Text>
                    {unread > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        onPress={onNewChat}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
        <Text style={styles.fabIcon}>💬</Text>
      </Pressable>
    </View>
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
    const hh = ((h + 11) % 12) + 1;
    const mm = m < 10 ? `0${m}` : `${m}`;
    return `${hh}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  ) {
    return 'Yesterday';
  }
  return d.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    backgroundColor: colors.headerDark,
    gap: spacing.md,
  },
  headerTitle: {
    flex: 1,
    color: colors.headerText,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarImg: { width: '100%', height: '100%' },
  headerAvatarText: { color: colors.headerText, fontWeight: '700', fontSize: 15 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: fontSize.md + 1, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  emptyBody: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  error: { color: colors.error, textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  sep: { height: 1, backgroundColor: colors.divider, marginLeft: 76 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 50, height: 50, borderRadius: 25 },
  avatarText: { color: colors.headerText, fontWeight: '700', fontSize: fontSize.lg },

  rowTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  rowTitle: { fontSize: fontSize.md + 1, fontWeight: '600', color: colors.text, flex: 1, marginRight: spacing.sm },
  rowTime: { fontSize: fontSize.xs, color: colors.textMuted },
  rowTimeUnread: { color: colors.primary, fontWeight: '700' },
  rowPreview: { fontSize: fontSize.sm + 1, color: colors.textMuted, flex: 1, marginRight: spacing.sm },
  rowPreviewUnread: { color: colors.text },

  badge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.headerText, fontSize: 12, fontWeight: '700' },

  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabIcon: { fontSize: 26 },
});
