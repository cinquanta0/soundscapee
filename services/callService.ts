import {
  collection, addDoc, doc, updateDoc, getDoc, onSnapshot,
  serverTimestamp, Unsubscribe, query, where, limit,
  getDocs, orderBy, increment,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebaseConfig';

export type CallStatus = 'ringing' | 'active' | 'ended' | 'declined' | 'missed' | 'busy';
export type CallPhase = 'ringing' | 'incoming' | 'connecting' | 'active' | 'ended' | null;
export type CallType = 'audio' | 'group';
export type ParticipantCallStatus = 'calling' | 'ringing' | 'active' | 'declined' | 'missed' | 'left';

export interface ParticipantProfile {
  name: string;
  avatar: string;
  photo?: string;
}

export interface Call {
  id: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  callerAvatar: string;
  calleeName: string;
  calleeAvatar: string;
  status: CallStatus;
  type: CallType;
  channelName: string;
  createdAt: Date;
  duration?: number;
  invitees?: string[];
  participantProfiles?: Record<string, ParticipantProfile>;
  participantStatuses?: Record<string, ParticipantCallStatus>;
}

const CALL_TIMEOUT_MS = 45_000;

function isGroupCallFinished(statuses: Record<string, ParticipantCallStatus> = {}): boolean {
  return !Object.values(statuses).some((status) => ['calling', 'ringing', 'active'].includes(status));
}

function buildGroupCallUpdate(
  statuses: Record<string, ParticipantCallStatus>,
): Record<string, unknown> {
  if (isGroupCallFinished(statuses)) {
    return {
      status: 'ended',
      endedAt: serverTimestamp(),
    };
  }
  if (Object.values(statuses).some((status) => status === 'active')) {
    return {
      status: 'active',
      answeredAt: serverTimestamp(),
    };
  }
  return {
    status: 'ringing',
  };
}

export function parseCallDoc(d: any): Call {
  const data = d.data();
  return {
    id: d.id,
    callerId: data.callerId,
    calleeId: data.calleeId || '',
    callerName: data.callerName ?? 'Utente',
    callerAvatar: data.callerAvatar ?? '🎵',
    calleeName: data.calleeName ?? 'Utente',
    calleeAvatar: data.calleeAvatar ?? '🎵',
    status: data.status as CallStatus,
    type: (data.type as CallType) ?? 'audio',
    channelName: data.channelName || d.id,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    duration: data.duration,
    invitees: data.invitees,
    participantProfiles: data.participantProfiles,
    participantStatuses: data.participantStatuses,
  };
}

function buildParticipantStatuses(callerId: string, invitees: string[]): Record<string, ParticipantCallStatus> {
  const statuses: Record<string, ParticipantCallStatus> = { [callerId]: 'calling' };
  invitees.forEach((uid) => {
    statuses[uid] = 'ringing';
  });
  return statuses;
}

function isPendingIncomingCall(call: Call, userId: string): boolean {
  if (call.type === 'group') {
    return ['ringing', 'active'].includes(call.status) && call.participantStatuses?.[userId] === 'ringing';
  }
  return call.status === 'ringing';
}

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
    invitees: [params.calleeId],
    participantStatuses: buildParticipantStatuses(user.uid, [params.calleeId]),
    channelName: '',
    createdAt: serverTimestamp(),
  });

  await updateDoc(docRef, { channelName: docRef.id });
  return docRef.id;
}

export async function createGroupCall(params: {
  inviteeIds: string[];
  inviteeProfiles: Record<string, ParticipantProfile>;
  callerName: string;
  callerAvatar: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const firstId = params.inviteeIds[0] ?? '';
  const firstProfile = params.inviteeProfiles[firstId] ?? { name: 'Utente', avatar: '🎵' };

  const docRef = await addDoc(collection(db, 'calls'), {
    callerId: user.uid,
    calleeId: firstId,
    callerName: params.callerName,
    callerAvatar: params.callerAvatar,
    calleeName: firstProfile.name,
    calleeAvatar: firstProfile.avatar,
    status: 'ringing',
    type: 'group',
    invitees: params.inviteeIds,
    participantStatuses: buildParticipantStatuses(user.uid, params.inviteeIds),
    participantProfiles: {
      [user.uid]: { name: params.callerName, avatar: params.callerAvatar },
      ...params.inviteeProfiles,
    },
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

export async function updateParticipantCallStatus(
  callId: string,
  userId: string,
  status: ParticipantCallStatus,
  overallStatus?: CallStatus,
): Promise<void> {
  const updates: Record<string, unknown> = {
    [`participantStatuses.${userId}`]: status,
  };
  if (overallStatus) {
    updates.status = overallStatus;
    if (overallStatus === 'active') updates.answeredAt = serverTimestamp();
    if (['ended', 'declined', 'missed'].includes(overallStatus)) updates.endedAt = serverTimestamp();
  }
  await updateDoc(doc(db, 'calls', callId), updates);
}

export async function leaveGroupCall(callId: string, userId: string): Promise<CallStatus> {
  const callRef = doc(db, 'calls', callId);
  const snap = await getDoc(callRef);
  if (!snap.exists()) return 'ended';

  const call = parseCallDoc(snap);
  const nextStatuses = {
    ...(call.participantStatuses ?? {}),
    [userId]: 'left' as ParticipantCallStatus,
  };
  const overall = buildGroupCallUpdate(nextStatuses);

  await updateDoc(callRef, {
    [`participantStatuses.${userId}`]: 'left',
    ...overall,
  });

  return (overall.status as CallStatus) ?? 'ended';
}

export async function inviteParticipantsToCall(
  callId: string,
  inviteeIds: string[],
  inviteeProfiles: Record<string, ParticipantProfile>,
): Promise<void> {
  if (!inviteeIds.length) return;

  const callRef = doc(db, 'calls', callId);
  const snap = await getDoc(callRef);
  if (!snap.exists()) throw new Error('Chiamata non trovata');

  const call = parseCallDoc(snap);
  const nextInvitees = Array.from(new Set([...(call.invitees ?? []), ...inviteeIds]));
  const nextProfiles = {
    ...(call.participantProfiles ?? {}),
    ...inviteeProfiles,
  };
  const nextStatuses = { ...(call.participantStatuses ?? {}) };
  inviteeIds.forEach((uid) => {
    if (!nextStatuses[uid] || ['declined', 'missed', 'left'].includes(nextStatuses[uid])) {
      nextStatuses[uid] = 'ringing';
    }
  });

  await updateDoc(callRef, {
    invitees: nextInvitees,
    participantProfiles: nextProfiles,
    participantStatuses: nextStatuses,
    status: call.status === 'ended' ? 'ringing' : call.status,
  });
}

export function listenForIncomingCall(
  userId: string,
  cb: (call: Call | null) => void,
): Unsubscribe {
  function toCall(d: any): Call | null {
    const data = d.data();
    // Per le chiamate 1:1 applica il timeout; per le group call di cui siamo invitati,
    // ci fidiamo del participantStatuses (l'host ha appena aggiunto questo utente).
    const type = (data.type as string) ?? 'audio';
    if (type !== 'group') {
      const createdAt = data.createdAt?.toDate() ?? new Date();
      if (Date.now() - createdAt.getTime() > CALL_TIMEOUT_MS) return null;
    }
    const call = parseCallDoc(d);
    return isPendingIncomingCall(call, userId) ? call : null;
  }

  let r1: Call | null = null;
  let r2: Call | null = null;

  const emit = () => cb(r1 ?? r2);

  const q1 = query(
    collection(db, 'calls'),
    where('calleeId', '==', userId),
    where('status', '==', 'ringing'),
    orderBy('createdAt', 'desc'),
    limit(1),
  );

  const q2 = query(
    collection(db, 'calls'),
    where('invitees', 'array-contains', userId),
    orderBy('createdAt', 'desc'),
    limit(5),
  );

  const unsub1 = onSnapshot(q1, (snap) => {
    r1 = snap.empty ? null : toCall(snap.docs[0]);
    emit();
  }, (err) => console.warn('[calls] q1 error:', err.message));

  const unsub2 = onSnapshot(q2, (snap) => {
    const found = snap.docs
      .map((d) => {
        const rawType = d.data()?.type;
        if (rawType !== 'group') return null;
        return toCall(d);
      })
      .find(Boolean) ?? null;
    r2 = found && r1?.id !== found.id ? found : null;
    emit();
  }, (err) => console.warn('[calls] q2 error:', err.message));

  return () => { unsub1(); unsub2(); };
}

export async function getCallHistory(userId: string, limitN = 50): Promise<Call[]> {
  const colRef = collection(db, 'calls');

  const [callerSnap, calleeSnap, inviteeSnap] = await Promise.all([
    getDocs(query(colRef, where('callerId', '==', userId), orderBy('createdAt', 'desc'), limit(limitN))),
    getDocs(query(colRef, where('calleeId', '==', userId), orderBy('createdAt', 'desc'), limit(limitN))),
    getDocs(query(colRef, where('invitees', 'array-contains', userId), limit(limitN))),
  ]);

  const seen = new Set<string>();
  const calls: Call[] = [];

  for (const snap of [callerSnap, calleeSnap, inviteeSnap]) {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      calls.push(parseCallDoc(d));
    }
  }

  calls.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return calls.slice(0, limitN);
}

export async function updateCallDuration(callId: string, duration: number): Promise<void> {
  await updateDoc(doc(db, 'calls', callId), { duration });
}

export function listenForCallUpdates(
  callId: string,
  cb: (call: Call | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'calls', callId), (snap) => {
    if (!snap.exists()) { cb(null); return; }
    cb(parseCallDoc(snap));
  });
}

export async function upgradeCallToGroup(
  callId: string,
  newInviteeIds: string[],
  allProfiles: Record<string, ParticipantProfile>,
): Promise<void> {
  if (!newInviteeIds.length) return;
  const callRef = doc(db, 'calls', callId);
  const snap = await getDoc(callRef);
  if (!snap.exists()) throw new Error('Chiamata non trovata');

  const call = parseCallDoc(snap);
  const nextInvitees = Array.from(new Set([...(call.invitees ?? [call.calleeId]), ...newInviteeIds]));
  const nextStatuses = { ...(call.participantStatuses ?? {}) };
  newInviteeIds.forEach((uid) => {
    if (!nextStatuses[uid] || ['declined', 'missed', 'left'].includes(nextStatuses[uid])) {
      nextStatuses[uid] = 'ringing';
    }
  });

  await updateDoc(callRef, {
    type: 'group',
    invitees: nextInvitees,
    participantProfiles: allProfiles,
    participantStatuses: nextStatuses,
  });
}

export async function rejoinGroupCall(callId: string, userId: string): Promise<Call | null> {
  const callRef = doc(db, 'calls', callId);
  const snap = await getDoc(callRef);
  if (!snap.exists()) return null;

  const call = parseCallDoc(snap);
  if (call.status === 'ended' || call.status === 'declined') return null;

  // Also guard against the race condition where all participants wrote 'left'
  // but the overall status is stuck at 'active'.
  const othersActive = Object.entries(call.participantStatuses ?? {})
    .some(([id, st]) => id !== userId && ['active', 'ringing', 'calling'].includes(st));
  if (!othersActive) return null;

  await updateDoc(callRef, {
    [`participantStatuses.${userId}`]: 'active',
    status: 'active',
    answeredAt: serverTimestamp(),
  });

  const fresh = await getDoc(callRef);
  return fresh.exists() ? parseCallDoc(fresh) : call;
}

export async function publishCallRecording(
  filePath: string,
  callId: string,
  otherPartyName: string,
  durationSecs: number,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const userSnap = await getDoc(doc(db, 'users', user.uid));
  const userData = userSnap.data();

  const filename = `call_${callId}_${Date.now()}.aac`;
  const storageRef = ref(storage, `sounds/${user.uid}/${filename}`);

  const response = await fetch(filePath);
  const blob = await response.blob();
  await uploadBytes(storageRef, blob, { contentType: 'audio/aac' });
  const audioUrl = await getDownloadURL(storageRef);

  await addDoc(collection(db, 'sounds'), {
    userId: user.uid,
    username: userData?.username || userData?.displayName || 'Anonimo',
    userAvatar: userData?.avatar || '🎧',
    title: `Chiamata con ${otherPartyName}`,
    description: '',
    mood: 'Conversazione',
    audioUrl,
    duration: durationSecs,
    location: null,
    likes: 0,
    comments: 0,
    listens: 0,
    tags: ['chiamata', 'conversazione'],
    createdAt: serverTimestamp(),
    isPublic: true,
  });

  await updateDoc(doc(db, 'users', user.uid), { recordingsCount: increment(1) });
}
