import { doc, setDoc, onSnapshot, arrayUnion, arrayRemove, Unsubscribe } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export async function blockUser(myUid: string, targetUid: string): Promise<void> {
  await setDoc(doc(db, 'users', myUid), { blockedUsers: arrayUnion(targetUid) }, { merge: true });
}

export async function unblockUser(myUid: string, targetUid: string): Promise<void> {
  await setDoc(doc(db, 'users', myUid), { blockedUsers: arrayRemove(targetUid) }, { merge: true });
}

export function listenBlockedUsers(myUid: string, cb: (blocked: string[]) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', myUid),
    (snap) => cb((snap.data()?.blockedUsers as string[]) ?? []),
    () => cb([]),
  );
}
