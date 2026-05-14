/**
 * Data shapes for VibeChat Firestore documents.
 *
 * Note: Firestore Timestamps come through as FirebaseFirestoreTypes.Timestamp
 * on read. When writing, we use serverTimestamp() which is FieldValue. Use the
 * `WithServerTimestamp` helper when you need a write payload type.
 */

import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type Timestamp = FirebaseFirestoreTypes.Timestamp;

/** Replace timestamp-typed fields with FieldValue for write payloads. */
export type WithServerTimestamp<T> = {
  [K in keyof T]: T[K] extends Timestamp | undefined
    ? FirebaseFirestoreTypes.FieldValue | Timestamp | undefined
    : T[K];
};

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  fcmTokens?: string[]; // a user may sign in on multiple devices
  /** Presence: written by presenceService on AppState changes. */
  online?: boolean;
  lastSeenAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * 1:1 or group chat room.
 * `participants` is the array we filter on in security rules and queries.
 */
export interface ChatRoom {
  id: string;
  participants: string[]; // uids
  isGroup: boolean;
  name?: string; // group name; for 1:1 we compute from the other participant
  lastMessage?: {
    text: string;
    senderId: string;
    createdAt: Timestamp;
  };
  /** Per-user unread counters maintained by Cloud Function. */
  unread?: Record<string, number>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type MessageType = 'text' | 'image';

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  type: MessageType;
  text?: string;
  imageUrl?: string;
  /** True once the sender soft-deletes the message. */
  deleted?: boolean;
  createdAt?: Timestamp;
}
