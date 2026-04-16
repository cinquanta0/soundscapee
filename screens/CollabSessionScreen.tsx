import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, Modal, Pressable, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { auth } from '../firebaseConfig';
import {
  CollabSession, CollabMode,
  listenToSession, acceptCollab, rejectCollab, cancelCollab,
  signalStartRecording, signalStopRecording,
  uploadMyTrack, advanceTurn, processCollab, publishCollabAsSound,
} from '../services/collabService';
import {
  fetchAgoraToken, joinAsHost, leaveAgoraChannel,
  setMicActive, destroyAgoraEngine, refreshSpeakerphone,
} from '../services/agoraService';

const MAX_RECORD_SECS = 60;

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: { extension: '.m4a', outputFormat: Audio.AndroidOutputFormat.MPEG_4, audioEncoder: Audio.AndroidAudioEncoder.AAC, sampleRate: 44100, numberOfChannels: 2, bitRate: 128000 },
  ios: { extension: '.m4a', outputFormat: Audio.IOSOutputFormat.MPEG4AAC, audioQuality: Audio.IOSAudioQuality.HIGH, sampleRate: 44100, numberOfChannels: 2, bitRate: 128000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: {},
};

function fmtSec(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
}

// ─── Waveform pulsante (animazione) ───────────────────────────────────────────
function PulseWave({ active, color }: { active: boolean; color: string }) {
  const anims = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.5)).current, useRef(new Animated.Value(0.4)).current, useRef(new Animated.Value(0.6)).current, useRef(new Animated.Value(0.3)).current];
  useEffect(() => {
    if (!active) { anims.forEach((a) => a.setValue(0.3)); return; }
    const loops = anims.map((a, i) =>
      Animated.loop(Animated.sequence([
        Animated.timing(a, { toValue: 0.3 + Math.random() * 0.7, duration: 150 + i * 60, useNativeDriver: false }),
        Animated.timing(a, { toValue: 0.2, duration: 150 + i * 60, useNativeDriver: false }),
      ])),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 32 }}>
      {anims.map((a, i) => (
        <Animated.View key={i} style={{ width: 4, borderRadius: 2, backgroundColor: color, height: a.interpolate({ inputRange: [0, 1], outputRange: [4, 28] }) }} />
      ))}
    </View>
  );
}

// ─── Schermata principale ─────────────────────────────────────────────────────
interface Props {
  sessionId: string;
  onClose: () => void;
}

export default function CollabSessionScreen({ sessionId, onClose }: Props) {
  const [session, setSession] = useState<CollabSession | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [agoraJoined, setAgoraJoined] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [title, setTitle] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  // Refs per evitare stale closure nei callback Firestore
  const recSecondsRef = useRef(0);
  const isRecordingRef = useRef(false);
  const sessionRef = useRef<CollabSession | null>(null);
  const isStartingRef = useRef(false); // guard contro doppio avvio
  const myUid = auth.currentUser?.uid ?? '';

  const isHost = session?.hostId === myUid;
  const myName = isHost ? session?.hostName : session?.guestName;
  const otherName = isHost ? session?.guestName : session?.hostName;
  const otherAvatar = isHost ? session?.guestAvatar : session?.hostAvatar;

  // In turns mode, is it my turn to record?
  const isMyTurn = session?.mode === 'sync' || (isHost ? session?.currentTurn === 0 : session?.currentTurn === 1);
  const myTrackUploaded = isHost ? !!session?.hostTrackUrl : !!session?.guestTrackUrl;
  const otherTrackUploaded = isHost ? !!session?.guestTrackUrl : !!session?.hostTrackUrl;
  const bothUploaded = !!session?.hostTrackUrl && !!session?.guestTrackUrl;

  // Mantieni i ref sincronizzati
  useEffect(() => { sessionRef.current = session; }, [session]);

  // ── Setup Agora ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchAgoraToken(sessionId).then(async (token) => {
      try {
        await joinAsHost(sessionId, token);
        setAgoraJoined(true);
        setMicActive(false); // mic spento di default
      } catch {}
    });
    return () => {
      leaveAgoraChannel().catch(() => {});
      destroyAgoraEngine();
    };
  }, [sessionId]);

  // ── Ascolta sessione ──────────────────────────────────────────────────────────
  useEffect(() => {
    unsubRef.current = listenToSession(sessionId, (s) => {
      setSession(s);

      // Segnale di inizio registrazione sincronizzato (modalità sync)
      // Usa recordingRef.current come guard (non stale)
      if (s.status === 'recording' && s.recordingStartedAt && !recordingRef.current) {
        const elapsed = Date.now() - s.recordingStartedAt.getTime();
        const remaining = MAX_RECORD_SECS * 1000 - elapsed;
        if (remaining > 500) startLocalRecording(Math.floor(elapsed / 1000));
      }

      // Segnale di stop — usa isRecordingRef.current (non stale)
      if (s.recordingStoppedAt && isRecordingRef.current) {
        stopLocalRecordingRef.current(s, false);
      }

      // Mix pronto
      if (s.status === 'done' && s.resultUrl) {
        setShowPublish(true);
        setTitle(`${s.hostName} ft. ${s.guestName}`);
      }
    });
    return () => {
      unsubRef.current?.();
      clearTimers();
      stopLocalRecordingRef.current(null, true);
    };
  }, [sessionId]);

  const clearTimers = () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
  };

  // ── Registrazione locale ──────────────────────────────────────────────────────
  const stopLocalRecording = useCallback(async (s: CollabSession | null, discard = false): Promise<void> => {
    clearTimers();
    setMicActive(false);
    setMicOn(false);
    isRecordingRef.current = false;
    if (!recordingRef.current) return;
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    try {
      await rec.stopAndUnloadAsync();
      if (discard) return;
      const uri = rec.getURI();
      const dur = recSecondsRef.current; // usa ref, non stato stale
      if (!uri) return;
      setIsUploading(true);
      // Determina ruolo dai ref aggiornati
      const currentSession = sessionRef.current;
      const amHost = currentSession?.hostId === myUid || (s?.hostId === myUid);
      await uploadMyTrack(sessionId, uri, dur, amHost);
      setIsUploading(false);
    } catch {
      setIsUploading(false);
      Alert.alert('Errore upload', 'Riprova tra poco');
    }
  }, [sessionId, myUid]);

  // Ref sempre aggiornata a stopLocalRecording — usata da setTimeout e listener
  const stopLocalRecordingRef = useRef(stopLocalRecording);
  useEffect(() => { stopLocalRecordingRef.current = stopLocalRecording; }, [stopLocalRecording]);

  const startLocalRecording = useCallback(async (elapsedSecs = 0) => {
    if (recordingRef.current || isStartingRef.current) return;
    isStartingRef.current = true;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permesso microfono negato', "Vai in Impostazioni e consenti l'accesso al microfono");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: false });
      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      recordingRef.current = recording;
      // Agora non critico — non deve bloccare la registrazione se fallisce
      try { setMicActive(true); refreshSpeakerphone(); } catch {}
      setMicOn(true);
      recSecondsRef.current = elapsedSecs;
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecSeconds(elapsedSecs);
      recTimerRef.current = setInterval(() => {
        recSecondsRef.current += 1;
        setRecSeconds(recSecondsRef.current);
      }, 1000);
      const remaining = (MAX_RECORD_SECS - elapsedSecs) * 1000;
      maxTimerRef.current = setTimeout(() => {
        signalStopRecording(sessionId).catch(() => {});
      }, remaining);
    } catch {
      Alert.alert('Errore', 'Impossibile avviare la registrazione');
    } finally {
      isStartingRef.current = false;
    }
  }, [sessionId]);

  // ── Azioni host ───────────────────────────────────────────────────────────────
  const handleStartRecording = async () => {
    if (!agoraJoined) return;
    if (session?.mode === 'sync') {
      // Entrambi iniziano → segnale Firestore
      await signalStartRecording(sessionId).catch(() => {});
    } else {
      // Turns: solo chi è di turno inizia localmente
      await signalStartRecording(sessionId).catch(() => {});
      await startLocalRecording(0);
    }
  };

  const handleStopRecording = async () => {
    await signalStopRecording(sessionId).catch(() => {});
  };

  const handleToggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    setMicActive(next);
  };

  const handleMix = async () => {
    if (!bothUploaded) { Alert.alert('Aspetta', "Entrambe le tracce devono essere caricate"); return; }
    try { await processCollab(sessionId); }
    catch { Alert.alert('Errore', 'Impossibile mixare le tracce'); }
  };

  const handlePublish = async () => {
    if (!title.trim()) { Alert.alert('Aggiungi un titolo'); return; }
    setPublishing(true);
    try {
      await publishCollabAsSound(sessionId, title.trim());
      Alert.alert('✅ Pubblicato!', `"${title}" è ora sul feed di entrambi`);
      setShowPublish(false);
      onClose();
    } catch { Alert.alert('Errore', 'Impossibile pubblicare'); }
    finally { setPublishing(false); }
  };

  const handlePreview = async () => {
    if (!session?.resultUrl) return;
    if (previewPlaying) {
      await previewSoundRef.current?.stopAsync();
      await previewSoundRef.current?.unloadAsync();
      previewSoundRef.current = null;
      setPreviewPlaying(false);
      return;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: false });
      const { sound } = await Audio.Sound.createAsync({ uri: session.resultUrl }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded && (s.didJustFinish || !s.isPlaying)) { setPreviewPlaying(false); } });
      previewSoundRef.current = sound;
      setPreviewPlaying(true);
    } catch {}
  };

  // ── Accetta/rifiuta (lato guest) ──────────────────────────────────────────────
  if (session?.status === 'pending' && !isHost) {
    return (
      <View style={s.overlay}>
        <LinearGradient colors={['#0f172a', '#1a0533']} style={StyleSheet.absoluteFill} />
        <View style={s.inviteCard}>
          <Text style={s.inviteEmoji}>{session.hostAvatar}</Text>
          <Text style={s.inviteTitle}>{session.hostName}</Text>
          <Text style={s.inviteSub}>ti invita a una</Text>
          <View style={s.modeBadge}>
            <Text style={s.modeBadgeTxt}>{session.mode === 'sync' ? '🎙 Sessione Sync' : '🔄 Sessione a Turni'}</Text>
          </View>
          <Text style={s.inviteDesc}>
            {session.mode === 'sync'
              ? 'Registrate insieme in tempo reale — il mix viene pubblicato con entrambi i vostri nomi'
              : 'Prima registra il tuo giro, poi lui aggiunge la sua voce sopra'}
          </Text>
          <View style={s.inviteActions}>
            <TouchableOpacity style={s.rejectBtn} onPress={() => { rejectCollab(sessionId); onClose(); }}>
              <Text style={s.rejectTxt}>✕ Rifiuta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.acceptBtn} onPress={() => acceptCollab(sessionId)}>
              <Text style={s.acceptTxt}>🎙 Accetta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (session?.status === 'rejected' || session?.status === 'cancelled') {
    return (
      <View style={s.overlay}>
        <LinearGradient colors={['#0f172a', '#1a0533']} style={StyleSheet.absoluteFill} />
        <View style={s.inviteCard}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>{session.status === 'rejected' ? '😔' : '❌'}</Text>
          <Text style={s.inviteTitle}>{session.status === 'rejected' ? `${otherName} ha rifiutato` : 'Sessione annullata'}</Text>
          <TouchableOpacity style={s.acceptBtn} onPress={onClose}><Text style={s.acceptTxt}>Chiudi</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!session || session.status === 'pending') {
    // Host in attesa che il guest risponda
    return (
      <View style={s.overlay}>
        <LinearGradient colors={['#0f172a', '#1a0533']} style={StyleSheet.absoluteFill} />
        <View style={s.inviteCard}>
          <ActivityIndicator color="#a855f7" size="large" style={{ marginBottom: 16 }} />
          <Text style={s.inviteTitle}>In attesa di {session?.guestName ?? '…'}</Text>
          <Text style={s.inviteSub}>Hai inviato un invito per una {session?.mode === 'sync' ? 'sessione sync' : 'sessione a turni'}</Text>
          <TouchableOpacity style={[s.rejectBtn, { marginTop: 24 }]} onPress={() => { cancelCollab(sessionId); onClose(); }}>
            <Text style={s.rejectTxt}>Annulla invito</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Schermata sessione attiva ──────────────────────────────────────────────────
  const statusLabel = () => {
    if (session.status === 'mixing') return '⚙️ Mixando le tracce…';
    if (isUploading) return '☁️ Caricando la tua traccia…';
    if (session.status === 'uploading') return myTrackUploaded ? (bothUploaded ? '✅ Entrambe le tracce pronte' : `⏳ In attesa di ${otherName}…`) : '☁️ Caricamento…';
    if (isRecording) return `⏺ ${fmtSec(recSeconds)} / ${fmtSec(MAX_RECORD_SECS)}`;
    if (session.mode === 'turns' && !isMyTurn) return `⏳ Turno di ${otherName}`;
    return session.status === 'accepted' ? (isHost ? 'Premi ⏺ per iniziare' : 'Pronto, aspetta il via') : '';
  };

  return (
    <View style={s.overlay}>
      <LinearGradient colors={['#0f172a', '#1a0533']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.closeBtn} onPress={() => {
          Alert.alert('Esci dalla sessione?', 'La sessione verrà annullata', [
            { text: 'Rimani', style: 'cancel' },
            { text: 'Esci', style: 'destructive', onPress: () => { cancelCollab(sessionId); onClose(); } },
          ]);
        }}>
          <Text style={s.closeTxt}>✕</Text>
        </TouchableOpacity>
        <View style={s.modePill}>
          <Text style={s.modePillTxt}>{session.mode === 'sync' ? '🎙 SYNC' : '🔄 TURNI'}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Partecipanti */}
      <View style={s.participants}>
        <View style={s.participant}>
          <Text style={s.participantAvatar}>{session.hostAvatar}</Text>
          <Text style={s.participantName}>{session.hostName}</Text>
          <Text style={s.participantRole}>Host</Text>
          <PulseWave active={isRecording && isHost} color="#a855f7" />
          {session.hostTrackUrl && <Text style={s.trackDone}>✓ Traccia pronta</Text>}
        </View>

        <View style={s.vsCircle}>
          <Text style={s.vsTxt}>🎵</Text>
        </View>

        <View style={s.participant}>
          <Text style={s.participantAvatar}>{session.guestAvatar}</Text>
          <Text style={s.participantName}>{session.guestName}</Text>
          <Text style={s.participantRole}>Guest</Text>
          <PulseWave active={isRecording && !isHost} color="#06b6d4" />
          {session.guestTrackUrl && <Text style={s.trackDone}>✓ Traccia pronta</Text>}
        </View>
      </View>

      {/* Status */}
      <Text style={s.statusLabel}>{statusLabel()}</Text>

      {/* Controlli */}
      <View style={s.controls}>

        {/* Mic toggle — sempre visibile durante sessione */}
        {session.status === 'accepted' && (
          <TouchableOpacity style={[s.micBtn, micOn && s.micBtnOn]} onPress={handleToggleMic} disabled={!agoraJoined}>
            <Text style={s.micIcon}>{micOn ? '🎙' : '🔇'}</Text>
            <Text style={s.micLabel}>{micOn ? 'Mic on' : 'Mic off'}</Text>
          </TouchableOpacity>
        )}

        {/* Bottone record — host avvia, tutti fermano */}
        {session.status === 'accepted' && (
          <TouchableOpacity
            style={[s.recBtn, (!isHost && !isRecording) && s.recBtnDisabled]}
            onPress={isRecording ? handleStopRecording : handleStartRecording}
            disabled={(!isHost && !isRecording) || isUploading || !agoraJoined}
          >
            <View style={[s.recBtnInner, isRecording && s.recBtnInnerActive]}>
              <Text style={s.recBtnIcon}>{isRecording ? '⏹' : '⏺'}</Text>
            </View>
            <Text style={s.recBtnLabel}>{isRecording ? 'Stop' : (isHost ? 'Registra' : 'In attesa…')}</Text>
          </TouchableOpacity>
        )}

        {/* Upload in corso */}
        {isUploading && <ActivityIndicator color="#a855f7" />}

        {/* Turns mode: avanza turno */}
        {session.mode === 'turns' && isHost && myTrackUploaded && !otherTrackUploaded && session.currentTurn === 0 && (
          <TouchableOpacity style={s.actionBtn} onPress={() => advanceTurn(sessionId)}>
            <Text style={s.actionBtnTxt}>🔄 Passa il turno a {session.guestName}</Text>
          </TouchableOpacity>
        )}

        {/* Mix — quando entrambe le tracce sono pronte */}
        {bothUploaded && session.status === 'uploading' && isHost && (
          <TouchableOpacity style={s.mixBtn} onPress={handleMix}>
            <Text style={s.mixBtnTxt}>✨ Mixa e ascolta</Text>
          </TouchableOpacity>
        )}

        {/* Mixing in corso */}
        {session.status === 'mixing' && (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color="#a855f7" size="large" />
            <Text style={s.statusLabel}>FFmpeg sta lavorando…</Text>
          </View>
        )}
      </View>

      {/* Modal publish */}
      <Modal visible={showPublish} transparent animationType="slide">
        <View style={s.publishOverlay}>
          <View style={s.publishCard}>
            <Text style={s.publishTitle}>🎉 Il mix è pronto!</Text>
            <TouchableOpacity style={s.previewBtn} onPress={handlePreview}>
              <Text style={s.previewBtnTxt}>{previewPlaying ? '⏹ Stop' : '▶ Ascolta il mix'}</Text>
            </TouchableOpacity>
            <TextInput
              style={s.titleInput}
              placeholder="Titolo del duetto..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={title}
              onChangeText={setTitle}
            />
            <Text style={s.publishHint}>Verrà pubblicato sul feed di entrambi con i credits</Text>
            <View style={s.publishActions}>
              <TouchableOpacity style={s.publishCancel} onPress={() => setShowPublish(false)}>
                <Text style={s.publishCancelTxt}>Dopo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.publishBtn, publishing && { opacity: 0.5 }]} onPress={handlePublish} disabled={publishing}>
                {publishing ? <ActivityIndicator color="#fff" /> : <Text style={s.publishBtnTxt}>📤 Pubblica</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Stili ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0f172a' },

  // Invite
  inviteCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  inviteEmoji: { fontSize: 64, marginBottom: 12 },
  inviteTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  inviteSub: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 16 },
  modeBadge: { backgroundColor: 'rgba(168,85,247,0.2)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)', marginBottom: 16 },
  modeBadgeTxt: { color: '#a855f7', fontSize: 14, fontWeight: '700' },
  inviteDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  inviteActions: { flexDirection: 'row', gap: 16 },
  rejectBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(255,59,48,0.15)', borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)' },
  rejectTxt: { color: '#FF3B30', fontWeight: '700', fontSize: 15 },
  acceptBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, backgroundColor: '#a855f7' },
  acceptTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 20 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 16 },
  modePill: { backgroundColor: 'rgba(168,85,247,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)' },
  modePillTxt: { color: '#a855f7', fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  // Partecipanti
  participants: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 24, paddingVertical: 32 },
  participant: { alignItems: 'center', gap: 6, flex: 1 },
  participantAvatar: { fontSize: 48 },
  participantName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  participantRole: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  trackDone: { color: '#4ade80', fontSize: 10, fontWeight: '600' },
  vsCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(168,85,247,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)' },
  vsTxt: { fontSize: 20 },

  // Status
  statusLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginBottom: 32, paddingHorizontal: 24 },

  // Controls
  controls: { alignItems: 'center', gap: 20, paddingHorizontal: 32 },
  micBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  micBtnOn: { backgroundColor: 'rgba(168,85,247,0.2)', borderColor: 'rgba(168,85,247,0.4)' },
  micIcon: { fontSize: 18 },
  micLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },

  recBtn: { alignItems: 'center', gap: 8 },
  recBtnDisabled: { opacity: 0.4 },
  recBtnInner: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(168,85,247,0.2)', borderWidth: 3, borderColor: '#a855f7', alignItems: 'center', justifyContent: 'center' },
  recBtnInnerActive: { backgroundColor: 'rgba(255,59,48,0.3)', borderColor: '#FF3B30' },
  recBtnIcon: { fontSize: 28 },
  recBtnLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },

  actionBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(6,182,212,0.15)', borderWidth: 1, borderColor: 'rgba(6,182,212,0.3)' },
  actionBtnTxt: { color: '#06b6d4', fontWeight: '700' },
  mixBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, backgroundColor: '#a855f7' },
  mixBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Publish modal
  publishOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  publishCard: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  publishTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  previewBtn: { backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)' },
  previewBtnTxt: { color: '#a855f7', fontWeight: '700' },
  titleInput: { backgroundColor: '#334155', borderRadius: 12, padding: 12, color: '#fff', fontSize: 15 },
  publishHint: { color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center' },
  publishActions: { flexDirection: 'row', gap: 12 },
  publishCancel: { flex: 1, backgroundColor: '#334155', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  publishCancelTxt: { color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  publishBtn: { flex: 2, backgroundColor: '#a855f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  publishBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
