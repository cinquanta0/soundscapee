import * as FileSystem from 'expo-file-system/legacy';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebaseConfig';

function buildStorageDownloadUrl(bucket, encodedPath, downloadToken) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

async function uploadViaRest(storagePath, localUri, contentType) {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const token = await user.getIdToken();
  const bucket = storage.app.options.storageBucket;
  const encodedPath = encodeURIComponent(storagePath);
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`;

  const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': contentType,
      Authorization: `Bearer ${token}`,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    const body = result.body?.slice(0, 400) || '<empty body>';
    throw new Error(`REST upload failed (${result.status}): ${body}`);
  }

  const responseData = JSON.parse(result.body);
  if (!responseData.downloadTokens) {
    throw new Error('REST upload failed: missing download token');
  }

  return buildStorageDownloadUrl(bucket, encodedPath, responseData.downloadTokens);
}

async function uploadViaSdk(storagePath, localUri, contentType) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, { contentType });
  return getDownloadURL(storageRef);
}

export async function uploadFileWithFallback(storagePath, localUri, contentType = 'audio/mp4') {
  try {
    return await uploadViaRest(storagePath, localUri, contentType);
  } catch (restError) {
    console.warn('[STORAGE] REST upload failed, retrying with SDK:', restError);
    return uploadViaSdk(storagePath, localUri, contentType);
  }
}
