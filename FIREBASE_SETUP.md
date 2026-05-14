# Firebase setup for VibeChat

This app uses Firebase as its entire backend — there is no separate Node/Express server. All client traffic goes through `@react-native-firebase/*` directly to Auth, Firestore, Storage, and Cloud Messaging. The optional pieces (push fan-out, unread counters) run as Cloud Functions in `firebase/functions/`.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and create a new project (e.g. `vibechat`).
2. Enable the services you'll use:
   - **Authentication** → Sign-in method → enable **Email/Password**.
   - **Firestore Database** → create in production mode (the rules file in this repo will replace the defaults).
   - **Storage** → create the default bucket.
   - **Cloud Messaging** → no setup needed in the console; it's on by default.

## 2. Register the apps and download credentials

> **TODO** — these two files are required before the app will build/run.
> They contain project-specific identifiers and are gitignored.

### Android
1. Firebase Console → Project settings → **Add app** → Android.
2. Use the package name **`com.vibechat`** (matches `android/app/build.gradle`).
3. Download `google-services.json` and place it at:
   ```
   android/app/google-services.json
   ```

### iOS
1. Firebase Console → Project settings → **Add app** → iOS.
2. Use the bundle identifier shown in Xcode (default **`org.reactjs.native.example.VibeChat`** — change it to your own bundle ID in Xcode first, and use the same value here).
3. Download `GoogleService-Info.plist` and place it at:
   ```
   ios/VibeChat/GoogleService-Info.plist
   ```
4. Open the project in Xcode and drag the file into the `VibeChat` group — make sure **"Copy items if needed"** is checked and the **VibeChat target** is selected. (Just placing the file on disk isn't enough; Xcode needs it added to the target.)
5. In `ios/VibeChat/AppDelegate.swift`, uncomment the `import FirebaseCore` line and the `FirebaseApp.configure()` call.
6. In Xcode, on the VibeChat target → **Signing & Capabilities** → add **Push Notifications** and **Background Modes → Remote notifications**. Upload an APNs auth key in the Firebase Console (Project settings → Cloud Messaging → Apple app configuration).

## 3. Install dependencies and native pods

```bash
npm install
cd ios && pod install && cd ..
```

Run the app:

```bash
npm run android
# or
npm run ios
```

If you see `[Firebase] No default app configured`, the credentials files above are missing or weren't added to the iOS target.

## 3b. Enable Google Sign-In (optional but recommended)

1. **Firebase Console → Authentication → Sign-in method → Google → Enable.** Set a project support email.
2. After enabling, Firebase auto-creates an OAuth client called **"Web client (auto-created)"**. Copy its **Web client ID** (looks like `233261392388-xxxx.apps.googleusercontent.com`).
3. Open `src/services/authService.ts` and replace the placeholder in `GOOGLE_WEB_CLIENT_ID` with that value.
4. **Android — SHA-1 fingerprint required**. Run from the project root:
   ```bash
   cd android && ./gradlew signingReport
   ```
   Copy the `SHA1` for the `debug` variant (and your release keystore once you have one). In the Firebase Console → Project settings → Your Android app → **Add fingerprint**. Then re-download `google-services.json` and replace `android/app/google-services.json` so it contains the OAuth client section.
5. **iOS — URL scheme.** Open `GoogleService-Info.plist` and copy the `REVERSED_CLIENT_ID` value. In Xcode → VibeChat target → Info → URL Types → add a new URL Scheme with that value. Without this, the Google sign-in browser sheet cannot return to the app.
6. Rebuild the native app (`npm run android` / Xcode build).

## 4. Deploy security rules

Install the Firebase CLI if you don't have it (`npm i -g firebase-tools`), then:

```bash
firebase login
firebase use --add        # link to your project
firebase deploy --only firestore:rules,storage,firestore:indexes
```

Rules live in `firebase/firestore.rules` and `firebase/storage.rules`. The shape they enforce:

- `/users/{uid}` — readable by any signed-in user, writable only by the owner; `uid`/`email` are immutable through client writes.
- `/chatRooms/{roomId}` — readable and writable only by users listed in `participants`.
- `/chatRooms/{roomId}/messages/{id}` — readable by participants; messages are created by their sender and are immutable from clients.
- `profileImages/{uid}/...` — owner-only writes (≤ 5 MB, must be `image/*`), signed-in reads.
- `chatImages/{roomId}/{uid}/...` — owner uploads, room-participant reads (≤ 10 MB).

## 5. Deploy Cloud Functions (optional but recommended)

```bash
cd firebase/functions
npm install
cd ../..
firebase deploy --only functions
```

What's included in `firebase/functions/src/index.ts`:

- `onMessageCreated` — Firestore trigger that fans push notifications out to every participant other than the sender, bumps `unread.{uid}` on the room doc, and prunes stale FCM tokens.
- `cleanupInvalidFcmToken` — callable used by the client when it knows its own token is dead.

If you set `room.privateNotifications === true` on a room, the notification body is replaced with a generic "You have a new message" so the preview doesn't leak content.

## 6. Where things live in the JS code

```
src/
  config/firebase.ts        # singleton accessors + serverTimestamp / FieldValue helpers
  types/models.ts           # UserProfile, ChatRoom, ChatMessage shapes
  services/
    authService.ts          # register / login / reset / logout / onAuthStateChanged
    firestoreService.ts     # users, rooms, messages — all reads use onSnapshot
    storageService.ts       # uploadProfileImage / uploadChatImage
    messagingService.ts     # permission, FCM token persist, foreground/open handlers
  hooks/useAuth.ts          # current user + FCM token lifecycle
App.tsx                     # subscribes via useAuth; renders signed-in / signed-out shell
index.js                    # registers FCM background handler (must be top-level)
```

## 7. Feature notes (post-MVP)

Already wired:
- Email/password and Google Sign-In.
- Chat list with unread badges, last-message preview, and per-room timestamps.
- Realtime messaging with WhatsApp-style date dividers ("Today / Yesterday / Monday / 12/05") and per-bubble timestamps.
- Image attachments in chat (paperclip → gallery → Storage upload → image message).
- Online + last-seen status, written through `presenceService` on AppState changes.
- Long-press on a message: **Copy** (any) and **Delete for everyone** (own messages — implemented as a soft delete, rule-checked, no Cloud Function required).
- Profile screen: edit display name, upload avatar, sign out.

Things this scaffold deliberately does *not* do:
- No navigation library. Drop in `@react-navigation/native` and replace the lightweight route switch in `App.tsx`.
- No typing indicators / read receipts / voice notes / video calls — out of scope for the chat MVP.
- No admin panel. The `delete` rule on `users` is `false` — do account deletions through the Admin SDK in a Cloud Function.
