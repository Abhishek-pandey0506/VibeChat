/**
 * Active call surface. Renders different layouts for voice vs video, but
 * shares the same control row (mute / speaker / hang up / camera flip).
 *
 * Lifecycle is owned by `useWebRTCPeer` — this component just renders the
 * streams and wires the button presses through.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useWebRTCPeer, type CallSide } from '../hooks/useWebRTCPeer';
import { getUserProfile } from '../services/firestoreService';
import { colors, fontSize, spacing } from '../theme';
import type { CallType, UserProfile } from '../types/models';

interface Props {
  callId: string;
  side: CallSide;
  type: CallType;
  /** uid of the OTHER party — for the header avatar/name. */
  peerUid: string;
  onClosed: () => void;
}

export function InCallScreen({ callId, side, type, peerUid, onClosed }: Props) {
  const peer = useWebRTCPeer({ callId, side, type });
  const [peerProfile, setPeerProfile] = useState<UserProfile | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getUserProfile(peerUid);
      if (!cancelled) setPeerProfile(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [peerUid]);

  // Tick a duration counter once the call is live.
  useEffect(() => {
    if (peer.state !== 'live') return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [peer.state]);

  // Bounce back to the previous screen when the peer hook reports 'ended'.
  useEffect(() => {
    if (peer.state === 'ended') {
      const t = setTimeout(onClosed, 250);
      return () => clearTimeout(t);
    }
  }, [peer.state, onClosed]);

  async function handleHangUp() {
    await peer.hangUp();
    onClosed();
  }

  const isVideo = type === 'video';
  const name = peerProfile?.displayName ?? peerProfile?.email ?? 'Connecting…';
  const initial = (name || '?').charAt(0).toUpperCase();
  const durationLabel =
    peer.state === 'live' ? formatDuration(seconds) : peer.state === 'connecting' ? 'Connecting…' : '';

  return (
    <View style={styles.container}>
      {/* Remote video fills the screen; voice mode just shows the avatar. */}
      {isVideo && peer.remoteStream ? (
        <RTCView
          streamURL={(peer.remoteStream as any).toURL?.()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
        />
      ) : (
        <View style={styles.voiceBg}>
          {peerProfile?.photoURL ? (
            <Image source={{ uri: peerProfile.photoURL }} style={styles.bigAvatar} />
          ) : (
            <View style={[styles.bigAvatar, styles.bigAvatarFallback]}>
              <Text style={styles.bigAvatarText}>{initial}</Text>
            </View>
          )}
        </View>
      )}

      {/* Top overlay: back arrow + name + duration */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        <Pressable
          onPress={handleHangUp}
          hitSlop={12}
          style={({ pressed }) => [styles.topBackBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.topBackIcon}>‹</Text>
        </Pressable>
        <View style={styles.topCenter} pointerEvents="none">
          <Text style={styles.peerName}>{name}</Text>
          {durationLabel ? (
            <Text style={styles.duration}>{durationLabel}</Text>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Local PIP only in video mode */}
      {isVideo && peer.localStream ? (
        <View style={styles.pipWrap}>
          <RTCView
            streamURL={(peer.localStream as any).toURL?.()}
            style={styles.pip}
            objectFit="cover"
            mirror
          />
        </View>
      ) : null}

      {/* Bottom control row */}
      <View style={styles.controls}>
        <CtrlButton
          icon={peer.muted ? '🔇' : '🎙'}
          label={peer.muted ? 'Unmute' : 'Mute'}
          onPress={peer.toggleMute}
        />
        {isVideo ? (
          <CtrlButton icon="🔄" label="Flip" onPress={peer.switchCamera} />
        ) : (
          <CtrlButton
            icon={peer.speakerOn ? '🔊' : '🔉'}
            label={peer.speakerOn ? 'Speaker' : 'Earpiece'}
            onPress={peer.toggleSpeaker}
          />
        )}
        <Pressable
          onPress={handleHangUp}
          style={({ pressed }) => [
            styles.endBtn,
            pressed && { opacity: 0.85 },
          ]}>
          <Text style={styles.endIcon}>📵</Text>
        </Pressable>
      </View>

      {/*
        Connecting overlay is purely cosmetic — it must NEVER block input,
        otherwise the user can't tap End during a stuck connect (which is
        exactly when they most want to). pointerEvents="none" makes it a
        transparent visual hint that passes touches through to the
        controls underneath.
      */}
      {peer.state === 'connecting' ? (
        <View
          pointerEvents="none"
          style={[styles.connectingOverlay, { backgroundColor: 'transparent' }]}>
          <ActivityIndicator color="rgba(255,255,255,0.55)" />
        </View>
      ) : null}
    </View>
  );
}

function CtrlButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ctrlBtn, pressed && { opacity: 0.85 }]}>
      <View style={styles.ctrlDisc}>
        <Text style={styles.ctrlIcon}>{icon}</Text>
      </View>
      <Text style={styles.ctrlLabel}>{label}</Text>
    </Pressable>
  );
}

function formatDuration(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss < 10 ? '0' : ''}${ss}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  voiceBg: {
    flex: 1,
    backgroundColor: colors.headerDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigAvatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  bigAvatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigAvatarText: { color: '#fff', fontSize: 64, fontWeight: '800' },

  topOverlay: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  topBackIcon: { color: '#fff', fontSize: 28, marginTop: -2 },
  topCenter: { flex: 1, alignItems: 'center' },
  peerName: {
    color: '#fff',
    fontSize: fontSize.xl,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  duration: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.md,
    marginTop: 4,
  },

  pipWrap: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 110,
    height: 150,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  pip: { width: '100%', height: '100%' },

  controls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  ctrlBtn: { alignItems: 'center', gap: 6 },
  ctrlDisc: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlIcon: { fontSize: 22 },
  ctrlLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.xs + 1,
    fontWeight: '600',
  },
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endIcon: { fontSize: 28 },

  connectingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
