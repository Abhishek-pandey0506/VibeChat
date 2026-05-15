/**
 * Group profile / management screen.
 *
 * Reached by tapping the chat header on a group chat. Live-subscribed so
 * any change (rename, member join/leave, photo update) reflects
 * immediately for everyone watching.
 *
 * Photo handling avoids Firebase Storage entirely — the picked image is
 * resized + base64-encoded and stored as a data URL on the room doc, the
 * same workaround used by profile photos and the group-create flow.
 *
 * Add Members uses the same "device contacts that are on VibeChat ∪
 * people you've chatted with" pool that CreateGroupScreen uses, instead
 * of dumping the entire user directory.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
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
import { GradientHeader } from '../components/GradientHeader';
import { useAuthContext } from '../contexts/AuthContext';
import {
  addGroupMembers,
  deleteGroupRoom,
  demoteAdmin,
  findUsersForContacts,
  getUserProfile,
  leaveGroup,
  promoteToAdmin,
  removeGroupMember,
  searchVibeChatUsers,
  subscribeRoom,
  subscribeUserPresence,
  subscribeUserRooms,
  updateGroupName,
  updateGroupPhoto,
} from '../services/firestoreService';
import {
  getDeviceContacts,
  hasContactsPermission,
  requestContactsPermission,
} from '../services/contactsService';
import { formatLastSeen } from '../services/presenceService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { ChatRoom, UserProfile } from '../types/models';

interface Props {
  roomId: string;
  onBack: () => void;
  /** Called after admin deletes the group OR the user leaves it. */
  onGroupGone: () => void;
}

function formatCreated(ms?: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Wrap formatLastSeen so it reads like a member-row presence line.
 * formatLastSeen returns "last seen 9h ago" (lowercase, lead with
 * "last") — that becomes "Last seen 9h ago" when we capitalize the L.
 */
function memberPresenceLine(
  online: boolean | undefined,
  lastSeenMs: number | null | undefined,
): string | null {
  if (online) return 'Active now';
  const raw = formatLastSeen(lastSeenMs);
  if (!raw) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function GroupProfileScreen({ roomId, onBack, onGroupGone }: Props) {
  const { user } = useAuthContext();
  const currentUser = user!;

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, UserProfile>>({});
  const [memberPresence, setMemberPresence] = useState<
    Record<string, { online: boolean; lastSeenMs: number | null }>
  >({});
  const [loading, setLoading] = useState(true);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);

  useEffect(() => {
    const unsub = subscribeRoom(roomId, next => {
      if (!next) {
        onGroupGone();
        return;
      }
      setRoom(next);
      setLoading(false);
    });
    return unsub;
  }, [roomId, onGroupGone]);

  // Fetch profiles for any new participants.
  useEffect(() => {
    if (!room) return;
    const missing = room.participants.filter(uid => !memberProfiles[uid]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const fetched: Record<string, UserProfile> = {};
      await Promise.all(
        missing.map(async uid => {
          const p = await getUserProfile(uid);
          if (p) fetched[uid] = p;
        }),
      );
      if (!cancelled) {
        setMemberProfiles(prev => ({ ...prev, ...fetched }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.participants.join(',')]);

  // Live presence for every member.
  useEffect(() => {
    if (!room) return;
    const unsubs = room.participants.map(uid =>
      subscribeUserPresence(uid, p =>
        setMemberPresence(prev => ({ ...prev, [uid]: p })),
      ),
    );
    return () => unsubs.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.participants.join(',')]);

  const isAdmin = !!room?.admins?.includes(currentUser.uid);
  const myUid = currentUser.uid;

  // ─── Photo: base64 in Firestore (no Firebase Storage) ──────────────────
  async function handleChangePhoto() {
    if (!isAdmin || uploadingPhoto) return;
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
      setUploadingPhoto(true);
      const sizeBytes = Math.ceil((asset.base64.length * 3) / 4);
      if (sizeBytes > 500 * 1024) {
        Alert.alert(
          'Image too large',
          `That photo is ${Math.round(
            sizeBytes / 1024,
          )} KB. Please pick a smaller image.`,
        );
        return;
      }
      const mime = asset.type ?? 'image/jpeg';
      const dataUrl = `data:${mime};base64,${asset.base64}`;
      await updateGroupPhoto(roomId, dataUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Try a different photo.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleRename() {
    const next = renameValue.trim();
    if (!next) {
      Alert.alert('Group name required', 'Please enter a name for the group.');
      return;
    }
    if (!isAdmin) {
      setShowRename(false);
      return;
    }
    setSavingName(true);
    try {
      await updateGroupName(roomId, next);
      setShowRename(false);
    } catch (e: any) {
      Alert.alert('Rename failed', e?.message ?? 'Try again.');
    } finally {
      setSavingName(false);
    }
  }

  function handleMemberPress(uid: string) {
    if (uid === myUid || !isAdmin) return;
    const profile = memberProfiles[uid];
    const name = profile?.displayName ?? profile?.email ?? 'this user';
    const isTheyAdmin = !!room?.admins?.includes(uid);

    const actions: { label: string; action: () => void; destructive?: boolean }[] = [];
    if (isTheyAdmin) {
      actions.push({
        label: 'Demote from admin',
        action: async () => {
          try {
            await demoteAdmin(roomId, uid);
          } catch (e: any) {
            Alert.alert('Could not demote', e?.message ?? 'Try again.');
          }
        },
      });
    } else {
      actions.push({
        label: 'Make admin',
        action: async () => {
          try {
            await promoteToAdmin(roomId, uid);
          } catch (e: any) {
            Alert.alert('Could not promote', e?.message ?? 'Try again.');
          }
        },
      });
    }
    actions.push({
      label: 'Remove from group',
      destructive: true,
      action: () =>
        Alert.alert(`Remove ${name}?`, "They won't be able to see new messages.", [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                await removeGroupMember(roomId, uid);
              } catch (e: any) {
                Alert.alert('Remove failed', e?.message ?? 'Try again.');
              }
            },
          },
        ]),
    });

    if (Platform.OS === 'ios') {
      const labels = [...actions.map(a => a.label), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: name,
          options: labels,
          cancelButtonIndex: labels.length - 1,
          destructiveButtonIndex: actions.findIndex(a => a.destructive),
        },
        idx => {
          if (idx >= 0 && idx < actions.length) actions[idx].action();
        },
      );
    } else {
      Alert.alert(
        name,
        undefined,
        [
          ...actions.map(a => ({
            text: a.label,
            style: a.destructive ? ('destructive' as const) : ('default' as const),
            onPress: a.action,
          })),
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true },
      );
    }
  }

  function handleDeleteGroup() {
    if (!isAdmin) return;
    Alert.alert(
      'Delete this group?',
      'All messages will be removed for every member. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGroupRoom(roomId);
              onGroupGone();
            } catch (e: any) {
              Alert.alert('Delete failed', e?.message ?? 'Try again.');
            }
          },
        },
      ],
    );
  }

  function handleLeaveGroup() {
    Alert.alert('Leave this group?', "You'll stop receiving new messages.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup(roomId, myUid);
            onGroupGone();
          } catch (e: any) {
            Alert.alert('Leave failed', e?.message ?? 'Try again.');
          }
        },
      },
    ]);
  }

  if (loading || !room) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const groupInitial = (room.name ?? 'G').charAt(0).toUpperCase();
  const createdAt = (room as any).createdAt?.toMillis?.() ?? null;
  const subtitle = `${room.participants.length} ${
    room.participants.length === 1 ? 'member' : 'members'
  }${createdAt ? ` · created ${formatCreated(createdAt)}` : ''}`;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.brandFrom}
        translucent={false}
      />

      <GradientHeader style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.headerBtn}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Group</Text>
        <Pressable
          hitSlop={10}
          style={styles.headerBtn}
          disabled={!isAdmin}
          onPress={() => {
            if (!isAdmin) return;
            setRenameValue(room.name ?? '');
            setShowRename(true);
          }}>
          <Text style={[styles.headerIcon, !isAdmin && { opacity: 0.4 }]}>✎</Text>
        </Pressable>
      </GradientHeader>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled">
        {/* Photo + camera badge */}
        <Pressable
          onPress={isAdmin ? handleChangePhoto : undefined}
          disabled={!isAdmin || uploadingPhoto}
          style={({ pressed }) => [
            styles.photoWrap,
            pressed && isAdmin && { opacity: 0.85 },
          ]}>
          {room.photoURL ? (
            <Image source={{ uri: room.photoURL }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoFallback]}>
              <Text style={styles.photoLetter}>{groupInitial}</Text>
            </View>
          )}
          {isAdmin && (
            <View style={styles.cameraBadge}>
              {uploadingPhoto ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.cameraIcon}>📷</Text>
              )}
            </View>
          )}
        </Pressable>

        {/* Name + counter */}
        <View style={styles.nameRow}>
          {showRename ? (
            <View style={styles.renameWrap}>
              <TextInput
                style={styles.renameInput}
                value={renameValue}
                onChangeText={setRenameValue}
                autoFocus
                maxLength={50}
                placeholder="Group name"
                placeholderTextColor={colors.text3}
              />
              <Pressable
                onPress={handleRename}
                disabled={savingName}
                style={({ pressed }) => [styles.renameBtn, pressed && { opacity: 0.85 }]}>
                {savingName ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.renameBtnText}>Save</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setShowRename(false)}
                disabled={savingName}
                style={({ pressed }) => [styles.renameCancel, pressed && { opacity: 0.6 }]}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.name}>{room.name || 'Group chat'}</Text>
          )}
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {/* Quick actions — only Add remains (admin-only).
            Mute / Search / Pin were removed per UX request. */}
        {isAdmin ? (
          <View style={styles.actionsRow}>
            <ActionButton
              icon="＋"
              label="Add"
              onPress={() => setShowAddPicker(true)}
            />
          </View>
        ) : null}

        {/* Members */}
        <Text style={styles.membersHeader}>
          {room.participants.length}{' '}
          {room.participants.length === 1 ? 'MEMBER' : 'MEMBERS'}
        </Text>

        {room.participants.map(uid => {
          const profile = memberProfiles[uid];
          const isYou = uid === myUid;
          const isUserAdmin = !!room.admins?.includes(uid);
          const presence = memberPresence[uid];
          let presenceLabel = '';
          if (isUserAdmin && isYou) {
            presenceLabel = 'Group admin';
          } else if (isUserAdmin) {
            presenceLabel = 'Group admin';
          } else {
            presenceLabel =
              memberPresenceLine(presence?.online, presence?.lastSeenMs) ??
              (createdAt ? `Joined ${formatCreated(createdAt)}` : '');
          }
          return (
            <Pressable
              key={uid}
              onPress={() => handleMemberPress(uid)}
              disabled={isYou || !isAdmin}
              style={({ pressed }) => [
                styles.memberRow,
                pressed && isAdmin && !isYou && { backgroundColor: colors.surfaceMuted },
              ]}>
              {profile?.photoURL ? (
                <Image source={{ uri: profile.photoURL }} style={styles.memberAvatar} />
              ) : (
                <View style={[styles.memberAvatar, styles.memberAvatarFallback]}>
                  <Text style={styles.memberAvatarText}>
                    {(profile?.displayName || profile?.email || '?')
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.memberNameRow}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {isYou
                      ? 'You'
                      : profile?.displayName ?? profile?.email ?? 'Unknown'}
                  </Text>
                  {isUserAdmin && (
                    <View style={styles.adminPill}>
                      <Text style={styles.adminPillText}>Admin</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.memberSub} numberOfLines={1}>
                  {presenceLabel}
                </Text>
              </View>
            </Pressable>
          );
        })}

        <View style={styles.actionsSpacer} />

        <Pressable
          onPress={handleLeaveGroup}
          style={({ pressed }) => [styles.leaveBtn, pressed && { opacity: 0.85 }]}>
          <Text style={styles.leaveBtnText}>⤴  Leave group</Text>
        </Pressable>

        {isAdmin && (
          <View style={styles.dangerZone}>
            <Text style={styles.dangerLabel}>Danger zone</Text>
            <Pressable
              onPress={handleDeleteGroup}
              style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.85 }]}>
              <Text style={styles.deleteBtnText}>Delete group for everyone</Text>
            </Pressable>
            <Text style={styles.dangerHint}>
              Removes the group and every message inside it for all members.
              Cannot be undone.
            </Text>
          </View>
        )}
      </ScrollView>

      {showAddPicker && (
        <AddMembersPicker
          roomId={roomId}
          currentParticipants={room.participants}
          onClose={() => setShowAddPicker(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  active,
  disabled,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionBtn,
        pressed && !disabled && { opacity: 0.7 },
        disabled && { opacity: 0.4 },
      ]}>
      <View style={[styles.actionIconCircle, active && styles.actionIconCircleActive]}>
        <Text
          style={[
            styles.actionIcon,
            active && { color: '#fff' },
          ]}>
          {icon}
        </Text>
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

// ─── Add members picker ─────────────────────────────────────────────────
// Pulls candidates from device contacts (matched against VibeChat users)
// + everyone the current user has chatted with. Falls back to a direct
// Firestore search when the user types a query that doesn't match any of
// the locally known candidates.

function AddMembersPicker({
  roomId,
  currentParticipants,
  onClose,
}: {
  roomId: string;
  currentParticipants: string[];
  onClose: () => void;
}) {
  const { user } = useAuthContext();
  const currentUser = user!;

  const [candidates, setCandidates] = useState<Record<string, UserProfile>>({});
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [directHits, setDirectHits] = useState<UserProfile[]>([]);

  // 1. Device contacts → VibeChat matches.
  const loadFromContacts = useCallback(async () => {
    try {
      let granted = await hasContactsPermission();
      if (!granted) granted = await requestContactsPermission();
      if (!granted) return;
      const contacts = await getDeviceContacts();
      const emails = contacts.flatMap(c => c.emails);
      const phones = contacts.flatMap(c => c.phoneLast10s);
      if (!emails.length && !phones.length) return;
      const matchMap = await findUsersForContacts(emails, phones);
      const pool: Record<string, UserProfile> = {};
      for (const profile of matchMap.values()) {
        if (profile.uid !== currentUser.uid) pool[profile.uid] = profile;
      }
      setCandidates(prev => ({ ...prev, ...pool }));
    } catch (e) {
      console.warn('[GroupProfile.Add] contacts failed', e);
    }
  }, [currentUser.uid]);

  // 2. Chat partners — anyone the user has shared a room with.
  useEffect(() => {
    const unsub = subscribeUserRooms(currentUser.uid, async rooms => {
      const otherUids = new Set<string>();
      for (const r of rooms) {
        for (const p of r.participants) {
          if (p !== currentUser.uid) otherUids.add(p);
        }
      }
      const missing = [...otherUids].filter(uid => !candidates[uid]);
      if (missing.length === 0) {
        setLoading(false);
        return;
      }
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
      setLoading(false);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.uid]);

  useEffect(() => {
    loadFromContacts().finally(() => setLoading(false));
  }, [loadFromContacts]);

  // 3. Direct Firestore search for anything not in the local pool.
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
        if (!cancelled) console.warn('[GroupProfile.Add] direct search failed', e);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, currentUser.uid]);

  const filtered = useMemo<UserProfile[]>(() => {
    const list = Object.values(candidates).filter(
      u => !currentParticipants.includes(u.uid),
    );
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    let primary = list;
    if (q) {
      primary = list.filter(u => {
        if ((u.displayName ?? '').toLowerCase().includes(q)) return true;
        if ((u.email ?? '').toLowerCase().includes(q)) return true;
        if (qDigits) {
          const phoneDigits = (u.phoneNumber ?? '').replace(/\D/g, '');
          if (phoneDigits.includes(qDigits)) return true;
        }
        return false;
      });
    }
    // Merge in direct hits that aren't already in primary AND aren't
    // already in the group.
    const shown = new Set(primary.map(u => u.uid));
    const extra = directHits.filter(
      u => !shown.has(u.uid) && !currentParticipants.includes(u.uid),
    );
    return [
      ...primary.sort((a, b) =>
        (a.displayName ?? a.email ?? '').localeCompare(b.displayName ?? b.email ?? ''),
      ),
      ...extra,
    ];
  }, [candidates, currentParticipants, search, directHits]);

  function toggle(uid: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function confirm() {
    if (selected.size === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await addGroupMembers(roomId, [...selected]);
      onClose();
    } catch (e: any) {
      Alert.alert('Add failed', e?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={pickerStyles.overlay}>
      <View style={pickerStyles.sheet}>
        <View style={pickerStyles.handle} />
        <View style={pickerStyles.headerRow}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={pickerStyles.headerAction}>Cancel</Text>
          </Pressable>
          <Text style={pickerStyles.title}>Add members</Text>
          <Pressable
            onPress={confirm}
            disabled={busy || selected.size === 0}
            hitSlop={10}>
            <Text
              style={[
                pickerStyles.confirm,
                (busy || selected.size === 0) && { opacity: 0.35 },
              ]}>
              {busy ? '...' : selected.size > 0 ? `Add (${selected.size})` : 'Add'}
            </Text>
          </Pressable>
        </View>

        <View style={pickerStyles.searchWrap}>
          <Text style={pickerStyles.searchIcon}>🔍</Text>
          <TextInput
            style={pickerStyles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search users"
            placeholderTextColor={colors.text3}
            autoCapitalize="none"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={6}>
              <Text style={pickerStyles.searchClear}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={pickerStyles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={u => u.uid}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSel = selected.has(item.uid);
              return (
                <Pressable
                  onPress={() => toggle(item.uid)}
                  style={({ pressed }) => [
                    pickerStyles.row,
                    pressed && { backgroundColor: colors.surfaceMuted },
                  ]}>
                  {item.photoURL ? (
                    <Image source={{ uri: item.photoURL }} style={pickerStyles.avatar} />
                  ) : (
                    <View style={[pickerStyles.avatar, pickerStyles.avatarFallback]}>
                      <Text style={pickerStyles.avatarText}>
                        {(item.displayName || item.email || '?')
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={pickerStyles.name}>
                      {item.displayName || item.email}
                    </Text>
                    {item.email || item.phoneNumber ? (
                      <Text style={pickerStyles.sub} numberOfLines={1}>
                        {item.phoneNumber || item.email}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[pickerStyles.check, isSel && pickerStyles.checkOn]}>
                    {isSel && <Text style={pickerStyles.tick}>✓</Text>}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={pickerStyles.center}>
                <Text style={pickerStyles.emptyTitle}>
                  {search ? 'No matches' : 'No one to add'}
                </Text>
                <Text style={pickerStyles.emptyBody}>
                  {search
                    ? 'Try a different name, phone, or email.'
                    : 'Everyone you know on VibeChat is already in this group.'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const PHOTO_SIZE = 110;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2,
  },
  headerBtn: { width: 36, alignItems: 'center' },
  back: { color: colors.headerText, fontSize: 32, lineHeight: 32, fontWeight: '500' },
  headerIcon: { color: colors.headerText, fontSize: 18 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.headerText,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },

  body: { paddingBottom: spacing.xxl, alignItems: 'center' },

  photoWrap: { marginTop: spacing.xl, width: PHOTO_SIZE, height: PHOTO_SIZE },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: PHOTO_SIZE / 2 },
  photoFallback: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoLetter: { color: colors.primary, fontSize: 40, fontWeight: '800' },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  cameraIcon: { fontSize: 14 },

  nameRow: { marginTop: spacing.md, alignItems: 'center', alignSelf: 'stretch' },
  name: {
    fontSize: fontSize.xl + 2,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: { color: colors.textMuted, fontSize: fontSize.sm + 1, marginTop: 4 },

  renameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignSelf: 'stretch',
  },
  renameInput: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    paddingVertical: 4,
  },
  renameBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  renameBtnText: { color: '#fff', fontWeight: '700' },
  renameCancel: { paddingHorizontal: spacing.sm, paddingVertical: 8 },
  renameCancelText: { color: colors.textMuted, fontWeight: '600' },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  actionBtn: { alignItems: 'center', gap: 6, flex: 1 },
  actionIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconCircleActive: { backgroundColor: colors.primary },
  actionIcon: { fontSize: 22 },
  actionLabel: { color: colors.text2, fontSize: fontSize.xs + 1, fontWeight: '600' },

  membersHeader: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    color: colors.textMuted,
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  memberAvatar: { width: 44, height: 44, borderRadius: 22 },
  memberAvatarFallback: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  memberName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  memberSub: { color: colors.textMuted, fontSize: fontSize.xs + 1, marginTop: 2 },

  adminPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  adminPillText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.3 },

  actionsSpacer: { height: spacing.xl },

  leaveBtn: {
    alignSelf: 'stretch',
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.error,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  leaveBtnText: { color: colors.error, fontWeight: '700', fontSize: fontSize.md + 1 },

  dangerZone: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.errorBg,
    backgroundColor: '#FFFAFA',
  },
  dangerLabel: {
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    color: colors.error,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  deleteBtn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.error,
    alignItems: 'center',
  },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.md + 1 },
  dangerHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs + 1,
    marginTop: spacing.sm,
    lineHeight: 17,
  },
});

const pickerStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    maxHeight: '85%',
    minHeight: '60%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.divider,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: { fontSize: fontSize.md + 1, fontWeight: '700', color: colors.text },
  headerAction: { color: colors.text, fontSize: fontSize.md, fontWeight: '500' },
  confirm: { color: colors.primary, fontWeight: '700', fontSize: fontSize.md },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    gap: spacing.sm,
  },
  searchIcon: { fontSize: 14, opacity: 0.6 },
  search: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    fontSize: fontSize.md,
    color: colors.text,
  },
  searchClear: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 4 },

  center: { padding: spacing.xl, alignItems: 'center' },
  emptyTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: fontSize.md,
    marginBottom: 4,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm + 1,
    textAlign: 'center',
    lineHeight: 19,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    gap: spacing.md,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  name: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  sub: { color: colors.textMuted, fontSize: fontSize.xs + 1, marginTop: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
