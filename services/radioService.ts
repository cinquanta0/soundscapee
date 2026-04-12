import {
  collection, addDoc, query, where, orderBy,
  limit, serverTimestamp, doc, updateDoc, increment,
  onSnapshot, Unsubscribe, Timestamp, setDoc, deleteDoc,
  arrayUnion, arrayRemove, getDocs,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebaseConfig';
import { auth } from '../firebaseConfig';

export interface PlaylistTrack {
  url: string;
  name: string;
  duration?: number;   // secondi, rilevati al momento del pick
  gapAfter?: number;   // secondi di pausa dopo questa traccia prima della prossima
}

export interface RadioRoom {
  id: string;
  hostId: string;
  hostName: string;
  title: string;
  description?: string;
  isLive: boolean;
  listenerCount: number;
  playlist: PlaylistTrack[];
  currentTrackIndex: number;
  /**
   * Momento in cui l'audio della traccia corrente INIZIA.
   * Può essere nel futuro (durante la pausa tra tracce).
   * elapsed = Date.now() - trackStartedAt.getTime()
   *   < 0  → siamo nella pausa, aspetta
   *   >= 0 → cerca a elapsed ms
   */
  trackStartedAt: Date;
  audioUrl?: string; // legacy compat
  startedAt: Date;
  createdAt: Date;
  hostMicLive?: boolean;
  activeSpeakers?: string[];  // userIds currently speaking (picked + cohosts)
  cohosts?: string[];         // userIds promoted to permanent cohost
  scheduledFor?: Date;        // set when room is not yet live
}

function mapRoom(id: string, data: Record<string, any>): RadioRoom {
  return {
    id,
    hostId: data.hostId ?? '',
    hostName: data.hostName ?? '',
    title: data.title ?? '',
    description: data.description ?? '',
    isLive: data.isLive ?? false,
    listenerCount: data.listenerCount ?? 0,
    playlist: data.playlist ?? (data.audioUrl ? [{ url: data.audioUrl, name: 'Traccia 1' }] : []),
    currentTrackIndex: data.currentTrackIndex ?? 0,
    trackStartedAt: data.trackStartedAt?.toDate() ?? data.startedAt?.toDate() ?? new Date(),
    audioUrl: data.audioUrl,
    startedAt: data.startedAt?.toDate() ?? new Date(),
    createdAt: data.createdAt?.toDate() ?? new Date(),
    hostMicLive: data.hostMicLive ?? false,
    activeSpeakers: data.activeSpeakers ?? [],
    cohosts: data.cohosts ?? [],
    scheduledFor: data.scheduledFor?.toDate?.() ?? undefined,
  };
}

export async function setHostMicLive(roomId: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'radio', roomId), { hostMicLive: active });
}

export function listenToLiveRooms(cb: (rooms: RadioRoom[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'radio'),
    where('isLive', '==', true),
    orderBy('listenerCount', 'desc'),
    limit(20),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => mapRoom(d.id, d.data())));
  });
}

export async function createRadioRoom(params: {
  title: string;
  description?: string;
  playlist: PlaylistTrack[];  // già uploadate, contengono url
  hostName: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  const docRef = await addDoc(collection(db, 'radio'), {
    hostId: user.uid,
    hostName: params.hostName,
    title: params.title,
    description: params.description ?? '',
    isLive: true,
    listenerCount: 0,
    playlist: params.playlist,
    currentTrackIndex: 0,
    trackStartedAt: serverTimestamp(),
    audioUrl: params.playlist[0]?.url ?? '',
    startedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Carica una singola traccia su Storage e restituisce la PlaylistTrack completa.
 * Usata da CreateRoomModal per caricare una traccia alla volta con progress.
 */
export async function uploadTrack(params: {
  uri: string;
  name: string;
  duration?: number;
  gapAfter: number;
}): Promise<PlaylistTrack> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  const ext = params.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') ?? 'm4a';
  const blob = await (await fetch(params.uri)).blob();
  const storageRef = ref(storage, `radio/${user.uid}/${Date.now()}.${ext}`);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  return { url, name: params.name, duration: params.duration, gapAfter: params.gapAfter };
}

/**
 * Avanza alla traccia successiva.
 * gapSeconds > 0 → trackStartedAt è nel futuro, i listener aspettano in pausa.
 */
export async function skipToNextTrack(
  roomId: string,
  nextIndex: number,
  gapSeconds: number = 0,
): Promise<void> {
  const startAt = new Date(Date.now() + gapSeconds * 1000);
  await updateDoc(doc(db, 'radio', roomId), {
    currentTrackIndex: nextIndex,
    trackStartedAt: Timestamp.fromDate(startAt),
  });
}

export async function endRadioRoom(roomId: string): Promise<void> {
  await updateDoc(doc(db, 'radio', roomId), { isLive: false });
}

export async function joinRadioRoom(roomId: string): Promise<void> {
  await updateDoc(doc(db, 'radio', roomId), { listenerCount: increment(1) });
}

export async function leaveRadioRoom(roomId: string): Promise<void> {
  await updateDoc(doc(db, 'radio', roomId), { listenerCount: increment(-1) });
}

export function listenToRoom(roomId: string, cb: (room: RadioRoom) => void): Unsubscribe {
  return onSnapshot(doc(db, 'radio', roomId), (snap) => {
    if (snap.exists()) cb(mapRoom(snap.id, snap.data()));
  });
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: Date;
  isPicked: boolean;
}

export function listenToChat(roomId: string, cb: (msgs: ChatMessage[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'radio', roomId, 'chat'),
    orderBy('timestamp', 'asc'),
    limit(100),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({
      id: d.id,
      userId: d.data().userId ?? '',
      userName: d.data().userName ?? '',
      text: d.data().text ?? '',
      timestamp: d.data().timestamp?.toDate() ?? new Date(),
      isPicked: d.data().isPicked ?? false,
    })));
  });
}

export async function sendChatMessage(roomId: string, text: string, userName: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await addDoc(collection(db, 'radio', roomId, 'chat'), {
    userId: user.uid,
    userName,
    text: text.trim(),
    timestamp: serverTimestamp(),
    isPicked: false,
  });
}

// ─── Reactions ────────────────────────────────────────────────────────────────

export interface Reaction {
  id: string;
  userId: string;
  emoji: string;
  timestamp: Date;
}

export async function sendReaction(roomId: string, emoji: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await addDoc(collection(db, 'radio', roomId, 'reactions'), {
    userId: user.uid,
    emoji,
    timestamp: serverTimestamp(),
  });
}

export function listenToReactions(roomId: string, cb: (reactions: Reaction[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'radio', roomId, 'reactions'),
    orderBy('timestamp', 'desc'),
    limit(50),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({
      id: d.id,
      userId: d.data().userId ?? '',
      emoji: d.data().emoji ?? '❤️',
      timestamp: d.data().timestamp?.toDate() ?? new Date(),
    })));
  });
}

// ─── Hand Raises ──────────────────────────────────────────────────────────────

export interface HandRaise {
  id: string;
  userId: string;
  userName: string;
  timestamp: Date;
  status: 'pending' | 'picked';
}

export async function raiseHand(roomId: string, userName: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await setDoc(doc(db, 'radio', roomId, 'handRaises', user.uid), {
    userId: user.uid,
    userName,
    timestamp: serverTimestamp(),
    status: 'pending',
  });
}

export async function lowerHand(roomId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(db, 'radio', roomId, 'handRaises', user.uid));
}

export function listenToMyHandRaise(
  roomId: string,
  cb: (raise: HandRaise | null) => void,
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) { cb(null); return () => {}; }
  return onSnapshot(doc(db, 'radio', roomId, 'handRaises', user.uid), (snap) => {
    if (!snap.exists()) { cb(null); return; }
    const d = snap.data();
    cb({
      id: snap.id,
      userId: d.userId,
      userName: d.userName,
      timestamp: d.timestamp?.toDate() ?? new Date(),
      status: d.status ?? 'pending',
    });
  });
}

export function listenToHandRaises(
  roomId: string,
  cb: (raises: HandRaise[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'radio', roomId, 'handRaises'),
    where('status', 'in', ['pending', 'picked']),
    orderBy('timestamp', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({
      id: d.id,
      userId: d.data().userId ?? '',
      userName: d.data().userName ?? '',
      timestamp: d.data().timestamp?.toDate() ?? new Date(),
      status: d.data().status ?? 'pending',
    })));
  });
}

export async function pickListener(
  roomId: string,
  userId: string,
  userName: string,
): Promise<void> {
  await updateDoc(doc(db, 'radio', roomId, 'handRaises', userId), {
    status: 'picked',
    pickedAt: Timestamp.now(),
  });
  await addDoc(collection(db, 'radio', roomId, 'chat'), {
    userId: 'system',
    userName: 'sistema',
    text: `⭐ ${userName} è in evidenza!`,
    timestamp: serverTimestamp(),
    isPicked: true,
  });
}

export async function dismissPick(roomId: string, userId: string): Promise<void> {
  await deleteDoc(doc(db, 'radio', roomId, 'handRaises', userId));
}

// ─── Speaker management (listener che parla) ──────────────────────────────────

export async function grantSpeaker(roomId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'radio', roomId), { activeSpeakers: arrayUnion(userId) });
}

export async function revokeSpeaker(roomId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'radio', roomId), { activeSpeakers: arrayRemove(userId) });
}

// ─── Cohost ───────────────────────────────────────────────────────────────────

export async function addCohost(roomId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'radio', roomId), {
    cohosts: arrayUnion(userId),
    activeSpeakers: arrayUnion(userId),
  });
}

export async function removeCohost(roomId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, 'radio', roomId), {
    cohosts: arrayRemove(userId),
    activeSpeakers: arrayRemove(userId),
  });
}

// ─── Playlist Collaborativa (Suggerimenti) ────────────────────────────────────

export interface Suggestion {
  id: string;
  userId: string;
  userName: string;
  soundId: string;
  soundName: string;
  soundUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: Date;
}

export async function suggestTrack(
  roomId: string,
  params: { soundId: string; soundName: string; soundUrl: string; userName: string },
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await addDoc(collection(db, 'radio', roomId, 'suggestions'), {
    userId: user.uid,
    userName: params.userName,
    soundId: params.soundId,
    soundName: params.soundName,
    soundUrl: params.soundUrl,
    status: 'pending',
    timestamp: serverTimestamp(),
  });
}

export async function approveSuggestion(
  roomId: string,
  suggestionId: string,
  soundUrl: string,
  soundName: string,
): Promise<void> {
  await updateDoc(doc(db, 'radio', roomId, 'suggestions', suggestionId), { status: 'approved' });
  await updateDoc(doc(db, 'radio', roomId), {
    playlist: arrayUnion({ url: soundUrl, name: soundName }),
  });
}

export async function rejectSuggestion(roomId: string, suggestionId: string): Promise<void> {
  await updateDoc(doc(db, 'radio', roomId, 'suggestions', suggestionId), { status: 'rejected' });
}

export function listenToSuggestions(
  roomId: string,
  cb: (suggestions: Suggestion[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'radio', roomId, 'suggestions'),
    orderBy('timestamp', 'asc'),
    limit(50),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({
      id: d.id,
      userId: d.data().userId ?? '',
      userName: d.data().userName ?? '',
      soundId: d.data().soundId ?? '',
      soundName: d.data().soundName ?? 'Suono',
      soundUrl: d.data().soundUrl ?? '',
      status: d.data().status ?? 'pending',
      timestamp: d.data().timestamp?.toDate() ?? new Date(),
    })));
  });
}

// ─── Suoni utente (per suggerimenti) ─────────────────────────────────────────

export interface UserSound {
  id: string;
  title: string;
  audioUrl: string;
}

export async function fetchUserSoundsForSuggestion(): Promise<UserSound[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(
    collection(db, 'sounds'),
    where('userId', '==', user.uid),
    orderBy('createdAt', 'desc'),
    limit(15),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    title: d.data().title ?? d.data().name ?? 'Suono',
    audioUrl: d.data().audioUrl ?? d.data().url ?? d.data().fileUrl ?? '',
  })).filter((s) => s.audioUrl);
}

// ─── Radio programmata ────────────────────────────────────────────────────────

export async function scheduleRadioRoom(params: {
  title: string;
  description?: string;
  playlist: PlaylistTrack[];
  hostName: string;
  scheduledFor: Date;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  const docRef = await addDoc(collection(db, 'radio'), {
    hostId: user.uid,
    hostName: params.hostName,
    title: params.title,
    description: params.description ?? '',
    isLive: false,
    listenerCount: 0,
    playlist: params.playlist,
    currentTrackIndex: 0,
    trackStartedAt: Timestamp.fromDate(params.scheduledFor),
    audioUrl: params.playlist[0]?.url ?? '',
    startedAt: Timestamp.fromDate(params.scheduledFor),
    createdAt: serverTimestamp(),
    scheduledFor: Timestamp.fromDate(params.scheduledFor),
  });
  return docRef.id;
}

export async function startScheduledRoom(roomId: string): Promise<void> {
  const now = new Date();
  await updateDoc(doc(db, 'radio', roomId), {
    isLive: true,
    trackStartedAt: serverTimestamp(),
    startedAt: serverTimestamp(),
    scheduledFor: null,
  });
}

export function listenToScheduledRooms(hostId: string, cb: (rooms: RadioRoom[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'radio'),
    where('hostId', '==', hostId),
    limit(10),
  );
  return onSnapshot(q, (snap) => {
    const now = new Date();
    const scheduled = snap.docs
      .map((d) => mapRoom(d.id, d.data()))
      .filter((r) => !r.isLive && r.scheduledFor && r.scheduledFor > now);
    cb(scheduled);
  });
}
