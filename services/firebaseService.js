import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  getCountFromServer,
  arrayUnion,
  arrayRemove,
  writeBatch
} from 'firebase/firestore';

import { sanitizeField } from '../utils/sanitize';

const DAILY_SOUND_LIMIT = 10;

/**
 * Controlla il rate limit giornaliero per la pubblicazione di suoni.
 * Lancia un errore se l'utente ha già raggiunto il limite.
 */
const checkAndUpdateSoundQuota = async (userId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const q = query(
    collection(db, 'sounds'),
    where('userId', '==', userId),
    where('createdAt', '>=', Timestamp.fromDate(today)),
  );
  const snap = await getCountFromServer(q);
  const todayCount = snap.data().count;

  if (todayCount >= DAILY_SOUND_LIMIT) {
    throw new Error(`Hai raggiunto il limite di ${DAILY_SOUND_LIMIT} suoni al giorno.`);
  }
};


import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../firebaseConfig';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Upload affidabile su React Native.
 * Firebase Storage JS SDK non gestisce correttamente i Blob su Android.
 * Soluzione: FileSystem.uploadAsync con Firebase Storage REST API — bypassa l'SDK completamente.
 */
const uploadFileReliable = async (storagePath, localUri, contentType = 'audio/mp4') => {
  const token = await auth.currentUser.getIdToken();
  const bucket = storage.app.options.storageBucket;
  const encodedPath = encodeURIComponent(storagePath);
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`;

  const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': contentType,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload fallito: HTTP ${result.status}`);
  }

  const responseData = JSON.parse(result.body);
  const downloadToken = responseData.downloadTokens;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${downloadToken}`;
};

// Notifiche gestite dalle Cloud Functions via trigger Firestore (onLikeCreated, onCommentCreated, onFollowCreated)

// ==================== USER MANAGEMENT ====================

/**
 * Crea o aggiorna il profilo utente
 */
export const createOrUpdateUserProfile = async (userId, userData) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    const fallbackUsername = (userData.username || userData.email?.split('@')[0] || `user_${userId.slice(0, 6)}`).toLowerCase();
    const fallbackDisplayName = userData.displayName || userData.username || userData.email?.split('@')[0] || `user_${userId.slice(0, 6)}`;
    
    if (!userDoc.exists()) {
      // Crea nuovo utente
      await setDoc(userRef, {
        username: fallbackUsername,
        displayName: fallbackDisplayName,
        email: userData.email || '',
        avatar: userData.avatar || '🎧',
        bio: userData.bio || 'Nuovo utente SoundScape 🎵',
        recordingsCount: 0,
        followersCount: 0,
        followingCount: 0,
        streak: 0,
        isPremium: false,
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp()
      });
    } else {
      // Aggiorna last active e completa eventuali campi mancanti (self-heal profilo)
      const existing = userDoc.data() || {};
      const patch = {
        lastActive: serverTimestamp(),
      };
      if (!existing.username) patch.username = fallbackUsername;
      if (!existing.displayName) patch.displayName = fallbackDisplayName;
      if (!existing.avatar) patch.avatar = userData.avatar || '🎧';
      if (!existing.email && userData.email) patch.email = userData.email;
      if (!existing.bio) patch.bio = userData.bio || 'Nuovo utente SoundScape 🎵';
      await updateDoc(userRef, patch);
    }
    
    return userRef.id;
  } catch (error) {
    console.error('Error creating/updating user:', error);
    throw error;
  }
};

/**
 * Ottieni profilo utente
 */
export const getUserProfile = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return { id: userDoc.id, ...userDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};

/**
 * Aggiorna profilo utente
 */
export const updateUserProfile = async (userId, updates) => {
  try {
    const sanitizedUpdates = { ...updates };
    if (typeof sanitizedUpdates.username === 'string') {
      sanitizedUpdates.username = sanitizeField(sanitizedUpdates.username, 50);
    }
    if (typeof sanitizedUpdates.bio === 'string') {
      sanitizedUpdates.bio = sanitizeField(sanitizedUpdates.bio, 300);
    }
    if (typeof sanitizedUpdates.displayName === 'string') {
      sanitizedUpdates.displayName = sanitizeField(sanitizedUpdates.displayName, 100);
    }

    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      ...sanitizedUpdates,
      lastActive: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};


/**
 * Upload foto profilo
 */
export const uploadProfilePicture = async (userId, imageUri) => {
  try {
    const filename = `profile_${userId}_${Date.now()}.jpg`;
    const storagePath = `profiles/${userId}/${filename}`;
    const downloadURL = await uploadFileReliable(storagePath, imageUri, 'image/jpeg');
    await updateUserProfile(userId, { profilePicture: downloadURL });
    return downloadURL;
  } catch (error) {
    console.error('❌ [PROFILE PIC] Error uploading profile picture:', error);
    throw error;
  }
};


// ==================== SOUNDS (POSTS) ====================

/**
 * Upload audio file to Firebase Storage
 */
const uploadAudio = async (userId, audioUri) => {
  try {
    const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.m4a`;
    const storagePath = `sounds/${userId}/${filename}`;
    const downloadURL = await uploadFileReliable(storagePath, audioUri, 'audio/mp4');
    return downloadURL;
  } catch (error) {
    console.error('❌ [UPLOAD] Error uploading audio:', error);
    throw error;
  }
};

/**
 * Crea nuovo sound (post)
 */
export const createSound = async (soundData) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Rate limiting
    await checkAndUpdateSoundQuota(user.uid);

    // Get user profile
    const userProfile = await getUserProfile(user.uid);

    // Upload audio
    const audioUrl = await uploadAudio(user.uid, soundData.audioUri);

    // Create sound document
    const soundDoc = {
      userId: user.uid,
      username: sanitizeField(userProfile?.username || 'Anonymous', 100),
      userAvatar: userProfile?.avatar || '🎧',
      title: sanitizeField(soundData.title, 200),
      description: sanitizeField(soundData.description || '', 500),
      mood: soundData.mood || 'Rilassante',
      audioUrl,
      duration: soundData.duration,
      location: soundData.location || null,
      likes: 0,
      comments: 0,
      listens: 0,
      tags: soundData.tags || [],
      createdAt: serverTimestamp()
    };

    const soundRef = await addDoc(collection(db, 'sounds'), soundDoc);

    // Update user recordings count
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, {
      recordingsCount: increment(1)
    });

    return soundRef.id;
  } catch (error) {
    console.error('❌ [CREATE SOUND] Error:', error);
    throw error;
  }
};

/**
 * Real-time listener per feed sounds
 */
export const subscribeToSoundsFeed = (callback, limitCount = 20) => {
  try {
    console.log('🔔 [FEED] Subscribing to sounds feed...');
    
    const q = query(
      collection(db, 'sounds'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const sounds = await Promise.all(snapshot.docs.map(async docSnap => {
        const data = docSnap.data();
        let username = data.username;
        let userAvatar = data.userAvatar;
        if ((!username || !userAvatar) && data.userId) {
          try {
            const userDoc = await getDoc(doc(db, 'users', data.userId));
            const ud = userDoc.data();
            username = username || ud?.username || ud?.displayName || 'Anonimo';
            userAvatar = userAvatar || ud?.avatar || '🎧';
          } catch {}
        }
        return {
          id: docSnap.id,
          ...data,
          username,
          userAvatar,
          createdAt: data.createdAt?.toDate() || new Date()
        };
      }));
      callback(sounds);
    }, (error) => {
      console.error('❌ [FEED] Error in sounds subscription:', error);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('❌ [FEED] Error subscribing to sounds:', error);
    throw error;
  }
};

/**
 * Ottieni sounds di un utente specifico
 * TEMPORANEO: senza orderBy per evitare errore indice
 */
export const getUserSounds = async (userId, limitCount = 50) => {
  try {
    console.log('👤 [USER SOUNDS] Fetching sounds for user:', userId);
    
    // Query semplificata senza orderBy
    const q = query(
      collection(db, 'sounds'),
      where('userId', '==', userId),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    const sounds = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date()
      };
    });
    
    // Ordina in memoria invece che nel database
    sounds.sort((a, b) => b.createdAt - a.createdAt);
    
    return sounds;
  } catch (error) {
    console.error('❌ [USER SOUNDS] Error getting user sounds:', error);
    throw error;
  }
};

/**
 * Elimina sound
 */
export const deleteSound = async (soundId) => {
  try {
    console.log('🗑️ [DELETE] Deleting sound:', soundId);
    
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Get sound document
    const soundRef = doc(db, 'sounds', soundId);
    const soundDoc = await getDoc(soundRef);
    
    if (!soundDoc.exists()) {
      throw new Error('Sound not found');
    }
    
    const soundData = soundDoc.data();
    
    // Check ownership
    if (soundData.userId !== user.uid) {
      throw new Error('Unauthorized');
    }
    
    // Delete audio file from storage
    try {
      const audioUrl = soundData.audioUrl;
      console.log('🗑️ [DELETE] Deleting audio file from Storage:', audioUrl);
      
      // Estrai il path dall'URL di Firebase Storage
      const baseUrl = `https://firebasestorage.googleapis.com/v0/b/${storage.app.options.storageBucket}/o/`;
      const imagePath = audioUrl.replace(baseUrl, '').split('?')[0];
      const decodedPath = decodeURIComponent(imagePath);
      
      const audioRef = ref(storage, decodedPath);
      await deleteObject(audioRef);
      
      console.log('✅ [DELETE] Audio file deleted from Storage');
    } catch (err) {
      console.warn('⚠️ [DELETE] Error deleting audio file:', err);
    }
    
    // Delete sound document
    await deleteDoc(soundRef);
    console.log('✅ [DELETE] Sound document deleted');
    
    // Update user recordings count
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, {
      recordingsCount: increment(-1)
    });
    
  } catch (error) {
    console.error('❌ [DELETE] Error deleting sound:', error);
    throw error;
  }
};

// ==================== LIKES ====================

/**
 * Toggle like su un sound
 */
export async function toggleLike(soundId) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const likeRef = doc(db, 'sounds', soundId, 'likes', user.uid);
  const likeDoc = await getDoc(likeRef);
  const soundRef = doc(db, 'sounds', soundId);

  if (likeDoc.exists()) {
    // Unlike
    await deleteDoc(likeRef);
    await updateDoc(soundRef, {
      likes: increment(-1),
    });
    return false;
  } else {
    // Like
    await setDoc(likeRef, {
      userId: user.uid,
      createdAt: new Date(),
    });
    await updateDoc(soundRef, {
      likes: increment(1),
    });

    return true;
  }
}

/**
 * Verifica se l'utente ha già messo like
 */
export const hasUserLiked = async (soundId) => {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const likeRef = doc(db, 'sounds', soundId, 'likes', user.uid);
    const likeDoc = await getDoc(likeRef);
    
    return likeDoc.exists();
  } catch (error) {
    console.error('Error checking like:', error);
    return false;
  }
};

// ==================== COMMENTS ====================

/**
 * Aggiungi commento
 */
/**
 * Aggiungi commento
 */
export async function addComment(soundId, text) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const userProfile = await getUserProfile(user.uid);

  const cleanText = sanitizeField(text, 1000);
  if (!cleanText) throw new Error('Commento vuoto');

  const commentData = {
    userId: user.uid,
    username: sanitizeField(userProfile?.username || 'Anonimo', 100),
    userAvatar: userProfile?.avatar || '🎧',
    text: cleanText,
    createdAt: serverTimestamp(),
  };

  // ✅ CORRETTO: usa subcollection
  const commentRef = await addDoc(
    collection(db, 'sounds', soundId, 'comments'),
    commentData
  );

  // Incrementa contatore commenti
  await updateDoc(doc(db, 'sounds', soundId), {
    comments: increment(1),
  });

  return { id: commentRef.id, ...commentData };
}

/**
 * Ottieni commenti di un sound
 */
/**
 * Elimina un commento (solo il proprietario)
 */
export async function deleteComment(soundId, commentId) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const commentRef = doc(db, 'sounds', soundId, 'comments', commentId);
  const snap = await getDoc(commentRef);
  if (!snap.exists() || snap.data().userId !== user.uid) {
    throw new Error('Non autorizzato');
  }

  await deleteDoc(commentRef);
  await updateDoc(doc(db, 'sounds', soundId), {
    comments: increment(-1),
  });
}

export const getComments = async (soundId, limitCount = 50) => {
  try {
    const q = query(
      collection(db, 'sounds', soundId, 'comments'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date()
    }));
  } catch (error) {
    console.error('Error getting comments:', error);
    throw error;
  }
};

// ==================== FOLLOWS ====================

/**
 * Follow/Unfollow utente
 */
export const toggleFollow = async (targetUserId) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');
    if (user.uid === targetUserId) throw new Error('Cannot follow yourself');

    const followId = `${user.uid}_${targetUserId}`;
    const followRef = doc(db, 'follows', followId);
    const followDoc = await getDoc(followRef);
    
    const followerRef = doc(db, 'users', user.uid);
    const followingRef = doc(db, 'users', targetUserId);
    
    if (followDoc.exists()) {
      // Unfollow
      await deleteDoc(followRef);
      await updateDoc(followerRef, { followingCount: increment(-1) });
      await updateDoc(followingRef, { followersCount: increment(-1) });
      return false;
    } else {
      // Follow
      await setDoc(followRef, {
        followerId: user.uid,
        followingId: targetUserId,
        createdAt: serverTimestamp()
      });
      await updateDoc(followerRef, { followingCount: increment(1) });
      await updateDoc(followingRef, { followersCount: increment(1) });
      return true;
    }
  } catch (error) {
    console.error('Error toggling follow:', error);
    throw error;
  }
};

/**
 * Verifica se segui un utente
 */
export const isFollowing = async (targetUserId) => {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const followId = `${user.uid}_${targetUserId}`;
    const followRef = doc(db, 'follows', followId);
    const followDoc = await getDoc(followRef);
    
    return followDoc.exists();
  } catch (error) {
    console.error('Error checking follow:', error);
    return false;
  }
};

// ==================== FRIEND REQUESTS ====================

const sortedFriendId = (a, b) => [a, b].sort().join('_');

/**
 * Invia una richiesta di amicizia a targetUserId.
 */
export const sendFriendRequest = async (targetUserId) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  if (user.uid === targetUserId) throw new Error('Cannot add yourself');

  const id = sortedFriendId(user.uid, targetUserId);
  await setDoc(doc(db, 'friendRequests', id), {
    users: [user.uid, targetUserId].sort(),
    initiatedBy: user.uid,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
};

/**
 * Annulla/rimuovi una richiesta o amicizia con targetUserId.
 */
export const cancelFriendRequest = async (targetUserId) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const id = sortedFriendId(user.uid, targetUserId);
  await deleteDoc(doc(db, 'friendRequests', id));
};

/**
 * Accetta la richiesta di amicizia inviata da targetUserId.
 */
export const acceptFriendRequest = async (targetUserId) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const id = sortedFriendId(user.uid, targetUserId);

  // Aggiorna status friendRequest
  await updateDoc(doc(db, 'friendRequests', id), {
    status: 'accepted',
    respondedAt: serverTimestamp(),
  });

  // Crea follow reciproco (A segue B e B segue A)
  const meId = user.uid;
  const themId = targetUserId;
  const followAtoB = `${themId}_${meId}`;
  const followBtoA = `${meId}_${themId}`;

  const [snapAtoB, snapBtoA] = await Promise.all([
    getDoc(doc(db, 'follows', followAtoB)),
    getDoc(doc(db, 'follows', followBtoA)),
  ]);

  const ops = [];
  if (!snapAtoB.exists()) {
    ops.push(setDoc(doc(db, 'follows', followAtoB), {
      followerId: themId, followingId: meId, createdAt: serverTimestamp(),
    }));
    ops.push(updateDoc(doc(db, 'users', themId), { followingCount: increment(1) }));
    ops.push(updateDoc(doc(db, 'users', meId), { followersCount: increment(1) }));
  }
  if (!snapBtoA.exists()) {
    ops.push(setDoc(doc(db, 'follows', followBtoA), {
      followerId: meId, followingId: themId, createdAt: serverTimestamp(),
    }));
    ops.push(updateDoc(doc(db, 'users', meId), { followingCount: increment(1) }));
    ops.push(updateDoc(doc(db, 'users', themId), { followersCount: increment(1) }));
  }
  // Aggiorna friendsCount su entrambi
  ops.push(updateDoc(doc(db, 'users', meId), { friendsCount: increment(1) }));
  ops.push(updateDoc(doc(db, 'users', themId), { friendsCount: increment(1) }));

  try {
    await Promise.all(ops);
  } catch (err) {
    console.warn('Avviso: impossibile aggiornare alcuni contatori amicizia (regole di sicurezza Firebase):', err);
  }
};

/**
 * Rifiuta la richiesta di amicizia inviata da targetUserId.
 */
export const rejectFriendRequest = async (targetUserId) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const id = sortedFriendId(user.uid, targetUserId);
  await deleteDoc(doc(db, 'friendRequests', id));
};

/**
 * Rimuove un amico: cancella friendRequest, follow reciproci e aggiorna contatori.
 */
export const removeFriend = async (targetUserId) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const meId = user.uid;
  const themId = targetUserId;

  const id = sortedFriendId(meId, themId);
  const followAtoB = `${themId}_${meId}`;
  const followBtoA = `${meId}_${themId}`;

  // Elimina subito la richiesta/amicizia
  await deleteDoc(doc(db, 'friendRequests', id));

  const ops = [];

  const [snapAtoB, snapBtoA] = await Promise.all([
    getDoc(doc(db, 'follows', followAtoB)),
    getDoc(doc(db, 'follows', followBtoA)),
  ]);

  if (snapAtoB.exists()) {
    ops.push(deleteDoc(doc(db, 'follows', followAtoB)));
    ops.push(updateDoc(doc(db, 'users', themId), { followingCount: increment(-1) }));
    ops.push(updateDoc(doc(db, 'users', meId), { followersCount: increment(-1) }));
  }
  if (snapBtoA.exists()) {
    ops.push(deleteDoc(doc(db, 'follows', followBtoA)));
    ops.push(updateDoc(doc(db, 'users', meId), { followingCount: increment(-1) }));
    ops.push(updateDoc(doc(db, 'users', themId), { followersCount: increment(-1) }));
  }
  ops.push(updateDoc(doc(db, 'users', meId), { friendsCount: increment(-1) }));
  ops.push(updateDoc(doc(db, 'users', themId), { friendsCount: increment(-1) }));

  try {
    await Promise.all(ops);
  } catch (err) {
    console.warn('Avviso: impossibile aggiornare alcuni contatori rimozione amicizia:', err);
  }
};

/**
 * Restituisce la lista degli amici (friendRequests accepted).
 */
export const getFriendsList = async (userId) => {
  try {
    const q = query(
      collection(db, 'friendRequests'),
      where('users', 'array-contains', userId),
      where('status', '==', 'accepted'),
    );
    const snap = await getDocs(q);
    const friends = await Promise.all(
      snap.docs.map(async (d) => {
        const friendId = d.data().users.find((u) => u !== userId);
        const profile = await getUserProfile(friendId);
        return { id: friendId, username: profile?.username || 'Utente', avatar: profile?.avatar || '🎧', bio: profile?.bio || '' };
      })
    );
    return friends;
  } catch {
    return [];
  }
};

/**
 * Restituisce lo stato della relazione con targetUserId.
 * 'none' | 'pending_sent' | 'pending_received' | 'friends'
 */
export const getFriendStatus = async (targetUserId) => {
  const user = auth.currentUser;
  if (!user) return 'none';
  const id = sortedFriendId(user.uid, targetUserId);
  const snap = await getDoc(doc(db, 'friendRequests', id));
  if (!snap.exists()) return 'none';
  const d = snap.data();
  if (d.status === 'accepted') return 'friends';
  if (d.initiatedBy === user.uid) return 'pending_sent';
  return 'pending_received';
};

/**
 * Ascolta in real-time tutte le richieste di amicizia in entrata (pending).
 * Chiama callback con array di { id, initiatedBy, createdAt, ... }
 */
export const listenPendingFriendRequests = (callback) => {
  const user = auth.currentUser;
  if (!user) return () => {};
  return onSnapshot(
    query(
      collection(db, 'friendRequests'),
      where('users', 'array-contains', user.uid),
      where('status', '==', 'pending'),
    ),
    (snap) => {
      const incoming = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.initiatedBy !== user.uid);
      callback(incoming);
    },
    (err) => console.error('listenPendingFriendRequests error:', err),
  );
};

// ==================== STATS ====================

/**
 * Incrementa play count
 */
export const incrementListens = async (soundId) => {
  try {
    const soundRef = doc(db, 'sounds', soundId);
    await updateDoc(soundRef, {
      listens: increment(1)
    });
  } catch (error) {
    console.error('Error incrementing listens:', error);
  }
};

/**
 * Aggiorna streak pubblicazione utente.
 * Da chiamare ogni volta che l'utente pubblica un suono.
 * - Stessa giornata: nessuna modifica (già pubblicato oggi)
 * - Ieri: streak +1
 * - Più vecchio o mai pubblicato: streak = 1
 * Campi Firestore: streakCount, lastPublishDate (YYYY-MM-DD)
 */
export const updatePublishStreak = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) return;

    const userData = userDoc.data();
    const today = new Date().toISOString().slice(0, 10);
    const lastPublishDate = userData.lastPublishDate;

    // Già pubblicato oggi → non aggiornare
    if (lastPublishDate === today) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const newStreak = lastPublishDate === yesterdayStr
      ? (userData.streakCount || 0) + 1
      : 1;

    await updateDoc(userRef, {
      streakCount: newStreak,
      lastPublishDate: today,
    });

    return newStreak;
  } catch (error) {
    console.error('Error updating publish streak:', error);
  }
};
// ==================== COMMUNITIES ====================

/**
 * Crea nuova community
 */
export const createCommunity = async (communityData) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const userProfile = await getUserProfile(user.uid);
    
    const communityDoc = {
      name: communityData.name,
      description: communityData.description || '',
      avatar: communityData.avatar || '🎵',
      category: communityData.category || 'General',
      creatorId: user.uid,
      creatorName: userProfile?.username || 'Anonymous',
      membersCount: 1,
      soundsCount: 0,
      isPublic: communityData.isPublic !== false,
      rules: communityData.rules || [],
      createdAt: serverTimestamp()
    };
    
    const communityRef = await addDoc(collection(db, 'communities'), communityDoc);
    
    await setDoc(doc(db, 'communities', communityRef.id, 'members', user.uid), {
      userId: user.uid,
      username: userProfile?.username || 'Anonymous',
      role: 'admin',
      joinedAt: serverTimestamp()
    });
    
    return communityRef.id;
  } catch (error) {
    console.error('Error creating community:', error);
    throw error;
  }
};

export const getCommunities = async (limitCount = 20) => {
  try {
    const uid = auth.currentUser?.uid;

    const [publicSnap, privateSnap] = await Promise.all([
      getDocs(query(collection(db, 'communities'), where('isPublic', '==', true), limit(limitCount))),
      uid
        ? getDocs(query(collection(db, 'communities'), where('isPublic', '==', false), where('creatorId', '==', uid)))
        : Promise.resolve({ docs: [] }),
    ]);

    const toItem = doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate() || new Date() });
    const seen = new Set();
    return [...publicSnap.docs, ...privateSnap.docs]
      .filter(doc => { if (seen.has(doc.id)) return false; seen.add(doc.id); return true; })
      .map(toItem);
  } catch (error) {
    console.error('Error getting communities:', error);
    throw error;
  }
};

export const toggleCommunityMembership = async (communityId) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const userProfile = await getUserProfile(user.uid);
    const memberRef = doc(db, 'communities', communityId, 'members', user.uid);
    const memberDoc = await getDoc(memberRef);
    
    const communityRef = doc(db, 'communities', communityId);
    
    if (memberDoc.exists()) {
      await deleteDoc(memberRef);
      await updateDoc(communityRef, {
        membersCount: increment(-1)
      });
      return false;
    } else {
      await setDoc(memberRef, {
        userId: user.uid,
        username: userProfile?.username || 'Anonymous',
        role: 'member',
        joinedAt: serverTimestamp()
      });
      await updateDoc(communityRef, {
        membersCount: increment(1)
      });
      return true;
    }
  } catch (error) {
    console.error('Error toggling membership:', error);
    throw error;
  }
};
/**
 * Posta sound in una community
 */
export const postSoundToCommunity = async (soundId, communityId) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const memberRef = doc(db, 'communities', communityId, 'members', user.uid);
    const memberDoc = await getDoc(memberRef);
    
    if (!memberDoc.exists()) {
      throw new Error('You must be a member to post');
    }

    await setDoc(doc(db, 'communities', communityId, 'sounds', soundId), {
      soundId,
      userId: user.uid,
      postedAt: serverTimestamp()
    });
    
    const communityRef = doc(db, 'communities', communityId);
    await updateDoc(communityRef, {
      soundsCount: increment(1)
    });
    
  } catch (error) {
    console.error('Error posting to community:', error);
    throw error;
  }
};

/**
 * Ottieni sounds di una community
 */
export const getCommunitySounds = async (communityId, limitCount = 20) => {
  try {
    const q = query(
      collection(db, 'communities', communityId, 'sounds'),
      orderBy('postedAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    const soundIds = snapshot.docs.map(doc => doc.data().soundId);
    
    const sounds = await Promise.all(
      soundIds.map(async (soundId) => {
        const soundRef = doc(db, 'sounds', soundId);
        const soundDoc = await getDoc(soundRef);
        if (soundDoc.exists()) {
          return {
            id: soundDoc.id,
            ...soundDoc.data(),
            createdAt: soundDoc.data().createdAt?.toDate() || new Date()
          };
        }
        return null;
      })
    );
    
    return sounds.filter(s => s !== null);
  } catch (error) {
    console.error('Error getting community sounds:', error);
    throw error;
  }
};
// ========================================
// 🗺️ FUNZIONI PER LE MAPPE SONORE
// ========================================

import { geohashForLocation, geohashQueryBounds, distanceBetween } from 'geofire-common';

// Crea suono con geohash per query geografiche
export const createSoundWithGeohash = async (soundData) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Rate limiting
    await checkAndUpdateSoundQuota(user.uid);

    let audioUrl = null;

    if (soundData.audioUri) {
      const storagePath = `sounds/${user.uid}/${Date.now()}.m4a`;
      audioUrl = await uploadFileReliable(storagePath, soundData.audioUri, 'audio/mp4');
    }

    // Calcola geohash se c'è location
    let geohash = null;
    if (soundData.location) {
      geohash = geohashForLocation([
        soundData.location.latitude,
        soundData.location.longitude
      ]);
    }

    const userProfile = await getUserProfile(user.uid);

    // Upload backstage (foto o video) se presente
    let backstageUrl = null;
    let backstageTipo = null;
    if (soundData.backstageUri && soundData.backstageTipo) {
      const ext = soundData.backstageTipo === 'video' ? 'mp4' : 'jpg';
      const contentType = soundData.backstageTipo === 'video' ? 'video/mp4' : 'image/jpeg';
      const bsPath = `backstage/${user.uid}/${Date.now()}.${ext}`;
      backstageUrl = await uploadFileReliable(bsPath, soundData.backstageUri, contentType);
      backstageTipo = soundData.backstageTipo;
    }

    const soundDoc = {
      userId: user.uid,
      username: sanitizeField(userProfile?.username || user.email?.split('@')[0] || 'Anonymous', 100),
      userAvatar: userProfile?.avatar || '🎧',
      title: sanitizeField(soundData.title, 200),
      description: sanitizeField(soundData.description || '', 500),
      mood: soundData.mood,
      audioUrl,
      duration: soundData.duration,
      location: soundData.location || null,
      geohash: geohash,
      likes: 0,
      comments: 0,
      listens: 0,
      createdAt: serverTimestamp(),
      isPublic: soundData.isPublic !== false,
      ...(backstageUrl ? { backstageUrl, backstageTipo } : {}),
    };

    const docRef = await addDoc(collection(db, 'sounds'), soundDoc);
    return docRef.id;
  } catch (error) {
    console.error('Error creating sound:', error);
    throw error;
  }
};

// Ottieni suoni vicini (raggio in km)
// Ottieni suoni vicini (raggio in km)
// Ottieni suoni vicini (raggio in km)
export const getNearbySounds = async (center, radiusInKm = 10) => {
  try {
    console.log('🗺️ [NEARBY] Searching sounds near:', center, 'radius:', radiusInKm, 'km');
    
    const bounds = geohashQueryBounds(
      [center.latitude, center.longitude],
      radiusInKm * 1000 // converti km in metri
    );

    console.log('📦 [NEARBY] Geohash bounds:', bounds);

    const promises = [];
    for (const b of bounds) {
      // ✅ ORDINE CORRETTO: where equality PRIMA, poi orderBy, poi where range
      const q = query(
        collection(db, 'sounds'),
        where('isPublic', '==', true),   // ✅ 1. where equality
        orderBy('geohash'),               // ✅ 2. orderBy
        where('geohash', '>=', b[0]),    // ✅ 3. where range start
        where('geohash', '<=', b[1])     // ✅ 4. where range end
      );
      promises.push(getDocs(q));
    }

    const snapshots = await Promise.all(promises);
    const matchingDocs = [];

    for (const snap of snapshots) {
      for (const doc of snap.docs) {
        const data = doc.data();
        
        // Salta se non ha location
        if (!data.location || !data.location.latitude) {
          console.log('⚠️ [NEARBY] Sound without valid location:', doc.id);
          continue;
        }

        // Calcola distanza reale
        const distanceInKm = distanceBetween(
          [data.location.latitude, data.location.longitude],
          [center.latitude, center.longitude]
        );

        // Aggiungi solo se dentro il raggio
        if (distanceInKm <= radiusInKm) {
          matchingDocs.push({
            id: doc.id,
            ...data,
            distance: distanceInKm,
            createdAt: data.createdAt?.toDate() || new Date(),
          });
        }
      }
    }

    console.log('✅ [NEARBY] Found', matchingDocs.length, 'sounds nearby');
    
    // Ordina per distanza (più vicini prima)
    return matchingDocs.sort((a, b) => a.distance - b.distance);
    
  } catch (error) {
    console.error('❌ [NEARBY] Error getting nearby sounds:', error);
    console.error('Error details:', error.message);
    return [];
  }
};

// Ottieni tutti i suoni per la mappa
export const getSoundsForMap = async (limitCount = 100) => {
  try {
    console.log('🗺️ [MAP] Loading sounds for map, limit:', limitCount);
    
    const q = query(
      collection(db, 'sounds'),
      where('isPublic', '==', true),
      orderBy('createdAt', 'desc'),
      limit(limitCount)  // ✅ CORRETTO: limit è una funzione, non un parametro
    );

    const snapshot = await getDocs(q);
    
    // Filtra solo quelli con location
    const sounds = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      }))
      .filter(sound => sound.location !== null && sound.location !== undefined);
    
    console.log('✅ [MAP] Found', sounds.length, 'sounds with location');
    
    return sounds;
  } catch (error) {
    console.error('❌ [MAP] Error getting sounds for map:', error);
    return [];
  }
};

// Get sounds at a specific location and time
export const getSoundsAtLocationByTime = async (location, date, hour) => {
  try {
    // Create time range (hour ± 1 hour)
    const startDate = new Date(date);
    startDate.setHours(hour - 1, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setHours(hour + 1, 59, 59, 999);

    const soundsRef = collection(db, 'sounds');
    const q = query(
      soundsRef,
      where('createdAt', '>=', Timestamp.fromDate(startDate)),
      where('createdAt', '<=', Timestamp.fromDate(endDate)),
      where('location', '!=', null),
      orderBy('location'),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const allSounds = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    }));

    // Filter by proximity (within 1km)
    const nearbySounds = allSounds.filter(sound => {
      if (!sound.location) return false;
      const distance = getDistance(
        location.latitude,
        location.longitude,
        sound.location.latitude,
        sound.location.longitude
      );
      return distance <= 1000; // 1km radius
    });

    return nearbySounds;
  } catch (error) {
    console.error('Error getting sounds by time:', error);
    return [];
  }
};

// Get timeline data with stats
export const getSoundTimeline = async (location, date, timeRange, hour) => {
  try {
    const sounds = await getSoundsAtLocationByTime(location, date, hour);

    // Calculate stats
    const stats = {
      totalSounds: sounds.length,
      uniqueUsers: new Set(sounds.map(s => s.userId)).size,
      mostPopularMood: getMostFrequent(sounds.map(s => s.mood)),
      avgDuration: sounds.length > 0 
        ? Math.round(sounds.reduce((sum, s) => sum + s.duration, 0) / sounds.length)
        : 0,
    };

    return {
      sounds,
      stats,
    };
  } catch (error) {
    console.error('Error getting timeline:', error);
    return { sounds: [], stats: null };
  }
};

// Helper: Calculate distance between two coordinates
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
};

// Helper: Get most frequent item in array
const getMostFrequent = (arr) => {
  if (arr.length === 0) return 'N/A';
  const frequency = {};
  let maxFreq = 0;
  let mostFrequent = arr[0];

  arr.forEach(item => {
    frequency[item] = (frequency[item] || 0) + 1;
    if (frequency[item] > maxFreq) {
      maxFreq = frequency[item];
      mostFrequent = item;
    }
  });

  return mostFrequent;
};


/**
 * Crea una nuova challenge (solo admin)
 */
export async function createChallenge(challengeData) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Non autenticato');

    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    if (!userDoc.exists() || userDoc.data()?.isAdmin !== true) {
      throw new Error('Permesso negato: richiesto ruolo admin');
    }

    const challenge = {
      title: challengeData.title,
      description: challengeData.description,
      emoji: challengeData.emoji || '🎵',
      startDate: challengeData.startDate || new Date(),
      endDate: challengeData.endDate,
      participants: 0,
      soundCount: 0,
      isActive: true,
      createdAt: new Date(),
      createdBy: currentUser.uid,
    };

    const docRef = await addDoc(collection(db, 'challenges'), challenge);
    return { id: docRef.id, ...challenge };
  } catch (error) {
    console.error('❌ Error creating challenge:', error);
    throw error;
  }
}

/**
 * Elimina una challenge attiva.
 * Nota: le regole Firestore devono permettere la delete al creatore (o admin).
 */
export async function deleteChallenge(challengeId) {
  try {
    const challengeRef = doc(db, 'challenges', challengeId);
    await deleteDoc(challengeRef);
  } catch (error) {
    console.error('❌ Error deleting challenge:', error);
    throw error;
  }
}

/**
 * Ottieni tutte le challenge attive
 */
export async function getActiveChallenges() {
  try {
    const now = new Date();
    const q = query(
      collection(db, 'challenges'),
      where('isActive', '==', true),
      where('endDate', '>', now),
      orderBy('endDate', 'asc')
    );

    const snapshot = await getDocs(q);
    const challenges = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      startDate: doc.data().startDate?.toDate(),
      endDate: doc.data().endDate?.toDate(),
      createdAt: doc.data().createdAt?.toDate(),
    }));

    console.log(`✅ Found ${challenges.length} active challenges`);
    return challenges;
  } catch (error) {
    console.error('❌ Error getting challenges:', error);
    return [];
  }
}

/**
 * Partecipa a una challenge
 */
export async function submitSoundToChallenge(challengeId, soundId) {

  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Aggiorna il suono con il challengeId
    await updateDoc(doc(db, 'sounds', soundId), {
      challengeId,
      challengeSubmittedAt: new Date(),
    });

    // Incrementa il contatore della challenge
    await updateDoc(doc(db, 'challenges', challengeId), {
      soundCount: increment(1),
      participants: increment(1),
    });

    console.log('✅ Joined challenge:', challengeId);
    return true;
  } catch (error) {
    console.error('❌ Error joining challenge:', error);
    throw error;
  }
}

/**
 * Ottieni i suoni di una challenge
 */
export async function getChallengeSounds(challengeId, limitCount = 50) {
  try {
    const q = query(
      collection(db, 'sounds'),
      where('challengeId', '==', challengeId),
      orderBy('likes', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    const sounds = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        
        // Get user info
        const userDoc = await getDoc(doc(db, 'users', data.userId));
        const userData = userDoc.data();

        return {
          id: docSnap.id,
          ...data,
          username: userData?.username || 'Anonimo',
          userAvatar: userData?.avatar || '🎧',
          createdAt: data.createdAt?.toDate(),
        };
      })
    );

    console.log(`✅ Found ${sounds.length} sounds for challenge ${challengeId}`);
    return sounds;
  } catch (error) {
    console.error('❌ Error getting challenge sounds:', error);
    return [];
  }
}

/**
 * Vota un suono in una challenge
 */
export async function voteForChallengeSound(soundId) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const voteRef = doc(db, 'sounds', soundId, 'votes', user.uid);
    const voteDoc = await getDoc(voteRef);

    if (voteDoc.exists()) {
      console.log('⚠️ Already voted for this sound');
      return false;
    }

    // Aggiungi voto
    await addDoc(collection(db, 'sounds', soundId, 'votes'), {
      userId: user.uid,
      votedAt: new Date(),
    });

    // Incrementa contatore voti
    await updateDoc(doc(db, 'sounds', soundId), {
      challengeVotes: increment(1),
    });

    console.log('✅ Vote added');
    return true;
  } catch (error) {
    console.error('❌ Error voting:', error);
    throw error;
  }
}

/**
 * Ottieni le challenge dell'utente
 */
export async function getUserChallenges(userId) {
  try {
    const q = query(
      collection(db, 'sounds'),
      where('userId', '==', userId),
      where('challengeId', '!=', null)
    );

    const snapshot = await getDocs(q);
    const challenges = snapshot.docs.map(doc => ({
      soundId: doc.id,
      challengeId: doc.data().challengeId,
      submittedAt: doc.data().challengeSubmittedAt?.toDate(),
      likes: doc.data().likes || 0,
      challengeVotes: doc.data().challengeVotes || 0,
    }));

    console.log(`✅ Found ${challenges.length} user challenges`);
    return challenges;
  } catch (error) {
    console.error('❌ Error getting user challenges:', error);
    return [];
  }
}

// ==================== FOLLOWERS/FOLLOWING ====================

/**
 * Ottieni lista followers di un utente
 */
export const getFollowersList = async (userId) => {
  try {
    console.log('👥 [FOLLOWERS] Getting followers for user:', userId);
    
    const q = query(
      collection(db, 'follows'),
      where('followingId', '==', userId)
    );
    
    const snapshot = await getDocs(q);
    
    const followers = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const followerId = doc.data().followerId;
        const userProfile = await getUserProfile(followerId);
        return {
          id: followerId,
          username: userProfile?.username || 'Utente',
          avatar: userProfile?.avatar || '🎧',
          bio: userProfile?.bio || ''
        };
      })
    );
    
    console.log(`✅ [FOLLOWERS] Found ${followers.length} followers`);
    return followers;
  } catch (error) {
    console.error('❌ [FOLLOWERS] Error getting followers:', error);
    return [];
  }
};

/**
 * Ottieni lista following di un utente
 */
export const getFollowingList = async (userId) => {
  try {
    console.log('👥 [FOLLOWING] Getting following for user:', userId);
    
    const q = query(
      collection(db, 'follows'),
      where('followerId', '==', userId)
    );
    
    const snapshot = await getDocs(q);
    
    const following = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const followingId = doc.data().followingId;
        const userProfile = await getUserProfile(followingId);
        return {
          id: followingId,
          username: userProfile?.username || 'Utente',
          avatar: userProfile?.avatar || '🎧',
          bio: userProfile?.bio || ''
        };
      })
    );
    
    console.log(`✅ [FOLLOWING] Found ${following.length} following`);
    return following;
  } catch (error) {
    console.error('❌ [FOLLOWING] Error getting following:', error);
    return [];
  }
};

/**
 * Conta follower e following direttamente dalla collezione `follows`.
 * Sempre accurato — non usa i counter fields che si desincronizzano.
 */
export const deleteCommunity = async (communityId) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Non autenticato');
  const comRef = doc(db, 'communities', communityId);
  const comSnap = await getDoc(comRef);
  if (!comSnap.exists()) throw new Error('Community non trovata');
  if (comSnap.data().creatorId !== uid) throw new Error('Solo il creatore può eliminare la community');

  const batch = writeBatch(db);
  const [membersSnap, requestsSnap] = await Promise.all([
    getDocs(collection(db, 'communities', communityId, 'members')),
    getDocs(collection(db, 'communities', communityId, 'joinRequests')),
  ]);
  membersSnap.docs.forEach(d => batch.delete(d.ref));
  requestsSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(comRef);
  await batch.commit();
};

export const getFollowStats = async (userId) => {
  try {
    const [followersSnap, followingSnap] = await Promise.all([
      getCountFromServer(query(collection(db, 'follows'), where('followingId', '==', userId))),
      getCountFromServer(query(collection(db, 'follows'), where('followerId', '==', userId))),
    ]);
    return {
      followers: followersSnap.data().count,
      following: followingSnap.data().count,
    };
  } catch {
    return { followers: 0, following: 0 };
  }
};

// ── Alias per compatibilità con ChallengesScreen ───────────────────────────────
// ChallengesScreen importa joinChallenge, ma la funzione si chiama submitSoundToChallenge
export const joinChallenge = submitSoundToChallenge;