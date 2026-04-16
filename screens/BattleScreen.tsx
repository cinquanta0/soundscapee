import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { auth } from '../firebaseConfig';
import {
  Battle, listenToBattle, acceptBattle, rejectBattle, cancelBattle,
  startChallengerRec, uploadBattleTrack, voteBattle, getMyVote, finalizeBattle,
} from '../services/battleService';

const REC_SECS = 30;

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: { extension: '.m4a', outputFormat: Audio.AndroidOutputFormat.MPEG_4, audioEncoder: Audio.AndroidAudioEncoder.AAC, sampleRate: 44100, numberOfChannels: 2, bitRate: 128000 },
  ios: { extension: '.m4a', outputFormat: Audio.IOSOutputFormat.MPEG4AAC, audioQuality: Audio.IOSAudioQuality.HIGH, sampleRate: 44100, numberOfChannels: 2, bitRate: 128000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: {},
};

function fmtSec(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Barra timer ──────────────────────────────────────────────────────────────
function TimerBar({ seconds, total, color }: { seconds: number; total: number; color: string }) {
  const pct = Math.max(0, Math.min(1, seconds / total));
  return (
    <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', width: '100%' }}>
      <Animated.View style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

// ─── Card partecipante ────────────────────────────────────────────────────────
function PlayerCard({ name, avatar, votes, trackDone, isRecording, isWinner, color }: {
  name: string; avatar: string; votes: number; trackDone: boolean;
  isRecording: boolean; isWinner: boolean; color: string;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isRecording) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 400, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isRecording]);

  return (
    <Animated.View style={[s.playerCard, isWinner && s.playerCardWinner, { borderColor: isWinner ? '#fbbf24' : color + '55', transform: [{ scale: pulse }] }]}>
      {isWinner && <Text style={s.crownEmoji}>👑</Text>}
      <Text style={s.playerAvatar}>{avatar}</Text>
      <Text style={s.playerName} numberOfLines={1}>{name}</Text>
      {trackDone && <Text style={s.trackReadyBadge}>✓ Pronto</Text>}
      {isRecording && <Text style={[s.recBadge, { color }]}>⏺ REC</Text>}
      <View style={[s.votesBubble, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Text style={[s.votesCount, { color }]}>{votes}</Text>
        <Text style={s.votesLabel}>voti</Text>
      </View>
    </Animated.View>
  );
}

// ─── Schermata principale ─────────────────────────────────────────────────────
interface Props { battleId: string; onClose: () => void; }

export default function BattleScreen({ battleId, onClose }: Props) {
  const [battle, setBattle] = useState<Battle | null>(null);
  const [recSecs, setRecSecs] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState<'challenger' | 'opponent' | null>(null);

  const recRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<Audio.Sound | null>(null);
  const uid = auth.currentUser?.uid ?? '';

  const isChallenger = battle?.challengerId === uid;
  const isParticipant = battle?.challengerId === uid || battle?.opponentId === uid;
  const isMyTurn = battle ? (
    (isChallenger && battle.status === 'challenger_rec') ||
    (!isChallenger && battle.status === 'opponent_rec')
  ) : false;
  const myTrackDone = battle ? (isChallenger ? !!battle.challengerTrackUrl : !!battle.opponentTrackUrl) : false;

  // ── Listener ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = listenToBattle(battleId, async (b) => {
      setBattle(b);
      // Auto-start rec quando è il mio turno
      if ((b.status === 'challenger_rec' && isChallenger) ||
          (b.status === 'opponent_rec' && !isChallenger && b.challengerId !== uid)) {
        if (!recRef.current && !isRecording) startRecording();
      }
      // Chiudi battaglia scaduta
      if (b.status === 'voting' && b.votingEndsAt && b.votingEndsAt < new Date() && b.winnerId === undefined) {
        await finalizeBattle(battleId).catch(() => {});
      }
    });
    getMyVote(battleId).then(setMyVote);
    return () => { unsub(); clearTimers(); stopRecording(true); };
  }, [battleId]);

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
  };

  // ── Registrazione ─────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (recRef.current) return;
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: false });
      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      recRef.current = recording;
      setIsRecording(true);
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
      maxTimerRef.current = setTimeout(() => stopRecording(false), REC_SECS * 1000);
    } catch {
      Alert.alert('Errore', 'Impossibile avviare la registrazione');
    }
  }, []);

  const stopRecording = useCallback(async (discard = false) => {
    clearTimers();
    if (!recRef.current) return;
    const rec = recRef.current;
    recRef.current = null;
    setIsRecording(false);
    try {
      await rec.stopAndUnloadAsync();
      if (discard) return;
      const uri = rec.getURI();
      if (!uri) return;
      setIsUploading(true);
      await uploadBattleTrack(battleId, uri, recSecs, isChallenger);
      setIsUploading(false);
    } catch {
      setIsUploading(false);
    }
  }, [recSecs, battleId, isChallenger]);

  // ── Preview ──────────────────────────────────────────────────────────────────
  const handlePreview = async (who: 'challenger' | 'opponent') => {
    const url = who === 'challenger' ? battle?.challengerTrackUrl : battle?.opponentTrackUrl;
    if (!url) return;
    if (previewPlaying === who) {
      await previewRef.current?.stopAsync();
      await previewRef.current?.unloadAsync();
      previewRef.current = null;
      setPreviewPlaying(null);
      return;
    }
    if (previewRef.current) { await previewRef.current.unloadAsync(); previewRef.current = null; }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, shouldDuckAndroid: false });
    const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
    sound.setOnPlaybackStatusUpdate(st => { if (st.isLoaded && st.didJustFinish) { setPreviewPlaying(null); } });
    previewRef.current = sound;
    setPreviewPlaying(who);
  };

  // ── Voto ─────────────────────────────────────────────────────────────────────
  const handleVote = async (votedForId: string) => {
    if (myVote) return;
    if (isParticipant) { Alert.alert('Non puoi votare', 'I partecipanti non possono votare nella propria battaglia'); return; }
    try {
      await voteBattle(battleId, votedForId);
      setMyVote(votedForId);
    } catch (e: any) {
      Alert.alert('Errore', e.message);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  if (!battle) {
    return (
      <View style={s.overlay}>
        <LinearGradient colors={['#0f172a', '#1a0533']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color="#f97316" size="large" />
      </View>
    );
  }

  // ── Invite screen (opponent) ──────────────────────────────────────────────────
  if (battle.status === 'pending' && !isChallenger) {
    return (
      <View style={s.overlay}>
        <LinearGradient colors={['#0f172a', '#1a0533']} style={StyleSheet.absoluteFill} />
        <View style={s.card}>
          <Text style={{ fontSize: 60, marginBottom: 8 }}>⚔️</Text>
          <Text style={s.cardTitle}>{battle.challengerName} ti sfida!</Text>
          <View style={s.themePill}><Text style={s.themePillTxt}>🎯 {battle.theme}</Text></View>
          <Text style={s.cardDesc}>Registra 30 secondi sul tema dato.{'\n'}Il pubblico voterà il migliore.</Text>
          <View style={s.rowBtns}>
            <TouchableOpacity style={s.rejectBtn} onPress={() => { rejectBattle(battleId); onClose(); }}>
              <Text style={s.rejectTxt}>✕ Rifiuta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.acceptBtn} onPress={() => acceptBattle(battleId)}>
              <Text style={s.acceptTxt}>⚔️ Accetta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (battle.status === 'rejected' || battle.status === 'cancelled') {
    return (
      <View style={s.overlay}>
        <LinearGradient colors={['#0f172a', '#1a0533']} style={StyleSheet.absoluteFill} />
        <View style={s.card}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>😔</Text>
          <Text style={s.cardTitle}>{battle.status === 'rejected' ? 'Sfida rifiutata' : 'Sfida annullata'}</Text>
          <TouchableOpacity style={s.acceptBtn} onPress={onClose}><Text style={s.acceptTxt}>Chiudi</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Waiting (challenger aspetta acceptance) ───────────────────────────────────
  if (battle.status === 'pending' && isChallenger) {
    return (
      <View style={s.overlay}>
        <LinearGradient colors={['#0f172a', '#1a0533']} style={StyleSheet.absoluteFill} />
        <View style={s.card}>
          <ActivityIndicator color="#f97316" size="large" style={{ marginBottom: 16 }} />
          <Text style={s.cardTitle}>In attesa di {battle.opponentName}…</Text>
          <View style={s.themePill}><Text style={s.themePillTxt}>🎯 {battle.theme}</Text></View>
          <TouchableOpacity style={[s.rejectBtn, { marginTop: 24 }]} onPress={() => { cancelBattle(battleId); onClose(); }}>
            <Text style={s.rejectTxt}>Annulla sfida</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Schermata registrazione / voting ─────────────────────────────────────────
  const votingOpen = battle.status === 'voting';
  const isDone = battle.status === 'done';
  const totalVotes = battle.challengerVotes + battle.opponentVotes;

  const timeLeftLabel = () => {
    if (!battle.votingEndsAt) return '';
    const ms = battle.votingEndsAt.getTime() - Date.now();
    if (ms <= 0) return 'Votazione chiusa';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `⏱ ${h}h ${m}m rimaste`;
  };

  return (
    <View style={s.overlay}>
      <LinearGradient colors={['#0f172a', '#1a0533']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.closeBtn} onPress={() => {
          if (isRecording) { Alert.alert('Registrazione in corso', 'Fermati prima di uscire'); return; }
          onClose();
        }}>
          <Text style={s.closeTxt}>✕</Text>
        </TouchableOpacity>
        <View style={s.themePillSmall}><Text style={s.themePillSmallTxt}>🎯 {battle.theme}</Text></View>
        <View style={{ width: 36 }} />
      </View>

      {/* VS */}
      <View style={s.vsRow}>
        <PlayerCard
          name={battle.challengerName}
          avatar={battle.challengerAvatar}
          votes={battle.challengerVotes}
          trackDone={!!battle.challengerTrackUrl}
          isRecording={battle.status === 'challenger_rec'}
          isWinner={isDone && battle.winnerId === battle.challengerId}
          color="#f97316"
        />
        <Text style={s.vsText}>VS</Text>
        <PlayerCard
          name={battle.opponentName}
          avatar={battle.opponentAvatar}
          votes={battle.opponentVotes}
          trackDone={!!battle.opponentTrackUrl}
          isRecording={battle.status === 'opponent_rec'}
          isWinner={isDone && battle.winnerId === battle.opponentId}
          color="#a855f7"
        />
      </View>

      {/* Barra voti */}
      {(votingOpen || isDone) && totalVotes > 0 && (
        <View style={{ paddingHorizontal: 24, marginBottom: 16 }}>
          <View style={{ height: 8, backgroundColor: '#a855f7', borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${(battle.challengerVotes / totalVotes) * 100}%`, backgroundColor: '#f97316' }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ color: '#f97316', fontSize: 11, fontWeight: '700' }}>{Math.round((battle.challengerVotes / totalVotes) * 100)}%</Text>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{totalVotes} voti totali</Text>
            <Text style={{ color: '#a855f7', fontSize: 11, fontWeight: '700' }}>{Math.round((battle.opponentVotes / totalVotes) * 100)}%</Text>
          </View>
        </View>
      )}

      {/* Status / controlli */}
      <View style={s.controls}>

        {/* Registrazione in corso */}
        {isRecording && (
          <View style={{ alignItems: 'center', gap: 12, width: '100%' }}>
            <Text style={{ color: '#f97316', fontSize: 28, fontWeight: '900' }}>{fmtSec(REC_SECS - recSecs)}</Text>
            <TimerBar seconds={recSecs} total={REC_SECS} color="#f97316" />
            <TouchableOpacity style={s.stopBtn} onPress={() => stopRecording(false)}>
              <Text style={s.stopBtnTxt}>⏹ Finito!</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Upload */}
        {isUploading && (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color="#f97316" />
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Caricamento traccia…</Text>
          </View>
        )}

        {/* Attesa turno */}
        {!isRecording && !isUploading && isParticipant && !myTrackDone && !isMyTurn && (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color="#a855f7" />
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              {battle.status === 'accepted' ? `In attesa che ${isChallenger ? 'la sfida inizi' : battle.challengerName + ' registri'}` : `Aspetta ${isChallenger ? battle.opponentName : battle.challengerName}…`}
            </Text>
          </View>
        )}

        {/* Challenger: avvia battaglia */}
        {isChallenger && battle.status === 'accepted' && !isRecording && (
          <TouchableOpacity style={s.startBtn} onPress={() => startChallengerRec(battleId)}>
            <Text style={s.startBtnTxt}>⚔️ Inizia la battaglia!</Text>
          </TouchableOpacity>
        )}

        {/* Traccia pronta, in attesa dell'altro */}
        {isParticipant && myTrackDone && !battle.opponentTrackUrl === !isChallenger && (
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center' }}>
            ✓ Traccia caricata! In attesa di {isChallenger ? battle.opponentName : battle.challengerName}…
          </Text>
        )}

        {/* Preview tracce (in voting/done) */}
        {(votingOpen || isDone) && (
          <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
            <TouchableOpacity
              style={[s.previewBtn, { borderColor: '#f97316' + '55' }]}
              onPress={() => handlePreview('challenger')}
            >
              <Text style={{ color: '#f97316', fontSize: 16 }}>{previewPlaying === 'challenger' ? '⏹' : '▶'}</Text>
              <Text style={{ color: '#f97316', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{battle.challengerName}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.previewBtn, { borderColor: '#a855f7' + '55' }]}
              onPress={() => handlePreview('opponent')}
            >
              <Text style={{ color: '#a855f7', fontSize: 16 }}>{previewPlaying === 'opponent' ? '⏹' : '▶'}</Text>
              <Text style={{ color: '#a855f7', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{battle.opponentName}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Vota */}
        {votingOpen && !isParticipant && !myVote && (
          <View style={{ gap: 10, width: '100%' }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center' }}>{timeLeftLabel()}</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[s.voteBtn, { borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.15)' }]} onPress={() => handleVote(battle.challengerId)}>
                <Text style={{ color: '#f97316', fontWeight: '800', fontSize: 15 }}>🔥 {battle.challengerName}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.voteBtn, { borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.15)' }]} onPress={() => handleVote(battle.opponentId)}>
                <Text style={{ color: '#a855f7', fontWeight: '800', fontSize: 15 }}>⚡ {battle.opponentName}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Già votato */}
        {votingOpen && !isParticipant && myVote && (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ color: '#4ade80', fontWeight: '700', fontSize: 14 }}>✓ Hai votato!</Text>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{timeLeftLabel()}</Text>
          </View>
        )}

        {/* Fine battaglia */}
        {isDone && (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Text style={{ color: '#fbbf24', fontSize: 20, fontWeight: '900' }}>
              🏆 {battle.winnerId === battle.challengerId ? battle.challengerName : battle.opponentName} ha vinto!
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{totalVotes} voti totali</Text>
            <TouchableOpacity style={[s.acceptBtn, { marginTop: 8 }]} onPress={onClose}>
              <Text style={s.acceptTxt}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Stili ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0f172a' },
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  cardTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  cardDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  themePill: { backgroundColor: 'rgba(249,115,22,0.15)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(249,115,22,0.4)', marginBottom: 16 },
  themePillTxt: { color: '#f97316', fontWeight: '700', fontSize: 14 },
  themePillSmall: { backgroundColor: 'rgba(249,115,22,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(249,115,22,0.3)' },
  themePillSmallTxt: { color: '#f97316', fontSize: 11, fontWeight: '700' },
  rowBtns: { flexDirection: 'row', gap: 14 },
  rejectBtn: { paddingHorizontal: 22, paddingVertical: 13, borderRadius: 12, backgroundColor: 'rgba(255,59,48,0.12)', borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)' },
  rejectTxt: { color: '#FF3B30', fontWeight: '700', fontSize: 14 },
  acceptBtn: { paddingHorizontal: 26, paddingVertical: 13, borderRadius: 12, backgroundColor: '#f97316' },
  acceptTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 20 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 15 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 16, paddingVertical: 24 },
  vsText: { color: 'rgba(255,255,255,0.3)', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  playerCard: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 12, borderWidth: 1, marginHorizontal: 4 },
  playerCardWinner: { backgroundColor: 'rgba(251,191,36,0.08)', borderColor: '#fbbf24' },
  crownEmoji: { fontSize: 20, position: 'absolute', top: -12 },
  playerAvatar: { fontSize: 44 },
  playerName: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  trackReadyBadge: { color: '#4ade80', fontSize: 10, fontWeight: '700' },
  recBadge: { fontSize: 10, fontWeight: '800' },
  votesBubble: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, alignItems: 'center', marginTop: 4 },
  votesCount: { fontSize: 20, fontWeight: '900' },
  votesLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 9 },
  controls: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 20 },
  startBtn: { backgroundColor: '#f97316', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16 },
  startBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 17 },
  stopBtn: { backgroundColor: 'rgba(255,59,48,0.2)', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(255,59,48,0.4)' },
  stopBtnTxt: { color: '#FF3B30', fontWeight: '800', fontSize: 15 },
  previewBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, borderWidth: 1 },
  voteBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
});
