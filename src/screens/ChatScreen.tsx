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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import Video from 'react-native-video';
import { createThumbnail } from 'react-native-create-thumbnail';
import { pick, types as DocTypes } from '@react-native-documents/picker';
import { useAuthContext } from '../contexts/AuthContext';
import {
  getUserProfile,
  markRoomRead,
  sendMessage,
  softDeleteMessage,
  subscribeBlockRelation,
  subscribeRoomMessages,
  subscribeUserPresence,
} from '../services/firestoreService';
import {
  uploadChatDocument,
  uploadChatImage,
  uploadChatVideo,
} from '../services/storageService';
import { formatLastSeen } from '../services/presenceService';
import { colors, fontSize, radius, spacing } from '../theme';
import type { ChatMessage, UserProfile } from '../types/models';

const MAX_VIDEO_BYTES = 20 * 1024 * 1024; // 20 MB

interface Props {
  roomId: string;
  title: string;
  /** uid of the other 1:1 participant, if known. Drives presence in header. */
  otherUid?: string;
  onBack: () => void;
  onOpenPeerProfile?: (otherUid: string) => void;
  /** Tapping the header on a group chat opens the GroupProfileScreen. */
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
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [presenceLabel, setPresenceLabel] = useState<string | null>(null);
  const [peer, setPeer] = useState<UserProfile | null>(null);
  const [block, setBlock] = useState({ iBlocked: false, theyBlocked: false });
  const listRef = useRef<FlatList<Row>>(null);

  // Fetch the peer profile once for the header avatar.
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
    // Clear any stale error from a previous mount.
    setError('');
    const unsub = subscribeRoomMessages(
      roomId,
      next => {
        setMessages(next);
        setLoading(false);
      },
      {
        onError: e => {
          // Surface Firestore/permission errors that the user can act on,
          // but silently log infrastructure noise like
          // `storage/object-not-found` (a stale URL pointing to a deleted
          // Storage object) — there's nothing the user can do about those
          // from the chat view, and the bubble's Image silently falls
          // back anyway.
          console.warn('[ChatScreen] message subscription error', e);
          if (!/^\[?storage\//i.test(e.message)) {
            setError(e.message);
          }
          setLoading(false);
        },
      },
    );
    markRoomRead(roomId, currentUser.uid).catch(() => {});
    return unsub;
  }, [roomId, currentUser.uid]);

  // Auto-dismiss the error bar after 4 seconds so it never sticks around.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 4000);
    return () => clearTimeout(t);
  }, [error]);

  /**
   * Wrap setError so background "object-not-found" noise never makes it to
   * the user. Real failures from user-initiated actions still get through.
   */
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
      return;
    }
    const unsub = subscribeUserPresence(otherUid, ({ online, lastSeenMs }) => {
      setPresenceLabel(online ? 'online' : formatLastSeen(lastSeenMs));
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
      const url = await uploadChatImage(roomId, currentUser.uid, asset.uri);
      await sendMessage({ roomId, senderId: currentUser.uid, type: 'image', imageUrl: url });
    } catch (e: any) {
      reportError(e?.message ?? 'Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleCameraCapture() {
    const result = await launchCamera({
      mediaType: 'photo',
      quality: 0.85,
      saveToPhotos: true,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setUploadingImage(true);
    setError('');
    try {
      const url = await uploadChatImage(roomId, currentUser.uid, asset.uri);
      await sendMessage({ roomId, senderId: currentUser.uid, type: 'image', imageUrl: url });
    } catch (e: any) {
      reportError(e?.message ?? 'Camera upload failed.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handlePickAndSendVideo() {
    const result = await launchImageLibrary({
      mediaType: 'video',
      selectionLimit: 1,
      videoQuality: 'medium',
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    if (asset.fileSize && asset.fileSize > MAX_VIDEO_BYTES) {
      const mb = (asset.fileSize / (1024 * 1024)).toFixed(1);
      Alert.alert('Video too large', `That file is ${mb} MB. Maximum is 20 MB.`);
      return;
    }
    setUploadingVideo(true);
    setError('');
    try {
      let posterUri: string | undefined;
      try {
        const thumb = await createThumbnail({ url: asset.uri, timeStamp: 1000 });
        posterUri = thumb.path;
      } catch {
        // ignore
      }
      const { videoUrl, posterUrl } = await uploadChatVideo(
        roomId,
        currentUser.uid,
        asset.uri,
        { posterUri },
      );
      await sendMessage({
        roomId,
        senderId: currentUser.uid,
        type: 'video',
        videoUrl,
        videoPosterUrl: posterUrl,
      });
    } catch (e: any) {
      reportError(e?.message ?? 'Video upload failed.');
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handlePickAndSendDocument() {
    let picked;
    try {
      const result = await pick({
        type: [DocTypes.pdf, DocTypes.docx, DocTypes.allFiles],
        allowMultiSelection: false,
      });
      picked = result[0];
    } catch (e: any) {
      // User cancelled is a normal exit.
      if (e?.code === 'DOCUMENT_PICKER_CANCELED' || /cancel/i.test(e?.message ?? '')) return;
      reportError(e?.message ?? 'Could not open file picker.');
      return;
    }
    if (!picked?.uri) return;

    setUploadingDoc(true);
    setError('');
    try {
      const url = await uploadChatDocument(roomId, currentUser.uid, picked.uri, {
        contentType: picked.type ?? 'application/octet-stream',
        filename: picked.name ?? undefined,
      });
      await sendMessage({
        roomId,
        senderId: currentUser.uid,
        type: 'document',
        documentUrl: url,
        documentName: picked.name ?? 'Document',
        documentSize: picked.size ?? undefined,
        documentMime: picked.type ?? undefined,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Document upload failed.');
    } finally {
      setUploadingDoc(false);
    }
  }

  function showAttachmentSheet() {
    if (uploadingImage || uploadingVideo || uploadingDoc || composeDisabled) return;
    const actions: { label: string; action: () => void }[] = [
      { label: 'Photo', action: handlePickAndSendImage },
      { label: 'Camera', action: handleCameraCapture },
      { label: 'Video', action: handlePickAndSendVideo },
      { label: 'Document', action: handlePickAndSendDocument },
    ];

    if (Platform.OS === 'ios') {
      const labels = [...actions.map(a => a.label), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        { options: labels, cancelButtonIndex: labels.length - 1, title: 'Send attachment' },
        idx => {
          if (idx >= 0 && idx < actions.length) actions[idx].action();
        },
      );
    } else {
      Alert.alert(
        'Send attachment',
        undefined,
        [
          ...actions.map(a => ({ text: a.label, onPress: a.action })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
        { cancelable: true },
      );
    }
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
    // While I have them blocked, hide their messages entirely.
    return rows.filter(r => r.kind === 'day' || r.msg.senderId === currentUser.uid);
  }, [rows, block.iBlocked, currentUser.uid]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // 'height' avoids the FlatList getting clipped off-screen on Android
      // (the bug visible in the user's screenshot where the input bar
      // disappears under the keyboard).
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      <Pressable
        onPress={() => {
          if (otherUid && onOpenPeerProfile) onOpenPeerProfile(otherUid);
          else if (!otherUid && onOpenGroupProfile) onOpenGroupProfile();
        }}
        disabled={otherUid ? !onOpenPeerProfile : !onOpenGroupProfile}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.85 }]}>
        <Pressable onPress={onBack} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        {peer?.photoURL ? (
          <Image source={{ uri: peer.photoURL }} style={styles.avatarSm} />
        ) : (
          <View style={[styles.avatarSm, styles.avatarSmFallback]}>
            <Text style={styles.avatarSmText}>{title.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {presenceLabel ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {block.iBlocked ? 'blocked' : presenceLabel}
            </Text>
          ) : null}
        </View>
        {(otherUid && onOpenPeerProfile) || (!otherUid && onOpenGroupProfile) ? (
          <Text style={styles.headerChevron}>›</Text>
        ) : null}
      </Pressable>

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
          <Text style={styles.errorBarText} numberOfLines={2}>{error}</Text>
          <Text style={styles.errorBarClose}>✕</Text>
        </Pressable>
      ) : null}

      {composeDisabled ? (
        <View style={styles.blockedBar}>
          <Text style={styles.blockedBarText}>
            {block.iBlocked
              ? 'You blocked this user. Tap the header to unblock.'
              : 'You can no longer message this user.'}
          </Text>
        </View>
      ) : (
        <View style={styles.inputBar}>
          <Pressable
            onPress={showAttachmentSheet}
            disabled={uploadingImage || uploadingVideo || uploadingDoc}
            hitSlop={6}
            style={({ pressed }) => [styles.attach, pressed && { opacity: 0.6 }]}>
            {uploadingImage || uploadingVideo || uploadingDoc ? (
              <ActivityIndicator color={colors.primary} />
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
  const time = msg.createdAt?.toDate?.()
    ? formatTime(msg.createdAt.toDate())
    : '';
  const textColor = mine ? styles.bubbleTextMine : styles.bubbleTextTheirs;
  const timeColor = mine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs;

  if (msg.deleted) {
    return (
      <View style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.deletedText, mine && { color: 'rgba(255,255,255,0.85)' }]}>
            🚫 This message was deleted
          </Text>
          {time ? <Text style={[styles.bubbleTime, timeColor]}>{time}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
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
                <Image source={{ uri: msg.videoPosterUrl }} style={styles.media} resizeMode="cover" />
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
            <View style={[styles.docIconWrap, mine && { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <Text style={styles.docIcon}>📄</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.docName, mine && { color: '#fff' }]}
                numberOfLines={1}>
                {msg.documentName ?? 'Document'}
              </Text>
              <Text
                style={[styles.docMeta, mine && { color: 'rgba(255,255,255,0.85)' }]}>
                {formatBytes(msg.documentSize)}{msg.documentMime ? ` · ${msg.documentMime.split('/').pop()}` : ''} · tap to open
              </Text>
            </View>
          </View>
        ) : null}

        {msg.text ? <Text style={[styles.bubbleText, textColor]}>{msg.text}</Text> : null}
        {time ? <Text style={[styles.bubbleTime, timeColor]}>{time}</Text> : null}
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

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
  },
  avatarSmFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmText: { color: colors.headerText, fontWeight: '700', fontSize: 15 },
  headerTitle: { color: colors.headerText, fontSize: fontSize.lg - 1, fontWeight: '700' },
  headerSub: { color: colors.headerSub, fontSize: fontSize.xs + 1, marginTop: 1 },
  headerChevron: {
    color: colors.headerSub,
    fontSize: 22,
    paddingHorizontal: 4,
    fontWeight: '300',
  },

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
  bubbleText: { fontSize: fontSize.md, lineHeight: 20 },
  bubbleTextMine: { color: colors.bubbleMineText },
  bubbleTextTheirs: { color: colors.bubbleTheirsText },
  bubbleTime: { fontSize: 10, alignSelf: 'flex-end', marginTop: 2 },
  bubbleTimeMine: { color: colors.bubbleMeta },
  bubbleTimeTheirs: { color: colors.bubbleMetaTheirs },
  deletedText: { fontStyle: 'italic', color: colors.textMuted, fontSize: fontSize.sm + 1 },

  media: {
    width: 220,
    height: 220,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
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

  // Document bubble row (file icon + name + meta)
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 200,
    marginBottom: spacing.xs,
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
  docName: {
    fontSize: fontSize.sm + 1,
    fontWeight: '700',
    color: colors.text,
  },
  docMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },

  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm + 2,
    backgroundColor: colors.errorBg,
    gap: spacing.sm,
  },
  errorBarText: { flex: 1, color: colors.error, fontSize: fontSize.sm, textAlign: 'center' },
  errorBarClose: { color: colors.error, fontSize: fontSize.md, paddingHorizontal: 4 },

  blockedBar: {
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  blockedBarText: {
    color: colors.textMuted,
    fontSize: fontSize.sm + 1,
    textAlign: 'center',
    fontWeight: '600',
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#9CB7B0' },
  sendText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: fontSize.lg },
});
