import { doc, updateDoc, onSnapshot, arrayUnion, arrayRemove, Unsubscribe } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export async function blockUser(myUid: string, targetUid: string): Promise<void> {
  await updateDoc(doc(db, 'users', myUid), { blockedUsers: arrayUnion(targetUid) });
}

export async function unblockUser(myUid: string, targetUid: string): Promise<void> {
  await updateDoc(doc(db, 'users', myUid), { blockedUsers: arrayRemove(targetUid) });
}

export function listenBlockedUsers(myUid: string, cb: (blocked: string[]) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', myUid),
    (snap) => cb((snap.data()?.blockedUsers as string[]) ?? []),
    () => cb([]),
  );
}
