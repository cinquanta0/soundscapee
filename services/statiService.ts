import {
  collection, query, where, orderBy, getDocs,
  addDoc, updateDoc, arrayUnion, serverTimestamp, doc, Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebaseConfig';
import { auth } from '../firebaseConfig';

export interface StatoScreen {
  emoji: string;
  title: string;
  body: string;
  audioUrl?: string;
  audioDuration?: number; // secondi
}

export interface StatiGroup {
  id: string;
  label: string;
  icon: string;
  screens: StatoScreen[];
  userId: string;
  createdAt: Date;
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/**
 * Carica tutti gli stati degli ultimi 24h (esclusi i tutorial hardcoded).
 */
export async function getRecentStati(): Promise<StatiGroup[]> {
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS);
  const q = query(
    collection(db, 'stati'),
    where('tipo', '==', 'utente'),
    where('createdAt', '>=', Timestamp.fromDate(cutoff)),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);

  // Raggruppa per userId: ogni utente ha un solo cerchio con tutti i suoi stati
  const byUser: Record<string, StatiGroup> = {};
  for (const d of snap.docs) {
    const data = d.data();
    const uid = data.userId as string;
    if (!byUser[uid]) {
      byUser[uid] = {
        id: `user_${uid}`,
        label: data.username || 'Utente',
        icon: data.avatar || '🎵',
        screens: [],
        userId: uid,
        createdAt: data.createdAt?.toDate() ?? new Date(),
      };
    }
    byUser[uid].screens.push({
      emoji: data.emoji || '🎵',
      title: data.title || '',
      body: data.body || '',
      audioUrl: data.audioUrl || undefined,
      audioDuration: data.audioDuration || undefined,
    });
  }

  return Object.values(byUser);
}

/**
 * Crea un nuovo stato utente.
 */
export async function createStato(params: {
  emoji: string;
  title: string;
  body: string;
  username: string;
  avatar: string;
  audioUrl?: string;
  audioDuration?: number;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  await addDoc(collection(db, 'stati'), {
    userId: user.uid,
    username: params.username,
    avatar: params.avatar,
    emoji: params.emoji,
    title: params.title,
    body: params.body,
    audioUrl: params.audioUrl || null,
    audioDuration: params.audioDuration || null,
    tipo: 'utente',
    visti: [],
    createdAt: serverTimestamp(),
  });
}

/**
 * Segna uno stato come visto dall'utente corrente.
 */
export async function markStatoViewed(statoId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await updateDoc(doc(db, 'stati', statoId), {
    visti: arrayUnion(user.uid),
  });
}
