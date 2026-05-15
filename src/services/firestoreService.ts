/**
 * Firestore service for users, chat rooms, and messages.
 *
 * All real-time reads are exposed as `subscribeXxx(...)` functions that return
 * the unsubscribe handle from onSnapshot, mirroring the auth service pattern.
 */

import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import {
  firebaseFirestore,
  COLLECTIONS,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from '../config/firebase';
import type { ChatMessage, ChatRoom, MessageType, UserProfile } from '../types/models';

type DocSnap = FirebaseFirestoreTypes.DocumentSnapshot;
type QuerySnap = FirebaseFirestoreTypes.QuerySnapshot;

// ─── Users ────────────────────────────────────────────────────────────────

/**
 * Page through users for pickers (e.g. Create Group). Excludes `excludeUid`.
 * No server-side text search — small directories should be fine; for larger
 * apps, add Algolia / Typesense.
 */
export async function listUsers(
  excludeUid: string,
  limit = 50,
): Promise<UserProfile[]> {
  const snap = await firebaseFirestore()
    .collection(COLLECTIONS.USERS)
    .orderBy('displayName')
    .limit(limit)
    .get();
  const out: UserProfile[] = [];
  snap.docs.forEach(d => {
    if (d.id === excludeUid) return;
    out.push({ uid: d.id, ...(d.data() as Omit<UserProfile, 'uid'>) });
  });
  return out;
}

/**
 * Direct user search by free-text query. Used by the New Chat screen so
 * the user can find someone even if that someone isn't in their address book.
 *
 * Strategy:
 *   • If the query looks like an email → exact match on `email`.
 *   • If the query contains 10+ digits → exact match on `phoneLast10`
 *     (the trailing 10 digits, which is what we index).
 *   • Otherwise we fall back to a `displayName` prefix range query.
 *     Firestore range queries are case-sensitive, so we additionally
 *     pull the first 50 users and filter client-side for substring +
 *     case-insensitive matches. Good enough for dev scale; swap to an
 *     external index (Algolia / Typesense) when the user table grows.
 *
 * `excludeUid` is dropped from results — typically the current user, so
 * the searcher doesn't see themselves.
 */
export async function searchVibeChatUsers(
  query: string,
  excludeUid: string,
): Promise<UserProfile[]> {
  const q = query.trim();
  if (!q) return [];
  const digits = q.replace(/\D/g, '');
  const looksLikeEmail = q.includes('@');

  const results = new Map<string, UserProfile>();

  // 1. Email exact match.
  if (looksLikeEmail) {
    const snap = await firebaseFirestore()
      .collection(COLLECTIONS.USERS)
      .where('email', '==', q.toLowerCase())
      .limit(5)
      .get();
    snap.docs.forEach(d => {
      if (d.id === excludeUid) return;
      results.set(d.id, { uid: d.id, ...(d.data() as Omit<UserProfile, 'uid'>) });
    });
  }

  // 2. Phone exact match against the last-10-digit slug.
  if (digits.length >= 10) {
    const slug = digits.slice(-10);
    const snap = await firebaseFirestore()
      .collection(COLLECTIONS.USERS)
      .where('phoneLast10', '==', slug)
      .limit(5)
      .get();
    snap.docs.forEach(d => {
      if (d.id === excludeUid) return;
      results.set(d.id, { uid: d.id, ...(d.data() as Omit<UserProfile, 'uid'>) });
    });
  }

  // 3. Name / catch-all client-side filter against the first 50 users.
  if (!looksLikeEmail || results.size === 0) {
    const snap = await firebaseFirestore()
      .collection(COLLECTIONS.USERS)
      .orderBy('displayName')
      .limit(50)
      .get();
    const lower = q.toLowerCase();
    snap.docs.forEach(d => {
      if (d.id === excludeUid) return;
      const data = d.data() as Omit<UserProfile, 'uid'>;
      const name = (data.displayName ?? '').toLowerCase();
      const email = (data.email ?? '').toLowerCase();
      const phone = data.phoneNumber ?? '';
      if (
        name.includes(lower) ||
        email.includes(lower) ||
        (digits && phone.replace(/\D/g, '').includes(digits))
      ) {
        results.set(d.id, { uid: d.id, ...data });
      }
    });
  }

  return Array.from(results.values());
}

/**
 * Match device contacts against VibeChat users.
 *
 * Firestore `in` queries are capped at 30 values per query, so we batch.
 * Returns a `Map` keyed by both lowercased email AND `phoneLast10`, so the
 * caller can look up a contact by whichever field it has.
 */
export async function findUsersForContacts(
  emails: string[],
  phoneLast10s: string[],
): Promise<Map<string, UserProfile>> {
  const out = new Map<string, UserProfile>();
  const CHUNK = 30;

  function chunk<T>(arr: T[]): T[][] {
    const o: T[][] = [];
    for (let i = 0; i < arr.length; i += CHUNK) o.push(arr.slice(i, i + CHUNK));
    return o;
  }

  const normalizedEmails = Array.from(new Set(emails.map(e => e.toLowerCase()))).filter(Boolean);
  const normalizedPhones = Array.from(new Set(phoneLast10s)).filter(Boolean);

  const queries: Promise<FirebaseFirestoreTypes.QuerySnapshot>[] = [];
  for (const batch of chunk(normalizedEmails)) {
    queries.push(
      firebaseFirestore()
        .collection(COLLECTIONS.USERS)
        .where('email', 'in', batch)
        .get(),
    );
  }
  for (const batch of chunk(normalizedPhones)) {
    queries.push(
      firebaseFirestore()
        .collection(COLLECTIONS.USERS)
        .where('phoneLast10', 'in', batch)
        .get(),
    );
  }

  const snaps = await Promise.all(queries);
  for (const snap of snaps) {
    snap.docs.forEach(d => {
      const profile: UserProfile = { uid: d.id, ...(d.data() as Omit<UserProfile, 'uid'>) };
      if (profile.email) out.set(profile.email.toLowerCase(), profile);
      if (profile.phoneLast10) out.set(profile.phoneLast10, profile);
    });
  }
  return out;
}

/**
 * Lookup a user profile by their email address (case-insensitive on input).
 * Returns null if nobody owns that address. Requires that the `users`
 * collection has `email` populated (we do this on registration).
 */
export async function findUserByEmail(email: string): Promise<UserProfile | null> {
  const normalized = email.trim().toLowerCase();
  const snap = await firebaseFirestore()
    .collection(COLLECTIONS.USERS)
    .where('email', '==', normalized)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, ...(doc.data() as Omit<UserProfile, 'uid'>) };
}

/**
 * Realtime user profile subscription. Used by the auth flow to detect when
 * the profile is "complete" (e.g. has a phoneNumber) and gate access to the
 * rest of the app behind a one-time profile completion screen.
 */
export function subscribeUserProfile(
  uid: string,
  onChange: (profile: UserProfile | null) => void,
  onError?: (e: Error) => void,
): () => void {
  return firebaseFirestore()
    .collection(COLLECTIONS.USERS)
    .doc(uid)
    .onSnapshot(
      snap => {
        if (!snap.exists) {
          onChange(null);
          return;
        }
        onChange({ uid: snap.id, ...(snap.data() as Omit<UserProfile, 'uid'>) });
      },
      err => onError?.(err as Error),
    );
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await firebaseFirestore().collection(COLLECTIONS.USERS).doc(uid).get();
  // NOTE: in @react-native-firebase's namespaced API, `exists` is a property
  // (not a method like in the v9 modular SDK).
  return snap.exists ? ({ uid, ...(snap.data() as Omit<UserProfile, 'uid'>) }) : null;
}

/** Compute the last-10-digit slug we index against for contact matching. */
export function phoneLast10Of(phone: string | undefined | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return undefined;
  return digits.slice(-10);
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<UserProfile, 'displayName' | 'photoURL' | 'phoneNumber'>>,
): Promise<void> {
  // Strip undefined values — Firestore throws "Unsupported field value:
  // undefined" otherwise.
  const cleaned: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) cleaned[k] = v;
  }
  // Keep the derived index column in sync.
  if (patch.phoneNumber !== undefined) {
    const last10 = phoneLast10Of(patch.phoneNumber);
    if (last10) cleaned.phoneLast10 = last10;
  }
  await firebaseFirestore()
    .collection(COLLECTIONS.USERS)
    .doc(uid)
    .update(cleaned);
}

export async function addFcmToken(uid: string, token: string): Promise<void> {
  await firebaseFirestore()
    .collection(COLLECTIONS.USERS)
    .doc(uid)
    .set({ fcmTokens: arrayUnion(token), updatedAt: serverTimestamp() }, { merge: true });
}

export async function removeFcmToken(uid: string, token: string): Promise<void> {
  await firebaseFirestore()
    .collection(COLLECTIONS.USERS)
    .doc(uid)
    .update({ fcmTokens: arrayRemove(token), updatedAt: serverTimestamp() });
}

// ─── Chat rooms ───────────────────────────────────────────────────────────

/**
 * Stable composite ID for 1:1 rooms so we don't create duplicates when
 * either user opens the room first. Group rooms get a Firestore auto-id.
 */
export function oneToOneRoomId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

export async function ensureOneToOneRoom(currentUid: string, otherUid: string): Promise<string> {
  const roomId = oneToOneRoomId(currentUid, otherUid);
  const ref = firebaseFirestore().collection(COLLECTIONS.CHAT_ROOMS).doc(roomId);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      participants: [currentUid, otherUid],
      isGroup: false,
      unread: { [currentUid]: 0, [otherUid]: 0 },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return roomId;
}

export async function createGroupRoom(
  creatorUid: string,
  participantUids: string[],
  name: string,
): Promise<string> {
  const participants = Array.from(new Set([creatorUid, ...participantUids]));
  const unread = Object.fromEntries(participants.map(uid => [uid, 0]));
  const ref = await firebaseFirestore().collection(COLLECTIONS.CHAT_ROOMS).add({
    participants,
    isGroup: true,
    name,
    unread,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Real-time list of rooms the current user is in, newest activity first.
 *
 * We intentionally do NOT use `.orderBy('updatedAt', 'desc')` on the server:
 * combining it with `where('participants', 'array-contains', uid)` requires
 * a composite index that has to be deployed before the app works at all.
 * The per-user room count is small, so we sort client-side instead. If you
 * ever expect 100s+ of rooms per user, deploy `firebase/firestore.indexes.json`
 * and swap the order back in.
 */
export function subscribeUserRooms(
  uid: string,
  onChange: (rooms: ChatRoom[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return firebaseFirestore()
    .collection(COLLECTIONS.CHAT_ROOMS)
    .where('participants', 'array-contains', uid)
    .onSnapshot(
      (snap: QuerySnap) => {
        const rooms: ChatRoom[] = snap.docs.map((d: DocSnap) => ({
          id: d.id,
          ...(d.data() as Omit<ChatRoom, 'id'>),
        }));
        rooms.sort((a, b) => {
          // Newly-created rooms can briefly have `updatedAt === null` while
          // the server timestamp is pending. Treat null as "now" so they
          // appear at the top instead of being dropped to the bottom.
          const aMs = a.updatedAt?.toMillis?.() ?? Date.now();
          const bMs = b.updatedAt?.toMillis?.() ?? Date.now();
          return bMs - aMs;
        });
        onChange(rooms);
      },
      err => onError?.(err as Error),
    );
}

// ─── Messages ─────────────────────────────────────────────────────────────

function messagesCollection(roomId: string) {
  return firebaseFirestore()
    .collection(COLLECTIONS.CHAT_ROOMS)
    .doc(roomId)
    .collection(COLLECTIONS.MESSAGES);
}

interface SendMessageInput {
  roomId: string;
  senderId: string;
  type: MessageType;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  videoPosterUrl?: string;
}

export async function sendMessage(input: SendMessageInput): Promise<string> {
  const { roomId, senderId, type, text, imageUrl, videoUrl, videoPosterUrl } = input;
  if (type === 'text' && !text?.trim()) {
    throw new Error('Text message cannot be empty');
  }
  if (type === 'image' && !imageUrl) {
    throw new Error('Image message must include imageUrl');
  }
  if (type === 'video' && !videoUrl) {
    throw new Error('Video message must include videoUrl');
  }

  const batch = firebaseFirestore().batch();
  const msgRef = messagesCollection(roomId).doc();
  const roomRef = firebaseFirestore().collection(COLLECTIONS.CHAT_ROOMS).doc(roomId);

  batch.set(msgRef, {
    senderId,
    type,
    text: text ?? null,
    imageUrl: imageUrl ?? null,
    videoUrl: videoUrl ?? null,
    videoPosterUrl: videoPosterUrl ?? null,
    createdAt: serverTimestamp(),
  });

  const previewText =
    type === 'image' ? '📷 Photo' : type === 'video' ? '🎥 Video' : (text ?? '');

  // We also update the room preview here for fast UI; the unread counter is
  // bumped by the Cloud Function so security rules can stay strict.
  batch.update(roomRef, {
    lastMessage: {
      text: previewText,
      senderId,
      createdAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return msgRef.id;
}

/** Real-time message feed for a room, oldest → newest with a sane cap. */
export function subscribeRoomMessages(
  roomId: string,
  onChange: (messages: ChatMessage[]) => void,
  options: { limit?: number; onError?: (e: Error) => void } = {},
): () => void {
  const { limit = 100, onError } = options;
  return messagesCollection(roomId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .onSnapshot(
      (snap: QuerySnap) => {
        const messages: ChatMessage[] = snap.docs
          .map((d: DocSnap) => ({
            id: d.id,
            roomId,
            ...(d.data() as Omit<ChatMessage, 'id' | 'roomId'>),
          }))
          .reverse(); // present chronologically to the UI
        onChange(messages);
      },
      err => onError?.(err as Error),
    );
}

/** Reset the unread counter for the current user when they open a room. */
export async function markRoomRead(roomId: string, uid: string): Promise<void> {
  await firebaseFirestore()
    .collection(COLLECTIONS.CHAT_ROOMS)
    .doc(roomId)
    .update({ [`unread.${uid}`]: 0 });
}

/**
 * Realtime presence for a single user. Used in the chat header to show
 * "online" / "last seen ...".
 */
export function subscribeUserPresence(
  uid: string,
  onChange: (presence: { online: boolean; lastSeenMs: number | null }) => void,
): () => void {
  return firebaseFirestore()
    .collection(COLLECTIONS.USERS)
    .doc(uid)
    .onSnapshot(snap => {
      const data = snap.data() as Partial<UserProfile> | undefined;
      onChange({
        online: !!data?.online,
        lastSeenMs: data?.lastSeenAt?.toMillis?.() ?? null,
      });
    });
}

/**
 * Soft-delete a message: blanks `text`/`imageUrl` and flips `deleted: true`.
 * Security rules only allow this transition when the caller is the sender,
 * so we don't need a Cloud Function.
 */
export async function softDeleteMessage(roomId: string, messageId: string): Promise<void> {
  await firebaseFirestore()
    .collection(COLLECTIONS.CHAT_ROOMS)
    .doc(roomId)
    .collection(COLLECTIONS.MESSAGES)
    .doc(messageId)
    .update({ deleted: true, text: null, imageUrl: null });
}
