/**
 * VibeChat Cloud Functions.
 *
 * Currently provides:
 *   - onMessageCreated: fan-out FCM push to room participants and bump the
 *                       per-recipient unread counter on the parent room doc.
 *   - cleanupInvalidFcmTokens: callable that prunes a single bad token (used
 *                              by the client when send returns 'unregistered').
 *
 * Deploy:  firebase deploy --only functions
 * Emulate: npm run serve   (firebase emulators:start)
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

initializeApp();

const db = getFirestore();

interface MessageDoc {
  senderId: string;
  type: 'text' | 'image';
  text?: string | null;
  imageUrl?: string | null;
}

interface RoomDoc {
  participants: string[];
  isGroup?: boolean;
  name?: string;
}

interface UserDoc {
  displayName?: string;
  fcmTokens?: string[];
}

/**
 * When a new message is created, notify every participant except the sender
 * and bump their unread counter.
 *
 * The notification "body" is the message text unless the room is marked
 * private (room.privateNotifications === true), in which case we send a
 * generic placeholder so push previews don't leak content.
 */
export const onMessageCreated = onDocumentCreated(
  'chatRooms/{roomId}/messages/{messageId}',
  async event => {
    const snap = event.data;
    if (!snap) return;

    const message = snap.data() as MessageDoc;
    const { roomId } = event.params;

    const roomRef = db.collection('chatRooms').doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      logger.warn('Room missing for new message', { roomId });
      return;
    }
    const room = roomSnap.data() as RoomDoc & { privateNotifications?: boolean };

    const recipients = room.participants.filter(uid => uid !== message.senderId);
    if (recipients.length === 0) return;

    // 1. Unread counters.
    const unreadUpdates: Record<string, FieldValue> = {};
    for (const uid of recipients) {
      unreadUpdates[`unread.${uid}`] = FieldValue.increment(1);
    }
    await roomRef.update(unreadUpdates);

    // 2. Build notification payload.
    const senderSnap = await db.collection('users').doc(message.senderId).get();
    const sender = (senderSnap.data() as UserDoc | undefined) ?? {};
    const senderName = sender.displayName ?? 'Someone';

    const title = room.isGroup && room.name ? `${senderName} · ${room.name}` : senderName;
    const previewBody =
      message.type === 'image'
        ? 'Sent an image'
        : (message.text ?? '').slice(0, 200) || 'New message';
    const body = room.privateNotifications ? 'You have a new message' : previewBody;

    // 3. Collect tokens for all recipients in parallel.
    const tokenLookups = await Promise.all(
      recipients.map(uid => db.collection('users').doc(uid).get()),
    );
    const tokensByUid = new Map<string, string[]>();
    tokenLookups.forEach((userSnap, idx) => {
      const data = userSnap.data() as UserDoc | undefined;
      const tokens = data?.fcmTokens ?? [];
      if (tokens.length) tokensByUid.set(recipients[idx], tokens);
    });

    const allTokens = [...tokensByUid.values()].flat();
    if (allTokens.length === 0) return;

    const response = await getMessaging().sendEachForMulticast({
      tokens: allTokens,
      notification: { title, body },
      data: {
        roomId,
        messageId: event.params.messageId,
        senderId: message.senderId,
        type: message.type,
      },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    // 4. Prune tokens FCM tells us are dead.
    const tokensToRemove: { uid: string; token: string }[] = [];
    response.responses.forEach((res, i) => {
      if (res.success) return;
      const code = res.error?.code;
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        const token = allTokens[i];
        for (const [uid, tokens] of tokensByUid) {
          if (tokens.includes(token)) {
            tokensToRemove.push({ uid, token });
            break;
          }
        }
      }
    });

    if (tokensToRemove.length) {
      await Promise.all(
        tokensToRemove.map(({ uid, token }) =>
          db.collection('users').doc(uid).update({
            fcmTokens: FieldValue.arrayRemove(token),
          }),
        ),
      );
      logger.info('Pruned stale FCM tokens', { count: tokensToRemove.length });
    }
  },
);

/**
 * Callable used by the client when it discovers (via APNS feedback, etc.)
 * that its own token is no longer valid.
 */
export const cleanupInvalidFcmToken = onCall<{ token: string }>(async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  const token = request.data?.token;
  if (!token) {
    throw new HttpsError('invalid-argument', 'token is required');
  }
  await db.collection('users').doc(request.auth.uid).update({
    fcmTokens: FieldValue.arrayRemove(token),
  });
  return { ok: true };
});
