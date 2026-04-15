import {
  collection, addDoc, getDocs, query, where, orderBy,
  limit, serverTimestamp, doc, updateDoc, onSnapshot,
  setDoc, getDoc, deleteDoc, Timestamp, Unsubscribe, increment,
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebaseConfig';
import { auth } from '../firebaseConfig';
import * as FileSystem from 'expo-file-system/legacy';

export interface Messaggio {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  audioUrl: string;
  duration: number;
  waveform: number[]; // valori 0-1, 20 barre
  timestamp: Date;
  ascoltato: boolean;
  soundRef?: string; // ID del suono se condiviso dal feed
  soundTitle?: string;
  statusReply?: boolean;
  statusReplyLabel?: string;
  statusId?: string;
}

export interface Conversazione {
  id: string; // sorted `${uid1}_${uid2}`
  participants: string[];
  otherUserId: string;
  otherUserName: string;
  otherUserAvatar: string;
  lastDuration: number;
  lastSenderId: string;
  lastTimestamp: Date;
  unread: number;
  lastMessageAscoltato: boolean;
}

// conversationId deterministico
export function convId(a: string, b: string) {
  return [a, b].sort().join('_');
}

// Genera waveform casuale deterministica basata su seed (messageId)
export function genWaveform(seed: string, bars = 20): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return Array.from({ length: bars }, (_, i) => {
    h = (Math.imul(h ^ (h >>> 17), 0xc4ceb9fe) | 0) ^ i;
    return 0.2 + (Math.abs(h) % 80) / 100;
  });
}

// ─── Conversations ────────────────────────────────────────────────────────────

export function listenConversazioni(
  userId: string,
  cb: (convs: Conversazione[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', userId),
    orderBy('updatedAt', 'desc'),
    limit(50),
  );
  return onSnapshot(q, (snap) => {
    const convs: Conversazione[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      const otherId = data.participants.find((p: string) => p !== userId) as string;
      convs.push({
        id: d.id,
        participants: data.participants,
        otherUserId: otherId,
        otherUserName: data[`name_${otherId}`] || 'Utente',
        otherUserAvatar: data[`avatar_${otherId}`] || '🎵',
        lastDuration: data.lastDuration || 0,
        lastSenderId: data.lastSenderId || '',
        lastTimestamp: data.updatedAt?.toDate() ?? new Date(),
        unread: data[`unread_${userId}`] || 0,
        lastMessageAscoltato: data.lastMessageAscoltato ?? false,
      });
    }
    cb(convs);
  }, (err) => console.error('[MESSAGGI] listenConversazioni error:', err.code, err.message));
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function listenMessaggi(
  conversationId: string,
  cb: (msgs: Messaggio[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'messaggi'),
    where('conversationId', '==', conversationId),
    orderBy('timestamp', 'asc'),
    limit(100),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Messaggio, 'id' | 'timestamp'>),
      timestamp: d.data().timestamp?.toDate() ?? new Date(),
    })));
  }, (err) => console.error('[MESSAGGI] listenMessaggi error:', err.code, err.message));
}

export async function inviaMessaggio(params: {
  receiverId: string;
  receiverName: string;
  receiverAvatar: string;
  audioUri: string;
  duration: number;
  soundRef?: string;
  soundTitle?: string;
  statusReply?: boolean;
  statusReplyLabel?: string;
  statusId?: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const cId = convId(user.uid, params.receiverId);

  // Upload audio via Firebase Storage REST API (bypass SDK - non funziona su Android)
  const token = await auth.currentUser!.getIdToken();
  const bucket = (storage as any).app.options.storageBucket;
  const storagePath = `messaggi/${cId}/${Date.now()}.m4a`;
  const encodedPath = encodeURIComponent(storagePath);
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`;

  const uploadResult = await FileSystem.uploadAsync(uploadUrl, params.audioUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': 'audio/mp4',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Upload fallito: HTTP ${uploadResult.status}`);
  }

  const uploadData = JSON.parse(uploadResult.body);
  const audioUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${uploadData.downloadTokens}`;

  const msgRef = await addDoc(collection(db, 'messaggi'), {
    conversationId: cId,
    senderId: user.uid,
    receiverId: params.receiverId,
    audioUrl,
    duration: params.duration,
    waveform: genWaveform(`${cId}${Date.now()}`),
    timestamp: serverTimestamp(),
    ascoltato: false,
    ...(params.soundRef ? { soundRef: params.soundRef, soundTitle: params.soundTitle } : {}),
    ...(params.statusReply ? {
      statusReply: true,
      statusReplyLabel: params.statusReplyLabel || 'Ti ha risposto al tuo stato',
      ...(params.statusId ? { statusId: params.statusId } : {}),
    } : {}),
  });

  // Aggiorna/crea conversation
  const convRef = doc(db, 'conversations', cId);
  const senderProfile = await getDoc(doc(db, 'users', user.uid));
  const sName = senderProfile.data()?.username || senderProfile.data()?.displayName || 'Utente';
  const sAvatar = senderProfile.data()?.avatar || '🎵';

  await setDoc(convRef, {
    participants: [user.uid, params.receiverId].sort(),
    [`name_${user.uid}`]: sName,
    [`avatar_${user.uid}`]: sAvatar,
    [`name_${params.receiverId}`]: params.receiverName,
    [`avatar_${params.receiverId}`]: params.receiverAvatar,
    lastDuration: params.duration,
    lastSenderId: user.uid,
    updatedAt: serverTimestamp(),
    [`unread_${params.receiverId}`]: increment(1),
    lastMessageAscoltato: false,
  }, { merge: true });
}

export async function eliminaMessaggio(messageId: string, conversationId: string, audioUrl: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  // Verifica ownership: il documento deve appartenere al mittente corrente
  const msgRef = doc(db, 'messaggi', messageId);
  const msgSnap = await getDoc(msgRef);
  if (!msgSnap.exists() || msgSnap.data().senderId !== user.uid) {
    throw new Error('Non autorizzato');
  }

  // Cancella il file da Firebase Storage (best-effort, non blocca se fallisce)
  try {
    // L'URL è del tipo: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media&token=...
    const match = audioUrl.match(/\/o\/([^?]+)/);
    if (match) {
      const storagePath = decodeURIComponent(match[1]);
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
    }
  } catch { /* file già eliminato o non trovato — ok */ }

  // Cancella il documento Firestore
  await deleteDoc(msgRef);

  // Aggiorna la conversation (decrementa unread del ricevente se non ascoltato)
  try {
    const data = msgSnap.data();
    if (!data.ascoltato) {
      const convRef = doc(db, 'conversations', conversationId);
      await updateDoc(convRef, {
        [`unread_${data.receiverId}`]: increment(-1),
      });
    }
  } catch { /* non critico */ }
}

export async function segnaAscoltato(messageId: string, conversationId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await updateDoc(doc(db, 'messaggi', messageId), { ascoltato: true });
  const convRef = doc(db, 'conversations', conversationId);
  await updateDoc(convRef, {
    [`unread_${user.uid}`]: 0,
    lastMessageAscoltato: true,
  });
}
