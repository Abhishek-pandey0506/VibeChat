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
  phoneNumber?: string;
  /** Last 10 digits of phoneNumber, indexed so the contact-matcher can do
   *  a single `where('phoneLast10', 'in', [...])` query irrespective of
   *  how each device formats its address-book entries. */
  phoneLast10?: string;
  fcmTokens?: string[]; // a user may sign in on multiple devices
  /** UIDs this user has blocked. They can't send the blocker new messages
   *  through the client, and the blocker's UI hides their chats. */
  blockedUsers?: string[];
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
  /** Group photo URL (groups only). */
  photoURL?: string;
  /** Subset of `participants` who can manage the group (add/remove/rename/delete). */
  admins?: string[];
  /** UID who originally created the group — preserved even if they leave. */
  createdBy?: string;
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

export type MessageType = 'text' | 'image' | 'video' | 'document';

export type CallType = 'voice' | 'video';
export type CallStatus =
  | 'ringing'   // caller wrote the doc; callee not yet seen it
  | 'accepted'  // callee tapped accept; peers exchanging SDP/ICE
  | 'live'      // both sides have remote stream attached
  | 'declined'
  | 'missed'
  | 'ended';

export interface CallDoc {
  id: string;
  callerUid: string;
  calleeUid: string;
  type: CallType;
  status: CallStatus;
  /** SDP offer from caller. */
  offer?: { sdp: string; type: string };
  /** SDP answer from callee. */
  answer?: { sdp: string; type: string };
  createdAt?: Timestamp;
  acceptedAt?: Timestamp;
  endedAt?: Timestamp;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  type: MessageType;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  /** Optional poster image for video messages (first frame). */
  videoPosterUrl?: string;
  /** Document attachment metadata. */
  documentUrl?: string;
  documentName?: string;
  documentSize?: number; // bytes
  documentMime?: string;
  /** True once the sender soft-deletes the message. */
  deleted?: boolean;
  createdAt?: Timestamp;
}
