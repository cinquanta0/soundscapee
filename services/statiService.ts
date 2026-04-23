import {
  collection, query, where, orderBy, getDocs,
  addDoc, updateDoc, arrayUnion, serverTimestamp, doc, Timestamp, deleteDoc, getDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebaseConfig';
import { auth } from '../firebaseConfig';

export interface StatoScreen {
  id?: string;
  emoji: string;
  title: string;
  body: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number; // secondi
  seenBy?: string[];
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

// Feather icon names → emoji equivalents (for story circles which render plain text)
const FEATHER_TO_EMOJI: Record<string, string> = {
  music: '🎵', headphones: '🎧', radio: '📻', mic: '🎤', speaker: '🔊',
  disc: '💿', 'volume-2': '🔊', 'play-circle': '▶️', star: '⭐', zap: '⚡',
  heart: '❤️', sun: '☀️', moon: '🌙', cloud: '☁️', wind: '💨', droplet: '💧',
};
function resolveAvatarEmoji(avatar: string | undefined): string {
  if (!avatar) return '🎵';
  return FEATHER_TO_EMOJI[avatar] ?? avatar;
}

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
        icon: resolveAvatarEmoji(data.avatar),
        screens: [],
        userId: uid,
        createdAt: data.createdAt?.toDate() ?? new Date(),
      };
    }
    byUser[uid].screens.push({
      id: d.id,
      emoji: data.emoji || '🎵',
      title: data.title || '',
      body: data.body || '',
      imageUrl: data.imageUrl || undefined,
      audioUrl: data.audioUrl || undefined,
      audioDuration: data.audioDuration || undefined,
      seenBy: Array.isArray(data.visti) ? data.visti : [],
    });
  }

  // Aggiorna label e icon con i dati aggiornati dal profilo Firestore,
  // così anche se il campo username nel documento stato è stale/errato mostriamo il nome corretto.
  const uids = Object.keys(byUser);
  await Promise.all(
    uids.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
          const p = snap.data();
          if (p.username) byUser[uid].label = p.username;
          if (p.avatar) byUser[uid].icon = resolveAvatarEmoji(p.avatar);
        }
      } catch {
        // profilo non disponibile — usa il valore denormalizzato già presente
      }
    })
  );

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
  imageUrl?: string;
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
    imageUrl: params.imageUrl || null,
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

export async function deleteStato(statoId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  // Verifica ownership prima di eliminare
  const snap = await getDoc(doc(db, 'stati', statoId));
  if (!snap.exists() || snap.data().userId !== user.uid) {
    throw new Error('Non autorizzato');
  }
  await deleteDoc(doc(db, 'stati', statoId));
}

export async function getStatoViewers(statoId: string): Promise<Array<{ id: string; name: string; avatar: string }>> {
  const statoSnap = await getDoc(doc(db, 'stati', statoId));
  if (!statoSnap.exists()) return [];
  const seenBy = Array.isArray(statoSnap.data()?.visti) ? statoSnap.data().visti : [];
  if (!seenBy.length) return [];

  const profiles = await Promise.all(
    seenBy.map(async (uid: string) => {
      try {
        const uSnap = await getDoc(doc(db, 'users', uid));
        const data = uSnap.exists() ? uSnap.data() : {};
        return {
          id: uid,
          name: data?.displayName || data?.username || 'Utente',
          avatar: data?.avatar || '🎵',
        };
      } catch {
        return { id: uid, name: 'Utente', avatar: '🎵' };
      }
    }),
  );

  return profiles;
}
