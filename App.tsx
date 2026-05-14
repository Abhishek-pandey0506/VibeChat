import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './src/hooks/useAuth';
import { configureGoogleSignIn } from './src/services/authService';
import {
  startPresenceTracking,
  type PresenceHandle,
} from './src/services/presenceService';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { RoomListScreen, type RoomListItem } from './src/screens/RoomListScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { NewChatScreen } from './src/screens/NewChatScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { colors } from './src/theme';

// Configure Google Sign-In SDK once at module load.
configureGoogleSignIn();

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.headerDark}
      />
      <AppContent />
    </SafeAreaProvider>
  );
}

type AuthScreen = 'login' | 'register';

// Lightweight in-app navigation. A real app should pull in
// @react-navigation/native; this works for the scaffold without an extra dep.
type Route =
  | { name: 'rooms' }
  | { name: 'newChat' }
  | { name: 'profile' }
  | { name: 'chat'; roomId: string; title: string; otherUid?: string };

function AppContent() {
  const insets = useSafeAreaInsets();
  const { user, initializing } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [route, setRoute] = useState<Route>({ name: 'rooms' });
  const presenceRef = useRef<PresenceHandle | null>(null);

  // Presence lifecycle: start tracking when a user signs in; stop on sign-out.
  useEffect(() => {
    if (user) {
      presenceRef.current = startPresenceTracking(user.uid);
    }
    return () => {
      const handle = presenceRef.current;
      presenceRef.current = null;
      handle?.stop().catch(() => {
        // best-effort cleanup
      });
    };
  }, [user]);

  if (initializing) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primaryDark} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
        {authScreen === 'login' ? (
          <LoginScreen onGoRegister={() => setAuthScreen('register')} />
        ) : (
          <RegisterScreen onGoLogin={() => setAuthScreen('login')} />
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.flex,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          // Header screens fill behind the top inset with dark green.
          backgroundColor: routeUsesDarkHeader(route) ? colors.headerDark : colors.bg,
        },
      ]}>
      {route.name === 'rooms' && (
        <RoomListScreen
          user={user}
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
          user={user}
          onBack={() => setRoute({ name: 'rooms' })}
          onRoomReady={(roomId, title, otherUid) =>
            setRoute({ name: 'chat', roomId, title, otherUid })
          }
        />
      )}
      {route.name === 'profile' && (
        <ProfileScreen user={user} onBack={() => setRoute({ name: 'rooms' })} />
      )}
      {route.name === 'chat' && (
        <ChatScreen
          user={user}
          roomId={route.roomId}
          title={route.title}
          otherUid={route.otherUid}
          onBack={() => setRoute({ name: 'rooms' })}
        />
      )}
    </View>
  );
}

function routeUsesDarkHeader(r: Route): boolean {
  return r.name === 'rooms' || r.name === 'chat' || r.name === 'profile';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});

export default App;
