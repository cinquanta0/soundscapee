import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { auth } from '../firebaseConfig';
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
} from '../services/podcastService';

type RoleMode = 'teacher' | 'student';
type Section = 'lessons' | 'review' | 'approved' | 'mine' | 'admin';

export default function ITSSchoolScreen() {
  const [roleMode, setRoleMode] = useState<RoleMode>('student');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<SchoolLesson[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingClassMember[]>([]);
  const [submissionBoard, setSubmissionBoard] = useState<SubmissionBoardItem[]>([]);
  const [mine, setMine] = useState<LessonSubmission[]>([]);
  const [approved, setApproved] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('lessons');

  const [newClassName, setNewClassName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [submissionTitle, setSubmissionTitle] = useState('');
  const [submissionDescription, setSubmissionDescription] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [pickedAudio, setPickedAudio] = useState<SoundResult | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SoundResult[]>([]);
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({});
  const [gradeById, setGradeById] = useState<Record<string, string>>({});
  const [gradeCommentById, setGradeCommentById] = useState<Record<string, string>>({});
  const [adminTargetUid, setAdminTargetUid] = useState('');
  const [adminRole, setAdminRole] = useState<'teacher' | 'student' | 'admin'>('teacher');
  const [busy, setBusy] = useState(false);
  const [schoolStatus, setSchoolStatus] = useState<SchoolAccessStatus | null>(null);

  const activeClass = useMemo(() => classes.find((c) => c.id === activeClassId) ?? null, [classes, activeClassId]);

  useEffect(() => {
    loadClasses(roleMode);
    getSchoolAccessStatus().then(setSchoolStatus).catch(() => setSchoolStatus(null));
  }, [roleMode]);

  useEffect(() => {
    if (!activeClassId) return;
    refreshClassData(activeClassId, roleMode);
  }, [activeClassId, roleMode]);

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
      setActiveClassId((prev) => prev ?? list[0]?.id ?? null);
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Impossibile caricare le classi');
    } finally {
      setLoading(false);
    }
  };

  const refreshClassData = async (classId: string, mode: RoleMode) => {
    setLoading(true);
    try {
      const [lessonList, approvedFeed] = await Promise.all([
        getClassLessons(classId),
        getApprovedClassFeed(classId),
      ]);
      setLessons(lessonList);
      setApproved(approvedFeed);
      if (mode === 'teacher') {
        const [members, board] = await Promise.all([
          getPendingClassMembersForTeacher(classId),
          getClassSubmissionsForTeacher(classId),
        ]);
        setPendingMembers(members);
        setSubmissionBoard(board);
      } else {
        setMine(await getStudentSubmissions(classId));
      }
      if (!selectedLessonId && lessonList[0]) setSelectedLessonId(lessonList[0].id);
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Impossibile aggiornare la classe');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    if (!schoolStatus?.emailVerified || !schoolStatus?.schoolDomainAllowed || !['teacher', 'admin'].includes(schoolStatus?.schoolRole || 'student')) {
      Alert.alert('Accesso docente richiesto', 'Per creare una classe usa email scolastica verificata e ruolo docente.');
      return;
    }
    setBusy(true);
    try {
      await createClass(newClassName, auth.currentUser?.displayName || 'Docente');
      setNewClassName('');
      await loadClasses('teacher');
      setRoleMode('teacher');
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Creazione classe fallita');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinClass = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      await joinClassByCode(joinCode);
      setJoinCode('');
      Alert.alert('Richiesta inviata', 'La docente deve approvare il tuo accesso prima di vedere la classe.');
      setRoleMode('student');
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Ingresso classe fallito');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveMember = async (studentId: string) => {
    if (!activeClassId) return;
    setBusy(true);
    try {
      await approveClassMember(activeClassId, studentId);
      await refreshClassData(activeClassId, 'teacher');
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Approvazione studente fallita');
    } finally {
      setBusy(false);
    }
  };

  const handleRejectMember = async (studentId: string) => {
    if (!activeClassId) return;
    setBusy(true);
    try {
      await rejectClassMember(activeClassId, studentId);
      await refreshClassData(activeClassId, 'teacher');
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Rifiuto studente fallito');
    } finally {
      setBusy(false);
    }
  };

  const handlePublishLesson = async () => {
    if (!activeClassId || !pickedAudio || !lessonTitle.trim()) return;
    setBusy(true);
    try {
      await createLessonPodcast({
        classId: activeClassId,
        title: lessonTitle.trim(),
        description: lessonDescription.trim(),
        audioUrl: pickedAudio.audioUrl,
      });
      setLessonTitle('');
      setLessonDescription('');
      setPickedAudio(null);
      await refreshClassData(activeClassId, 'teacher');
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Pubblicazione lezione fallita');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitAssignment = async () => {
    if (!activeClassId || !selectedLessonId || !pickedAudio || !submissionTitle.trim()) return;
    setBusy(true);
    try {
      await submitLessonAssignment({
        classId: activeClassId,
        lessonId: selectedLessonId,
        title: submissionTitle.trim(),
        description: submissionDescription.trim(),
        audioUrl: pickedAudio.audioUrl,
      });
      setSubmissionTitle('');
      setSubmissionDescription('');
      setPickedAudio(null);
      await refreshClassData(activeClassId, 'student');
      setSection('mine');
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Invio consegna fallito');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (submissionId: string) => {
    setBusy(true);
    try {
      await approveSubmission(submissionId);
      if (activeClassId) await refreshClassData(activeClassId, 'teacher');
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Approvazione fallita');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (submissionId: string) => {
    const feedback = feedbackById[submissionId]?.trim();
    if (!feedback) {
      Alert.alert('Feedback richiesto', 'Inserisci un feedback prima di rifiutare.');
      return;
    }
    setBusy(true);
    try {
      await rejectSubmission(submissionId, feedback);
      if (activeClassId) await refreshClassData(activeClassId, 'teacher');
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Rifiuto fallito');
    } finally {
      setBusy(false);
    }
  };

  const handleGrade = async (submissionId: string) => {
    const gradeRaw = gradeById[submissionId] ?? '';
    const gradeValue = Number(gradeRaw);
    if (Number.isNaN(gradeValue)) {
      Alert.alert('Voto non valido', 'Inserisci un numero da 0 a 100.');
      return;
    }
    setBusy(true);
    try {
      await gradeSubmission(submissionId, gradeValue, gradeCommentById[submissionId] ?? '');
      if (activeClassId) await refreshClassData(activeClassId, 'teacher');
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Salvataggio voto fallito');
    } finally {
      setBusy(false);
    }
  };

  const handleAssignRole = async () => {
    if (!adminTargetUid.trim()) return;
    setBusy(true);
    try {
      await setSchoolRoleByAdmin(adminTargetUid.trim(), adminRole);
      setAdminTargetUid('');
      Alert.alert('Ruolo aggiornato', 'Il ruolo utente e stato aggiornato con successo.');
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Impossibile aggiornare ruolo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusBanner}>
        <Text style={styles.statusText}>
          {schoolStatus
            ? `Scuola: ruolo ${schoolStatus.schoolRole.toUpperCase()} · email ${schoolStatus.emailVerified ? 'verificata' : 'non verificata'} · dominio ${schoolStatus.schoolDomainAllowed ? 'scolastico' : 'non scolastico'}`
            : 'Scuola: stato account in caricamento...'}
        </Text>
      </View>
      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, roleMode === 'teacher' && styles.modeBtnActive]} onPress={() => setRoleMode('teacher')}>
          <Text style={[styles.modeTxt, roleMode === 'teacher' && styles.modeTxtActive]}>Docente</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, roleMode === 'student' && styles.modeBtnActive]} onPress={() => setRoleMode('student')}>
          <Text style={[styles.modeTxt, roleMode === 'student' && styles.modeTxtActive]}>Studente</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {roleMode === 'teacher' ? (
          <View style={styles.inlineRow}>
            <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={newClassName} onChangeText={setNewClassName} placeholder="Nome classe..." placeholderTextColor="#64748b" />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateClass} disabled={busy}>
              <Text style={styles.primaryTxt}>Crea</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inlineRow}>
            <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={joinCode} onChangeText={setJoinCode} placeholder="Codice classe..." autoCapitalize="characters" placeholderTextColor="#64748b" />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleJoinClass} disabled={busy}>
              <Text style={styles.primaryTxt}>Entra</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FlatList
        horizontal
        data={classes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, marginBottom: 10 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.classChip, item.id === activeClassId && styles.classChipActive]} onPress={() => setActiveClassId(item.id)}>
            <Text style={[styles.classChipTxt, item.id === activeClassId && styles.classChipTxtActive]}>{item.name} ({item.code})</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyHint}>Nessuna classe disponibile</Text>}
        showsHorizontalScrollIndicator={false}
      />

      {!activeClass ? (
        <View style={styles.center}><Text style={styles.emptyHint}>Crea o entra in una classe per iniziare.</Text></View>
      ) : (
        <>
          <View style={styles.modeRow}>
            <TouchableOpacity style={[styles.modeBtn, section === 'lessons' && styles.modeBtnActive]} onPress={() => setSection('lessons')}>
              <Text style={[styles.modeTxt, section === 'lessons' && styles.modeTxtActive]}>Lezioni</Text>
            </TouchableOpacity>
            {roleMode === 'teacher' ? (
              <TouchableOpacity style={[styles.modeBtn, section === 'review' && styles.modeBtnActive]} onPress={() => setSection('review')}>
                <Text style={[styles.modeTxt, section === 'review' && styles.modeTxtActive]}>Da approvare</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.modeBtn, section === 'mine' && styles.modeBtnActive]} onPress={() => setSection('mine')}>
                <Text style={[styles.modeTxt, section === 'mine' && styles.modeTxtActive]}>Mie consegne</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.modeBtn, section === 'approved' && styles.modeBtnActive]} onPress={() => setSection('approved')}>
              <Text style={[styles.modeTxt, section === 'approved' && styles.modeTxtActive]}>Pubblicate</Text>
            </TouchableOpacity>
            {schoolStatus?.schoolRole === 'admin' && (
              <TouchableOpacity style={[styles.modeBtn, section === 'admin' && styles.modeBtnActive]} onPress={() => setSection('admin')}>
                <Text style={[styles.modeTxt, section === 'admin' && styles.modeTxtActive]}>Admin</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={styles.center}><ActivityIndicator color="#00FF9C" /></View>
          ) : (
            <>
              {section === 'lessons' && (
                <View style={styles.card}>
                  <Text style={styles.label}>Lezioni classe</Text>
                  <FlatList
                    data={lessons}
                    keyExtractor={(item) => item.id}
                    style={{ maxHeight: 160 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={[styles.row, selectedLessonId === item.id && styles.rowActive]} onPress={() => setSelectedLessonId(item.id)}>
                        <Text style={styles.rowTitle}>{item.title}</Text>
                        <Text style={styles.rowSub}>{item.teacherName}</Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={styles.emptyHint}>Nessuna lezione pubblicata.</Text>}
                  />

                  <Text style={styles.label}>Audio (cerca suoni esistenti)</Text>
                  <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder="Cerca audio..." placeholderTextColor="#64748b" />
                  <FlatList
                    data={results.slice(0, 8)}
                    keyExtractor={(item) => item.id}
                    style={{ maxHeight: 140 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={[styles.row, pickedAudio?.id === item.id && styles.rowActive]} onPress={() => setPickedAudio(item)}>
                        <Text style={styles.rowTitle}>{item.title}</Text>
                        <Text style={styles.rowSub}>@{item.username}</Text>
                      </TouchableOpacity>
                    )}
                  />

                  {roleMode === 'teacher' ? (
                    <>
                      <TextInput style={styles.input} value={lessonTitle} onChangeText={setLessonTitle} placeholder="Titolo lezione" placeholderTextColor="#64748b" />
                      <TextInput style={styles.input} value={lessonDescription} onChangeText={setLessonDescription} placeholder="Descrizione lezione" placeholderTextColor="#64748b" />
                      <TouchableOpacity style={styles.primaryBtnWide} onPress={handlePublishLesson} disabled={!pickedAudio || !lessonTitle.trim() || busy}>
                        <Text style={styles.primaryTxt}>Pubblica lezione</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TextInput style={styles.input} value={submissionTitle} onChangeText={setSubmissionTitle} placeholder="Titolo consegna" placeholderTextColor="#64748b" />
                      <TextInput style={styles.input} value={submissionDescription} onChangeText={setSubmissionDescription} placeholder="Descrizione consegna" placeholderTextColor="#64748b" />
                      <TouchableOpacity style={styles.primaryBtnWide} onPress={handleSubmitAssignment} disabled={!pickedAudio || !submissionTitle.trim() || !selectedLessonId || busy}>
                        <Text style={styles.primaryTxt}>Invia alla docente</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              {section === 'review' && roleMode === 'teacher' && (
                <FlatList
                  data={submissionBoard}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ gap: 10, paddingHorizontal: 12, paddingBottom: 40 }}
                  renderItem={({ item }) => (
                    <View style={styles.card}>
                      <Text style={styles.rowTitle}>{item.studentName}</Text>
                      <Text style={styles.rowSub}>
                        {item.lessonTitle || 'Lezione'} · Stato: {item.status.toUpperCase()}
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={feedbackById[item.id] ?? ''}
                        onChangeText={(value) => setFeedbackById((prev) => ({ ...prev, [item.id]: value }))}
                        placeholder="Feedback (obbligatorio per rifiuto)"
                        placeholderTextColor="#64748b"
                      />
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={gradeById[item.id] ?? String(item.grade ?? '')}
                        onChangeText={(value) => setGradeById((prev) => ({ ...prev, [item.id]: value }))}
                        placeholder="Voto (0-100)"
                        placeholderTextColor="#64748b"
                      />
                      <TextInput
                        style={styles.input}
                        value={gradeCommentById[item.id] ?? item.gradeComment ?? ''}
                        onChangeText={(value) => setGradeCommentById((prev) => ({ ...prev, [item.id]: value }))}
                        placeholder="Nota valutazione (opzionale)"
                        placeholderTextColor="#64748b"
                      />
                      <View style={styles.inlineRow}>
                        <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => handleApprove(item.id)} disabled={item.status !== 'pending'}><Text style={styles.primaryTxt}>Approva</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => handleReject(item.id)} disabled={item.status !== 'pending'}><Text style={styles.secondaryTxt}>Rifiuta</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.primaryBtn, { flex: 1, backgroundColor: '#60a5fa' }]} onPress={() => handleGrade(item.id)}><Text style={[styles.primaryTxt, { color: '#0f172a' }]}>Salva voto</Text></TouchableOpacity>
                      </View>
                    </View>
                  )}
                  ListHeaderComponent={
                    pendingMembers.length ? (
                      <View style={styles.card}>
                        <Text style={styles.label}>Richieste accesso studenti</Text>
                        {pendingMembers.map((m) => (
                          <View key={m.userId} style={[styles.inlineRow, { marginBottom: 8 }]}>
                            <Text style={[styles.rowTitle, { flex: 1 }]}>{m.userId}</Text>
                            <TouchableOpacity style={styles.primaryBtn} onPress={() => handleApproveMember(m.userId)}>
                              <Text style={styles.primaryTxt}>Approva</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleRejectMember(m.userId)}>
                              <Text style={styles.secondaryTxt}>Rifiuta</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    ) : null
                  }
                  ListEmptyComponent={<Text style={styles.emptyHint}>Nessuna consegna disponibile.</Text>}
                />
              )}

              {section === 'mine' && roleMode === 'student' && (
                <FlatList
                  data={mine}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ gap: 10, paddingHorizontal: 12, paddingBottom: 40 }}
                  renderItem={({ item }) => (
                    <View style={styles.card}>
                      <Text style={styles.rowTitle}>Stato: {item.status.toUpperCase()}</Text>
                      {!!item.teacherFeedback && <Text style={styles.rowSub}>Feedback: {item.teacherFeedback}</Text>}
                      {typeof item.grade === 'number' && <Text style={styles.rowSub}>Voto: {item.grade}/100</Text>}
                      {!!item.gradeComment && <Text style={styles.rowSub}>Nota docente: {item.gradeComment}</Text>}
                    </View>
                  )}
                  ListEmptyComponent={<Text style={styles.emptyHint}>Nessuna consegna inviata.</Text>}
                />
              )}

              {section === 'admin' && schoolStatus?.schoolRole === 'admin' && (
                <View style={styles.card}>
                  <Text style={styles.label}>Gestione ruoli scolastici</Text>
                  <TextInput
                    style={styles.input}
                    value={adminTargetUid}
                    onChangeText={setAdminTargetUid}
                    placeholder="UID utente da aggiornare"
                    placeholderTextColor="#64748b"
                  />
                  <View style={styles.inlineRow}>
                    {(['teacher', 'student', 'admin'] as const).map((r) => (
                      <TouchableOpacity key={r} style={[styles.modeBtn, adminRole === r && styles.modeBtnActive]} onPress={() => setAdminRole(r)}>
                        <Text style={[styles.modeTxt, adminRole === r && styles.modeTxtActive]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity style={styles.primaryBtnWide} onPress={handleAssignRole} disabled={busy || !adminTargetUid.trim()}>
                    <Text style={styles.primaryTxt}>Aggiorna ruolo</Text>
                  </TouchableOpacity>
                </View>
              )}

              {section === 'approved' && (
                <FlatList
                  data={approved}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ gap: 10, paddingHorizontal: 12, paddingBottom: 40 }}
                  renderItem={({ item }) => (
                    <View style={styles.card}>
                      <Text style={styles.rowTitle}>{item.title}</Text>
                      <Text style={styles.rowSub}>@{item.username}</Text>
                    </View>
                  )}
                  ListEmptyComponent={<Text style={styles.emptyHint}>Nessuna consegna approvata.</Text>}
                />
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingTop: 8 },
  statusBanner: { marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#334155', backgroundColor: '#111827' },
  statusText: { color: '#cbd5e1', fontSize: 12 },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 10 },
  modeBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1e293b', alignItems: 'center' },
  modeBtnActive: { borderColor: 'rgba(0,255,156,0.4)', backgroundColor: 'rgba(0,255,156,0.1)' },
  modeTxt: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  modeTxtActive: { color: '#00FF9C' },
  card: { backgroundColor: '#111827', marginHorizontal: 12, marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 12 },
  inlineRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { backgroundColor: '#1e293b', borderRadius: 10, borderWidth: 1, borderColor: '#334155', color: '#fff', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  label: { color: '#cbd5e1', fontSize: 12, marginBottom: 6, marginTop: 4, fontWeight: '700' },
  primaryBtn: { backgroundColor: '#00FF9C', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  primaryBtnWide: { backgroundColor: '#00FF9C', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  primaryTxt: { color: '#052e16', fontSize: 12, fontWeight: '800' },
  secondaryBtn: { backgroundColor: '#3f1d2e', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#7f1d1d' },
  secondaryTxt: { color: '#fecaca', fontSize: 12, fontWeight: '700' },
  row: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  rowActive: { backgroundColor: 'rgba(0,255,156,0.08)', borderRadius: 8, borderBottomWidth: 0, paddingHorizontal: 8 },
  rowTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rowSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  classChip: { borderWidth: 1, borderColor: '#334155', backgroundColor: '#1e293b', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  classChipActive: { borderColor: 'rgba(0,255,156,0.4)', backgroundColor: 'rgba(0,255,156,0.1)' },
  classChipTxt: { color: '#94a3b8', fontSize: 12 },
  classChipTxtActive: { color: '#00FF9C' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyHint: { color: '#64748b', textAlign: 'center', padding: 12 },
});
