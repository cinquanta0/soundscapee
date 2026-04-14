import {
  collection, addDoc, getDocs, query, orderBy,
  limit, serverTimestamp, doc, updateDoc, deleteDoc, where,
  setDoc, getDoc, increment, onSnapshot, Unsubscribe,
  arrayUnion, arrayRemove,
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
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  isITS: boolean;        // true = episodio del canale ITS
  category?: string;     // es. "informatica", "marketing", ecc.
}

// ─── Playlist ─────────────────────────────────────────────────────────────────

export interface Playlist {
  id: string;
  name: string;
  userId: string;
  podcastIds: string[];
  createdAt: Date;
}

export interface PodcastComment {
  id: string;
  userId: string;
  username: string;
  text: string;
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
    likesCount: d.data().likesCount ?? 0,
    dislikesCount: d.data().dislikesCount ?? 0,
    commentsCount: d.data().commentsCount ?? 0,
    isITS: d.data().isITS ?? false,
    category: d.data().category,
  }));
}

// ─── Likes / Dislikes ─────────────────────────────────────────────────────────

export async function getPodcastVotes(podcastId: string): Promise<{ liked: boolean; disliked: boolean }> {
  const user = auth.currentUser;
  if (!user) return { liked: false, disliked: false };
  const [likeSnap, dislikeSnap] = await Promise.all([
    getDoc(doc(db, 'podcast', podcastId, 'likes', user.uid)),
    getDoc(doc(db, 'podcast', podcastId, 'dislikes', user.uid)),
  ]);
  return { liked: likeSnap.exists(), disliked: dislikeSnap.exists() };
}

export async function togglePodcastLike(podcastId: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  const likeRef = doc(db, 'podcast', podcastId, 'likes', user.uid);
  const dislikeRef = doc(db, 'podcast', podcastId, 'dislikes', user.uid);
  const podRef = doc(db, 'podcast', podcastId);
  const likeSnap = await getDoc(likeRef);
  if (likeSnap.exists()) {
    await deleteDoc(likeRef);
    await updateDoc(podRef, { likesCount: increment(-1) });
    return false;
  } else {
    const dislikeSnap = await getDoc(dislikeRef);
    if (dislikeSnap.exists()) {
      await deleteDoc(dislikeRef);
      await updateDoc(podRef, { dislikesCount: increment(-1) });
    }
    await setDoc(likeRef, { userId: user.uid, createdAt: serverTimestamp() });
    await updateDoc(podRef, { likesCount: increment(1) });
    return true;
  }
}

export async function togglePodcastDislike(podcastId: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  const dislikeRef = doc(db, 'podcast', podcastId, 'dislikes', user.uid);
  const likeRef = doc(db, 'podcast', podcastId, 'likes', user.uid);
  const podRef = doc(db, 'podcast', podcastId);
  const dislikeSnap = await getDoc(dislikeRef);
  if (dislikeSnap.exists()) {
    await deleteDoc(dislikeRef);
    await updateDoc(podRef, { dislikesCount: increment(-1) });
    return false;
  } else {
    const likeSnap = await getDoc(likeRef);
    if (likeSnap.exists()) {
      await deleteDoc(likeRef);
      await updateDoc(podRef, { likesCount: increment(-1) });
    }
    await setDoc(dislikeRef, { userId: user.uid, createdAt: serverTimestamp() });
    await updateDoc(podRef, { dislikesCount: increment(1) });
    return true;
  }
}

// ─── Commenti ─────────────────────────────────────────────────────────────────

export function listenPodcastComments(podcastId: string, cb: (comments: PodcastComment[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'podcast', podcastId, 'comments'),
    orderBy('createdAt', 'asc'),
    limit(100),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({
      id: d.id,
      userId: d.data().userId ?? '',
      username: d.data().username ?? 'Utente',
      text: d.data().text ?? '',
      createdAt: d.data().createdAt?.toDate() ?? new Date(),
    })));
  });
}

export async function addPodcastComment(podcastId: string, text: string, username: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  await addDoc(collection(db, 'podcast', podcastId, 'comments'), {
    userId: user.uid,
    username,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'podcast', podcastId), { commentsCount: increment(1) });
}

export async function deletePodcastComment(podcastId: string, commentId: string): Promise<void> {
  await deleteDoc(doc(db, 'podcast', podcastId, 'comments', commentId));
  await updateDoc(doc(db, 'podcast', podcastId), { commentsCount: increment(-1) });
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
  isITS?: boolean;     // true = episodio ITS
  category?: string;   // categoria opzionale
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
    likesCount: 0,
    dislikesCount: 0,
    commentsCount: 0,
    isITS: params.isITS ?? false,
    ...(params.category ? { category: params.category } : {}),
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

// ─── Single podcast ───────────────────────────────────────────────────────────

export async function getPodcastById(id: string): Promise<Podcast | null> {
  const snap = await getDoc(doc(db, 'podcast', id));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    userId: d.userId ?? '',
    username: d.username ?? '',
    userAvatar: d.userAvatar ?? '',
    title: d.title ?? '',
    description: d.description ?? '',
    audioUrl: d.audioUrl ?? '',
    coverUrl: d.coverUrl ?? null,
    duration: d.duration ?? 0,
    createdAt: d.createdAt?.toDate() ?? new Date(),
    likesCount: d.likesCount ?? 0,
    dislikesCount: d.dislikesCount ?? 0,
    commentsCount: d.commentsCount ?? 0,
    isITS: d.isITS ?? false,
    category: d.category,
  };
}

// ─── Playlist functions ───────────────────────────────────────────────────────

/** Crea una nuova playlist vuota e restituisce il suo ID */
export async function createPlaylist(name: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  const docRef = await addDoc(collection(db, 'playlists'), {
    name: name.trim(),
    userId: user.uid,
    podcastIds: [],
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/** Restituisce le playlist dell'utente corrente */
export async function getUserPlaylists(): Promise<Playlist[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(
    collection(db, 'playlists'),
    where('userId', '==', user.uid),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    name: d.data().name ?? '',
    userId: d.data().userId ?? '',
    podcastIds: d.data().podcastIds ?? [],
    createdAt: d.data().createdAt?.toDate() ?? new Date(),
  }));
}

/** Aggiunge un episodio a una playlist */
export async function addPodcastToPlaylist(playlistId: string, podcastId: string): Promise<void> {
  await updateDoc(doc(db, 'playlists', playlistId), {
    podcastIds: arrayUnion(podcastId),
  });
}

/** Rimuove un episodio da una playlist */
export async function removePodcastFromPlaylist(playlistId: string, podcastId: string): Promise<void> {
  await updateDoc(doc(db, 'playlists', playlistId), {
    podcastIds: arrayRemove(podcastId),
  });
}

/** Elimina una playlist */
export async function deletePlaylist(playlistId: string): Promise<void> {
  await deleteDoc(doc(db, 'playlists', playlistId));
}

/** Ascolta in real-time una singola playlist (aggiornamenti live) */
export function listenToPlaylist(
  playlistId: string,
  cb: (playlist: Playlist | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'playlists', playlistId), (snap) => {
    if (!snap.exists()) { cb(null); return; }
    const d = snap.data();
    cb({
      id: snap.id,
      name: d.name ?? '',
      userId: d.userId ?? '',
      podcastIds: d.podcastIds ?? [],
      createdAt: d.createdAt?.toDate() ?? new Date(),
    });
  });
}

// ─── SoundScape sound search ──────────────────────────────────────────────────

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
