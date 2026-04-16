import {
    addDoc,
    collection, doc,
    getDoc, getDocs,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc, updateDoc,
    where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebaseConfig';

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export type BattleStatus =
  | 'pending'             // invito inviato
  | 'accepted'            // opponent ha accettato
  | 'challenger_rec'      // challenger sta registrando
  | 'opponent_rec'        // opponent sta registrando
  | 'voting'              // entrambe le tracce pronte, pubblico vota
  | 'done'                // battaglia conclusa
  | 'rejected'
  | 'cancelled';

export interface Battle {
  id: string;
  challengerId: string;
  challengerName: string;
  challengerAvatar: string;
  opponentId: string;
  opponentName: string;
  opponentAvatar: string;
  theme: string;
  status: BattleStatus;
  challengerTrackUrl?: string;
  challengerTrackDuration?: number;
  opponentTrackUrl?: string;
  opponentTrackDuration?: number;
  challengerVotes: number;
  opponentVotes: number;
  votingEndsAt?: Date;
  winnerId?: string;
  createdAt: Date;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function mapBattle(id: string, d: any): Battle {
  return {
    id,
    challengerId: d.challengerId,
    challengerName: d.challengerName || 'Challenger',
    challengerAvatar: d.challengerAvatar || '🎙',
    opponentId: d.opponentId,
    opponentName: d.opponentName || 'Opponent',
    opponentAvatar: d.opponentAvatar || '🎙',
    theme: d.theme || '',
    status: d.status || 'pending',
    challengerTrackUrl: d.challengerTrackUrl,
    challengerTrackDuration: d.challengerTrackDuration,
    opponentTrackUrl: d.opponentTrackUrl,
    opponentTrackDuration: d.opponentTrackDuration,
    challengerVotes: d.challengerVotes ?? 0,
    opponentVotes: d.opponentVotes ?? 0,
    votingEndsAt: d.votingEndsAt?.toDate(),
    winnerId: d.winnerId,
    createdAt: d.createdAt?.toDate() ?? new Date(),
  };
}

// ─── Crea battaglia ───────────────────────────────────────────────────────────

export async function createBattle(
  opponentId: string,
  opponentName: string,
  opponentAvatar: string,
  theme: string,
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const r = await addDoc(collection(db, 'battles'), {
    challengerId: user.uid,
    challengerName: user.displayName || 'Challenger',
    challengerAvatar: user.photoURL || '🎙',
    opponentId,
    opponentName,
    opponentAvatar,
    theme,
    status: 'pending',
    challengerVotes: 0,
    opponentVotes: 0,
    createdAt: serverTimestamp(),
  });
  return r.id;
}

// ─── Ascolta una battaglia ─────────────────────────────────────────────────────

export function listenToBattle(
  battleId: string,
  callback: (b: Battle) => void,
): () => void {
  return onSnapshot(doc(db, 'battles', battleId), (snap) => {
    if (!snap.exists()) return;
    callback(mapBattle(snap.id, snap.data()));
  });
}

// ─── Ascolta inviti in arrivo ─────────────────────────────────────────────────

export function listenToIncomingBattle(
  callback: (b: Battle | null) => void,
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  const q = query(
    collection(db, 'battles'),
    where('opponentId', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) { callback(null); return; }
    callback(mapBattle(snap.docs[0].id, snap.docs[0].data()));
  });
}

// ─── Ascolta battaglie attive (per explore) ────────────────────────────────────

export function listenToActiveBattles(
  callback: (battles: Battle[]) => void,
): () => void {
  const q = query(
    collection(db, 'battles'),
    where('status', 'in', ['accepted', 'challenger_rec', 'opponent_rec', 'voting']),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => mapBattle(d.id, d.data())));
  });
}

// ─── Azioni stato ─────────────────────────────────────────────────────────────

export async function acceptBattle(battleId: string): Promise<void> {
  await updateDoc(doc(db, 'battles', battleId), { status: 'accepted' });
}

export async function rejectBattle(battleId: string): Promise<void> {
  await updateDoc(doc(db, 'battles', battleId), { status: 'rejected' });
}

export async function cancelBattle(battleId: string): Promise<void> {
  await updateDoc(doc(db, 'battles', battleId), { status: 'cancelled' });
}

export async function startChallengerRec(battleId: string): Promise<void> {
  await updateDoc(doc(db, 'battles', battleId), { status: 'challenger_rec' });
}

export async function startOpponentRec(battleId: string): Promise<void> {
  await updateDoc(doc(db, 'battles', battleId), { status: 'opponent_rec' });
}

// ─── Upload traccia ───────────────────────────────────────────────────────────

export async function uploadBattleTrack(
  battleId: string,
  audioUri: string,
  duration: number,
  isChallenger: boolean,
): Promise<void> {
  const role = isChallenger ? 'challenger' : 'opponent';
  const storageRef = ref(storage, `battles/${battleId}/${role}.m4a`);
  const response = await fetch(audioUri);
  const blob = await response.blob();
  await uploadBytes(storageRef, blob, { contentType: 'audio/mp4' });
  const url = await getDownloadURL(storageRef);

  const votingEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const isOpponentDone = !isChallenger;
  const snap = await getDoc(doc(db, 'battles', battleId));
  const d = snap.data()!;
  const otherDone = isChallenger ? !!d.opponentTrackUrl : !!d.challengerTrackUrl;

  await updateDoc(doc(db, 'battles', battleId), {
    [`${role}TrackUrl`]: url,
    [`${role}TrackDuration`]: duration,
    ...(otherDone || isOpponentDone
      ? { status: 'voting', votingEndsAt }
      : { status: isChallenger ? 'opponent_rec' : 'voting', ...(isChallenger ? {} : { votingEndsAt }) }),
  });
}

// ─── Vota ─────────────────────────────────────────────────────────────────────

export async function voteBattle(battleId: string, votedForId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Non autenticato');

  const snap = await getDoc(doc(db, 'battles', battleId));
  const d = snap.data()!;
  const isChallenger = votedForId === d.challengerId;

  // Salva voto usando uid come ID doc → previene voti multipli
  try {
    await setDoc(doc(db, 'battles', battleId, 'votes', uid), {
      userId: uid,
      votedForId,
      createdAt: serverTimestamp(),
    });
  } catch (e: any) {
    const code = e?.code ? ` (${e.code})` : '';
    throw new Error(`voteBattle: denied writing votes subdoc${code}`);
  }

  // Incrementa counter
  try {
    await updateDoc(doc(db, 'battles', battleId), {
      [isChallenger ? 'challengerVotes' : 'opponentVotes']: increment(1),
    });
  } catch (e: any) {
    const code = e?.code ? ` (${e.code})` : '';
    throw new Error(`voteBattle: denied updating battle counters${code}`);
  }
}

export async function getMyVote(battleId: string): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'battles', battleId, 'votes', uid));
  if (!snap.exists()) return null;
  return snap.data().votedForId;
}

// Se in passato per regole Firebase le scritture dei contatori fallivano,
// può succedere che il doc vote esista ma `challengerVotes/opponentVotes` siano indietro.
// Questa funzione ricalcola i contatori partendo da tutti i vote subdoc e incrementa solo i mancanti.
export async function reconcileBattleCounters(battleId: string): Promise<void> {
  const battleSnap = await getDoc(doc(db, 'battles', battleId));
  if (!battleSnap.exists()) return;
  const b = battleSnap.data()!;

  // Legge i voti effettivi dalla subcollection `votes`
  const votesSnap = await getDocs(collection(db, 'battles', battleId, 'votes'));
  let expectedChallenger = 0;
  let expectedOpponent = 0;
  votesSnap.forEach((v) => {
    const d = v.data();
    if (d?.votedForId === b.challengerId) expectedChallenger += 1;
    else if (d?.votedForId === b.opponentId) expectedOpponent += 1;
  });

  const currentChallenger = b.challengerVotes ?? 0;
  const currentOpponent = b.opponentVotes ?? 0;

  const missingChallenger = expectedChallenger - currentChallenger;
  const missingOpponent = expectedOpponent - currentOpponent;

  // Le regole attuali consentono incrementi (+1), non decrementi o set arbitrari.
  const maxSteps = 20;
  for (let i = 0; i < missingChallenger && i < maxSteps; i++) {
    await updateDoc(doc(db, 'battles', battleId), { challengerVotes: increment(1) });
  }
  for (let i = 0; i < missingOpponent && i < maxSteps; i++) {
    await updateDoc(doc(db, 'battles', battleId), { opponentVotes: increment(1) });
  }
}

// ─── Chiudi battaglia (calcola vincitore) ──────────────────────────────────────

export async function finalizeBattle(battleId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'battles', battleId));
  const d = snap.data()!;
  if (d.status === 'done') return;
  const winnerId = (d.challengerVotes >= d.opponentVotes) ? d.challengerId : d.opponentId;
  await updateDoc(doc(db, 'battles', battleId), { status: 'done', winnerId });
  // Incrementa battleWins sul vincitore
  await updateDoc(doc(db, 'users', winnerId), { battleWins: increment(1) });
}
