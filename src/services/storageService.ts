/**
 * Storage service for profile and chat image uploads.
 *
 * Layout (mirrors security rules):
 *   profileImages/{uid}/{filename}
 *   chatImages/{roomId}/{uid}/{filename}
 *
 * The local `fileUri` is a `file://` path from react-native-image-picker
 * (or similar). Returns the public download URL stored back in Firestore.
 */

import { firebaseStorage, firebaseFirestore, COLLECTIONS, serverTimestamp } from '../config/firebase';

function timestampedName(ext: string): string {
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
  return `${Date.now()}.${safeExt}`;
}

function guessExt(uri: string): string {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1] ?? 'jpg';
}

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
}

interface UploadOptions {
  onProgress?: (p: UploadProgress) => void;
  contentType?: string;
}

async function uploadAndGetUrl(
  storagePath: string,
  fileUri: string,
  options: UploadOptions,
): Promise<string> {
  const ref = firebaseStorage().ref(storagePath);
  const task = ref.putFile(fileUri, {
    contentType: options.contentType ?? `image/${guessExt(fileUri)}`,
  });

  if (options.onProgress) {
    task.on('state_changed', snapshot => {
      options.onProgress?.({
        bytesTransferred: snapshot.bytesTransferred,
        totalBytes: snapshot.totalBytes,
      });
    });
  }

  await task;
  return ref.getDownloadURL();
}

/**
 * Upload a new profile image, write the URL back to users/{uid}.photoURL,
 * and return the URL for immediate UI use.
 */
export async function uploadProfileImage(
  uid: string,
  fileUri: string,
  options: UploadOptions = {},
): Promise<string> {
  const path = `profileImages/${uid}/${timestampedName(guessExt(fileUri))}`;
  const url = await uploadAndGetUrl(path, fileUri, options);
  await firebaseFirestore()
    .collection(COLLECTIONS.USERS)
    .doc(uid)
    .update({ photoURL: url, updatedAt: serverTimestamp() });
  return url;
}

/**
 * Upload a chat image. The caller is expected to then send a message of
 * type='image' carrying the returned URL via firestoreService.sendMessage.
 */
export async function uploadChatImage(
  roomId: string,
  uid: string,
  fileUri: string,
  options: UploadOptions = {},
): Promise<string> {
  const path = `chatImages/${roomId}/${uid}/${timestampedName(guessExt(fileUri))}`;
  return uploadAndGetUrl(path, fileUri, options);
}
