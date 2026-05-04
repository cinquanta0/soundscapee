import {
  collection, addDoc, query, where, orderBy,
  limit, serverTimestamp, doc, updateDoc, onSnapshot,
  setDoc, getDoc, deleteDoc, Unsubscribe, increment,
  arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebaseConfig';
import { auth } from '../firebaseConfig';
import { uploadFileWithFallback } from './storageUpload';

export interface Messaggio {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  type: 'audio' | 'text';
  audioUrl?: string;
  text?: string;
  duration?: number;
  waveform?: number[];
  timestamp: Date;
  ascoltato: boolean;
  reactions?: Record<string, string[]>; // emoji → [uid, ...]
  replyTo?: { id: string; senderName: string; preview: string };
  soundRef?: string;
  soundTitle?: string;
  statusReply?: boolean;
  statusReplyLabel?: string;
  statusId?: string;
}

export interface Conversazione {
  id: string;
  participants: string[];
  otherUserId: string;
  otherUserName: string;
  otherUserAvatar: string;
  lastDuration: number;
  lastText: string;
  lastType: 'audio' | 'text';
  lastSenderId: string;
  lastTimestamp: Date;
  unread: number;
  lastMessageAscoltato: boolean;
}

export function convId(a: string, b: string) {
  return [a, b].sort().join('_');
}

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
        lastText: data.lastText || '',
        lastType: (data.lastType as 'audio' | 'text') ?? 'audio',
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
      ...(d.data() as Omit<Messaggio, 'id' | 'timestamp' | 'type'>),
      type: (d.data().type as 'audio' | 'text') ?? 'audio',
      timestamp: d.data().timestamp?.toDate() ?? new Date(),
    })));
  }, (err) => console.error('[MESSAGGI] listenMessaggi error:', err.code, err.message));
}

// ─── Send audio message ───────────────────────────────────────────────────────

export async function inviaMessaggio(params: {
  receiverId: string;
  receiverName: string;
  receiverAvatar: string;
  audioUri: string;
  duration: number;
  replyTo?: { id: string; senderName: string; preview: string };
  soundRef?: string;
  soundTitle?: string;
  statusReply?: boolean;
  statusReplyLabel?: string;
  statusId?: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const cId = convId(user.uid, params.receiverId);
  const storagePath = `messaggi/${cId}/${Date.now()}.m4a`;
  const audioUrl = await uploadFileWithFallback(storagePath, params.audioUri, 'audio/mp4');

  await addDoc(collection(db, 'messaggi'), {
    conversationId: cId,
    senderId: user.uid,
    receiverId: params.receiverId,
    type: 'audio',
    audioUrl,
    duration: params.duration,
    waveform: genWaveform(`${cId}${Date.now()}`),
    timestamp: serverTimestamp(),
    ascoltato: false,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    ...(params.soundRef ? { soundRef: params.soundRef, soundTitle: params.soundTitle } : {}),
    ...(params.statusReply ? {
      statusReply: true,
      statusReplyLabel: params.statusReplyLabel || 'Ti ha risposto al tuo stato',
      ...(params.statusId ? { statusId: params.statusId } : {}),
    } : {}),
  });

  await _updateConversation(cId, user.uid, params.receiverId, params.receiverName, params.receiverAvatar, {
    type: 'audio', duration: params.duration,
  });
}

// ─── Send text message ────────────────────────────────────────────────────────

export async function inviaTestoMessaggio(params: {
  receiverId: string;
  receiverName: string;
  receiverAvatar: string;
  text: string;
  replyTo?: { id: string; senderName: string; preview: string };
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const cId = convId(user.uid, params.receiverId);

  await addDoc(collection(db, 'messaggi'), {
    conversationId: cId,
    senderId: user.uid,
    receiverId: params.receiverId,
    type: 'text',
    text: params.text,
    timestamp: serverTimestamp(),
    ascoltato: false,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
  });

  await _updateConversation(cId, user.uid, params.receiverId, params.receiverName, params.receiverAvatar, {
    type: 'text', text: params.text.slice(0, 60),
  });
}

// ─── Reactions ────────────────────────────────────────────────────────────────

export async function toggleReazione(messageId: string, emoji: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const msgRef = doc(db, 'messaggi', messageId);
  const snap = await getDoc(msgRef);
  if (!snap.exists()) return;
  const current: string[] = snap.data().reactions?.[emoji] ?? [];
  const hasReacted = current.includes(user.uid);
  await updateDoc(msgRef, {
    [`reactions.${emoji}`]: hasReacted ? arrayRemove(user.uid) : arrayUnion(user.uid),
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function eliminaMessaggio(messageId: string, conversationId: string, audioUrl?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const msgRef = doc(db, 'messaggi', messageId);
  const msgSnap = await getDoc(msgRef);
  if (!msgSnap.exists() || msgSnap.data().senderId !== user.uid) throw new Error('Non autorizzato');

  if (msgSnap.data().type !== 'text' && audioUrl) {
    try {
      const match = audioUrl.match(/\/o\/([^?]+)/);
      if (match) await deleteObject(ref(storage, decodeURIComponent(match[1])));
    } catch {}
  }

  await deleteDoc(msgRef);

  try {
    const data = msgSnap.data();
    if (!data.ascoltato) {
      await updateDoc(doc(db, 'conversations', conversationId), {
        [`unread_${data.receiverId}`]: increment(-1),
      });
    }
  } catch {}
}

// ─── Mark as read ─────────────────────────────────────────────────────────────

export async function segnaAscoltato(messageId: string, conversationId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await updateDoc(doc(db, 'messaggi', messageId), { ascoltato: true });
  await updateDoc(doc(db, 'conversations', conversationId), {
    [`unread_${user.uid}`]: 0,
    lastMessageAscoltato: true,
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _updateConversation(
  cId: string,
  senderId: string,
  receiverId: string,
  receiverName: string,
  receiverAvatar: string,
  last: { type: 'audio'; duration: number } | { type: 'text'; text: string },
) {
  const convRef = doc(db, 'conversations', cId);
  const senderProfile = await getDoc(doc(db, 'users', senderId));
  const sName = senderProfile.data()?.username || senderProfile.data()?.displayName || 'Utente';
  const sAvatar = senderProfile.data()?.avatar || '🎵';

  await setDoc(convRef, {
    participants: [senderId, receiverId].sort(),
    [`name_${senderId}`]: sName,
    [`avatar_${senderId}`]: sAvatar,
    [`name_${receiverId}`]: receiverName,
    [`avatar_${receiverId}`]: receiverAvatar,
    lastSenderId: senderId,
    lastType: last.type,
    lastDuration: last.type === 'audio' ? last.duration : 0,
    lastText: last.type === 'text' ? last.text : '',
    updatedAt: serverTimestamp(),
    [`unread_${receiverId}`]: increment(1),
    lastMessageAscoltato: false,
  }, { merge: true });
}
