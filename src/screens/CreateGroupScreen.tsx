import { useEffect, useMemo, useState } from 'react';
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
import { createGroupRoom, listUsers } from '../services/firestoreService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { UserProfile } from '../types/models';

interface Props {
  onBack: () => void;
  onGroupReady: (roomId: string, title: string) => void;
}

export function CreateGroupScreen({ onBack, onGroupReady }: Props) {
  const { user } = useAuthContext();
  const currentUser = user!;

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listUsers(currentUser.uid);
        if (!cancelled) setUsers(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load users.');
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser.uid]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      u =>
        u.displayName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q),
    );
  }, [users, search]);

  const selectedUsers = useMemo(
    () => users.filter(u => selected.has(u.uid)),
    [users, selected],
  );

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
          placeholder="Search users by name or email"
          placeholderTextColor={colors.textLight}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={6}>
            <Text style={styles.clearIcon}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* Selected chips row — bounded height so the chips render correctly
          inside the flex parent. ScrollView keeps a single line. */}
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

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Add members</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loadingUsers ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={u => u.uid}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: spacing.xxl + spacing.lg }}
          renderItem={({ item }) => {
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
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No users found</Text>
              <Text style={styles.emptyBody}>Try a different search term.</Text>
            </View>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },

  // Header
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

  // Top row: avatar + name + counter
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

  // Search bar
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

  // Selected-chips bar
  chipsBar: {
    height: 50,
    marginTop: spacing.md,
  },
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

  // Section header
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
  emptyTitle: { color: colors.text, fontWeight: '700', fontSize: fontSize.md + 1, marginBottom: spacing.xs },
  emptyBody: { color: colors.textMuted, fontSize: fontSize.sm + 1, textAlign: 'center' },

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
