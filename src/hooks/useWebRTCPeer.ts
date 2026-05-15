/**
 * useWebRTCPeer — hooks an RTCPeerConnection into the Firestore-backed
 * signaling we set up in callService. Caller writes the offer + listens for
 * the answer; callee reads the offer + writes the answer. Both sides stream
 * their ICE candidates into the matching subcollection.
 *
 * Returns:
 *   - localStream / remoteStream: MediaStreams to render with <RTCView>.
 *   - state: 'idle' | 'connecting' | 'live' | 'ended'.
 *   - controls: toggleMute, toggleSpeaker, switchCamera, hangUp.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import { firebaseFirestore } from '../config/firebase';
import { endCall as svcEndCall } from '../services/callService';
import type { CallType } from '../types/models';

const CALLS = 'calls';

/**
 * Public STUN servers + an OpenRelay fallback TURN so the call connects
 * even for users behind symmetric NATs. Swap the OpenRelay creds for your
 * own self-hosted coturn / Cloudflare / Twilio TURN when you outgrow it.
 */
const ICE_SERVERS = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

export type CallSide = 'caller' | 'callee';
export type CallState = 'idle' | 'connecting' | 'live' | 'ended';

interface Options {
  callId: string;
  side: CallSide;
  type: CallType;
  /** Auto-tear-down when the parent component unmounts. */
  autoTeardown?: boolean;
}

export function useWebRTCPeer({ callId, side, type, autoTeardown = true }: Options) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<CallState>('idle');
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(type === 'video');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const cleanupFnsRef = useRef<Array<() => void>>([]);

  const teardown = useCallback(async () => {
    cleanupFnsRef.current.forEach(fn => {
      try {
        fn();
      } catch {
        // ignore
      }
    });
    cleanupFnsRef.current = [];

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(t => t.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);

    pcRef.current?.close();
    pcRef.current = null;

    try {
      InCallManager.stop();
    } catch {
      // ignore
    }
    setState('ended');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream, remoteStream]);

  const hangUp = useCallback(async () => {
    await teardown();
    await svcEndCall(callId).catch(() => {});
  }, [callId, teardown]);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => {
      t.enabled = muted; // we're about to flip — current 'muted' means enable
    });
    setMuted(m => !m);
  }, [localStream, muted]);

  const toggleSpeaker = useCallback(() => {
    try {
      InCallManager.setForceSpeakerphoneOn(!speakerOn);
    } catch {
      // ignore
    }
    setSpeakerOn(s => !s);
  }, [speakerOn]);

  const switchCamera = useCallback(() => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach(t => {
      // @ts-expect-error: react-native-webrtc's MediaStreamTrack exposes this.
      t._switchCamera?.();
    });
  }, [localStream]);

  // ─── Main effect: set up peer connection + signaling ────────────────
  useEffect(() => {
    let cancelled = false;
    setState('connecting');

    // Tell the OS we're starting a call so the proximity sensor / audio
    // routing behaves correctly. `start` accepts 'audio' | 'video'.
    try {
      InCallManager.start({ media: type === 'video' ? 'video' : 'audio' });
      InCallManager.setKeepScreenOn(type === 'video');
      if (type === 'video') InCallManager.setForceSpeakerphoneOn(true);
    } catch {
      // ignore — manager might be unavailable in dev menu
    }

    (async () => {
      try {
        // 1. Grab local media.
        const stream = (await mediaDevices.getUserMedia({
          audio: true,
          video:
            type === 'video'
              ? {
                  facingMode: 'user',
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                  frameRate: { ideal: 30 },
                }
              : false,
        })) as MediaStream;
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        setLocalStream(stream);

        // 2. Build peer connection.
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        // Aggregate incoming tracks into a single MediaStream so the
        // remote <RTCView> renders both audio and video together.
        const incoming = new MediaStream();
        // @ts-expect-error: event 'track' typed as RTCTrackEvent
        pc.addEventListener('track', (ev: any) => {
          ev.streams?.[0]?.getTracks?.().forEach((t: any) => incoming.addTrack(t));
          setRemoteStream(incoming);
        });

        // 3. ICE wiring — write our candidates to our side's sub-collection
        //    and watch the other side's.
        const myCol = side === 'caller' ? 'offerCandidates' : 'answerCandidates';
        const theirCol = side === 'caller' ? 'answerCandidates' : 'offerCandidates';
        const callRef = firebaseFirestore().collection(CALLS).doc(callId);

        // @ts-expect-error
        pc.addEventListener('icecandidate', (ev: any) => {
          if (ev.candidate) {
            callRef.collection(myCol).add(ev.candidate.toJSON()).catch(() => {});
          }
        });
        // @ts-expect-error
        pc.addEventListener('connectionstatechange', () => {
          const s = pc.connectionState;
          if (s === 'connected') setState('live');
          if (s === 'failed' || s === 'disconnected' || s === 'closed') {
            // Don't trigger hangUp from here — let the user / signaling
            // doc be the source of truth. Just reflect UI state.
            if (s === 'failed') setState('ended');
          }
        });

        // 4. Offer/answer dance.
        if (side === 'caller') {
          const offer = await pc.createOffer({});
          await pc.setLocalDescription(offer);
          await callRef.update({
            offer: { sdp: offer.sdp, type: offer.type },
          });

          // Listen for the answer.
          const unsubDoc = callRef.onSnapshot(async snap => {
            const data = snap.data();
            if (!data) return;
            if (data.answer && !pc.remoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
            if (data.status === 'ended' || data.status === 'declined') {
              await teardown();
            }
          });
          cleanupFnsRef.current.push(unsubDoc);
        } else {
          // Callee: read the offer that was already written by the caller.
          const snap = await callRef.get();
          const data = snap.data();
          if (!data?.offer) throw new Error('No offer found for this call.');
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await callRef.update({
            answer: { sdp: answer.sdp, type: answer.type },
          });

          // Listen for end status.
          const unsubDoc = callRef.onSnapshot(async snap2 => {
            const d = snap2.data();
            if (d?.status === 'ended' || d?.status === 'declined') {
              await teardown();
            }
          });
          cleanupFnsRef.current.push(unsubDoc);
        }

        // 5. Pipe remote ICE candidates into our peer connection.
        const unsubIce = callRef.collection(theirCol).onSnapshot(snap2 => {
          snap2.docChanges().forEach(change => {
            if (change.type === 'added') {
              const data = change.doc.data();
              pc.addIceCandidate(new RTCIceCandidate(data as any)).catch(() => {});
            }
          });
        });
        cleanupFnsRef.current.push(unsubIce);
      } catch (e) {
        console.warn('[useWebRTCPeer] setup failed', e);
        await teardown();
      }
    })();

    return () => {
      cancelled = true;
      if (autoTeardown) {
        void teardown();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, side, type]);

  return {
    localStream,
    remoteStream,
    state,
    muted,
    speakerOn,
    toggleMute,
    toggleSpeaker,
    switchCamera,
    hangUp,
  };
}
