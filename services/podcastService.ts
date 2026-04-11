import {
  collection, addDoc, getDocs, query, orderBy,
  limit, serverTimestamp, doc, updateDoc, deleteDoc, where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { db, storage } from '../firebaseConfig';
import { auth } from '../firebaseConfig';

export interface Podcast {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  title: string;
  description: string;
  audioUrl: string;
  coverUrl: string | null;
  duration: number; // secondi
  createdAt: Date;
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    webm: 'audio/webm',
    caf: 'audio/x-caf',
  };
  return map[ext.toLowerCase()] ?? 'audio/mpeg';
}

function extFromUri(uri: string): string {
  // Prova a estrarre l'estensione dall'URI (prima del ?)
  const clean = uri.split('?')[0];
  const parts = clean.split('.');
  const ext = parts[parts.length - 1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
  const allowed = ['mp3', 'm4a', 'mp4', 'aac', 'wav', 'ogg', 'flac', 'webm'];
  return allowed.includes(ext) ? ext : 'mp3';
}

export async function getPodcasts(limitN = 30): Promise<Podcast[]> {
  const q = query(collection(db, 'podcast'), orderBy('createdAt', 'desc'), limit(limitN));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Podcast, 'id'>),
    createdAt: d.data().createdAt?.toDate() ?? new Date(),
  }));
}

export async function publishPodcast(params: {
  audioUri?: string;   // file locale da caricare
  audioUrl?: string;   // URL già su Storage (es. suono da SoundScape)
  coverUri: string | null;
  title: string;
  description: string;
  duration: number;
  username: string;
  userAvatar: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  if (!params.audioUri && !params.audioUrl) throw new Error('Audio mancante');

  let audioUrl: string;

  if (params.audioUrl) {
    // Suono già su Firebase Storage — nessun upload necessario
    audioUrl = params.audioUrl;
  } else {
    const token = await user.getIdToken();
    const bucket = (storage.app.options as any).storageBucket as string;

    const ext = extFromUri(params.audioUri!);
    const contentType = mimeFromExt(ext);

    const audioPath = `podcast/${user.uid}/${Date.now()}.${ext}`;
    const encodedAudioPath = encodeURIComponent(audioPath);
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedAudioPath}`;

    const audioResult = await FileSystem.uploadAsync(uploadUrl, params.audioUri!, {
      httpMethod: 'POST',
      headers: { 'Content-Type': contentType, Authorization: `Bearer ${token}` },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (audioResult.status < 200 || audioResult.status >= 300) {
      throw new Error(`Audio upload failed: HTTP ${audioResult.status}`);
    }
    const audioData = JSON.parse(audioResult.body);
    audioUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedAudioPath}?alt=media&token=${audioData.downloadTokens}`;
  }

  // Upload cover se presente (immagine — usa uploadBytes va bene)
  let coverUrl: string | null = null;
  if (params.coverUri) {
    const coverBlob = await (await fetch(params.coverUri)).blob();
    const coverRef = ref(storage, `podcast/${user.uid}/cover_${Date.now()}.jpg`);
    await uploadBytes(coverRef, coverBlob, { contentType: 'image/jpeg' });
    coverUrl = await getDownloadURL(coverRef);
  }

  const docRef = await addDoc(collection(db, 'podcast'), {
    userId: user.uid,
    username: params.username,
    userAvatar: params.userAvatar,
    title: params.title,
    description: params.description,
    audioUrl,
    coverUrl,
    duration: params.duration,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updatePodcast(
  id: string,
  params: { title?: string; description?: string; newCoverUri?: string | null },
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const updates: Record<string, unknown> = {};
  if (params.title !== undefined) updates.title = params.title;
  if (params.description !== undefined) updates.description = params.description;

  if (params.newCoverUri !== undefined) {
    if (params.newCoverUri === null) {
      updates.coverUrl = null;
    } else {
      const coverBlob = await (await fetch(params.newCoverUri)).blob();
      const coverRef = ref(storage, `podcast/${user.uid}/cover_${Date.now()}.jpg`);
      await uploadBytes(coverRef, coverBlob, { contentType: 'image/jpeg' });
      updates.coverUrl = await getDownloadURL(coverRef);
    }
  }

  await updateDoc(doc(db, 'podcast', id), updates);
}

export async function deletePodcast(id: string): Promise<void> {
  await deleteDoc(doc(db, 'podcast', id));
}

// ─── SoundScape sound search ──────────────────────────────────────────────────

export interface SoundResult {
  id: string;
  title: string;
  username: string;
  audioUrl: string;
  duration: number;
}

export async function searchSounds(queryText: string): Promise<SoundResult[]> {
  const q = query(collection(db, 'sounds'), orderBy('createdAt', 'desc'), limit(40));
  const snap = await getDocs(q);
  const all = snap.docs.map((d) => ({
    id: d.id,
    title: d.data().title ?? '',
    username: d.data().username ?? '',
    audioUrl: d.data().audioUrl ?? '',
    duration: d.data().duration ?? 0,
  }));
  if (!queryText.trim()) return all;
  const lower = queryText.toLowerCase();
  return all.filter((r) =>
    r.title.toLowerCase().includes(lower) || r.username.toLowerCase().includes(lower),
  );
}
