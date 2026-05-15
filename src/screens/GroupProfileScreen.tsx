/**
 * Group profile / management screen.
 *
 * Reached by tapping the chat header on a group chat. Live-subscribed so any
 * change (rename, member join/leave, photo update) reflects immediately for
 * everyone watching.
 *
 * Capabilities depend on role:
 *   • Admin: rename, change photo, add members, kick members, promote /
 *     demote other admins, delete the group entirely.
 *   • Member: see the member list, leave the group themselves.
 */

import { useEffect, useMemo, useState } from 'react';
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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useAuthContext } from '../contexts/AuthContext';
import {
  addGroupMembers,
  deleteGroupRoom,
  demoteAdmin,
  getUserProfile,
  leaveGroup,
  listUsers,
  promoteToAdmin,
  removeGroupMember,
  subscribeRoom,
  updateGroupName,
  updateGroupPhoto,
} from '../services/firestoreService';
import { uploadGroupImage } from '../services/storageService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { ChatRoom, UserProfile } from '../types/models';

interface Props {
  roomId: string;
  onBack: () => void;
  /** Called after admin deletes the group OR the user leaves it. */
  onGroupGone: () => void;
}

export function GroupProfileScreen({ roomId, onBack, onGroupGone }: Props) {
  const { user } = useAuthContext();
  const currentUser = user!;

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);

  // Realtime subscription so member changes propagate to everyone.
  useEffect(() => {
    const unsub = subscribeRoom(roomId, next => {
      if (!next) {
        // Room was deleted or we were removed — bounce out.
        onGroupGone();
        return;
      }
      setRoom(next);
      setLoading(false);
    });
    return unsub;
  }, [roomId, onGroupGone]);

  // Fetch any missing member profiles.
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

  const isAdmin = !!room?.admins?.includes(currentUser.uid);
  const myUid = currentUser.uid;

  async function handleChangePhoto() {
    if (!isAdmin) return;
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.85,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadGroupImage(roomId, asset.uri);
      await updateGroupPhoto(roomId, url);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Try a different photo.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleRename() {
    const next = renameValue.trim();
    if (!next || !isAdmin) {
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
    if (uid === myUid) return;
    if (!isAdmin) return;
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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Group info</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.heroBg} />

        <Pressable
          onPress={isAdmin ? handleChangePhoto : undefined}
          disabled={!isAdmin || uploadingPhoto}
          style={({ pressed }) => [styles.photoWrap, pressed && isAdmin && { opacity: 0.85 }]}>
          {room.photoURL ? (
            <Image source={{ uri: room.photoURL }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoFallback]}>
              <Text style={styles.photoIcon}>👥</Text>
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

        <View style={styles.nameRow}>
          {showRename ? (
            <View style={styles.renameWrap}>
              <TextInput
                style={styles.renameInput}
                value={renameValue}
                onChangeText={setRenameValue}
                autoFocus
                maxLength={50}
              />
              <Pressable
                onPress={handleRename}
                disabled={savingName}
                style={({ pressed }) => [styles.renameBtn, pressed && { opacity: 0.85 }]}>
                {savingName ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text style={styles.renameBtnText}>Save</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                if (!isAdmin) return;
                setRenameValue(room.name ?? '');
                setShowRename(true);
              }}
              disabled={!isAdmin}>
              <Text style={styles.name}>{room.name || 'Group chat'}</Text>
              {isAdmin && <Text style={styles.nameHint}>Tap to rename</Text>}
            </Pressable>
          )}
        </View>

        <Text style={styles.membersHeader}>
          {room.participants.length}{' '}
          {room.participants.length === 1 ? 'member' : 'members'}
        </Text>

        {isAdmin && (
          <Pressable
            onPress={() => setShowAddPicker(true)}
            style={({ pressed }) => [styles.addRow, pressed && { opacity: 0.85 }]}>
            <View style={styles.addIcon}>
              <Text style={styles.addIconText}>＋</Text>
            </View>
            <Text style={styles.addText}>Add members</Text>
          </Pressable>
        )}

        {room.participants.map(uid => {
          const profile = memberProfiles[uid];
          const isYou = uid === myUid;
          const isUserAdmin = !!room.admins?.includes(uid);
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
                    {(profile?.displayName || profile?.email || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {isYou ? 'You' : profile?.displayName ?? profile?.email ?? 'Unknown'}
                </Text>
                {profile?.email && !isYou ? (
                  <Text style={styles.memberSub} numberOfLines={1}>
                    {profile.email}
                  </Text>
                ) : null}
              </View>
              {isUserAdmin && (
                <View style={styles.adminPill}>
                  <Text style={styles.adminPillText}>Admin</Text>
                </View>
              )}
            </Pressable>
          );
        })}

        {/* Footer actions */}
        <View style={styles.actionsSpacer} />

        <Pressable
          onPress={handleLeaveGroup}
          style={({ pressed }) => [styles.leaveBtn, pressed && { opacity: 0.85 }]}>
          <Text style={styles.leaveBtnText}>Leave group</Text>
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
              Removes the group and every message inside it for all members. This
              cannot be undone.
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

// ─── Add-members sheet ────────────────────────────────────────────────────

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
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listUsers(currentUser.uid);
        if (!cancelled) {
          // Drop existing members.
          setUsers(list.filter(u => !currentParticipants.includes(u.uid)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser.uid, currentParticipants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      u =>
        u.displayName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q),
    );
  }, [users, search]);

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
        <View style={pickerStyles.headerRow}>
          <Pressable onPress={onClose}>
            <Text style={pickerStyles.headerAction}>Cancel</Text>
          </Pressable>
          <Text style={pickerStyles.title}>Add members</Text>
          <Pressable onPress={confirm} disabled={busy || selected.size === 0}>
            <Text
              style={[
                pickerStyles.headerAction,
                pickerStyles.confirm,
                (busy || selected.size === 0) && { opacity: 0.4 },
              ]}>
              Add {selected.size > 0 ? `(${selected.size})` : ''}
            </Text>
          </Pressable>
        </View>
        <TextInput
          style={pickerStyles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search users"
          placeholderTextColor={colors.textLight}
          autoCapitalize="none"
        />
        {loading ? (
          <View style={pickerStyles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={u => u.uid}
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
                        {(item.displayName || item.email || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={pickerStyles.name}>
                      {item.displayName || item.email}
                    </Text>
                    {item.email ? (
                      <Text style={pickerStyles.sub} numberOfLines={1}>
                        {item.email}
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
                <Text style={{ color: colors.textMuted }}>No one to add.</Text>
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

  body: { paddingBottom: spacing.xxl, alignItems: 'center' },

  heroBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: colors.headerDark,
  },

  photoWrap: { marginTop: 44, width: PHOTO_SIZE, height: PHOTO_SIZE },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    borderWidth: 4,
    borderColor: colors.bg,
  },
  photoFallback: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoIcon: { fontSize: 42 },
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

  nameRow: { marginTop: spacing.md, alignItems: 'center', minHeight: 60 },
  name: {
    fontSize: fontSize.xl + 2,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  nameHint: { color: colors.textLight, fontSize: fontSize.xs + 1, marginTop: 4, textAlign: 'center' },

  renameWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
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
  renameBtnText: { color: colors.textOnPrimary, fontWeight: '700' },

  membersHeader: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    color: colors.textMuted,
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  addIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIconText: { color: colors.primary, fontWeight: '800', fontSize: 24 },
  addText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.md },

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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: { color: colors.headerText, fontWeight: '700', fontSize: 16 },
  memberName: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  memberSub: { color: colors.textMuted, fontSize: fontSize.xs + 1, marginTop: 2 },

  adminPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  adminPillText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },

  actionsSpacer: { height: spacing.xl },

  leaveBtn: {
    alignSelf: 'stretch',
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    maxHeight: '85%',
    minHeight: '60%',
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
  confirm: { color: colors.primary, fontWeight: '700' },
  search: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
  },
  center: { padding: spacing.xl, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    gap: spacing.md,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.headerText, fontWeight: '700', fontSize: 15 },
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
