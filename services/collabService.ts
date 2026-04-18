import {
  collection, doc, addDoc, updateDoc, onSnapshot,
  serverTimestamp, getDoc, Timestamp, query, where, orderBy, limit, getDocs,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { auth, db, storage, functions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export type CollabMode = 'sync' | 'turns';
export type CollabStatus =
  | 'pending'      // invito inviato, in attesa risposta
  | 'accepted'     // guest ha accettato, entrambi entrano
  | 'recording'    // registrazione in corso
  | 'uploading'    // upload tracce
  | 'mixing'       // Cloud Function al lavoro
  | 'done'         // mix pronto, pronto per pubblicare
  | 'rejected'     // guest ha rifiutato
  | 'cancelled';   // host ha annullato

export interface CollabSession {
  id: string;
  hostId: string;
  hostName: string;
  hostAvatar: string;
  guestId: string;
  guestName: string;
  guestAvatar: string;
  mode: CollabMode;
  status: CollabStatus;
  // Turn mode: 0 = host registra, 1 = guest registra
  currentTurn?: number;
  recordingStartedAt?: Date;
  recordingStoppedAt?: Date;
  hostTrackUrl?: string;
  guestTrackUrl?: string;
  hostTrackDuration?: number;
  guestTrackDuration?: number;
  resultUrl?: string;
  resultDuration?: number;
  createdAt: Date;
}

// ─── Crea sessione (host invita guest) ────────────────────────────────────────

export async function createCollabSession(
  guestId: string,
  guestName: string,
  guestAvatar: string,
  mode: CollabMode = 'sync',
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const ref = await addDoc(collection(db, 'collabSessions'), {
    hostId: user.uid,
    hostName: user.displayName || 'Host',
    hostAvatar: user.photoURL || '🎵',
    guestId,
    guestName,
    guestAvatar,
    mode,
    status: 'pending',
    currentTurn: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// ─── Ascolta una sessione ──────────────────────────────────────────────────────

export function listenToSession(
  sessionId: string,
  callback: (session: CollabSession) => void,
): () => void {
  return onSnapshot(doc(db, 'collabSessions', sessionId), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();
    callback({
      id: snap.id,
      hostId: d.hostId,
      hostName: d.hostName || 'Host',
      hostAvatar: d.hostAvatar || '🎵',
      guestId: d.guestId,
      guestName: d.guestName || 'Guest',
      guestAvatar: d.guestAvatar || '🎵',
      mode: d.mode || 'sync',
      status: d.status || 'pending',
      currentTurn: d.currentTurn ?? 0,
      recordingStartedAt: d.recordingStartedAt?.toDate(),
      recordingStoppedAt: d.recordingStoppedAt?.toDate(),
      hostTrackUrl: d.hostTrackUrl,
      guestTrackUrl: d.guestTrackUrl,
      hostTrackDuration: d.hostTrackDuration,
      guestTrackDuration: d.guestTrackDuration,
      resultUrl: d.resultUrl,
      resultDuration: d.resultDuration,
      createdAt: d.createdAt?.toDate() ?? new Date(),
    });
  });
}

// ─── Ascolta inviti in arrivo ─────────────────────────────────────────────────

export function listenToIncomingCollab(
  callback: (session: CollabSession | null) => void,
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  const q = query(
    collection(db, 'collabSessions'),
    where('guestId', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) { callback(null); return; }
    const d = snap.docs[0].data();
    callback({
      id: snap.docs[0].id,
      hostId: d.hostId,
      hostName: d.hostName || 'Host',
      hostAvatar: d.hostAvatar || '🎵',
      guestId: d.guestId,
      guestName: d.guestName || 'Guest',
      guestAvatar: d.guestAvatar || '🎵',
      mode: d.mode || 'sync',
      status: 'pending',
      currentTurn: 0,
      createdAt: d.createdAt?.toDate() ?? new Date(),
    });
  });
}

// ─── Azioni stato sessione ────────────────────────────────────────────────────

export async function acceptCollab(sessionId: string): Promise<void> {
  await updateDoc(doc(db, 'collabSessions', sessionId), { status: 'accepted' });
}

export async function rejectCollab(sessionId: string): Promise<void> {
  await updateDoc(doc(db, 'collabSessions', sessionId), { status: 'rejected' });
}

export async function cancelCollab(sessionId: string): Promise<void> {
  await updateDoc(doc(db, 'collabSessions', sessionId), { status: 'cancelled' });
}

// ─── Segnale inizio/fine registrazione (Firestore come canale di sync) ─────────

export async function signalStartRecording(sessionId: string): Promise<void> {
  await updateDoc(doc(db, 'collabSessions', sessionId), {
    status: 'recording',
    recordingStartedAt: serverTimestamp(),
    recordingStoppedAt: null,
  });
}

export async function signalStopRecording(sessionId: string): Promise<void> {
  await updateDoc(doc(db, 'collabSessions', sessionId), {
    recordingStoppedAt: serverTimestamp(),
  });
}

// ─── Upload traccia individuale ───────────────────────────────────────────────

export async function uploadMyTrack(
  sessionId: string,
  audioUri: string,
  duration: number,
  isHost: boolean,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Non autenticato');

  const role = isHost ? 'host' : 'guest';
  const storageRef = ref(storage, `collabs/${sessionId}/${role}.m4a`);

  const response = await fetch(audioUri);
  const blob = await response.blob();
  await uploadBytes(storageRef, blob, { contentType: 'audio/mp4' });
  const url = await getDownloadURL(storageRef);

  await updateDoc(doc(db, 'collabSessions', sessionId), {
    [`${role}TrackUrl`]: url,
    [`${role}TrackDuration`]: duration,
    status: 'uploading',
  });
}

// ─── Avanza turno (modalità turni) ────────────────────────────────────────────

export async function advanceTurn(sessionId: string): Promise<void> {
  await updateDoc(doc(db, 'collabSessions', sessionId), {
    currentTurn: 1,
    status: 'accepted', // torna a stato pronto per il secondo turno
    recordingStartedAt: null,
    recordingStoppedAt: null,
  });
}

// ─── Chiama Cloud Function per mixare ────────────────────────────────────────

export async function processCollab(sessionId: string): Promise<void> {
  await updateDoc(doc(db, 'collabSessions', sessionId), { status: 'mixing' });
  const fn = httpsCallable(functions, 'processCollab');
  try {
    await fn({ sessionId });
  } catch (err) {
    // Ripristina status per permettere retry e fermare lo spinner
    await updateDoc(doc(db, 'collabSessions', sessionId), { status: 'uploading' }).catch(() => {});
    throw err;
  }
}

// ─── Pubblica il risultato come suono ────────────────────────────────────────

export async function publishCollabAsSound(
  sessionId: string,
  title: string,
): Promise<void> {
  const snap = await getDoc(doc(db, 'collabSessions', sessionId));
  if (!snap.exists()) throw new Error('Sessione non trovata');
  const s = snap.data();
  if (!s.resultUrl) throw new Error('Mix non pronto');

  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Non autenticato');

  const userDoc = await getDoc(doc(db, 'users', uid));
  const userData = userDoc.data();

  await addDoc(collection(db, 'sounds'), {
    userId: uid,
    username: userData?.username || userData?.displayName || 'Anonimo',
    userAvatar: userData?.avatar || '🎧',
    collaboratorId: s.hostId === uid ? s.guestId : s.hostId,
    collaboratorName: s.hostId === uid ? s.guestName : s.hostName,
    title,
    audioUrl: s.resultUrl,
    duration: s.resultDuration ?? 0,
    isCollab: true,
    collabSessionId: sessionId,
    likes: 0,
    comments: 0,
    listens: 0,
    createdAt: serverTimestamp(),
  });
}
