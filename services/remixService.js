import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  increment,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, auth } from '../firebaseConfig';

// ═══════════════════════════════════════════════════════════════════════
// CREATE REMIX
// ═══════════════════════════════════════════════════════════════════════

export const createRemix = async (remixData) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const remixDoc = {
    userId: user.uid,
    username: user.displayName || 'Anonymous',
    userAvatar: user.photoURL || '🎵',
    title: remixData.title,
    description: remixData.description || '',
    tracks: remixData.tracks.map((track) => ({
      soundId: track.id || track.soundId,
      title: track.title,
      audioUrl: track.audioUrl,
      duration: track.duration,
      volume: track.volume || 1,
      offsetStart: track.offsetStart || 0,
      trimStart: track.startTime || 0,
      trimEnd: track.endTime || track.duration,
    })),
    tracksCount: remixData.tracks.length,
    totalDuration: remixData.totalDuration,
    isPublic: remixData.isPublic !== false,
    isProcessed: false,
    processingStatus: 'pending', // pending | processing | done | error
    audioUrl: null,
    plays: 0,
    likes: 0,
    shares: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'remixes'), remixDoc);
  return docRef.id;
};

// ═══════════════════════════════════════════════════════════════════════
// READ REMIXES
// ═══════════════════════════════════════════════════════════════════════

export const getPublicRemixes = async (limitCount = 20) => {
  const q = query(
    collection(db, 'remixes'),
    where('isPublic', '==', true),
    where('isProcessed', '==', true),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate() || new Date(),
    updatedAt: d.data().updatedAt?.toDate() || new Date(),
  }));
};

export const getUserRemixes = async (userId = null) => {
  const uid = userId || auth.currentUser?.uid;
  if (!uid) throw new Error('User not authenticated');

  const q = query(
    collection(db, 'remixes'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate() || new Date(),
    updatedAt: d.data().updatedAt?.toDate() || new Date(),
  }));
};

export const getRemix = async (remixId) => {
  const docRef = doc(db, 'remixes', remixId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) throw new Error('Remix not found');

  return {
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: docSnap.data().createdAt?.toDate() || new Date(),
    updatedAt: docSnap.data().updatedAt?.toDate() || new Date(),
  };
};

/**
 * Listener real-time su un remix — aggiorna la UI quando il processing finisce.
 * Restituisce la funzione unsubscribe.
 */
export const subscribeToRemix = (remixId, callback) => {
  const docRef = doc(db, 'remixes', remixId);
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback({
        id: snap.id,
        ...snap.data(),
        createdAt: snap.data().createdAt?.toDate() || new Date(),
        updatedAt: snap.data().updatedAt?.toDate() || new Date(),
      });
    }
  });
};

// ═══════════════════════════════════════════════════════════════════════
// UPDATE REMIX
// ═══════════════════════════════════════════════════════════════════════

export const updateRemix = async (remixId, updates) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const remix = await getRemix(remixId);
  if (remix.userId !== user.uid) throw new Error('Not authorized');

  await updateDoc(doc(db, 'remixes', remixId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const markRemixProcessed = async (remixId, audioUrl) => {
  await updateDoc(doc(db, 'remixes', remixId), {
    isProcessed: true,
    processingStatus: 'done',
    audioUrl,
    updatedAt: serverTimestamp(),
  });
};

// ═══════════════════════════════════════════════════════════════════════
// DELETE REMIX
// ═══════════════════════════════════════════════════════════════════════

export const deleteRemix = async (remixId) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const remix = await getRemix(remixId);
  if (remix.userId !== user.uid) throw new Error('Not authorized');

  await deleteDoc(doc(db, 'remixes', remixId));
};

// ═══════════════════════════════════════════════════════════════════════
// REMIX PROCESSING — chiama la Cloud Function reale
// ═══════════════════════════════════════════════════════════════════════

export const requestRemixRendering = async (remixId) => {
  const functions = getFunctions(undefined, 'europe-west1');
  const processRemix = httpsCallable(functions, 'processRemix');
  const result = await processRemix({ remixId });
  return result.data;
};

// ═══════════════════════════════════════════════════════════════════════
// INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════

export const incrementRemixPlays = async (remixId) => {
  try {
    await updateDoc(doc(db, 'remixes', remixId), { plays: increment(1) });
  } catch (_) {
    // Non blocca il playback
  }
};

export const toggleRemixLike = async (remixId) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  // Il documento like usa l'uid come ID — coerente con le Security Rules
  const likeRef = doc(db, 'remixes', remixId, 'likes', user.uid);
  const likeSnap = await getDoc(likeRef);
  const remixRef = doc(db, 'remixes', remixId);

  if (likeSnap.exists()) {
    await deleteDoc(likeRef);
    await updateDoc(remixRef, { likes: increment(-1) });
    return false;
  } else {
    await setDoc(likeRef, { createdAt: serverTimestamp() });
    await updateDoc(remixRef, { likes: increment(1) });
    return true;
  }
};

export const hasUserLikedRemix = async (remixId) => {
  const user = auth.currentUser;
  if (!user) return false;

  const likeRef = doc(db, 'remixes', remixId, 'likes', user.uid);
  const likeSnap = await getDoc(likeRef);
  return likeSnap.exists();
};

export const incrementRemixShares = async (remixId) => {
  try {
    await updateDoc(doc(db, 'remixes', remixId), { shares: increment(1) });
  } catch (_) {}
};

// ═══════════════════════════════════════════════════════════════════════
// STATS & TRENDING
// ═══════════════════════════════════════════════════════════════════════

export const getUserRemixStats = async (userId = null) => {
  const remixes = await getUserRemixes(userId);
  return {
    totalRemixes: remixes.length,
    totalPlays: remixes.reduce((s, r) => s + (r.plays || 0), 0),
    totalLikes: remixes.reduce((s, r) => s + (r.likes || 0), 0),
    totalShares: remixes.reduce((s, r) => s + (r.shares || 0), 0),
    processedRemixes: remixes.filter((r) => r.isProcessed).length,
    publicRemixes: remixes.filter((r) => r.isPublic).length,
  };
};

export const getTrendingRemixes = async (limitCount = 10) => {
  const q = query(
    collection(db, 'remixes'),
    where('isPublic', '==', true),
    where('isProcessed', '==', true),
    orderBy('likes', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate() || new Date(),
  }));
};

export default {
  createRemix,
  getPublicRemixes,
  getUserRemixes,
  getRemix,
  subscribeToRemix,
  updateRemix,
  markRemixProcessed,
  deleteRemix,
  requestRemixRendering,
  incrementRemixPlays,
  toggleRemixLike,
  hasUserLikedRemix,
  incrementRemixShares,
  getUserRemixStats,
  getTrendingRemixes,
};
