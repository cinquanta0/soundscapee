import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  FlatList, ActivityIndicator, Alert, ScrollView,
  useWindowDimensions, Clipboard, Image,
} from 'react-native';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { auth } from '../firebaseConfig';
import SchoolOnboarding from '../components/SchoolOnboarding';
import {
  SchoolClass,
  SchoolLesson,
  LessonSubmission,
  createClass,
  joinClassByCode,
  getTeacherClasses,
  getStudentClasses,
  getClassLessons,
  createLessonPodcast,
  submitLessonAssignment,
  approveSubmission,
  rejectSubmission,
  getApprovedClassFeed,
  getStudentSubmissions,
  searchSounds,
  SoundResult,
  PendingClassMember,
  getPendingClassMembersForTeacher,
  approveClassMember,
  rejectClassMember,
  getSchoolAccessStatus,
  SchoolAccessStatus,
  getClassSubmissionsForTeacher,
  SubmissionBoardItem,
  gradeSubmission,
  setSchoolRoleByAdmin,
  getPodcastById,
  updateClassPhoto,
} from '../services/podcastService';

const ONBOARDING_KEY = 'soundscape_school_onboarding_done';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       '#07101E',
  surface:  '#0C1929',
  card:     '#0F1F35',
  border:   '#1A2D4A',
  gold:     '#F0A500',
  goldDim:  'rgba(240,165,0,0.12)',
  blue:     '#4D8BF5',
  blueDim:  'rgba(77,139,245,0.12)',
  green:    '#00C97A',
  greenDim: 'rgba(0,201,122,0.12)',
  red:      '#FF4D6D',
  redDim:   'rgba(255,77,109,0.12)',
  amber:    '#F59E0B',
  amberDim: 'rgba(245,158,11,0.12)',
  text:     '#EDF2FF',
  textDim:  '#7B96C2',
  textMute: '#2E4870',
};

type RoleMode = 'teacher' | 'student';
type Section = 'lessons' | 'review' | 'approved' | 'mine' | 'admin';

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cfg: Record<string, { color: string; bg: string; label: string }> = {
    pending:  { color: C.amber,  bg: C.amberDim, label: t('school.status.pending')  },
    approved: { color: C.green,  bg: C.greenDim, label: t('school.status.approved') },
    rejected: { color: C.red,    bg: C.redDim,   label: t('school.status.rejected') },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <View style={[badge.wrap, { backgroundColor: c.bg, borderColor: c.color + '50' }]}>
      <View style={[badge.dot, { backgroundColor: c.color }]} />
      <Text style={[badge.txt, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}
const badge = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  txt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
});

// ─── Grade circle ─────────────────────────────────────────────────────────────
function GradeCircle({ grade }: { grade: number }) {
  const color = grade >= 80 ? C.green : grade >= 60 ? C.blue : grade >= 40 ? C.amber : C.red;
  return (
    <View style={[gc.ring, { borderColor: color + '60' }]}>
      <View style={[gc.inner, { backgroundColor: color + '18' }]}>
        <Text style={[gc.num, { color }]}>{grade}</Text>
        <Text style={gc.denom}>/100</Text>
      </View>
    </View>
  );
}
const gc = StyleSheet.create({
  ring: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  inner: {
    width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
  },
  num: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  denom: { color: C.textMute, fontSize: 9, fontWeight: '700' },
});

// ─── Section tab ──────────────────────────────────────────────────────────────
function SectionTab({
  label, active, onPress, badgeCount,
}: { label: string; active: boolean; onPress: () => void; badgeCount?: number }) {
  return (
    <TouchableOpacity style={[st.tab, active && st.tabActive]} onPress={onPress}>
      <Text style={[st.txt, active && st.txtActive]}>{label}</Text>
      {!!badgeCount && (
        <View style={st.badge}>
          <Text style={st.badgeTxt}>{badgeCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
const st = StyleSheet.create({
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 99, borderWidth: 1,
    borderColor: C.border, backgroundColor: C.surface,
  },
  tabActive: { borderColor: C.gold + '70', backgroundColor: C.goldDim },
  txt: { color: C.textMute, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  txtActive: { color: C.gold },
  badge: {
    backgroundColor: C.red, borderRadius: 99,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ITSSchoolScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const hPad = width > 900 ? 28 : 16;
  const maxW = width > 900 ? 860 : width > 680 ? 760 : undefined;
  const contentCardStyle = useMemo(
    () => (maxW ? { maxWidth: maxW, alignSelf: 'center' as const, width: '100%' as const } : { width: '100%' as const }),
    [maxW],
  );

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [roleMode, setRoleMode]     = useState<RoleMode>('student');
  const [classes, setClasses]       = useState<SchoolClass[]>([]);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [lessons, setLessons]       = useState<SchoolLesson[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingClassMember[]>([]);
  const [submissionBoard, setSubmissionBoard] = useState<SubmissionBoardItem[]>([]);
  const [mine, setMine]             = useState<LessonSubmission[]>([]);
  const [approved, setApproved]     = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [section, setSection]       = useState<Section>('lessons');

  const [newClassName, setNewClassName] = useState('');
  const [joinCode, setJoinCode]         = useState('');
  const [lessonTitle, setLessonTitle]   = useState('');
  const [lessonDesc, setLessonDesc]     = useState('');
  const [subTitle, setSubTitle]         = useState('');
  const [subDesc, setSubDesc]           = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [pickedAudio, setPickedAudio]   = useState<SoundResult | null>(null);
  const [search, setSearch]             = useState('');
  const [results, setResults]           = useState<SoundResult[]>([]);
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({});
  const [gradeById, setGradeById]       = useState<Record<string, string>>({});
  const [gradeNoteById, setGradeNoteById] = useState<Record<string, string>>({});
  const [adminUid, setAdminUid]         = useState('');
  const [adminRole, setAdminRole]       = useState<'teacher' | 'student' | 'admin'>('teacher');
  const [busy, setBusy]                 = useState(false);
  const [schoolStatus, setSchoolStatus] = useState<SchoolAccessStatus | null>(null);
  const [lessonAudioUrl, setLessonAudioUrl] = useState<string | null>(null);
  const [lessonAudioLoading, setLessonAudioLoading] = useState(false);
  const [lessonAudioPlaying, setLessonAudioPlaying] = useState(false);
  const screenScrollRef = useRef<ScrollView | null>(null);
  const lessonSoundRef = useRef<Audio.Sound | null>(null);

  // ── Stato per audio locale (registrazione / file) ──────────────────────────
  const [localAudioUri, setLocalAudioUri] = useState<string | null>(null);
  const [localAudioName, setLocalAudioName] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecondsRef = useRef(0);
  const [uploadingClassPhoto, setUploadingClassPhoto] = useState(false);

  const clearLocalAudio = () => { setLocalAudioUri(null); setLocalAudioName(''); };

  const activeClass = useMemo(
    () => classes.find((c) => c.id === activeClassId) ?? null,
    [classes, activeClassId],
  );

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, fallback: T, ms = 9000): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeoutPromise = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      });
      return await Promise.race([promise, timeoutPromise]);
    } catch {
      return fallback;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }, []);

  const switchSection = useCallback((next: Section) => {
    setSection(next);
    // Keep section header/content reachable on small Android screens.
    requestAnimationFrame(() => {
      screenScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  }, []);

  // ── Onboarding ─────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((done) => {
      if (!done) setShowOnboarding(true);
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    AsyncStorage.setItem(ONBOARDING_KEY, '1');
    setShowOnboarding(false);
  }, []);

  // ── Caricamento ────────────────────────────────────────────────────────────
  useEffect(() => {
    loadClasses(roleMode);
    getSchoolAccessStatus().then(setSchoolStatus).catch(() => setSchoolStatus(null));
  }, [roleMode]);

  useEffect(() => {
    if (!activeClassId) return;
    refreshClassData(activeClassId, roleMode);
  }, [activeClassId, roleMode]);

  useEffect(() => {
    const selectedLesson = lessons.find((l) => l.id === selectedLessonId);
    const loadLessonAudio = async () => {
      setLessonAudioLoading(true);
      setLessonAudioUrl(null);
      setLessonAudioPlaying(false);
      try {
        await lessonSoundRef.current?.unloadAsync().catch(() => {});
        lessonSoundRef.current = null;
        if (!selectedLesson?.podcastId) return;
        const podcast = await getPodcastById(selectedLesson.podcastId);
        const audioUrl = podcast?.audioUrl || null;
        setLessonAudioUrl(audioUrl);
      } finally {
        setLessonAudioLoading(false);
      }
    };
    loadLessonAudio();
  }, [selectedLessonId, lessons]);

  useEffect(() => {
    return () => {
      lessonSoundRef.current?.unloadAsync().catch(() => {});
      lessonSoundRef.current = null;
    };
  }, []);

  useEffect(() => {
    setSection((prev) => {
      if (roleMode === 'teacher' && prev === 'mine') return 'lessons';
      if (roleMode === 'student' && prev === 'review') return 'lessons';
      return prev;
    });
  }, [roleMode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchSounds(search).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadClasses = async (mode: RoleMode) => {
    setLoading(true);
    try {
      const list = mode === 'teacher' ? await getTeacherClasses() : await getStudentClasses();
      setClasses(list);
      setActiveClassId((prev) => {
        if (!prev) return list[0]?.id ?? null;
        return list.some((c) => c.id === prev) ? prev : list[0]?.id ?? null;
      });
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotLoadClasses'));
    } finally {
      setLoading(false);
    }
  };

  const refreshClassData = async (classId: string, mode: RoleMode) => {
    setLoading(true);
    try {
      const [lessonList, approvedFeed] = await Promise.all([
        withTimeout(getClassLessons(classId), [] as SchoolLesson[]),
        withTimeout(getApprovedClassFeed(classId), [] as any[]),
      ]);
      setLessons(lessonList);
      setApproved(approvedFeed);
      if (mode === 'teacher') {
        const [members, board] = await Promise.all([
          withTimeout(getPendingClassMembersForTeacher(classId), [] as PendingClassMember[]),
          withTimeout(getClassSubmissionsForTeacher(classId), [] as SubmissionBoardItem[]),
        ]);
        setPendingMembers(members);
        setSubmissionBoard(board);
        setMine([]);
      } else {
        setPendingMembers([]);
        setSubmissionBoard([]);
        setMine(await withTimeout(getStudentSubmissions(classId), [] as LessonSubmission[]));
      }
      const firstLessonId = lessonList[0]?.id ?? null;
      setSelectedLessonId((prev) => (prev && lessonList.some((l) => l.id === prev) ? prev : firstLessonId));
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotUpdate'));
    } finally {
      setLoading(false);
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    if (!['teacher', 'admin'].includes(schoolStatus?.schoolRole || 'student')) {
      Alert.alert(t('school.teacherAccessRequired'), t('school.teacherAccessMsg'));
      return;
    }
    setBusy(true);
    try {
      await createClass(newClassName.trim(), auth.currentUser?.displayName || 'Docente');
      setNewClassName('');
      await loadClasses('teacher');
      setRoleMode('teacher');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotCreateClass'));
    } finally { setBusy(false); }
  };

  const handleJoinClass = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      await joinClassByCode(joinCode.trim().toUpperCase());
      setJoinCode('');
      Alert.alert(t('school.requestSentTitle'), t('school.requestSentMsg'));
      setRoleMode('student');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotJoin'));
    } finally { setBusy(false); }
  };

  const handleApproveMember = async (studentId: string) => {
    if (!activeClassId) return;
    setBusy(true);
    try {
      await approveClassMember(activeClassId, studentId);
      await refreshClassData(activeClassId, 'teacher');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotApprove'));
    } finally { setBusy(false); }
  };

  const handleRejectMember = async (studentId: string) => {
    if (!activeClassId) return;
    setBusy(true);
    try {
      await rejectClassMember(activeClassId, studentId);
      await refreshClassData(activeClassId, 'teacher');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotReject'));
    } finally { setBusy(false); }
  };

  const handlePublishLesson = async () => {
    if (!activeClassId || !lessonTitle.trim()) return;
    const hasAudio = !!pickedAudio || !!localAudioUri;
    if (!hasAudio) return;
    setBusy(true);
    try {
      await createLessonPodcast({
        classId: activeClassId,
        title: lessonTitle.trim(),
        description: lessonDesc.trim(),
        audioUrl: pickedAudio?.audioUrl,
        audioUri: localAudioUri || undefined,
      });
      setLessonTitle(''); setLessonDesc(''); setPickedAudio(null); clearLocalAudio();
      await refreshClassData(activeClassId, 'teacher');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotPublishLesson'));
    } finally { setBusy(false); }
  };

  const handleSubmit = async () => {
    if (!activeClassId || !selectedLessonId || !subTitle.trim()) return;
    const hasAudio = !!pickedAudio || !!localAudioUri;
    if (!hasAudio) return;
    setBusy(true);
    try {
      await submitLessonAssignment({
        classId: activeClassId,
        lessonId: selectedLessonId,
        title: subTitle.trim(),
        description: subDesc.trim(),
        audioUrl: pickedAudio?.audioUrl,
        audioUri: localAudioUri || undefined,
      });
      setSubTitle(''); setSubDesc(''); setPickedAudio(null); clearLocalAudio();
      await refreshClassData(activeClassId, 'student');
      setSection('mine');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotSubmit'));
    } finally { setBusy(false); }
  };

  const handleApprove = async (submissionId: string) => {
    const gradeRaw = (gradeById[submissionId] ?? '').trim();
    const gradeValue = Number(gradeRaw);
    if (!gradeRaw || Number.isNaN(gradeValue)) {
      Alert.alert(t('school.gradeRequired'), t('school.gradeRequiredMsg'));
      return;
    }
    setBusy(true);
    try {
      await gradeSubmission(submissionId, gradeValue, gradeNoteById[submissionId] ?? '');
      await approveSubmission(submissionId);
      if (activeClassId) await refreshClassData(activeClassId, 'teacher');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotApproveSubmission'));
    } finally { setBusy(false); }
  };

  const handleReject = async (submissionId: string) => {
    const feedback = feedbackById[submissionId]?.trim();
    if (!feedback) {
      Alert.alert(t('school.feedbackRequired'), t('school.feedbackRequiredMsg'));
      return;
    }
    setBusy(true);
    try {
      await rejectSubmission(submissionId, feedback);
      if (activeClassId) await refreshClassData(activeClassId, 'teacher');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotRejectSubmission'));
    } finally { setBusy(false); }
  };

  const handleGrade = async (submissionId: string) => {
    const gradeValue = Number(gradeById[submissionId] ?? '');
    if (Number.isNaN(gradeValue)) {
      Alert.alert(t('school.invalidVote'), t('school.invalidVoteMsg'));
      return;
    }
    setBusy(true);
    try {
      await gradeSubmission(submissionId, gradeValue, gradeNoteById[submissionId] ?? '');
      if (activeClassId) await refreshClassData(activeClassId, 'teacher');
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotGrade'));
    } finally { setBusy(false); }
  };

  const handleAssignRole = async () => {
    const uid = adminUid.trim();
    if (!uid) return;
    if (!/^[a-zA-Z0-9]{20,128}$/.test(uid)) {
      Alert.alert(t('common.error'), 'UID non valido. Deve essere alfanumerico, 20-128 caratteri.');
      return;
    }
    setBusy(true);
    try {
      await setSchoolRoleByAdmin(uid, adminRole);
      setAdminUid('');
      Alert.alert(t('school.roleUpdated'), t('school.roleUpdatedMsg'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('school.errors.cannotUpdateRole'));
    } finally { setBusy(false); }
  };

  const copyClassCode = (code: string) => {
    Clipboard.setString(code);
    Alert.alert('', t('school.codeCopied'));
  };

  const toggleLessonAudio = async () => {
    if (!lessonAudioUrl) return;
    try {
      if (lessonSoundRef.current && lessonAudioPlaying) {
        await lessonSoundRef.current.pauseAsync();
        setLessonAudioPlaying(false);
        return;
      }
      if (lessonSoundRef.current && !lessonAudioPlaying) {
        await lessonSoundRef.current.playAsync();
        setLessonAudioPlaying(true);
        return;
      }
      setLessonAudioLoading(true);
      const { sound } = await Audio.Sound.createAsync(
        { uri: lessonAudioUrl },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          setLessonAudioPlaying(!!status.isPlaying);
          if (status.didJustFinish) {
            setLessonAudioPlaying(false);
          }
        },
      );
      lessonSoundRef.current = sound;
      setLessonAudioPlaying(true);
    } catch {
      Alert.alert(t('common.error'), 'Impossibile riprodurre questa lezione.');
      setLessonAudioPlaying(false);
    } finally {
      setLessonAudioLoading(false);
    }
  };

  // ── Audio actions ────────────────────────────────────────────────────────────
  const handlePickAudioFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        clearLocalAudio();
        setPickedAudio(null);
        setLocalAudioUri(res.assets[0].uri);
        setLocalAudioName(res.assets[0].name || 'File audio');
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), 'Impossibile selezionare il file');
    }
  };

  const handleStartRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('common.error'), 'Permesso microfono negato');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
      recordTimerRef.current = setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
      }, 1000);
      clearLocalAudio();
      setPickedAudio(null);
    } catch (err: any) {
      Alert.alert(t('common.error'), 'Impossibile avviare registrazione');
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      if (uri) {
        setLocalAudioUri(uri);
        setLocalAudioName('AUDIO REGISTRATO');
      }
    } catch (err) {}
    setIsRecording(false);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
  };

  const handleUpdateClassPhoto = async () => {
    if (!activeClassId || roleMode !== 'teacher') return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.6,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setUploadingClassPhoto(true);
        await updateClassPhoto(activeClassId, res.assets[0].uri);
        await refreshClassData(activeClassId, roleMode);
        await loadClasses(roleMode);
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || 'Errore aggiornamento foto');
    } finally {
      setUploadingClassPhoto(false);
    }
  };

  // ── Status banner ──────────────────────────────────────────────────────────
  const renderStatusBanner = () => {
    const roleColor = schoolStatus?.schoolRole === 'teacher' ? C.blue
      : schoolStatus?.schoolRole === 'admin' ? '#a78bfa' : C.green;
    const roleLabel = !schoolStatus ? '…'
      : schoolStatus.schoolRole === 'teacher' ? t('school.roleTeacher')
      : schoolStatus.schoolRole === 'admin' ? 'Admin'
      : t('school.roleStudent');

    return (
      <View style={[s.statusBar, { marginHorizontal: hPad }]}>
        {!schoolStatus ? (
          <ActivityIndicator size="small" color={C.textMute} />
        ) : (
          <>
            <View style={[s.rolePill, { backgroundColor: roleColor + '20', borderColor: roleColor + '40' }]}>
              <Text style={[s.roleTxt, { color: roleColor }]}>🎓 {roleLabel}</Text>
            </View>
            <View style={s.statusDivider} />
            <Text style={[s.statusItem, { color: schoolStatus.emailVerified ? C.green : C.red }]}>
              {schoolStatus.emailVerified ? '● ' : '○ '}{t(schoolStatus.emailVerified ? 'school.statusBanner.emailVerified' : 'school.statusBanner.emailNotVerified')}
            </Text>
            <View style={s.statusDivider} />
            <Text style={[s.statusItem, { color: schoolStatus.schoolDomainAllowed ? C.green : C.textMute }]}>
              {schoolStatus.schoolDomainAllowed ? '● ' : '○ '}{t(schoolStatus.schoolDomainAllowed ? 'school.statusBanner.domainOk' : 'school.statusBanner.domainNotOk')}
            </Text>
          </>
        )}
      </View>
    );
  };

  // ── Admin panel ─────────────────────────────────────────────────────────────
  const renderAdminPanel = () => (
    <View style={[s.card, contentCardStyle]}>
      <View style={s.cardAccent} />
      <Text style={s.cardLabel}>{t('school.adminTitle')}</Text>
      <TextInput
        style={s.input}
        value={adminUid}
        onChangeText={setAdminUid}
        placeholder={t('school.adminUidPlaceholder')}
        placeholderTextColor={C.textMute}
      />
      <View style={s.segRow}>
        {(['teacher', 'student', 'admin'] as const).map((r) => (
          <TouchableOpacity
            key={r}
            style={[s.seg, adminRole === r && s.segActive]}
            onPress={() => setAdminRole(r)}
          >
            <Text style={[s.segTxt, adminRole === r && s.segTxtActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[s.btnGold, (!adminUid.trim() || busy) && s.btnDisabled]}
        onPress={handleAssignRole}
        disabled={!adminUid.trim() || busy}
      >
        <Text style={s.btnGoldTxt}>{t('school.adminUpdateRole')}</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Audio picker ─────────────────────────────────────────────────────────────
  const [audioMode, setAudioMode] = useState<'search' | 'record' | 'file'>('search');

  const renderAudioPicker = () => (
    <View style={{ marginTop: 8 }}>
      <Text style={s.fieldLabel}>{t('school.audioSection')}</Text>
      <View style={s.audioModeTabs}>
        <TouchableOpacity style={[s.audioModeTab, audioMode === 'search' && s.audioModeTabActive]} onPress={() => setAudioMode('search')}>
          <Text style={[s.audioModeTxt, audioMode === 'search' && s.audioModeTxtActive]}>Cerca</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.audioModeTab, audioMode === 'record' && s.audioModeTabActive]} onPress={() => setAudioMode('record')}>
          <Text style={[s.audioModeTxt, audioMode === 'record' && s.audioModeTxtActive]}>Registra</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.audioModeTab, audioMode === 'file' && s.audioModeTabActive]} onPress={() => setAudioMode('file')}>
          <Text style={[s.audioModeTxt, audioMode === 'file' && s.audioModeTxtActive]}>File</Text>
        </TouchableOpacity>
      </View>

      {audioMode === 'search' && (
        <View>
          <TextInput style={s.input} value={search} onChangeText={setSearch} placeholder={t('school.searchAudio')} placeholderTextColor={C.textMute} />
          {pickedAudio ? (
            <View style={s.pickedRow}>
              <Text style={s.pickedTxt} numberOfLines={1}>🎵  {pickedAudio.title}</Text>
              <TouchableOpacity onPress={() => setPickedAudio(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: C.red, fontSize: 14, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <FlatList
            data={results.slice(0, 6)} keyExtractor={(item) => item.id} scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={[s.audioRow, pickedAudio?.id === item.id && s.audioRowActive]} onPress={() => { setPickedAudio(item); clearLocalAudio(); }}>
                <View style={[s.audioRowDot, pickedAudio?.id === item.id && { backgroundColor: C.green }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.audioRowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.audioRowSub}>@{item.username}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {audioMode === 'record' && (
        <View style={s.recordSection}>
          <Text style={s.recordTime}>
            {isRecording ? `00:${String(recordSeconds).padStart(2, '0')}` : localAudioUri && audioMode === 'record' ? 'Registrazione pronta' : 'Pronto a registrare'}
          </Text>
          <TouchableOpacity
            style={[s.recordBtn, isRecording && s.recordBtnActive]}
            onPress={isRecording ? handleStopRecording : handleStartRecording}
          >
            <View style={[s.recordBtnInner, isRecording && s.recordBtnInnerActive]} />
          </TouchableOpacity>
          {localAudioUri && audioMode === 'record' && !isRecording && (
            <View style={s.pickedRow}>
              <Text style={s.pickedTxt} numberOfLines={1}>🎙️ {localAudioName}</Text>
              <TouchableOpacity onPress={clearLocalAudio} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: C.red, fontSize: 14, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {audioMode === 'file' && (
        <View style={s.fileSection}>
          <TouchableOpacity style={s.btnBlue} onPress={handlePickAudioFile}>
            <Text style={s.btnBlueTxt}>Scegli file audio</Text>
          </TouchableOpacity>
          {localAudioUri && audioMode === 'file' && (
            <View style={s.pickedRow}>
              <Text style={s.pickedTxt} numberOfLines={1}>📁 {localAudioName}</Text>
              <TouchableOpacity onPress={clearLocalAudio} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: C.red, fontSize: 14, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );

  // ── Lessons section ──────────────────────────────────────────────────────────
  const renderLessons = () => (
    <View style={{ gap: 12 }}>
      {/* Lesson list */}
      <View style={[s.card, contentCardStyle]}>
        <View style={[s.cardAccent, { backgroundColor: C.blue }]} />
        <Text style={s.cardLabel}>{t('school.classLessons')}</Text>
        {lessons.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📭</Text>
            <Text style={s.emptyText}>{t('school.noLessons')}</Text>
          </View>
        ) : (
          <View style={{ gap: 1 }}>
            {lessons.map((item, idx) => (
              <TouchableOpacity
                key={item.id}
                style={[s.lessonRow, selectedLessonId === item.id && s.lessonRowActive]}
                onPress={() => setSelectedLessonId(item.id)}
              >
                <View style={[s.lessonDot, selectedLessonId === item.id && { backgroundColor: C.blue }]} />
                {idx < lessons.length - 1 && <View style={s.lessonLine} />}
                <View style={{ flex: 1, paddingLeft: 14 }}>
                  <Text style={[s.lessonTitle, selectedLessonId === item.id && { color: C.text }]}>
                    {item.title}
                  </Text>
                  <Text style={s.lessonSub}>{t('school.lessonBy', { name: item.teacherName })}</Text>
                </View>
                {selectedLessonId === item.id && (
                  <View style={[s.activePill, { backgroundColor: C.blue + '25', borderColor: C.blue + '50' }]}>
                    <Text style={[s.activePillTxt, { color: C.blue }]}>▶</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Publish / Submit form */}
      <View style={[s.card, contentCardStyle]}>
        <View style={[s.cardAccent, { backgroundColor: roleMode === 'teacher' ? C.gold : C.green }]} />
        <Text style={s.cardLabel}>Audio lezione selezionata</Text>
        {selectedLessonId ? (
          <View style={s.inlineRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle} numberOfLines={1}>
                {lessons.find((l) => l.id === selectedLessonId)?.title || 'Lezione'}
              </Text>
              <Text style={s.rowSub}>
                {lessonAudioLoading ? 'Caricamento audio...' : lessonAudioUrl ? 'Pronta per l’ascolto' : 'Audio non disponibile'}
              </Text>
            </View>
            <TouchableOpacity
              style={[s.btnBlue, (!lessonAudioUrl || lessonAudioLoading) && s.btnDisabled]}
              onPress={toggleLessonAudio}
              disabled={!lessonAudioUrl || lessonAudioLoading}
            >
              {lessonAudioLoading ? (
                <ActivityIndicator color={C.blue} size="small" />
              ) : (
                <Text style={s.btnBlueTxt}>{lessonAudioPlaying ? 'Stop' : 'Play'}</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={s.emptyText}>Seleziona una lezione per ascoltare l’audio.</Text>
        )}
      </View>

      <View style={[s.card, contentCardStyle]}>
        <View style={[s.cardAccent, { backgroundColor: roleMode === 'teacher' ? C.gold : C.green }]} />
        {roleMode === 'teacher' ? (
          <>
            <Text style={s.cardLabel}>{t('school.publishLesson')}</Text>
            <TextInput style={s.input} value={lessonTitle} onChangeText={setLessonTitle}
              placeholder={t('school.lessonTitlePlaceholder')} placeholderTextColor={C.textMute} />
            <TextInput style={[s.input, s.inputMulti]} value={lessonDesc} onChangeText={setLessonDesc}
              placeholder={t('school.lessonDescPlaceholder')} placeholderTextColor={C.textMute} multiline numberOfLines={2} />
            {renderAudioPicker()}
            <TouchableOpacity
              style={[s.btnGold, (!(pickedAudio || localAudioUri) || !lessonTitle.trim() || busy) && s.btnDisabled]}
              onPress={handlePublishLesson}
              disabled={!(pickedAudio || localAudioUri) || !lessonTitle.trim() || busy}
            >
              {busy ? <ActivityIndicator color={C.bg} size="small" />
                : <Text style={s.btnGoldTxt}>{t('school.publishLesson')}</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.cardLabel}>{t('school.submitAssignment')}</Text>
            <TextInput style={s.input} value={subTitle} onChangeText={setSubTitle}
              placeholder={t('school.submissionTitlePlaceholder')} placeholderTextColor={C.textMute} />
            <TextInput style={[s.input, s.inputMulti]} value={subDesc} onChangeText={setSubDesc}
              placeholder={t('school.submissionDescPlaceholder')} placeholderTextColor={C.textMute} multiline numberOfLines={2} />
            {renderAudioPicker()}
            <TouchableOpacity
              style={[s.btnGreen, (!(pickedAudio || localAudioUri) || !subTitle.trim() || !selectedLessonId || busy) && s.btnDisabled]}
              onPress={handleSubmit}
              disabled={!(pickedAudio || localAudioUri) || !subTitle.trim() || !selectedLessonId || busy}
            >
              {busy ? <ActivityIndicator color={C.bg} size="small" />
                : <Text style={s.btnGreenTxt}>{t('school.submitAssignment')}</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  // ── Review section (teacher) ─────────────────────────────────────────────────
  const renderReview = () => (
    <View style={{ gap: 12 }}>
      {pendingMembers.length > 0 && (
        <View style={[s.card, contentCardStyle]}>
          <View style={[s.cardAccent, { backgroundColor: C.amber }]} />
          <Text style={s.cardLabel}>{t('school.pendingStudents')}</Text>
          {pendingMembers.map((m) => (
            <View key={m.userId} style={s.memberRow}>
              <View style={s.memberInitial}>
                <Text style={s.memberInitialTxt}>{m.userId[0]?.toUpperCase()}</Text>
              </View>
              <Text style={s.memberUid} numberOfLines={1}>{m.userId}</Text>
              <TouchableOpacity style={s.approveBtn} onPress={() => handleApproveMember(m.userId)} disabled={busy}>
                <Text style={{ color: C.green, fontSize: 15, fontWeight: '800' }}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.rejectBtn} onPress={() => handleRejectMember(m.userId)} disabled={busy}>
                <Text style={{ color: C.red, fontSize: 13, fontWeight: '800' }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {submissionBoard.length === 0 ? (
        <View style={[s.card, contentCardStyle]}>
          <View style={[s.cardAccent, { backgroundColor: C.amber }]} />
          <Text style={s.emptyIcon}>📭</Text>
          <Text style={s.emptyText}>{t('school.noPendingSubmissions')}</Text>
        </View>
      ) : (
        submissionBoard.map((item) => (
          <View key={item.id} style={[s.subCard, contentCardStyle]}>
            {/* Left status stripe */}
            <View style={[s.subStripe, {
              backgroundColor: item.status === 'approved' ? C.green : item.status === 'rejected' ? C.red : C.amber,
            }]} />
            <View style={{ flex: 1 }}>
              <View style={s.subHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.subStudent}>{item.studentName}</Text>
                  <Text style={s.subLesson}>{item.lessonTitle || t('school.sections.lessons')}</Text>
                </View>
                <StatusBadge status={item.status} />
              </View>

              {item.status === 'pending' && (
                <>
                  <View style={s.gradeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>{t('school.gradeLabel')}</Text>
                      <TextInput
                        style={s.input}
                        keyboardType="numeric"
                        value={gradeById[item.id] ?? String(item.grade ?? '')}
                        onChangeText={(v) => setGradeById((p) => ({ ...p, [item.id]: v }))}
                        placeholder="0–100"
                        placeholderTextColor={C.textMute}
                      />
                    </View>
                    <View style={{ flex: 2 }}>
                      <Text style={s.fieldLabel}>{t('school.gradeNote')}</Text>
                      <TextInput
                        style={s.input}
                        value={gradeNoteById[item.id] ?? item.gradeComment ?? ''}
                        onChangeText={(v) => setGradeNoteById((p) => ({ ...p, [item.id]: v }))}
                        placeholder={t('common.optional')}
                        placeholderTextColor={C.textMute}
                      />
                    </View>
                  </View>
                  <Text style={s.fieldLabel}>{t('school.feedbackLabel')}</Text>
                  <TextInput
                    style={s.input}
                    value={feedbackById[item.id] ?? ''}
                    onChangeText={(v) => setFeedbackById((p) => ({ ...p, [item.id]: v }))}
                    placeholder={t('school.feedbackPlaceholder')}
                    placeholderTextColor={C.textMute}
                  />
                  <View style={s.actionRow}>
                    <TouchableOpacity style={[s.btnGreen, { flex: 1 }]} onPress={() => handleApprove(item.id)} disabled={busy}>
                      <Text style={s.btnGreenTxt}>{t('school.approve')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btnRed, { flex: 1 }]} onPress={() => handleReject(item.id)} disabled={busy}>
                      <Text style={s.btnRedTxt}>{t('common.reject')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btnBlue, { flex: 1 }]} onPress={() => handleGrade(item.id)} disabled={busy}>
                      <Text style={s.btnBlueTxt}>{t('school.saveGrade')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {item.status !== 'pending' && typeof item.grade === 'number' && (
                <View style={{ paddingTop: 8 }}>
                  <GradeCircle grade={item.grade} />
                </View>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );

  // ── Mine section (student) ───────────────────────────────────────────────────
  const renderMine = () => (
    <View style={{ gap: 12 }}>
      {mine.length === 0 ? (
        <View style={[s.card, contentCardStyle]}>
          <View style={[s.cardAccent, { backgroundColor: C.blue }]} />
          <Text style={s.emptyIcon}>📝</Text>
          <Text style={s.emptyText}>{t('school.noSubmissions')}</Text>
        </View>
      ) : (
        mine.map((item) => (
          <View key={item.id} style={[s.subCard, contentCardStyle]}>
            <View style={[s.subStripe, {
              backgroundColor: item.status === 'approved' ? C.green : item.status === 'rejected' ? C.red : C.amber,
            }]} />
            <View style={{ flex: 1 }}>
              <View style={s.subHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.subStudent}>{item.lessonTitle || t('school.sections.lessons')}</Text>
                </View>
                <StatusBadge status={item.status} />
              </View>
              {typeof item.grade === 'number' && (
                <View style={{ paddingTop: 8 }}>
                  <GradeCircle grade={item.grade} />
                </View>
              )}
              {!!item.teacherFeedback && (
                <View style={s.feedbackBox}>
                  <Text style={s.feedbackLabel}>💬 Feedback</Text>
                  <Text style={s.feedbackText}>{item.teacherFeedback}</Text>
                </View>
              )}
              {!!item.gradeComment && (
                <View style={s.feedbackBox}>
                  <Text style={s.feedbackLabel}>📋 {t('school.gradeNote')}</Text>
                  <Text style={s.feedbackText}>{item.gradeComment}</Text>
                </View>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );

  // ── Approved section ─────────────────────────────────────────────────────────
  const renderApproved = () => (
    <View style={{ gap: 10 }}>
      {approved.length === 0 ? (
        <View style={[s.card, contentCardStyle]}>
          <View style={[s.cardAccent, { backgroundColor: C.green }]} />
          <Text style={s.emptyIcon}>🏆</Text>
          <Text style={s.emptyText}>{t('school.noApproved')}</Text>
        </View>
      ) : (
        approved.map((item) => (
          <View key={item.id} style={[s.card, contentCardStyle]}>
            <View style={[s.cardAccent, { backgroundColor: C.green }]} />
            <View style={s.inlineRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{item.title}</Text>
                <Text style={s.rowSub}>@{item.username}</Text>
              </View>
              <StatusBadge status="approved" />
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderSectionContent = () => {
    if (section === 'lessons') return renderLessons();
    if (section === 'review' && roleMode === 'teacher') return renderReview();
    if (section === 'mine' && roleMode === 'student') return renderMine();
    if (section === 'approved') return renderApproved();
    if (section === 'admin' && schoolStatus?.schoolRole === 'admin') return renderAdminPanel();

    return (
      <View style={[s.card, contentCardStyle]}>
        <View style={[s.cardAccent, { backgroundColor: C.blue }]} />
        <Text style={s.emptyText}>{t('school.createOrJoin')}</Text>
      </View>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {showOnboarding && <SchoolOnboarding onComplete={completeOnboarding} />}

      {/* Top gold accent line */}
      <View style={s.topLine} />

      <ScrollView
        ref={screenScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 36 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        {renderStatusBanner()}

        {/* Role toggle */}
        <View style={[s.toggleTrack, { marginHorizontal: hPad }]}>
          <TouchableOpacity
            style={[s.toggleHalf, roleMode === 'teacher' && s.toggleHalfActive]}
            onPress={() => setRoleMode('teacher')}
          >
            <Text style={[s.toggleLabel, roleMode === 'teacher' && s.toggleLabelActive]}>
              📋  {t('school.roleTeacher')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleHalf, roleMode === 'student' && s.toggleHalfActive]}
            onPress={() => setRoleMode('student')}
          >
            <Text style={[s.toggleLabel, roleMode === 'student' && s.toggleLabelActive]}>
              🎤  {t('school.roleStudent')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Create / join class */}
        <View style={[s.card, { marginHorizontal: hPad }, contentCardStyle]}>
          <View style={[s.cardAccent, { backgroundColor: roleMode === 'teacher' ? C.gold : C.blue }]} />
          {roleMode === 'teacher' ? (
            <View style={s.inlineRow}>
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                value={newClassName}
                onChangeText={setNewClassName}
                placeholder={t('school.classNamePlaceholder')}
                placeholderTextColor={C.textMute}
              />
              <TouchableOpacity
                style={[s.btnGold, { marginTop: 0 }, (!newClassName.trim() || busy) && s.btnDisabled]}
                onPress={handleCreateClass}
                disabled={!newClassName.trim() || busy}
              >
                <Text style={s.btnGoldTxt}>{t('common.create')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.inlineRow}>
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                value={joinCode}
                onChangeText={setJoinCode}
                placeholder={t('school.joinCodePlaceholder')}
                autoCapitalize="characters"
                placeholderTextColor={C.textMute}
              />
              <TouchableOpacity
                style={[s.btnBlue, (!joinCode.trim() || busy) && s.btnDisabled]}
                onPress={handleJoinClass}
                disabled={!joinCode.trim() || busy}
              >
                <Text style={s.btnBlueTxt}>{t('school.joinClass')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Class chips */}
        <FlatList
          horizontal
          data={classes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: hPad, gap: 8, marginBottom: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.classChip, item.id === activeClassId && s.classChipActive]}
              onPress={() => setActiveClassId(item.id)}
              onLongPress={() => copyClassCode(item.code)}
            >
              <Text style={[s.classChipName, item.id === activeClassId && s.classChipNameActive]}>
                {item.name}
              </Text>
              <View style={[s.codeTag, item.id === activeClassId && { borderColor: C.gold + '50' }]}>
                <Text style={[s.codeTagTxt, item.id === activeClassId && { color: C.gold }]}>
                  {item.code}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={[s.emptyText, { paddingVertical: 10 }]}>{t('school.noClasses')}</Text>
          }
          showsHorizontalScrollIndicator={false}
        />

        {!activeClass ? (
          <>
            <View style={s.centerSoft}>
              <Text style={{ fontSize: 48, marginBottom: 14 }}>🏫</Text>
              <Text style={s.emptyText}>{t('school.createOrJoin')}</Text>
            </View>
            {schoolStatus?.schoolRole === 'admin' && (
              <View style={{ paddingHorizontal: hPad }}>
                {renderAdminPanel()}
              </View>
            )}
          </>
        ) : (
        <View>
          {/* Class Header */}
          <View style={[s.classHeader, { marginHorizontal: hPad, maxWidth: maxW, alignSelf: maxW ? 'center' : undefined, width: maxW ? '100%' : undefined }]}>
            <View style={s.classPhotoWrap}>
              {activeClass.photoUrl ? (
                <Image source={{ uri: activeClass.photoUrl }} style={s.classPhoto} />
              ) : (
                <View style={s.classPhotoFallback}>
                  <Text style={s.classPhotoFallbackTxt}>{activeClass.name[0]?.toUpperCase()}</Text>
                </View>
              )}
              {roleMode === 'teacher' && (
                <TouchableOpacity style={s.editPhotoBtn} onPress={handleUpdateClassPhoto} disabled={uploadingClassPhoto}>
                  {uploadingClassPhoto ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.editPhotoBtnTxt}>📷</Text>}
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flex: 1, paddingLeft: 16 }}>
              <Text style={s.classHeaderName} numberOfLines={2}>{activeClass.name}</Text>
              <Text style={s.classHeaderTeacher}>{t('school.lessonBy', { name: activeClass.teacherName })}</Text>
            </View>
          </View>

          {/* Section tabs */}
          <View style={[s.tabsWrap, { marginHorizontal: hPad }]}>
            <SectionTab
              label={`${t('school.sections.lessons')} (${lessons.length})`}
              active={section === 'lessons'}
              onPress={() => switchSection('lessons')}
            />
            {roleMode === 'teacher' ? (
              <SectionTab
                label={t('school.sections.review')}
                active={section === 'review'}
                onPress={() => switchSection('review')}
                badgeCount={
                  submissionBoard.filter(i => i.status === 'pending').length + pendingMembers.length || undefined
                }
              />
            ) : (
              <SectionTab
                label={t('school.sections.mine')}
                active={section === 'mine'}
                onPress={() => switchSection('mine')}
              />
            )}
            <SectionTab
              label={t('school.sections.approved')}
              active={section === 'approved'}
              onPress={() => switchSection('approved')}
            />
            {schoolStatus?.schoolRole === 'admin' && (
              <SectionTab
                label={t('school.sections.admin')}
                active={section === 'admin'}
                onPress={() => switchSection('admin')}
              />
            )}
          </View>

          {loading ? (
            <View style={s.centerSoft}>
              <ActivityIndicator color={C.gold} size="large" />
            </View>
          ) : (
            <View style={{ paddingHorizontal: hPad }}>
              <View style={s.sectionStage}>
                {renderSectionContent()}
              </View>
            </View>
          )}
        </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 4 },

  topLine: { height: 2, backgroundColor: C.gold, marginBottom: 10, opacity: 0.7 },

  // Status banner
  statusBar: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    marginBottom: 12, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
  },
  rolePill: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, borderWidth: 1,
  },
  roleTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  statusDivider: { width: 1, height: 14, backgroundColor: C.border },
  statusItem: { fontSize: 11, fontWeight: '600' },

  // Role toggle
  toggleTrack: {
    flexDirection: 'row', backgroundColor: C.surface, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, marginBottom: 12, overflow: 'hidden',
  },
  toggleHalf: {
    flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 11,
  },
  toggleHalfActive: { backgroundColor: C.goldDim },
  toggleLabel: { color: C.textMute, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  toggleLabelActive: { color: C.gold },
  tabsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sectionStage: {
    minHeight: 340,
  },

  // Card base
  card: {
    backgroundColor: C.card, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
    backgroundColor: C.gold, borderTopLeftRadius: 14, borderBottomLeftRadius: 14,
  },
  cardLabel: {
    color: C.textMute, fontSize: 10, fontWeight: '800',
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1.2,
    paddingLeft: 8,
  },

  // Class chips
  classChip: {
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    alignItems: 'center', gap: 4,
  },
  classChipActive: { borderColor: C.gold + '60', backgroundColor: C.goldDim },
  classChipName: { color: C.textDim, fontSize: 13, fontWeight: '700' },
  classChipNameActive: { color: C.gold },
  codeTag: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
  },
  codeTagTxt: { color: C.textMute, fontSize: 9, fontFamily: 'monospace', fontWeight: '700', letterSpacing: 0.5 },

  // Input
  input: {
    backgroundColor: C.surface, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, color: C.text,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, fontSize: 14,
  },
  inputMulti: { minHeight: 60, textAlignVertical: 'top' },
  fieldLabel: { color: C.textMute, fontSize: 11, fontWeight: '600', marginBottom: 4, paddingLeft: 2 },

  // Buttons
  btnGold: {
    backgroundColor: C.gold, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 11,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  btnGoldTxt: { color: '#0A0800', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  btnGreen: {
    backgroundColor: C.green, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  btnGreenTxt: { color: '#001A0F', fontSize: 13, fontWeight: '800' },
  btnRed: {
    backgroundColor: C.redDim, borderRadius: 10, borderWidth: 1, borderColor: C.red + '50',
    paddingHorizontal: 14, paddingVertical: 11,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  btnRedTxt: { color: C.red, fontSize: 13, fontWeight: '700' },
  btnBlue: {
    backgroundColor: C.blueDim, borderRadius: 10, borderWidth: 1, borderColor: C.blue + '50',
    paddingHorizontal: 14, paddingVertical: 11,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  btnBlueTxt: { color: C.blue, fontSize: 13, fontWeight: '700' },
  btnDisabled: { opacity: 0.35 },

  // Layout helpers
  inlineRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  actionRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  gradeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  centerSoft: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  segRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  seg: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  segActive: { borderColor: C.gold + '60', backgroundColor: C.goldDim },
  segTxt: { color: C.textMute, fontSize: 12, fontWeight: '700' },
  segTxtActive: { color: C.gold },

  // Lesson timeline
  lessonRow: {
    flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12,
    paddingLeft: 6, position: 'relative',
  },
  lessonRowActive: {
    backgroundColor: C.blueDim, borderRadius: 10, paddingHorizontal: 6,
  },
  lessonDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.border, marginTop: 4,
    borderWidth: 2, borderColor: C.border,
    zIndex: 2,
  },
  lessonLine: {
    position: 'absolute', left: 10, top: 20, bottom: -10,
    width: 1, backgroundColor: C.border, zIndex: 1,
  },
  lessonTitle: { color: C.textDim, fontSize: 14, fontWeight: '600' },
  lessonSub: { color: C.textMute, fontSize: 11, marginTop: 2 },
  activePill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1,
    alignSelf: 'flex-start', marginTop: 2,
  },
  activePillTxt: { fontSize: 11, fontWeight: '800' },

  // Audio picker
  pickedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.greenDim, borderRadius: 8, borderWidth: 1,
    borderColor: C.green + '30', padding: 10, marginBottom: 8,
  },
  pickedTxt: { color: C.green, fontSize: 13, fontWeight: '600', flex: 1, marginRight: 8 },
  audioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 9, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  audioRowActive: {
    backgroundColor: C.greenDim, borderRadius: 8, borderBottomWidth: 0, paddingHorizontal: 8,
  },
  audioRowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.border },
  audioRowTitle: { color: C.text, fontSize: 13, fontWeight: '600' },
  audioRowSub: { color: C.textMute, fontSize: 11, marginTop: 1 },

  // Member row
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  memberInitial: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  memberInitialTxt: { color: C.textDim, fontSize: 14, fontWeight: '800' },
  memberUid: { flex: 1, color: C.textMute, fontSize: 11, fontFamily: 'monospace' },
  approveBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.greenDim, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.green + '40',
  },
  rejectBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.redDim, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.red + '40',
  },

  // Submission card
  subCard: {
    flexDirection: 'row', backgroundColor: C.card, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  subStripe: { width: 4, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  subHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginBottom: 10, padding: 14, paddingBottom: 0,
  },
  subStudent: { color: C.text, fontSize: 15, fontWeight: '800' },
  subLesson: { color: C.textMute, fontSize: 11, marginTop: 2 },

  // Feedback box
  feedbackBox: {
    backgroundColor: C.surface, borderRadius: 8, borderWidth: 1,
    borderColor: C.border, padding: 10, marginTop: 8, marginHorizontal: 14, marginBottom: 14,
  },
  feedbackLabel: { color: C.textMute, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  feedbackText: { color: C.textDim, fontSize: 13, lineHeight: 19 },

  // Generic
  rowTitle: { color: C.text, fontSize: 14, fontWeight: '700', paddingLeft: 8 },
  rowSub: { color: C.textMute, fontSize: 12, marginTop: 2, paddingLeft: 8 },

  // Empty
  emptyCard: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10,
  },
  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyIcon: { fontSize: 36, opacity: 0.5 },
  emptyText: { color: C.textMute, textAlign: 'center', fontSize: 13, lineHeight: 20 },
});
