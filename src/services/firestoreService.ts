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

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await firebaseFirestore().collection(COLLECTIONS.USERS).doc(uid).get();
  // NOTE: in @react-native-firebase's namespaced API, `exists` is a property
  // (not a method like in the v9 modular SDK).
  return snap.exists ? ({ uid, ...(snap.data() as Omit<UserProfile, 'uid'>) }) : null;
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<UserProfile, 'displayName' | 'photoURL'>>,
): Promise<void> {
  await firebaseFirestore()
    .collection(COLLECTIONS.USERS)
    .doc(uid)
    .update({ ...patch, updatedAt: serverTimestamp() });
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
}

export async function sendMessage(input: SendMessageInput): Promise<string> {
  const { roomId, senderId, type, text, imageUrl } = input;
  if (type === 'text' && !text?.trim()) {
    throw new Error('Text message cannot be empty');
  }
  if (type === 'image' && !imageUrl) {
    throw new Error('Image message must include imageUrl');
  }

  const batch = firebaseFirestore().batch();
  const msgRef = messagesCollection(roomId).doc();
  const roomRef = firebaseFirestore().collection(COLLECTIONS.CHAT_ROOMS).doc(roomId);

  batch.set(msgRef, {
    senderId,
    type,
    text: text ?? null,
    imageUrl: imageUrl ?? null,
    createdAt: serverTimestamp(),
  });

  // We also update the room preview here for fast UI; the unread counter is
  // bumped by the Cloud Function so security rules can stay strict.
  batch.update(roomRef, {
    lastMessage: {
      text: type === 'image' ? '[image]' : text,
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
