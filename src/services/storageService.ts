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
  return (match?.[1] ?? 'jpg').toLowerCase();
}

/**
 * Map a file extension to a proper IANA MIME type. The Firebase Storage
 * rules require `request.resource.contentType.matches('image/.*')`, so the
 * MIME has to be valid — `image/jpg` (a common typo) is *not* in IANA and
 * some backends reject it. Always use `image/jpeg` for .jpg/.jpeg.
 */
function mimeFor(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'gif') return 'image/gif';
  if (e === 'webp') return 'image/webp';
  if (e === 'heic' || e === 'heif') return 'image/heic';
  return `image/${e}`;
}

/**
 * Turn the Firebase Storage SDK's slightly cryptic error codes into copy
 * the user can actually act on. Most "object-not-found"-on-upload reports
 * trace back to either Storage not being enabled in the console, or rules
 * that haven't been deployed yet.
 */
export function describeStorageError(e: any): string {
  const code = e?.code ?? '';
  if (code === 'storage/unauthorized') {
    return "You don't have permission to upload that. Try signing out and back in.";
  }
  if (code === 'storage/object-not-found') {
    return 'Storage is not reachable. Make sure Firebase Storage is enabled and the security rules are deployed.';
  }
  if (code === 'storage/quota-exceeded') {
    return 'Your storage quota is full. Free some space and try again.';
  }
  if (code === 'storage/canceled') {
    return 'Upload cancelled.';
  }
  if (code === 'storage/retry-limit-exceeded') {
    return 'Network was unstable. Please try again on a stronger connection.';
  }
  return e?.message ?? 'Upload failed. Please try again.';
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
  if (!fileUri) {
    throw new Error('No file selected.');
  }
  const ref = firebaseStorage().ref(storagePath);
  const ext = guessExt(fileUri);
  const task = ref.putFile(fileUri, {
    contentType: options.contentType ?? mimeFor(ext),
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
 * Upload a new group photo to `groupImages/{roomId}/...`. Returns the
 * download URL. Caller is responsible for writing it into
 * `chatRooms/{roomId}.photoURL` (e.g. via updateGroupPhoto).
 */
export async function uploadGroupImage(
  roomId: string,
  fileUri: string,
  options: UploadOptions = {},
): Promise<string> {
  const path = `groupImages/${roomId}/${timestampedName(guessExt(fileUri))}`;
  return uploadAndGetUrl(path, fileUri, options);
}

/**
 * Encode a profile photo as a base64 data URL and write it directly to
 * `users/{uid}.photoURL`. NO Firebase Storage involved — works on Spark
 * plan, no bucket required.
 *
 * Trade-off: Firestore docs cap at 1 MB. We expect callers to pass a
 * thumbnail-sized JPEG (~256 × 256). The data URL fits comfortably in the
 * doc and `<Image source={{ uri: 'data:image/jpeg;base64,...' }} />`
 * renders it natively in RN.
 */
export async function setProfilePhotoFromBase64(
  uid: string,
  base64: string,
  mime: string = 'image/jpeg',
): Promise<string> {
  if (!base64) throw new Error('No image data to save.');
  // Reject anything that'd push the user doc near Firestore's 1 MB limit.
  // (1 MB / 1.37 base64 expansion ≈ 730 KB of payload.)
  const sizeBytes = Math.ceil((base64.length * 3) / 4);
  if (sizeBytes > 700 * 1024) {
    throw new Error(
      `Image is too large (${Math.round(
        sizeBytes / 1024,
      )} KB). Please pick a smaller photo or crop it.`,
    );
  }
  const dataUrl = `data:${mime};base64,${base64}`;
  await firebaseFirestore()
    .collection(COLLECTIONS.USERS)
    .doc(uid)
    .update({ photoURL: dataUrl, updatedAt: serverTimestamp() });
  return dataUrl;
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

/**
 * Upload an arbitrary document (PDF, doc, anything). The MIME type is
 * preserved on the Storage object so a download / preview client picks the
 * right viewer.
 */
export async function uploadChatDocument(
  roomId: string,
  uid: string,
  fileUri: string,
  options: UploadOptions & { contentType?: string; filename?: string } = {},
): Promise<string> {
  const ext = guessExt(options.filename ?? fileUri) || 'bin';
  const safeName = (options.filename ?? `${Date.now()}.${ext}`).replace(/[^\w.\-]/g, '_');
  const path = `chatDocs/${roomId}/${uid}/${Date.now()}-${safeName}`;
  return uploadAndGetUrl(path, fileUri, {
    ...options,
    contentType: options.contentType ?? 'application/octet-stream',
  });
}

/**
 * Upload a chat video. Caller follows with sendMessage({ type: 'video', ... }).
 * `posterUri`, if provided (typically from react-native-create-thumbnail),
 * is also uploaded and returned as `posterUrl` for the message preview.
 */
export async function uploadChatVideo(
  roomId: string,
  uid: string,
  fileUri: string,
  options: UploadOptions & { posterUri?: string } = {},
): Promise<{ videoUrl: string; posterUrl?: string }> {
  const ext = guessExt(fileUri) || 'mp4';
  const path = `chatVideos/${roomId}/${uid}/${timestampedName(ext)}`;
  const videoUrl = await uploadAndGetUrl(path, fileUri, {
    ...options,
    contentType: `video/${ext}`,
  });

  let posterUrl: string | undefined;
  if (options.posterUri) {
    const posterPath = `chatVideos/${roomId}/${uid}/${timestampedName('jpg')}.poster`;
    posterUrl = await uploadAndGetUrl(posterPath, options.posterUri, {
      contentType: 'image/jpeg',
    });
  }
  return { videoUrl, posterUrl };
}
