/**
 * Call signaling service. Uses a top-level `calls/{callId}` Firestore
 * collection plus two ICE-candidate sub-collections per call. WebRTC media
 * is peer-to-peer (free) — Firestore only carries SDP + ICE.
 *
 * Lifecycle:
 *   1. Caller creates the doc with `status: 'ringing'`.
 *   2. Callee subscribes to incoming-call queries, sees the doc, accepts
 *      → flips status to 'accepted'.
 *   3. useWebRTCPeer on both sides exchanges offer/answer + ICE via the
 *      same doc.
 *   4. Either side hangs up → status becomes 'ended' + endedAt timestamp.
 *      A best-effort delete cleans up the doc 10 s later.
 */

import { firebaseFirestore, serverTimestamp } from '../config/firebase';
import type { CallDoc, CallStatus, CallType } from '../types/models';

const CALLS = 'calls';

export async function startCall(
  callerUid: string,
  calleeUid: string,
  type: CallType,
): Promise<string> {
  const ref = await firebaseFirestore().collection(CALLS).add({
    callerUid,
    calleeUid,
    type,
    status: 'ringing' as CallStatus,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function acceptCall(callId: string): Promise<void> {
  await firebaseFirestore().collection(CALLS).doc(callId).update({
    status: 'accepted',
    acceptedAt: serverTimestamp(),
  });
}

export async function declineCall(callId: string): Promise<void> {
  await firebaseFirestore().collection(CALLS).doc(callId).update({
    status: 'declined',
    endedAt: serverTimestamp(),
  });
  // Clean up doc shortly after — frees the calls collection from old rows.
  setTimeout(() => {
    firebaseFirestore().collection(CALLS).doc(callId).delete().catch(() => {});
  }, 10_000);
}

export async function endCall(callId: string): Promise<void> {
  try {
    await firebaseFirestore().collection(CALLS).doc(callId).update({
      status: 'ended',
      endedAt: serverTimestamp(),
    });
  } catch {
    // Doc may already be gone (other side ended first).
  }
  setTimeout(() => {
    firebaseFirestore().collection(CALLS).doc(callId).delete().catch(() => {});
  }, 10_000);
}

/**
 * Subscribe to ringing calls addressed to me. Used by the global incoming-
 * call overlay in App.tsx.
 */
export function subscribeIncomingCalls(
  myUid: string,
  onChange: (call: CallDoc | null) => void,
): () => void {
  return firebaseFirestore()
    .collection(CALLS)
    .where('calleeUid', '==', myUid)
    .where('status', '==', 'ringing')
    .onSnapshot(snap => {
      // Most-recent ringing call wins — usually there's only one.
      const doc = snap.docs[0];
      if (!doc) {
        onChange(null);
        return;
      }
      onChange({ id: doc.id, ...(doc.data() as Omit<CallDoc, 'id'>) });
    });
}

/** Live subscription to a specific call doc. */
export function subscribeCall(
  callId: string,
  onChange: (call: CallDoc | null) => void,
): () => void {
  return firebaseFirestore()
    .collection(CALLS)
    .doc(callId)
    .onSnapshot(snap => {
      if (!snap.exists) {
        onChange(null);
        return;
      }
      onChange({ id: snap.id, ...(snap.data() as Omit<CallDoc, 'id'>) });
    });
}
