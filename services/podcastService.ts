import {
  collection, addDoc, getDocs, query, orderBy,
  limit, serverTimestamp, doc, updateDoc, deleteDoc, where,
  setDoc, getDoc, increment, onSnapshot, Unsubscribe,
  arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import * as FileSystem from 'expo-file-system/legacy';
import { db, storage, functions } from '../firebaseConfig';
import { auth } from '../firebaseConfig';

export interface Podcast {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  title: string;
  description: string;
  audioUrl: string;
  coverUrl: string | null;
  duration: number; // secondi
  createdAt: Date;
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  isITS: boolean;        // true = episodio del canale ITS
  category?: string;     // es. "informatica", "marketing", ecc.
  schoolMode?: boolean;
  classId?: string;
  lessonId?: string;
  authorRole?: 'teacher' | 'student';
  submissionStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  submittedToTeacherId?: string;
  teacherFeedback?: string;
  dueDate?: Date | null;
}

// ─── Playlist ─────────────────────────────────────────────────────────────────

export interface Playlist {
  id: string;
  name: string;
  userId: string;
  podcastIds: string[];
  createdAt: Date;
}

export interface PodcastComment {
  id: string;
  userId: string;
  username: string;
  text: string;
  createdAt: Date;
}

export interface SchoolClass {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  teacherName: string;
  photoUrl?: string | null;
  createdAt: Date;
}

export interface PendingClassMember {
  userId: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface SchoolAccessStatus {
  schoolRole: 'teacher' | 'student' | 'admin';
  emailVerified: boolean;
  schoolDomainAllowed: boolean;
}

export interface SubmissionBoardItem extends LessonSubmission {
  lessonTitle?: string;
}

export interface SchoolLesson {
  id: string;
  classId: string;
  teacherId: string;
  teacherName: string;
  title: string;
  description: string;
  podcastId: string;
  dueDate: Date | null;
  createdAt: Date;
}

export interface LessonSubmission {
  id: string;
  classId: string;
  lessonId: string;
  lessonTitle?: string;
  studentId: string;
  studentName: string;
  podcastId: string;
  status: 'pending' | 'approved' | 'rejected';
  teacherFeedback?: string;
  teacherId: string;
  createdAt: Date;
  reviewedAt?: Date | null;
  grade?: number | null;
  gradeComment?: string;
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    webm: 'audio/webm',
    caf: 'audio/x-caf',
  };
  return map[ext.toLowerCase()] ?? 'audio/mpeg';
}

function extFromUri(uri: string): string {
  // Prova a estrarre l'estensione dall'URI (prima del ?)
  const clean = uri.split('?')[0];
  const parts = clean.split('.');
  const ext = parts[parts.length - 1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
  const allowed = ['mp3', 'm4a', 'mp4', 'aac', 'wav', 'ogg', 'flac', 'webm'];
  return allowed.includes(ext) ? ext : 'mp3';
}

function normalizeDate(value: any): Date | null {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function getPodcasts(limitN = 30): Promise<Podcast[]> {
  const maxFetch = Math.max(limitN * 3, 60);
  const snap = await getDocs(query(collection(db, 'podcast'), orderBy('createdAt', 'desc'), limit(maxFetch)));
  return snap.docs
    .filter((d) => {
      const data = d.data();
      const isClassBoundSchoolContent = data.schoolMode === true && (!!data.classId || !!data.lessonId);
      return !isClassBoundSchoolContent;
    })
    .map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Podcast, 'id'>),
      createdAt: d.data().createdAt?.toDate() ?? new Date(),
      likesCount: d.data().likesCount ?? 0,
      dislikesCount: d.data().dislikesCount ?? 0,
      commentsCount: d.data().commentsCount ?? 0,
      isITS: d.data().isITS ?? false,
      category: d.data().category,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitN);
}

export async function getSchoolAccessStatus(): Promise<SchoolAccessStatus> {
  const user = auth.currentUser;
  if (!user) {
    return { schoolRole: 'student', emailVerified: false, schoolDomainAllowed: false };
  }
  const userSnap = await getDoc(doc(db, 'users', user.uid));
  const data = userSnap.exists() ? userSnap.data() : {};
  return {
    schoolRole: (data?.schoolRole ?? 'student') as 'teacher' | 'student' | 'admin',
    emailVerified: !!(data?.emailVerified ?? user.emailVerified),
    schoolDomainAllowed: !!data?.schoolDomainAllowed,
  };
}

export async function setSchoolRoleByAdmin(targetUserId: string, role: 'teacher' | 'student' | 'admin'): Promise<void> {
  const callable = httpsCallable<{ targetUserId: string; role: 'teacher' | 'student' | 'admin' }, { ok: boolean }>(
    functions,
    'setSchoolRoleByAdmin',
  );
  await callable({ targetUserId, role });
}

// ─── Likes / Dislikes ─────────────────────────────────────────────────────────

export async function getPodcastVotes(podcastId: string): Promise<{ liked: boolean; disliked: boolean }> {
  const user = auth.currentUser;
  if (!user) return { liked: false, disliked: false };
  const [likeSnap, dislikeSnap] = await Promise.all([
    getDoc(doc(db, 'podcast', podcastId, 'likes', user.uid)),
    getDoc(doc(db, 'podcast', podcastId, 'dislikes', user.uid)),
  ]);
  return { liked: likeSnap.exists(), disliked: dislikeSnap.exists() };
}

export async function togglePodcastLike(podcastId: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  const likeRef = doc(db, 'podcast', podcastId, 'likes', user.uid);
  const dislikeRef = doc(db, 'podcast', podcastId, 'dislikes', user.uid);
  const podRef = doc(db, 'podcast', podcastId);
  const likeSnap = await getDoc(likeRef);
  if (likeSnap.exists()) {
    await deleteDoc(likeRef);
    await updateDoc(podRef, { likesCount: increment(-1) });
    return false;
  } else {
    const dislikeSnap = await getDoc(dislikeRef);
    if (dislikeSnap.exists()) {
      await deleteDoc(dislikeRef);
      await updateDoc(podRef, { dislikesCount: increment(-1) });
    }
    await setDoc(likeRef, { userId: user.uid, createdAt: serverTimestamp() });
    await updateDoc(podRef, { likesCount: increment(1) });
    return true;
  }
}

export async function togglePodcastDislike(podcastId: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  const dislikeRef = doc(db, 'podcast', podcastId, 'dislikes', user.uid);
  const likeRef = doc(db, 'podcast', podcastId, 'likes', user.uid);
  const podRef = doc(db, 'podcast', podcastId);
  const dislikeSnap = await getDoc(dislikeRef);
  if (dislikeSnap.exists()) {
    await deleteDoc(dislikeRef);
    await updateDoc(podRef, { dislikesCount: increment(-1) });
    return false;
  } else {
    const likeSnap = await getDoc(likeRef);
    if (likeSnap.exists()) {
      await deleteDoc(likeRef);
      await updateDoc(podRef, { likesCount: increment(-1) });
    }
    await setDoc(dislikeRef, { userId: user.uid, createdAt: serverTimestamp() });
    await updateDoc(podRef, { dislikesCount: increment(1) });
    return true;
  }
}

// ─── Commenti ─────────────────────────────────────────────────────────────────

export function listenPodcastComments(podcastId: string, cb: (comments: PodcastComment[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'podcast', podcastId, 'comments'),
    orderBy('createdAt', 'asc'),
    limit(100),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({
      id: d.id,
      userId: d.data().userId ?? '',
      username: d.data().username ?? 'Utente',
      text: d.data().text ?? '',
      createdAt: d.data().createdAt?.toDate() ?? new Date(),
    })));
  });
}

export async function addPodcastComment(podcastId: string, text: string, username: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  await addDoc(collection(db, 'podcast', podcastId, 'comments'), {
    userId: user.uid,
    username,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'podcast', podcastId), { commentsCount: increment(1) });
}

export async function deletePodcastComment(podcastId: string, commentId: string): Promise<void> {
  await deleteDoc(doc(db, 'podcast', podcastId, 'comments', commentId));
  await updateDoc(doc(db, 'podcast', podcastId), { commentsCount: increment(-1) });
}

export async function publishPodcast(params: {
  audioUri?: string;   // file locale da caricare
  audioUrl?: string;   // URL già su Storage (es. suono da SoundScape)
  coverUri: string | null;
  title: string;
  description: string;
  duration: number;
  username: string;
  userAvatar: string;
  isITS?: boolean;     // true = episodio ITS
  category?: string;   // categoria opzionale
  schoolMode?: boolean;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  if (!params.audioUri && !params.audioUrl) throw new Error('Audio mancante');

  let audioUrl: string;

  if (params.audioUrl) {
    // Suono già su Firebase Storage — nessun upload necessario
    audioUrl = params.audioUrl;
  } else {
    const token = await user.getIdToken();
    const bucket = (storage.app.options as any).storageBucket as string;

    const ext = extFromUri(params.audioUri!);
    const contentType = mimeFromExt(ext);

    const audioPath = `podcast/${user.uid}/${Date.now()}.${ext}`;
    const encodedAudioPath = encodeURIComponent(audioPath);
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedAudioPath}`;

    const audioResult = await FileSystem.uploadAsync(uploadUrl, params.audioUri!, {
      httpMethod: 'POST',
      headers: { 'Content-Type': contentType, Authorization: `Bearer ${token}` },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (audioResult.status < 200 || audioResult.status >= 300) {
      throw new Error(`Audio upload failed: HTTP ${audioResult.status}`);
    }
    const audioData = JSON.parse(audioResult.body);
    audioUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedAudioPath}?alt=media&token=${audioData.downloadTokens}`;
  }

  // Upload cover se presente (immagine — usa uploadBytes va bene)
  let coverUrl: string | null = null;
  if (params.coverUri) {
    const coverBlob = await (await fetch(params.coverUri)).blob();
    const coverRef = ref(storage, `podcast/${user.uid}/cover_${Date.now()}.jpg`);
    await uploadBytes(coverRef, coverBlob, { contentType: 'image/jpeg' });
    coverUrl = await getDownloadURL(coverRef);
  }

  const docRef = await addDoc(collection(db, 'podcast'), {
    userId: user.uid,
    username: params.username,
    userAvatar: params.userAvatar,
    title: params.title,
    description: params.description,
    audioUrl,
    coverUrl,
    duration: params.duration,
    createdAt: serverTimestamp(),
    likesCount: 0,
    dislikesCount: 0,
    commentsCount: 0,
    isITS: params.isITS ?? false,
    ...(params.category ? { category: params.category } : {}),
    schoolMode: params.schoolMode ?? false,
  });
  return docRef.id;
}

export async function createClass(name: string, teacherName: string): Promise<string> {
  const callable = httpsCallable<{ name: string }, { classId: string }>(functions, 'createClassSecure');
  const result = await callable({ name: name.trim() || teacherName.trim() });
  return result.data.classId;
}

export async function joinClassByCode(code: string): Promise<string> {
  const callable = httpsCallable<{ code: string }, { classId: string; status: 'pending' | 'approved' | 'rejected' }>(functions, 'joinClassSecure');
  const result = await callable({ code: code.trim().toUpperCase() });
  return result.data.classId;
}

export async function getTeacherClasses(): Promise<SchoolClass[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(db, 'classes'), where('teacherId', '==', user.uid));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({
    id: d.id,
    name: d.data().name ?? '',
    code: d.data().code ?? '',
    teacherId: d.data().teacherId ?? '',
    teacherName: d.data().teacherName ?? 'Docente',
    photoUrl: d.data().photoUrl ?? null,
    createdAt: d.data().createdAt?.toDate() ?? new Date(),
  }));
  return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getStudentClasses(): Promise<SchoolClass[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const classesSnap = await getDocs(query(collection(db, 'classes'), limit(100)));
  const classes = await Promise.all(
    classesSnap.docs.map(async (c) => {
      const memberSnap = await getDoc(doc(db, 'classes', c.id, 'members', user.uid));
      if (!memberSnap.exists()) return null;
      return memberSnap.data()?.status === 'approved' ? c : null;
    }),
  );
  return classes
    .filter((c): c is any => c !== null)
    .map((c) => ({
      id: c.id,
      name: c.data().name ?? '',
      code: c.data().code ?? '',
      teacherId: c.data().teacherId ?? '',
      teacherName: c.data().teacherName ?? 'Docente',
      photoUrl: c.data().photoUrl ?? null,
      createdAt: c.data().createdAt?.toDate() ?? new Date(),
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getPendingClassMembersForTeacher(classId: string): Promise<PendingClassMember[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const classSnap = await getDoc(doc(db, 'classes', classId));
  if (!classSnap.exists() || classSnap.data().teacherId !== user.uid) return [];
  const snap = await getDocs(query(collection(db, 'classes', classId, 'members'), where('status', '==', 'pending')));
  return snap.docs.map((d) => ({
    userId: d.id,
    role: d.data().role ?? 'student',
    status: d.data().status ?? 'pending',
  }));
}

export async function approveClassMember(classId: string, studentId: string): Promise<void> {
  const callable = httpsCallable<{ classId: string; studentId: string }, { ok: boolean }>(functions, 'approveClassMemberSecure');
  await callable({ classId, studentId });
}

export async function rejectClassMember(classId: string, studentId: string): Promise<void> {
  const callable = httpsCallable<{ classId: string; studentId: string }, { ok: boolean }>(functions, 'rejectClassMemberSecure');
  await callable({ classId, studentId });
}

export async function updateClassPhoto(classId: string, photoUri: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  // Verifica che l'utente sia il docente della classe
  const classSnap = await getDoc(doc(db, 'classes', classId));
  if (!classSnap.exists() || classSnap.data().teacherId !== user.uid) {
    throw new Error('Solo il docente può aggiornare la foto della classe');
  }
  const blob = await (await fetch(photoUri)).blob();
  const photoRef = ref(storage, `classes/${classId}/cover_${Date.now()}.jpg`);
  await uploadBytes(photoRef, blob, { contentType: 'image/jpeg' });
  const photoUrl = await getDownloadURL(photoRef);
  await updateDoc(doc(db, 'classes', classId), { photoUrl });
  return photoUrl;
}

export async function createLessonPodcast(params: {
  classId: string;
  title: string;
  description: string;
  dueDate?: Date | null;
  audioUri?: string;
  audioUrl?: string;
  coverUri?: string | null;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  const classSnap = await getDoc(doc(db, 'classes', params.classId));
  if (!classSnap.exists()) throw new Error('Classe non trovata');
  if (classSnap.data().teacherId !== user.uid) throw new Error('Solo la docente puo creare lezioni');
  const podcastId = await publishPodcast({
    audioUri: params.audioUri,
    audioUrl: params.audioUrl,
    coverUri: params.coverUri ?? null,
    title: params.title,
    description: params.description,
    duration: 0,
    username: user.displayName ?? classSnap.data().teacherName ?? 'Docente',
    userAvatar: user.photoURL ?? '',
    isITS: true,
    category: 'lesson',
    schoolMode: true,
  });
  const lessonRef = await addDoc(collection(db, 'lessons'), {
    classId: params.classId,
    teacherId: user.uid,
    teacherName: classSnap.data().teacherName ?? user.displayName ?? 'Docente',
    title: params.title.trim(),
    description: params.description.trim(),
    podcastId,
    dueDate: params.dueDate ?? null,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'podcast', podcastId), {
    schoolMode: true,
    classId: params.classId,
    lessonId: lessonRef.id,
    authorRole: 'teacher',
    submissionStatus: 'none',
    dueDate: params.dueDate ?? null,
  });
  return lessonRef.id;
}

export async function getClassLessons(classId: string): Promise<SchoolLesson[]> {
  const q = query(collection(db, 'lessons'), where('classId', '==', classId));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({
    id: d.id,
    classId: d.data().classId ?? '',
    teacherId: d.data().teacherId ?? '',
    teacherName: d.data().teacherName ?? 'Docente',
    title: d.data().title ?? '',
    description: d.data().description ?? '',
    podcastId: d.data().podcastId ?? '',
    dueDate: normalizeDate(d.data().dueDate),
    createdAt: d.data().createdAt?.toDate() ?? new Date(),
  }));
  if (list.length > 0) {
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  const classSnap = await getDoc(doc(db, 'classes', classId));
  const classTeacherId = classSnap.exists() ? (classSnap.data().teacherId ?? '') : '';

  // Backward-compatible fallback: some legacy ITS lessons were stored only in `podcast`.
  const legacySnap = await getDocs(query(collection(db, 'podcast'), where('classId', '==', classId), limit(120)));
  const legacyList = legacySnap.docs
    .filter((d) => {
      const data = d.data();
      if (data.schoolMode !== true) return false;
      if (data.authorRole === 'student') return false;

      // Accept multiple legacy shapes:
      // - explicit teacher authorRole
      // - category lesson / submissionStatus none
      // - teacher-owned class podcast with no explicit authorRole
      return (
        data.authorRole === 'teacher'
        || data.category === 'lesson'
        || data.submissionStatus === 'none'
        || (!data.authorRole && !!classTeacherId && data.userId === classTeacherId)
        || (!!data.lessonId && data.authorRole !== 'student')
      );
    })
    .map((d) => {
      const data = d.data();
      return {
        id: data.lessonId || d.id,
        classId: data.classId ?? classId,
        teacherId: data.userId ?? '',
        teacherName: data.username ?? 'Docente',
        title: data.title ?? '',
        description: data.description ?? '',
        podcastId: d.id,
        dueDate: normalizeDate(data.dueDate),
        createdAt: data.createdAt?.toDate() ?? new Date(),
      } as SchoolLesson;
    });

  return legacyList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function submitLessonAssignment(params: {
  classId: string;
  lessonId: string;
  title: string;
  description: string;
  audioUri?: string;
  audioUrl?: string;
  coverUri?: string | null;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Devi essere autenticato');
  const lessonSnap = await getDoc(doc(db, 'lessons', params.lessonId));
  if (!lessonSnap.exists()) throw new Error('Lezione non trovata');
  const teacherId = lessonSnap.data().teacherId;
  const duplicateQuery = query(
    collection(db, 'lessonSubmissions'),
    where('studentId', '==', user.uid),
    where('status', '==', 'pending'),
  );
  const dup = await getDocs(duplicateQuery);
  const hasPendingForLesson = dup.docs.some((d) => d.data().lessonId === params.lessonId);
  if (hasPendingForLesson) throw new Error('Hai gia una consegna in revisione per questa lezione');

  const podcastId = await publishPodcast({
    audioUri: params.audioUri,
    audioUrl: params.audioUrl,
    coverUri: params.coverUri ?? null,
    title: params.title,
    description: params.description,
    duration: 0,
    username: user.displayName ?? user.email ?? 'Studente',
    userAvatar: user.photoURL ?? '',
    isITS: true,
    category: 'submission',
    schoolMode: true,
  });

  const submissionRef = await addDoc(collection(db, 'lessonSubmissions'), {
    classId: params.classId,
    lessonId: params.lessonId,
    studentId: user.uid,
    studentName: user.displayName ?? user.email ?? 'Studente',
    teacherId,
    podcastId,
    status: 'pending',
    teacherFeedback: '',
    createdAt: serverTimestamp(),
    reviewedAt: null,
  });
  await updateDoc(doc(db, 'podcast', podcastId), {
    schoolMode: true,
    classId: params.classId,
    lessonId: params.lessonId,
    authorRole: 'student',
    submissionStatus: 'pending',
    submittedToTeacherId: teacherId,
  });
  return submissionRef.id;
}

export async function getPendingSubmissionsForTeacher(classId: string): Promise<LessonSubmission[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(
    collection(db, 'lessonSubmissions'),
    where('teacherId', '==', user.uid),
    where('status', '==', 'pending'),
  );
  const snap = await getDocs(q);
  const list = snap.docs
    .filter((d) => d.data().classId === classId)
    .map((d) => ({
    id: d.id,
    classId: d.data().classId ?? '',
    lessonId: d.data().lessonId ?? '',
    studentId: d.data().studentId ?? '',
    studentName: d.data().studentName ?? 'Studente',
    teacherId: d.data().teacherId ?? '',
    podcastId: d.data().podcastId ?? '',
    status: d.data().status ?? 'pending',
    teacherFeedback: d.data().teacherFeedback ?? '',
    createdAt: d.data().createdAt?.toDate() ?? new Date(),
    reviewedAt: normalizeDate(d.data().reviewedAt),
    grade: d.data().grade ?? null,
    gradeComment: d.data().gradeComment ?? '',
  }));
  return list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function getStudentSubmissions(classId: string): Promise<LessonSubmission[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(
    collection(db, 'podcast'),
    where('userId', '==', user.uid),
  );
  const snap = await getDocs(q);
  const list = snap.docs
    .filter((d) => d.data().classId === classId && d.data().authorRole === 'student' && !!d.data().lessonId)
    .map((d) => ({
    id: d.id,
    classId: d.data().classId ?? '',
    lessonId: d.data().lessonId ?? '',
      lessonTitle: '',
      studentId: d.data().userId ?? '',
      studentName: d.data().username ?? 'Studente',
      teacherId: d.data().submittedToTeacherId ?? '',
      podcastId: d.id,
      status: d.data().submissionStatus ?? 'pending',
    teacherFeedback: d.data().teacherFeedback ?? '',
    createdAt: d.data().createdAt?.toDate() ?? new Date(),
      reviewedAt: null,
      grade: d.data().grade ?? null,
      gradeComment: d.data().gradeComment ?? '',
  }));
  const lessonIds = Array.from(new Set(list.map((x) => x.lessonId).filter(Boolean)));
  const lessonTitleMap = new Map<string, string>();
  await Promise.all(lessonIds.map(async (lessonId) => {
    const lessonSnap = await getDoc(doc(db, 'lessons', lessonId));
    if (lessonSnap.exists()) {
      lessonTitleMap.set(lessonId, lessonSnap.data().title ?? '');
      return;
    }
    // Legacy fallback: if lesson doc is missing, use linked podcast title.
    const podcastSnap = await getDoc(doc(db, 'podcast', lessonId));
    lessonTitleMap.set(lessonId, podcastSnap.exists() ? (podcastSnap.data().title ?? '') : '');
  }));
  return list
    .map((x) => ({ ...x, lessonTitle: lessonTitleMap.get(x.lessonId) ?? '' }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function approveSubmission(submissionId: string): Promise<void> {
  const callable = httpsCallable<{ submissionId: string }, { ok: boolean }>(functions, 'approveSubmissionSecure');
  await callable({ submissionId });
}

export async function rejectSubmission(submissionId: string, feedback: string): Promise<void> {
  const msg = feedback.trim();
  if (!msg) throw new Error('Il feedback e obbligatorio');
  const callable = httpsCallable<{ submissionId: string; feedback: string }, { ok: boolean }>(functions, 'rejectSubmissionSecure');
  await callable({ submissionId, feedback: msg });
}

export async function gradeSubmission(submissionId: string, grade: number, gradeComment: string): Promise<void> {
  const safeGrade = Math.max(0, Math.min(100, Math.round(grade)));
  const callable = httpsCallable<{ submissionId: string; grade: number; gradeComment: string }, { ok: boolean }>(
    functions,
    'gradeSubmissionSecure',
  );
  await callable({ submissionId, grade: safeGrade, gradeComment: (gradeComment || '').trim() });
}

export async function getClassSubmissionsForTeacher(classId: string): Promise<SubmissionBoardItem[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(db, 'lessonSubmissions'), where('teacherId', '==', user.uid));
  const snap = await getDocs(q);
  const list = snap.docs
    .filter((d) => d.data().classId === classId)
    .map((d) => ({
      id: d.id,
      classId: d.data().classId ?? '',
      lessonId: d.data().lessonId ?? '',
      studentId: d.data().studentId ?? '',
      studentName: d.data().studentName ?? 'Studente',
      teacherId: d.data().teacherId ?? '',
      podcastId: d.data().podcastId ?? '',
      status: d.data().status ?? 'pending',
      teacherFeedback: d.data().teacherFeedback ?? '',
      createdAt: d.data().createdAt?.toDate() ?? new Date(),
      reviewedAt: normalizeDate(d.data().reviewedAt),
      grade: d.data().grade ?? null,
      gradeComment: d.data().gradeComment ?? '',
    }));
  const lessonIds = Array.from(new Set(list.map((x) => x.lessonId).filter(Boolean)));
  const lessonTitleMap = new Map<string, string>();
  await Promise.all(lessonIds.map(async (lessonId) => {
    const lessonSnap = await getDoc(doc(db, 'lessons', lessonId));
    if (lessonSnap.exists()) {
      lessonTitleMap.set(lessonId, lessonSnap.data().title ?? '');
      return;
    }
    // Legacy fallback for migrated/old classes.
    const podcastSnap = await getDoc(doc(db, 'podcast', lessonId));
    lessonTitleMap.set(lessonId, podcastSnap.exists() ? (podcastSnap.data().title ?? '') : '');
  }));
  return list
    .map((x) => ({ ...x, lessonTitle: lessonTitleMap.get(x.lessonId) ?? '' }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getApprovedClassFeed(classId: string): Promise<Podcast[]> {
  const q = query(
    collection(db, 'podcast'),
    where('classId', '==', classId),
    limit(120),
  );
  const snap = await getDocs(q);
  const list = snap.docs
    .filter((d) => d.data().schoolMode === true && d.data().submissionStatus === 'approved')
    .map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Podcast, 'id'>),
      createdAt: d.data().createdAt?.toDate() ?? new Date(),
      likesCount: d.data().likesCount ?? 0,
      dislikesCount: d.data().dislikesCount ?? 0,
      commentsCount: d.data().commentsCount ?? 0,
      isITS: d.data().isITS ?? false,
      category: d.data().category,
      schoolMode: d.data().schoolMode ?? false,
      classId: d.data().classId,
      lessonId: d.data().lessonId,
      authorRole: d.data().authorRole,
      submissionStatus: d.data().submissionStatus ?? 'none',
      submittedToTeacherId: d.data().submittedToTeacherId,
      teacherFeedback: d.data().teacherFeedback,
      dueDate: normalizeDate(d.data().dueDate),
    }));
  return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50);
}

export async function updatePodcast(
  id: string,
  params: { title?: string; description?: string; newCoverUri?: string | null },
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');

  const updates: Record<string, unknown> = {};
  if (params.title !== undefined) updates.title = params.title;
  if (params.description !== undefined) updates.description = params.description;

  if (params.newCoverUri !== undefined) {
    if (params.newCoverUri === null) {
      updates.coverUrl = null;
    } else {
      const coverBlob = await (await fetch(params.newCoverUri)).blob();
      const coverRef = ref(storage, `podcast/${user.uid}/cover_${Date.now()}.jpg`);
      await uploadBytes(coverRef, coverBlob, { contentType: 'image/jpeg' });
      updates.coverUrl = await getDownloadURL(coverRef);
    }
  }

  await updateDoc(doc(db, 'podcast', id), updates);
}

export async function deletePodcast(id: string): Promise<void> {
  await deleteDoc(doc(db, 'podcast', id));
}

// ─── SoundScape sound search ──────────────────────────────────────────────────

export interface SoundResult {
  id: string;
  title: string;
  username: string;
  audioUrl: string;
  duration: number;
}

// ─── Single podcast ───────────────────────────────────────────────────────────

export async function getPodcastById(id: string): Promise<Podcast | null> {
  const snap = await getDoc(doc(db, 'podcast', id));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    userId: d.userId ?? '',
    username: d.username ?? '',
    userAvatar: d.userAvatar ?? '',
    title: d.title ?? '',
    description: d.description ?? '',
    audioUrl: d.audioUrl ?? '',
    coverUrl: d.coverUrl ?? null,
    duration: d.duration ?? 0,
    createdAt: d.createdAt?.toDate() ?? new Date(),
    likesCount: d.likesCount ?? 0,
    dislikesCount: d.dislikesCount ?? 0,
    commentsCount: d.commentsCount ?? 0,
    isITS: d.isITS ?? false,
    category: d.category,
  };
}

// ─── Playlist functions ───────────────────────────────────────────────────────

/** Crea una nuova playlist vuota e restituisce il suo ID */
export async function createPlaylist(name: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  const docRef = await addDoc(collection(db, 'playlists'), {
    name: name.trim(),
    userId: user.uid,
    podcastIds: [],
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/** Restituisce le playlist dell'utente corrente */
export async function getUserPlaylists(): Promise<Playlist[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(
    collection(db, 'playlists'),
    where('userId', '==', user.uid),
  );
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({
    id: d.id,
    name: d.data().name ?? '',
    userId: d.data().userId ?? '',
    podcastIds: d.data().podcastIds ?? [],
    createdAt: d.data().createdAt?.toDate() ?? new Date(),
  }));
  return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Aggiunge un episodio a una playlist */
export async function addPodcastToPlaylist(playlistId: string, podcastId: string): Promise<void> {
  await updateDoc(doc(db, 'playlists', playlistId), {
    podcastIds: arrayUnion(podcastId),
  });
}

/** Rimuove un episodio da una playlist */
export async function removePodcastFromPlaylist(playlistId: string, podcastId: string): Promise<void> {
  await updateDoc(doc(db, 'playlists', playlistId), {
    podcastIds: arrayRemove(podcastId),
  });
}

/** Elimina una playlist */
export async function deletePlaylist(playlistId: string): Promise<void> {
  await deleteDoc(doc(db, 'playlists', playlistId));
}

/** Ascolta in real-time una singola playlist (aggiornamenti live) */
export function listenToPlaylist(
  playlistId: string,
  cb: (playlist: Playlist | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'playlists', playlistId), (snap) => {
    if (!snap.exists()) { cb(null); return; }
    const d = snap.data();
    cb({
      id: snap.id,
      name: d.name ?? '',
      userId: d.userId ?? '',
      podcastIds: d.podcastIds ?? [],
      createdAt: d.createdAt?.toDate() ?? new Date(),
    });
  });
}

// ─── SoundScape sound search ──────────────────────────────────────────────────

export async function searchSounds(queryText: string): Promise<SoundResult[]> {
  const q = query(collection(db, 'sounds'), orderBy('createdAt', 'desc'), limit(40));
  const snap = await getDocs(q);
  const all = snap.docs.map((d) => ({
    id: d.id,
    title: d.data().title ?? '',
    username: d.data().username ?? '',
    audioUrl: d.data().audioUrl ?? '',
    duration: d.data().duration ?? 0,
  }));
  if (!queryText.trim()) return all;
  const lower = queryText.toLowerCase();
  return all.filter((r) =>
    r.title.toLowerCase().includes(lower) || r.username.toLowerCase().includes(lower),
  );
}
