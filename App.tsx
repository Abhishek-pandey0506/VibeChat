import { useEffect, useRef, useState } from 'react';
import { StatusBar, StyleSheet, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuthContext } from './src/contexts/AuthContext';
import { configureGoogleSignIn, logout } from './src/services/authService';
import { requestNotificationPermission } from './src/services/messagingService';
import { subscribeUserProfile } from './src/services/firestoreService';
import {
  startPresenceTracking,
  type PresenceHandle,
} from './src/services/presenceService';
import { LoginScreen } from './src/screens/LoginScreen';
import { RoomListScreen, type RoomListItem } from './src/screens/RoomListScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { NewChatScreen } from './src/screens/NewChatScreen';
import { CreateGroupScreen } from './src/screens/CreateGroupScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { UserProfileViewScreen } from './src/screens/UserProfileViewScreen';
import { GroupProfileScreen } from './src/screens/GroupProfileScreen';
import { IncomingCallScreen } from './src/screens/IncomingCallScreen';
import { InCallScreen } from './src/screens/InCallScreen';
import { startCall, subscribeIncomingCalls, subscribeCall } from './src/services/callService';
import type { CallDoc, CallType } from './src/types/models';
import { SplashScreen } from './src/screens/SplashScreen';
import { CompleteProfileScreen } from './src/screens/CompleteProfileScreen';
import { AllSetScreen } from './src/screens/AllSetScreen';
import { SigningInScreen } from './src/screens/SigningInScreen';
import { TermsScreen } from './src/screens/TermsScreen';
import { PrivacyScreen } from './src/screens/PrivacyScreen';
import { colors } from './src/theme';
import type { UserProfile } from './src/types/models';

// Configure Google Sign-In SDK once at module load.
configureGoogleSignIn();

function App() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = useColorScheme();
  return (
    <SafeAreaProvider>
      {/* Screens override this StatusBar; this is just the default. */}
      <StatusBar barStyle="light-content" backgroundColor={colors.brandFrom} />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// Pre-auth routes (visible to signed-out users + onboarding policies)
type AuthRoute =
  | { name: 'login' }
  | { name: 'terms' }
  | { name: 'privacy' };

// Post-auth routes (visible to signed-in users with a complete profile)
type AppRoute =
  | { name: 'rooms' }
  | { name: 'newChat' }
  | { name: 'createGroup' }
  | { name: 'profile' }
  | { name: 'userProfile'; uid: string; prev: AppRoute }
  | { name: 'groupProfile'; roomId: string; prev: AppRoute }
  | { name: 'chat'; roomId: string; title: string; otherUid?: string };

const SPLASH_MIN_MS = 3000;

interface ActiveCall {
  callId: string;
  side: 'caller' | 'callee';
  type: CallType;
  peerUid: string;
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const { user, initializing } = useAuthContext();
  const [authRoute, setAuthRoute] = useState<AuthRoute>({ name: 'login' });
  const [route, setRoute] = useState<AppRoute>({ name: 'rooms' });
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [incomingCall, setIncomingCall] = useState<CallDoc | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  /** Set to true the moment we leave CompleteProfileScreen — used to show
   *  AllSetScreen exactly once before the user hits the rooms list. */
  const [showAllSet, setShowAllSet] = useState(false);
  /** Tracks whether we've been on CompleteProfileScreen in this session so
   *  AllSetScreen only fires after a fresh completion (not on every cold
   *  start when the profile already has a phone). */
  const sawIncompleteRef = useRef(false);
  const presenceRef = useRef<PresenceHandle | null>(null);

  // Hold the splash for at least SPLASH_MIN_MS.
  useEffect(() => {
    const t = setTimeout(() => setMinSplashElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  // Ask for notification permission once on app launch. The OS gates the
  // actual dialog so this is a no-op when the user has already decided
  // (granted or denied previously).
  useEffect(() => {
    void requestNotificationPermission().catch(err =>
      console.warn('[App] notification permission check failed', err),
    );
  }, []);

  // Subscribe to the signed-in user's profile so we can detect when it
  // becomes "complete" (has phoneNumber) and route past the onboarding form.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const unsub = subscribeUserProfile(user.uid, next => {
      setProfile(next);
      setProfileLoading(false);
    });
    return unsub;
  }, [user]);

  // Global incoming-call listener. Surfaces a full-screen ringing UI
  // regardless of which route is on top.
  useEffect(() => {
    if (!user || !profile?.phoneNumber) {
      setIncomingCall(null);
      return;
    }
    const unsub = subscribeIncomingCalls(user.uid, call => {
      // Ignore the call we initiated ourselves (some snapshot delay can
      // bounce our own ringing doc back to us for a beat).
      if (call && call.callerUid !== user.uid) setIncomingCall(call);
      else setIncomingCall(null);
    });
    return unsub;
  }, [user, profile?.phoneNumber]);

  // When a call we're in moves to 'accepted' on the doc, the caller side
  // transitions from outgoing-ringing → in-call. We watch the active call.
  useEffect(() => {
    if (!activeCall) return;
    const unsub = subscribeCall(activeCall.callId, doc => {
      if (!doc) {
        setActiveCall(null);
        return;
      }
      if (doc.status === 'declined' || doc.status === 'ended') {
        setActiveCall(null);
      }
    });
    return unsub;
  }, [activeCall]);

  function handleStartCall(otherUid: string, type: CallType) {
    if (!user) return;
    startCall(user.uid, otherUid, type)
      .then(callId => {
        setActiveCall({ callId, side: 'caller', type, peerUid: otherUid });
      })
      .catch(err => console.warn('[App] startCall failed', err));
  }

  // Flip showAllSet on once profile becomes complete after the user has
  // been on CompleteProfileScreen this session.
  useEffect(() => {
    if (sawIncompleteRef.current && profile?.phoneNumber && !showAllSet) {
      setShowAllSet(true);
    }
  }, [profile?.phoneNumber, showAllSet]);

  // Recovery: if the Firebase Auth user is still around but the profile
  // doc has been deleted (typically a half-completed deleteAccount from a
  // previous session), sign out so the next launch starts cleanly at the
  // login screen — instead of showing "Complete your profile" with no
  // backing doc.
  //
  // We use a 1.5 s grace period to avoid mistakenly triggering during the
  // tiny race window between a brand-new Google sign-in and the first
  // profile snapshot arriving from Firestore.
  useEffect(() => {
    if (!user || profileLoading || profile !== null) return;
    const t = setTimeout(() => {
      console.warn('[App] orphaned auth user with no profile doc — signing out');
      void logout();
    }, 1500);
    return () => clearTimeout(t);
  }, [user, profileLoading, profile]);

  // Presence lifecycle: only run for users with a completed profile so
  // we don't write presence for someone stuck on the onboarding form.
  useEffect(() => {
    if (!user || !profile?.phoneNumber) return;
    presenceRef.current = startPresenceTracking(user.uid);
    return () => {
      const handle = presenceRef.current;
      presenceRef.current = null;
      handle?.stop().catch(() => {});
    };
  }, [user, profile?.phoneNumber]);

  // Reset in-app stack on sign-out.
  useEffect(() => {
    if (!user) {
      setRoute({ name: 'rooms' });
      setAuthRoute({ name: 'login' });
    }
  }, [user]);

  // Splash gate.
  if (initializing || !minSplashElapsed) {
    return <SplashScreen />;
  }

  // ─── Signed-out branch ──────────────────────────────────────────────
  if (!user) {
    const authBg =
      authRoute.name === 'login' ? colors.brandFrom : colors.bgSoft;
    return (
      <View style={[styles.flex, { paddingTop: insets.top, backgroundColor: authBg }]}>
        {authRoute.name === 'login' && (
          <LoginScreen
            onOpenTerms={() => setAuthRoute({ name: 'terms' })}
            onOpenPrivacy={() => setAuthRoute({ name: 'privacy' })}
          />
        )}
        {authRoute.name === 'terms' && (
          <TermsScreen onBack={() => setAuthRoute({ name: 'login' })} />
        )}
        {authRoute.name === 'privacy' && (
          <PrivacyScreen onBack={() => setAuthRoute({ name: 'login' })} />
        )}
      </View>
    );
  }

  // ─── Signed-in: gate behind profile completion ───────────────────────
  // While we don't know yet, show the "Signing you in" checklist instead
  // of the cold splash — gives the user a sense of progression in the
  // gap between Google auth and Firestore profile arrival.
  if (profileLoading && !profile) {
    return <SigningInScreen />;
  }

  // Profile doc doesn't exist at all. Two cases land here:
  //   • Mid-delete: the Firestore doc was just removed, the auth listener
  //     will fire null in a moment and route us to LoginScreen.
  //   • Half-deleted from a previous session: the recovery effect above
  //     will sign us out shortly.
  // Either way, do NOT show CompleteProfileScreen — that would flash
  // briefly before the real navigation lands.
  if (profile === null) {
    return <SplashScreen />;
  }

  // Profile exists but the user hasn't filled in their phone number yet —
  // brand-new Google sign-in.
  if (!profile.phoneNumber) {
    sawIncompleteRef.current = true;
    return (
      <View style={[styles.flex, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
        <CompleteProfileScreen />
      </View>
    );
  }

  // First render after a fresh completion → AllSetScreen takeover.
  if (showAllSet) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top, backgroundColor: colors.brandFrom }]}>
        <AllSetScreen
          onGoToChats={() => {
            sawIncompleteRef.current = false;
            setShowAllSet(false);
          }}
        />
      </View>
    );
  }

  // ─── Signed-in + profile complete: normal app ────────────────────────
  return (
    <View
      style={[
        styles.flex,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: routeUsesDarkHeader(route) ? colors.headerDark : colors.bg,
        },
      ]}>
      {route.name === 'rooms' && (
        <RoomListScreen
          onOpenRoom={(room: RoomListItem) =>
            setRoute({
              name: 'chat',
              roomId: room.id,
              title: room.title,
              otherUid: room.otherUid,
            })
          }
          onNewChat={() => setRoute({ name: 'newChat' })}
          onOpenProfile={() => setRoute({ name: 'profile' })}
        />
      )}
      {route.name === 'newChat' && (
        <NewChatScreen
          onBack={() => setRoute({ name: 'rooms' })}
          onRoomReady={(roomId, title, otherUid) =>
            setRoute({ name: 'chat', roomId, title, otherUid })
          }
          onCreateGroup={() => setRoute({ name: 'createGroup' })}
        />
      )}
      {route.name === 'createGroup' && (
        <CreateGroupScreen
          onBack={() => setRoute({ name: 'newChat' })}
          onGroupReady={(roomId, title) => setRoute({ name: 'chat', roomId, title })}
        />
      )}
      {route.name === 'profile' && (
        <ProfileScreen onBack={() => setRoute({ name: 'rooms' })} />
      )}
      {route.name === 'chat' && (
        <ChatScreen
          roomId={route.roomId}
          title={route.title}
          otherUid={route.otherUid}
          onBack={() => setRoute({ name: 'rooms' })}
          onOpenPeerProfile={uid =>
            setRoute({ name: 'userProfile', uid, prev: route })
          }
          onOpenGroupProfile={() =>
            setRoute({ name: 'groupProfile', roomId: route.roomId, prev: route })
          }
          onStartCall={handleStartCall}
        />
      )}
      {route.name === 'userProfile' && (
        <UserProfileViewScreen
          otherUid={route.uid}
          onBack={() => setRoute(route.prev)}
        />
      )}
      {route.name === 'groupProfile' && (
        <GroupProfileScreen
          roomId={route.roomId}
          onBack={() => setRoute(route.prev)}
          onGroupGone={() => setRoute({ name: 'rooms' })}
        />
      )}

      {/* Active call surface sits on top of the route stack. It takes the
          entire screen so the underlying route is hidden while a call is
          in progress. */}
      {activeCall && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <InCallScreen
            callId={activeCall.callId}
            side={activeCall.side}
            type={activeCall.type}
            peerUid={activeCall.peerUid}
            onClosed={() => setActiveCall(null)}
          />
        </View>
      )}

      {/* Incoming-call ringer overlays everything, including an active call
          (rare, but it'd mask a parallel ring). */}
      {incomingCall && !activeCall && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <IncomingCallScreen
            call={incomingCall}
            onAccepted={call => {
              setIncomingCall(null);
              setActiveCall({
                callId: call.id,
                side: 'callee',
                type: call.type,
                peerUid: call.callerUid,
              });
            }}
            onDeclined={() => setIncomingCall(null)}
          />
        </View>
      )}
    </View>
  );
}

function routeUsesDarkHeader(r: AppRoute): boolean {
  return (
    r.name === 'rooms' ||
    r.name === 'chat' ||
    r.name === 'profile' ||
    r.name === 'newChat' ||
    r.name === 'createGroup' ||
    r.name === 'userProfile' ||
    r.name === 'groupProfile'
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

export default App;
