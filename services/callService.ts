import {
  collection, addDoc, doc, updateDoc, onSnapshot,
  serverTimestamp, Unsubscribe, query, where, limit,
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

export type CallStatus = 'ringing' | 'active' | 'ended' | 'declined' | 'missed' | 'busy';
export type CallPhase = 'ringing' | 'incoming' | 'connecting' | 'active' | 'ended' | null;

export interface Call {
  id: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  callerAvatar: string;
  calleeName: string;
  calleeAvatar: string;
  status: CallStatus;
  type: 'audio';
  channelName: string;
  createdAt: Date;
}

const CALL_TIMEOUT_MS = 45_000;

export async function createCall(params: {
  calleeId: string;
  calleeName: string;
  calleeAvatar: string;
  callerName: string;
  callerAvatar: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const docRef = await addDoc(collection(db, 'calls'), {
    callerId: user.uid,
    calleeId: params.calleeId,
    callerName: params.callerName,
    callerAvatar: params.callerAvatar,
    calleeName: params.calleeName,
    calleeAvatar: params.calleeAvatar,
    status: 'ringing',
    type: 'audio',
    channelName: '',
    createdAt: serverTimestamp(),
  });

  await updateDoc(docRef, { channelName: docRef.id });
  return docRef.id;
}

export async function updateCallStatus(callId: string, status: CallStatus): Promise<void> {
  await updateDoc(doc(db, 'calls', callId), {
    status,
    ...(status === 'active' ? { answeredAt: serverTimestamp() } : {}),
    ...(['ended', 'declined', 'missed'].includes(status) ? { endedAt: serverTimestamp() } : {}),
  });
}

export function listenForIncomingCall(
  userId: string,
  cb: (call: Call | null) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'calls'),
    where('calleeId', '==', userId),
    where('status', '==', 'ringing'),
    limit(1),
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) { cb(null); return; }
    const d = snap.docs[0];
    const data = d.data();
    const createdAt = data.createdAt?.toDate() ?? new Date();
    if (Date.now() - createdAt.getTime() > CALL_TIMEOUT_MS) { cb(null); return; }
    cb({
      id: d.id,
      callerId: data.callerId,
      calleeId: data.calleeId,
      callerName: data.callerName ?? 'Utente',
      callerAvatar: data.callerAvatar ?? '🎵',
      calleeName: data.calleeName ?? 'Utente',
      calleeAvatar: data.calleeAvatar ?? '🎵',
      status: data.status as CallStatus,
      type: 'audio',
      channelName: data.channelName || d.id,
      createdAt,
    });
  });
}

export function listenForCallUpdates(
  callId: string,
  cb: (call: Call | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'calls', callId), (snap) => {
    if (!snap.exists()) { cb(null); return; }
    const data = snap.data();
    cb({
      id: snap.id,
      callerId: data.callerId,
      calleeId: data.calleeId,
      callerName: data.callerName ?? 'Utente',
      callerAvatar: data.callerAvatar ?? '🎵',
      calleeName: data.calleeName ?? 'Utente',
      calleeAvatar: data.calleeAvatar ?? '🎵',
      status: data.status as CallStatus,
      type: 'audio',
      channelName: data.channelName || snap.id,
      createdAt: data.createdAt?.toDate() ?? new Date(),
    });
  });
}
