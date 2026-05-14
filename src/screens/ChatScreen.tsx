import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { launchImageLibrary } from 'react-native-image-picker';
import type { AuthUser } from '../services/authService';
import {
  markRoomRead,
  sendMessage,
  softDeleteMessage,
  subscribeRoomMessages,
  subscribeUserPresence,
} from '../services/firestoreService';
import { uploadChatImage } from '../services/storageService';
import { formatLastSeen } from '../services/presenceService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { ChatMessage } from '../types/models';

interface Props {
  user: AuthUser;
  roomId: string;
  title: string;
  /** uid of the other 1:1 participant, if known. Drives presence in header. */
  otherUid?: string;
  onBack: () => void;
}

type Row =
  | { kind: 'msg'; msg: ChatMessage }
  | { kind: 'day'; key: string; label: string };

export function ChatScreen({ user, roomId, title, otherUid, onBack }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState('');
  const [presenceLabel, setPresenceLabel] = useState<string | null>(null);
  const listRef = useRef<FlatList<Row>>(null);

  useEffect(() => {
    const unsub = subscribeRoomMessages(
      roomId,
      next => {
        setMessages(next);
        setLoading(false);
      },
      {
        onError: e => {
          setError(e.message);
          setLoading(false);
        },
      },
    );
    markRoomRead(roomId, user.uid).catch(() => {
      // not fatal — counter will catch up on next read
    });
    return unsub;
  }, [roomId, user.uid]);

  // Presence in the header (1:1 only — group chats don't show a single status).
  useEffect(() => {
    if (!otherUid) {
      setPresenceLabel(null);
      return;
    }
    const unsub = subscribeUserPresence(otherUid, ({ online, lastSeenMs }) => {
      setPresenceLabel(online ? 'online' : formatLastSeen(lastSeenMs));
    });
    return unsub;
  }, [otherUid]);

  // Group messages into day-separated rows.
  const rows = useMemo<Row[]>(() => buildRows(messages), [messages]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      await sendMessage({ roomId, senderId: user.uid, type: 'text', text });
      setDraft('');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send.');
    } finally {
      setSending(false);
    }
  }

  async function handlePickAndSendImage() {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.85,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setUploadingImage(true);
    setError('');
    try {
      const url = await uploadChatImage(roomId, user.uid, asset.uri);
      await sendMessage({ roomId, senderId: user.uid, type: 'image', imageUrl: url });
    } catch (e: any) {
      setError(e?.message ?? 'Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
  }

  function handleLongPressMessage(msg: ChatMessage) {
    if (msg.deleted) return;
    const isMine = msg.senderId === user.uid;
    const canCopy = msg.type === 'text' && !!msg.text;

    const actions: { label: string; action: () => void; destructive?: boolean }[] = [];
    if (canCopy) {
      actions.push({
        label: 'Copy',
        action: () => {
          if (msg.text) Clipboard.setString(msg.text);
        },
      });
    }
    if (isMine) {
      actions.push({
        label: 'Delete for everyone',
        destructive: true,
        action: async () => {
          try {
            await softDeleteMessage(roomId, msg.id);
          } catch (e: any) {
            Alert.alert('Delete failed', e?.message ?? 'Try again.');
          }
        },
      });
    }
    if (actions.length === 0) return;

    if (Platform.OS === 'ios') {
      const labels = [...actions.map(a => a.label), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
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
        'Message',
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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.avatarSm}>
          <Text style={styles.avatarSmText}>{title.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {presenceLabel ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {presenceLabel}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.chatBg}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primaryDark} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={r => (r.kind === 'msg' ? r.msg.id : r.key)}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.empty}>Say hi 👋</Text>
              </View>
            }
            renderItem={({ item }) => {
              if (item.kind === 'day') {
                return (
                  <View style={styles.dayWrap}>
                    <Text style={styles.dayChip}>{item.label}</Text>
                  </View>
                );
              }
              return (
                <MessageBubble
                  msg={item.msg}
                  mine={item.msg.senderId === user.uid}
                  onLongPress={() => handleLongPressMessage(item.msg)}
                />
              );
            }}
          />
        )}
      </View>

      {error ? <Text style={styles.errorBar}>{error}</Text> : null}

      <View style={styles.inputBar}>
        <Pressable
          onPress={handlePickAndSendImage}
          disabled={uploadingImage}
          hitSlop={6}
          style={({ pressed }) => [styles.attach, pressed && { opacity: 0.6 }]}>
          {uploadingImage ? (
            <ActivityIndicator color={colors.primaryDark} />
          ) : (
            <Text style={styles.attachIcon}>📎</Text>
          )}
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Message"
          placeholderTextColor="#999"
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <Pressable
          onPress={handleSend}
          disabled={sending || !draft.trim()}
          style={({ pressed }) => [
            styles.send,
            (!draft.trim() || sending) && styles.sendDisabled,
            pressed && { opacity: 0.85 },
          ]}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>➤</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Bubble subcomponent ──────────────────────────────────────────────────

function MessageBubble({
  msg,
  mine,
  onLongPress,
}: {
  msg: ChatMessage;
  mine: boolean;
  onLongPress: () => void;
}) {
  const time = msg.createdAt?.toDate?.()
    ? formatTime(msg.createdAt.toDate())
    : '';

  if (msg.deleted) {
    return (
      <View style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={styles.deletedText}>🚫 This message was deleted</Text>
          {time ? <Text style={styles.bubbleTime}>{time}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        style={({ pressed }) => [
          styles.bubble,
          mine ? styles.bubbleMine : styles.bubbleTheirs,
          pressed && { opacity: 0.85 },
        ]}>
        {msg.type === 'image' && msg.imageUrl ? (
          <Image source={{ uri: msg.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : null}
        {msg.text ? <Text style={styles.bubbleText}>{msg.text}</Text> : null}
        {time ? <Text style={styles.bubbleTime}>{time}</Text> : null}
      </Pressable>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildRows(messages: ChatMessage[]): Row[] {
  const out: Row[] = [];
  let lastDayKey: string | null = null;
  for (const msg of messages) {
    const d = msg.createdAt?.toDate?.();
    const key = d ? dayKey(d) : 'pending';
    if (key !== lastDayKey) {
      out.push({ kind: 'day', key: `day-${key}`, label: dayLabel(d) });
      lastDayKey = key;
    }
    out.push({ kind: 'msg', msg });
  }
  return out;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date | undefined): string {
  if (!d) return '...';
  const now = new Date();
  const today = dayKey(now);
  const yest = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const k = dayKey(d);
  if (k === today) return 'Today';
  if (k === yest) return 'Yesterday';
  // Within the past week: weekday name; otherwise locale date.
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return d.toLocaleDateString();
}

function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = ((h + 11) % 12) + 1;
  const mm = m < 10 ? `0${m}` : `${m}`;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hh}:${mm} ${ampm}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.chatBg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.headerDark,
    gap: spacing.sm,
  },
  back: { color: colors.headerText, fontSize: 28, fontWeight: '400', width: 28, textAlign: 'center' },
  avatarSm: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmText: { color: colors.headerText, fontWeight: '700', fontSize: 15 },
  headerTitle: { color: colors.headerText, fontSize: fontSize.lg - 1, fontWeight: '700' },
  headerSub: { color: colors.headerSub, fontSize: fontSize.xs + 1, marginTop: 1 },

  chatBg: { flex: 1, backgroundColor: colors.chatBg },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  empty: { color: colors.textMuted },

  listContent: { paddingHorizontal: spacing.sm, paddingVertical: spacing.md },

  dayWrap: { alignItems: 'center', marginVertical: spacing.sm },
  dayChip: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    color: colors.textMuted,
    fontSize: fontSize.xs + 1,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },

  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    elevation: 1,
    shadowColor: colors.shadow,
    shadowOpacity: 0.6,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
  },
  bubbleMine: { backgroundColor: colors.bubbleMine, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.bubbleTheirs, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: fontSize.md, color: colors.text, lineHeight: 20 },
  bubbleTime: {
    fontSize: 10,
    color: colors.bubbleMeta,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  deletedText: { fontStyle: 'italic', color: colors.textMuted, fontSize: fontSize.sm + 1 },

  image: {
    width: 220,
    height: 220,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },

  errorBar: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: 6,
    backgroundColor: colors.errorBg,
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.sm,
  },
  attach: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachIcon: { fontSize: 22 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    fontSize: fontSize.md,
    color: colors.text,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#9CB7B0' },
  sendText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.lg },
});
