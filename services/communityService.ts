import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, limit, onSnapshot, serverTimestamp, setDoc,
  where, arrayUnion, arrayRemove, Timestamp, getCountFromServer,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { auth, db, storage } from '../firebaseConfig';

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface CommunityMember {
  userId: string;
  userName: string;
  userAvatar: string;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: Date;
}

export interface JoinRequest {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  requestedAt: Date;
}

export interface CommunityMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  audioUrl: string;
  audioDuration: number;
  caption?: string;
  reactions: Record<string, string[]>; // emoji → [userId, ...]
  isPinned: boolean;
  createdAt: Date;
}

export interface Community {
  id: string;
  name: string;
  description: string;
  avatar: string;
  category: string;
  isPublic: boolean;
  membersCount: number;
  soundsCount: number;
  createdBy: string;
  createdAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Non autenticato');
  return uid;
}

function communityDoc(communityId: string) {
  return doc(db, 'communities', communityId);
}

// ─── Community info ───────────────────────────────────────────────────────────

export async function getCommunityById(communityId: string): Promise<Community | null> {
  const snap = await getDoc(communityDoc(communityId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name,
    description: d.description || '',
    avatar: d.avatar || '🎵',
    category: d.category || 'General',
    isPublic: d.isPublic !== false,
    membersCount: d.membersCount ?? 0,
    soundsCount: d.soundsCount ?? 0,
    createdBy: d.createdBy ?? '',
    createdAt: d.createdAt?.toDate() ?? new Date(),
  };
}

// ─── Membri ───────────────────────────────────────────────────────────────────

export async function getMembers(communityId: string): Promise<CommunityMember[]> {
  const snap = await getDocs(collection(db, 'communities', communityId, 'members'));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      userId: d.id,
      userName: data.userName || 'Utente',
      userAvatar: data.userAvatar || '🎵',
      role: data.role || 'member',
      joinedAt: data.joinedAt?.toDate() ?? new Date(),
    };
  }).sort((a, b) => {
    const order = { admin: 0, moderator: 1, member: 2 };
    return order[a.role as keyof typeof order] - order[b.role as keyof typeof order];
  });
}

export function listenToMembers(
  communityId: string,
  callback: (members: CommunityMember[]) => void,
): () => void {
  return onSnapshot(
    collection(db, 'communities', communityId, 'members'),
    (snap) => {
      const members = snap.docs.map((d) => {
        const data = d.data();
        return {
          userId: d.id,
          userName: data.userName || 'Utente',
          userAvatar: data.userAvatar || '🎵',
          role: data.role || 'member',
          joinedAt: data.joinedAt?.toDate() ?? new Date(),
        } as CommunityMember;
      }).sort((a, b) => {
        const order: Record<string, number> = { admin: 0, moderator: 1, member: 2 };
        return order[a.role] - order[b.role];
      });
      callback(members);
    },
  );
}

export async function getMyRole(communityId: string): Promise<'admin' | 'moderator' | 'member' | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'communities', communityId, 'members', uid));
  if (!snap.exists()) return null;
  return snap.data().role ?? 'member';
}

export async function setMemberRole(
  communityId: string,
  userId: string,
  role: 'moderator' | 'member',
): Promise<void> {
  await updateDoc(doc(db, 'communities', communityId, 'members', userId), { role });
}

export async function kickMember(communityId: string, userId: string): Promise<void> {
  await deleteDoc(doc(db, 'communities', communityId, 'members', userId));
  await updateDoc(communityDoc(communityId), { membersCount: Math.max(0, (await getCountFromServer(collection(db, 'communities', communityId, 'members'))).data().count) });
}

// ─── Join / Leave ─────────────────────────────────────────────────────────────

export async function joinCommunity(communityId: string): Promise<void> {
  const uid = currentUid();
  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.exists() ? userSnap.data() : null;
  await setDoc(doc(db, 'communities', communityId, 'members', uid), {
    userId: uid,
    userName: userData?.username || userData?.displayName || 'Utente',
    userAvatar: userData?.avatar || userData?.photoURL || '🎵',
    role: 'member',
    joinedAt: serverTimestamp(),
  });
  await updateDoc(communityDoc(communityId), { membersCount: (await getCountFromServer(collection(db, 'communities', communityId, 'members'))).data().count });
}

export async function leaveCommunity(communityId: string): Promise<void> {
  const uid = currentUid();
  await deleteDoc(doc(db, 'communities', communityId, 'members', uid));
  const count = (await getCountFromServer(collection(db, 'communities', communityId, 'members'))).data().count;
  await updateDoc(communityDoc(communityId), { membersCount: Math.max(0, count) });
}

// ─── Join Requests (community private) ───────────────────────────────────────

export async function requestToJoin(communityId: string): Promise<void> {
  const uid = currentUid();
  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.exists() ? userSnap.data() : null;
  await setDoc(doc(db, 'communities', communityId, 'joinRequests', uid), {
    userId: uid,
    userName: userData?.username || userData?.displayName || 'Utente',
    userAvatar: userData?.avatar || userData?.photoURL || '🎵',
    requestedAt: serverTimestamp(),
    status: 'pending',
  });
}

export async function cancelJoinRequest(communityId: string): Promise<void> {
  const uid = currentUid();
  await deleteDoc(doc(db, 'communities', communityId, 'joinRequests', uid));
}

export async function getMyJoinRequest(communityId: string): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  const snap = await getDoc(doc(db, 'communities', communityId, 'joinRequests', uid));
  return snap.exists();
}

export function listenToJoinRequests(
  communityId: string,
  callback: (requests: JoinRequest[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, 'communities', communityId, 'joinRequests'), orderBy('requestedAt', 'asc')),
    (snap) => {
      callback(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          userName: data.userName || 'Utente',
          userAvatar: data.userAvatar || '🎵',
          requestedAt: data.requestedAt?.toDate() ?? new Date(),
        };
      }));
    },
  );
}

export async function approveJoinRequest(communityId: string, userId: string, userName: string, userAvatar: string): Promise<void> {
  await setDoc(doc(db, 'communities', communityId, 'members', userId), {
    userId,
    userName,
    userAvatar,
    role: 'member',
    joinedAt: serverTimestamp(),
  });
  await deleteDoc(doc(db, 'communities', communityId, 'joinRequests', userId));
  const count = (await getCountFromServer(collection(db, 'communities', communityId, 'members'))).data().count;
  await updateDoc(communityDoc(communityId), { membersCount: count });
}

export async function rejectJoinRequest(communityId: string, userId: string): Promise<void> {
  await deleteDoc(doc(db, 'communities', communityId, 'joinRequests', userId));
}

// ─── Chat vocale di gruppo ────────────────────────────────────────────────────

export function listenToChat(
  communityId: string,
  callback: (messages: CommunityMessage[]) => void,
): () => void {
  const q = query(
    collection(db, 'communities', communityId, 'chat'),
    orderBy('createdAt', 'asc'),
    limit(100),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        senderId: data.senderId,
        senderName: data.senderName || 'Utente',
        senderAvatar: data.senderAvatar || '🎵',
        audioUrl: data.audioUrl,
        audioDuration: data.audioDuration ?? 0,
        caption: data.caption,
        reactions: data.reactions ?? {},
        isPinned: data.isPinned ?? false,
        createdAt: data.createdAt?.toDate() ?? new Date(),
      } as CommunityMessage;
    }));
  });
}

export async function sendVoiceMessage(
  communityId: string,
  audioUri: string,
  duration: number,
  caption?: string,
): Promise<void> {
  const uid = currentUid();
  const user = auth.currentUser!;

  // Upload audio
  const fileName = `voice_${uid}_${Date.now()}.m4a`;
  const storageRef = ref(storage, `communities/${communityId}/chat/${fileName}`);
  const fileInfo = await FileSystem.getInfoAsync(audioUri);
  if (!fileInfo.exists) throw new Error('File audio non trovato');
  const response = await fetch(audioUri);
  const blob = await response.blob();
  await uploadBytes(storageRef, blob, { contentType: 'audio/mp4' });
  const audioUrl = await getDownloadURL(storageRef);

  await addDoc(collection(db, 'communities', communityId, 'chat'), {
    senderId: uid,
    senderName: user.displayName || 'Utente',
    senderAvatar: user.photoURL || '🎵',
    audioUrl,
    audioDuration: duration,
    caption: caption?.trim() || null,
    reactions: {},
    isPinned: false,
    createdAt: serverTimestamp(),
  });
}

export async function deleteMessage(communityId: string, messageId: string, audioUrl: string): Promise<void> {
  await deleteDoc(doc(db, 'communities', communityId, 'chat', messageId));
  try {
    const storageRef = ref(storage, audioUrl);
    await deleteObject(storageRef);
  } catch {}
}

export async function toggleReaction(communityId: string, messageId: string, emoji: string): Promise<void> {
  const uid = currentUid();
  const msgRef = doc(db, 'communities', communityId, 'chat', messageId);
  const snap = await getDoc(msgRef);
  if (!snap.exists()) return;
  const reactions: Record<string, string[]> = snap.data().reactions ?? {};
  const users = reactions[emoji] ?? [];
  const hasReacted = users.includes(uid);
  await updateDoc(msgRef, {
    [`reactions.${emoji}`]: hasReacted ? arrayRemove(uid) : arrayUnion(uid),
  });
}

export async function pinMessage(communityId: string, messageId: string, pinned: boolean): Promise<void> {
  // Prima rimuovi tutti i pin esistenti
  if (pinned) {
    const q = query(collection(db, 'communities', communityId, 'chat'), where('isPinned', '==', true));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { isPinned: false })));
  }
  await updateDoc(doc(db, 'communities', communityId, 'chat', messageId), { isPinned: pinned });
}
