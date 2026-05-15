/**
 * 1:1 / group conversation screen.
 *
 * Header: white surface with back arrow, small avatar, name +
 * "Active now" presence line, and a chevron to the peer / group
 * profile. (Voice & video calling were removed.)
 *
 * Body: grey bubbles for incoming, purple bubbles for outgoing. Timestamp
 * sits OUTSIDE the bubble (below it on the same side) so the bubble
 * itself stays clean.
 *
 * Input bar: + attachment button on the left (gallery photo only, capped
 * at 1 MB), pill-shaped Message input, mic icon on the right that morphs
 * into a Send button when text is present.
 *
 * Live subscriptions: realtime messages, peer presence, block relation.
 * Long-press a message for Copy / Delete-for-everyone. Pre-existing
 * video and document messages still render in the bubble component for
 * backward compat — only NEW outgoing attachments are restricted to
 * gallery photos.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
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
import Clipboard from '@react-native-clipboard/clipboard';
import { launchImageLibrary } from 'react-native-image-picker';
// Video is still imported so existing image/video messages from before
// this build still render — we just no longer let users CREATE new
// video messages from the attachment button.
import Video from 'react-native-video';
import { useAuthContext } from '../contexts/AuthContext';
import {
  getUserProfile,
  hideRoomForUser,
  markRoomRead,
  sendMessage,
  softDeleteMessage,
  subscribeBlockRelation,
  subscribeRoomMessages,
  subscribeUserPresence,
  unblockUser,
} from '../services/firestoreService';
import { uploadChatImage } from '../services/storageService';
import { formatLastSeen } from '../services/presenceService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { ChatMessage, UserProfile } from '../types/models';

// Photo attachments are capped at 1 MB. The picker also resizes before
// the file is read, so most pictures land well under this naturally — the
// hard cap below is a safety net for very large originals.
const MAX_PHOTO_BYTES = 1 * 1024 * 1024; // 1 MB

interface Props {
  roomId: string;
  title: string;
  otherUid?: string;
  onBack: () => void;
  onOpenPeerProfile?: (otherUid: string) => void;
  onOpenGroupProfile?: () => void;
}

type Row =
  | { kind: 'msg'; msg: ChatMessage }
  | { kind: 'day'; key: string; label: string };

export function ChatScreen({
  roomId,
  title,
  otherUid,
  onBack,
  onOpenPeerProfile,
  onOpenGroupProfile,
}: Props) {
  const { user } = useAuthContext();
  const currentUser = user!;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [unblocking, setUnblocking] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [presenceOnline, setPresenceOnline] = useState(false);
  const [presenceLabel, setPresenceLabel] = useState<string | null>(null);
  const [peer, setPeer] = useState<UserProfile | null>(null);
  const [block, setBlock] = useState({ iBlocked: false, theyBlocked: false });
  const listRef = useRef<FlatList<Row>>(null);

  useEffect(() => {
    if (!otherUid) {
      setPeer(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const p = await getUserProfile(otherUid);
      if (!cancelled) setPeer(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [otherUid]);

  useEffect(() => {
    setError('');
    const unsub = subscribeRoomMessages(
      roomId,
      next => {
        setMessages(next);
        setLoading(false);
      },
      {
        onError: e => {
          console.warn('[ChatScreen] message subscription error', e);
          if (!/^\[?storage\//i.test(e.message)) setError(e.message);
          setLoading(false);
        },
      },
    );
    markRoomRead(roomId, currentUser.uid).catch(() => {});
    return unsub;
  }, [roomId, currentUser.uid]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 4000);
    return () => clearTimeout(t);
  }, [error]);

  function reportError(msg: string | undefined) {
    if (!msg) return;
    if (/storage\/object-not-found/i.test(msg)) {
      console.warn('[ChatScreen] suppressed storage/object-not-found', msg);
      return;
    }
    setError(msg);
  }

  useEffect(() => {
    if (!otherUid) {
      setPresenceLabel(null);
      setPresenceOnline(false);
      return;
    }
    const unsub = subscribeUserPresence(otherUid, ({ online, lastSeenMs }) => {
      setPresenceOnline(online);
      setPresenceLabel(online ? 'Active now' : formatLastSeen(lastSeenMs));
    });
    return unsub;
  }, [otherUid]);

  useEffect(() => {
    if (!otherUid) return;
    const unsub = subscribeBlockRelation(currentUser.uid, otherUid, setBlock);
    return unsub;
  }, [otherUid, currentUser.uid]);

  const rows = useMemo<Row[]>(() => buildRows(messages), [messages]);

  const composeDisabled = block.iBlocked || block.theyBlocked;
  const hasDraft = draft.trim().length > 0;

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending || composeDisabled) return;
    setSending(true);
    setError('');
    try {
      await sendMessage({ roomId, senderId: currentUser.uid, type: 'text', text });
      setDraft('');
    } catch (e: any) {
      reportError(e?.message ?? 'Failed to send.');
    } finally {
      setSending(false);
    }
  }

  /**
   * Pick a photo from the gallery and send it as an image message.
   * Only photos are supported (no camera, no video, no documents) and
   * the file size is hard-capped at 1 MB. The picker is asked to resize
   * to a maximum of 1600 px on its longest edge with quality 0.8 so the
   * vast majority of pictures land well under the cap naturally.
   */
  async function handlePickAndSendPhoto() {
    if (uploadingImage || composeDisabled) return;
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
      const kb = Math.round(asset.fileSize / 1024);
      Alert.alert(
        'Photo too large',
        `That image is ${kb} KB. Maximum is 1024 KB. Try a smaller photo.`,
      );
      return;
    }
    setUploadingImage(true);
    setError('');
    try {
      const url = await uploadChatImage(roomId, currentUser.uid, asset.uri);
      await sendMessage({
        roomId,
        senderId: currentUser.uid,
        type: 'image',
        imageUrl: url,
      });
    } catch (e: any) {
      reportError(e?.message ?? 'Photo upload failed.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleUnblock() {
    if (!otherUid || unblocking) return;
    setUnblocking(true);
    try {
      await unblockUser(currentUser.uid, otherUid);
    } catch (e: any) {
      Alert.alert('Unblock failed', e?.message ?? 'Try again.');
    } finally {
      setUnblocking(false);
    }
  }

  function handleDeleteChat() {
    Alert.alert(
      'Delete this chat?',
      'It will be removed from your list. Messages will still exist for the other person. The chat will reappear if they send a new message.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await hideRoomForUser(roomId, currentUser.uid);
            } catch (e: any) {
              // Even if the hide fails (rules / network), still leave the
              // screen — the user clearly wants out. They can re-trigger
              // the action from the list later if needed.
              console.warn('[ChatScreen] hideRoomForUser failed', e);
            } finally {
              onBack();
            }
          },
        },
      ],
    );
  }

  function handleLongPressMessage(msg: ChatMessage) {
    if (msg.deleted) return;
    const isMine = msg.senderId === currentUser.uid;
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

  const visibleMessages = useMemo(() => {
    if (!block.iBlocked) return rows;
    return rows.filter(r => r.kind === 'day' || r.msg.senderId === currentUser.uid);
  }, [rows, block.iBlocked, currentUser.uid]);

  const headerInitial = title.charAt(0).toUpperCase();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />

      {/* Header */}
      <Pressable
        onPress={() => {
          if (otherUid && onOpenPeerProfile) onOpenPeerProfile(otherUid);
          else if (!otherUid && onOpenGroupProfile) onOpenGroupProfile();
        }}
        disabled={otherUid ? !onOpenPeerProfile : !onOpenGroupProfile}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.92 }]}>
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        {peer?.photoURL ? (
          <Image source={{ uri: peer.photoURL }} style={styles.avatarSm} />
        ) : (
          <View style={[styles.avatarSm, styles.avatarSmFallback]}>
            <Text style={styles.avatarSmText}>{headerInitial}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {presenceLabel ? (
            <View style={styles.presenceRow}>
              {presenceOnline && !block.iBlocked ? (
                <View style={styles.onlineDot} />
              ) : null}
              <Text style={styles.headerSub} numberOfLines={1}>
                {block.iBlocked ? 'blocked' : presenceLabel}
              </Text>
            </View>
          ) : null}
        </View>
        {/* Right slot intentionally empty — the whole header is tappable
            to open the peer / group profile, so a chevron would be
            redundant chrome. */}
      </Pressable>

      <View style={styles.divider} />

      {/* Message list */}
      <View style={styles.chatBg}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={visibleMessages}
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
                  mine={item.msg.senderId === currentUser.uid}
                  isPlaying={playingVideoId === item.msg.id}
                  onPlayVideo={() => setPlayingVideoId(item.msg.id)}
                  onLongPress={() => handleLongPressMessage(item.msg)}
                />
              );
            }}
          />
        )}
      </View>

      {error ? (
        <Pressable onPress={() => setError('')} style={styles.errorBar}>
          <Text style={styles.errorBarText} numberOfLines={2}>
            {error}
          </Text>
          <Text style={styles.errorBarClose}>✕</Text>
        </Pressable>
      ) : null}

      {composeDisabled ? (
        // Card-style block notice — matches the Verafied design: dark
        // rounded panel pinned to the bottom of the chat, with a clear
        // title, a body line that names the blocked party, and two
        // actions (Delete chat / Unblock) for the blocker. When THEY
        // blocked YOU, only the title + body show — there's nothing for
        // you to unblock.
        <View style={styles.blockCard}>
          <Text style={styles.blockTitle}>
            {block.iBlocked ? 'You blocked this account' : "You've been blocked"}
          </Text>
          <Text style={styles.blockBody}>
            {block.iBlocked ? (
              <>
                You will not be able to message{' '}
                <Text style={styles.blockBodyBold}>
                  {peer?.displayName || title}
                </Text>{' '}
                until you unblock them.
              </>
            ) : (
              <>
                <Text style={styles.blockBodyBold}>
                  {peer?.displayName || title}
                </Text>{' '}
                blocked you. You can no longer message this user.
              </>
            )}
          </Text>
          {block.iBlocked ? (
            <View style={styles.blockActions}>
              <Pressable
                onPress={handleDeleteChat}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.blockBtn,
                  pressed && { opacity: 0.7 },
                ]}>
                <Text style={styles.blockBtnDanger}>Delete chat</Text>
              </Pressable>
              <View style={styles.blockSep} />
              <Pressable
                onPress={handleUnblock}
                disabled={unblocking}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.blockBtn,
                  pressed && { opacity: 0.7 },
                ]}>
                {unblocking ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.blockBtnPrimary}>Unblock</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.inputBar}>
          <Pressable
            onPress={handlePickAndSendPhoto}
            disabled={uploadingImage}
            hitSlop={6}
            style={({ pressed }) => [styles.attach, pressed && { opacity: 0.6 }]}>
            {uploadingImage ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.attachIcon}>+</Text>
            )}
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor={colors.text3}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          {/* Send button — only visible once the user has typed
              something. No mic icon (voice messages aren't supported). */}
          {hasDraft || sending ? (
            <Pressable
              onPress={handleSend}
              disabled={sending}
              hitSlop={6}
              style={({ pressed }) => [styles.send, pressed && { opacity: 0.85 }]}>
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendIcon}>➤</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Bubble subcomponent ──────────────────────────────────────────────────

function MessageBubble({
  msg,
  mine,
  isPlaying,
  onPlayVideo,
  onLongPress,
}: {
  msg: ChatMessage;
  mine: boolean;
  isPlaying: boolean;
  onPlayVideo: () => void;
  onLongPress: () => void;
}) {
  const time = msg.createdAt?.toDate?.() ? formatTime(msg.createdAt.toDate()) : '';
  const isMedia = msg.type === 'image' || msg.type === 'video';

  if (msg.deleted) {
    return (
      <View style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubbleColumn, mine ? styles.colRight : styles.colLeft]}>
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text
              style={[
                styles.deletedText,
                mine && { color: 'rgba(255,255,255,0.85)' },
              ]}>
              🚫 This message was deleted
            </Text>
          </View>
          {time ? <Text style={styles.timeOutside}>{time}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.bubbleColumn, mine ? styles.colRight : styles.colLeft]}>
        <Pressable
          onLongPress={onLongPress}
          onPress={() => {
            if (msg.type === 'document' && msg.documentUrl) {
              Linking.openURL(msg.documentUrl).catch(() => {});
            }
          }}
          delayLongPress={300}
          style={({ pressed }) => [
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            isMedia && styles.bubbleMedia,
            pressed && { opacity: 0.9 },
          ]}>
          {msg.type === 'image' && msg.imageUrl ? (
            <Image source={{ uri: msg.imageUrl }} style={styles.media} resizeMode="cover" />
          ) : null}

          {msg.type === 'video' && msg.videoUrl ? (
            isPlaying ? (
              <Video
                source={{ uri: msg.videoUrl }}
                style={styles.media}
                controls
                paused={false}
                resizeMode="cover"
              />
            ) : (
              <Pressable onPress={onPlayVideo} style={styles.videoPoster}>
                {msg.videoPosterUrl ? (
                  <Image
                    source={{ uri: msg.videoPosterUrl }}
                    style={styles.media}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.media, styles.videoPlaceholder]} />
                )}
                <View style={styles.playButton}>
                  <Text style={styles.playIcon}>▶</Text>
                </View>
              </Pressable>
            )
          ) : null}

          {msg.type === 'document' && msg.documentUrl ? (
            <View style={styles.docRow}>
              <View
                style={[
                  styles.docIconWrap,
                  mine && { backgroundColor: 'rgba(255,255,255,0.18)' },
                ]}>
                <Text style={styles.docIcon}>📄</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.docName,
                    mine ? { color: '#fff' } : { color: colors.text },
                  ]}
                  numberOfLines={1}>
                  {msg.documentName ?? 'Document'}
                </Text>
                <Text
                  style={[
                    styles.docMeta,
                    mine && { color: 'rgba(255,255,255,0.85)' },
                  ]}>
                  {formatBytes(msg.documentSize)}
                  {msg.documentMime ? ` · ${msg.documentMime.split('/').pop()}` : ''} · tap
                  to open
                </Text>
              </View>
            </View>
          ) : null}

          {msg.text ? (
            <Text
              style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
              {msg.text}
            </Text>
          ) : null}
        </Pressable>
        {time ? <Text style={styles.timeOutside}>{time}</Text> : null}
      </View>
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
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return d.toLocaleDateString();
}

function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = h < 10 ? `0${h}` : `${h}`;
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${hh}:${mm}`;
}

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  back: { color: colors.text, fontSize: 30, fontWeight: '300', width: 18 },
  avatarSm: { width: 36, height: 36, borderRadius: 18 },
  avatarSmFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  headerTitle: { color: colors.text, fontSize: fontSize.md + 1, fontWeight: '700' },

  presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.online,
  },
  headerSub: { color: colors.textMuted, fontSize: fontSize.xs + 1, fontWeight: '500' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },

  chatBg: { flex: 1, backgroundColor: colors.surface },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  empty: { color: colors.textMuted },

  listContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },

  dayWrap: { alignItems: 'center', marginVertical: spacing.md },
  dayChip: {
    color: colors.textMuted,
    fontSize: fontSize.xs + 1,
    fontWeight: '600',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    overflow: 'hidden',
  },

  // Row holds the bubble + outside-bubble timestamp in a column
  bubbleRow: { flexDirection: 'row', marginVertical: 4 },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubbleColumn: { maxWidth: '80%' },
  colLeft: { alignItems: 'flex-start' },
  colRight: { alignItems: 'flex-end' },

  bubble: {
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  bubbleTheirs: {
    backgroundColor: colors.surfaceMuted,
    borderBottomLeftRadius: 6,
  },
  // Image / video bubbles drop the inner padding so the media fills the
  // bubble corners.
  bubbleMedia: { padding: 0, overflow: 'hidden' },

  bubbleText: { fontSize: fontSize.md, lineHeight: 21 },
  bubbleTextMine: { color: '#fff' },
  bubbleTextTheirs: { color: colors.text },

  // Time sits below the bubble, on the same side as the bubble.
  timeOutside: {
    fontSize: 11,
    color: colors.text3,
    marginTop: 4,
    marginHorizontal: 4,
  },

  deletedText: {
    fontStyle: 'italic',
    color: colors.textMuted,
    fontSize: fontSize.sm + 1,
  },

  media: {
    width: 240,
    height: 240,
  },
  videoPoster: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  videoPlaceholder: { backgroundColor: '#1F1F2E' },
  playButton: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    top: '50%',
    marginTop: -28,
  },
  playIcon: { color: '#fff', fontSize: 22, marginLeft: 4 },

  // Document bubble row
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 200,
  },
  docIconWrap: {
    width: 40,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(124,58,237,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIcon: { fontSize: 20 },
  docName: { fontSize: fontSize.sm + 1, fontWeight: '700' },
  docMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm + 2,
    backgroundColor: colors.errorBg,
    gap: spacing.sm,
  },
  errorBarText: { flex: 1, color: colors.error, fontSize: fontSize.sm, textAlign: 'center' },
  errorBarClose: { color: colors.error, fontSize: fontSize.md, paddingHorizontal: 4 },

  // Block / report card — dark rounded panel pinned to the bottom edge,
  // matching the Verafied design (screenshot 3 in the user's request).
  blockCard: {
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#18181B',
  },
  blockTitle: {
    color: '#fff',
    fontSize: fontSize.md + 1,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  blockBody: {
    color: '#D4D4D8',
    fontSize: fontSize.sm + 1,
    textAlign: 'center',
    lineHeight: 20,
  },
  blockBodyBold: { color: '#fff', fontWeight: '700' },
  blockActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    gap: spacing.lg,
  },
  blockBtn: { paddingVertical: 6, paddingHorizontal: spacing.md },
  blockSep: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  blockBtnDanger: {
    color: '#F87171',
    fontWeight: '700',
    fontSize: fontSize.md,
  },
  blockBtnPrimary: {
    color: '#fff',
    fontWeight: '700',
    fontSize: fontSize.md,
  },

  // ─── Input bar ────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  attach: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachIcon: {
    fontSize: 24,
    color: colors.text,
    fontWeight: '300',
    lineHeight: 26,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    fontSize: fontSize.md,
    color: colors.text,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
