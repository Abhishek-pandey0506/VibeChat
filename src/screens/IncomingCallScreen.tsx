/**
 * Full-screen "ringing" UI rendered as an overlay on top of whatever
 * route is currently active when a call doc with status==='ringing'
 * appears for the current user.
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
import InCallManager from 'react-native-incall-manager';
import { acceptCall, declineCall } from '../services/callService';
import { getUserProfile } from '../services/firestoreService';
import { colors, fontSize, spacing } from '../theme';
import type { CallDoc, UserProfile } from '../types/models';

interface Props {
  call: CallDoc;
  onAccepted: (call: CallDoc) => void;
  onDeclined: () => void;
}

export function IncomingCallScreen({ call, onAccepted, onDeclined }: Props) {
  const [caller, setCaller] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getUserProfile(call.callerUid);
      if (!cancelled) setCaller(p);
    })();
    // Ring with the platform's default tone while we wait.
    try {
      InCallManager.startRingtone('_BUNDLE_');
    } catch {
      // ignore — may be unavailable in dev menu
    }
    return () => {
      cancelled = true;
      try {
        InCallManager.stopRingtone();
      } catch {
        // ignore
      }
    };
  }, [call.callerUid]);

  async function accept() {
    if (busy) return;
    setBusy(true);
    try {
      await acceptCall(call.id);
      try {
        InCallManager.stopRingtone();
      } catch {
        // ignore
      }
      onAccepted(call);
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (busy) return;
    setBusy(true);
    try {
      await declineCall(call.id);
      try {
        InCallManager.stopRingtone();
      } catch {
        // ignore
      }
      onDeclined();
    } finally {
      setBusy(false);
    }
  }

  const name = caller?.displayName ?? caller?.email ?? 'Incoming call';
  const initial = (name || '?').charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.topBlock}>
        <Text style={styles.kicker}>
          {call.type === 'video' ? 'Incoming video call' : 'Incoming voice call'}
        </Text>
        {caller?.photoURL ? (
          <Image source={{ uri: caller.photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.status}>ringing…</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={decline}
          disabled={busy}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]}>
          <View style={[styles.disc, styles.declineDisc]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.discIcon}>✕</Text>
            )}
          </View>
          <Text style={styles.actionLabel}>Decline</Text>
        </Pressable>
        <Pressable
          onPress={accept}
          disabled={busy}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]}>
          <View style={[styles.disc, styles.acceptDisc]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.discIcon}>{call.type === 'video' ? '📹' : '📞'}</Text>
            )}
          </View>
          <Text style={styles.actionLabel}>Accept</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.headerDark,
    paddingTop: 80,
    paddingBottom: 60,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  topBlock: { alignItems: 'center' },
  kicker: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSize.sm + 1,
    fontWeight: '600',
    marginBottom: spacing.xl,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    marginBottom: spacing.lg,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  avatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 56, fontWeight: '800' },
  name: {
    color: '#fff',
    fontSize: fontSize.xxl,
    fontWeight: '800',
    textAlign: 'center',
  },
  status: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },

  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  actionBtn: { alignItems: 'center', gap: 8 },
  disc: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptDisc: { backgroundColor: '#22C55E' },
  declineDisc: { backgroundColor: '#EF4444' },
  discIcon: { fontSize: 30, color: '#fff' },
  actionLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fontSize.sm + 1,
    fontWeight: '600',
  },
});
