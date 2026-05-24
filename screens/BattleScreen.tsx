import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Animated, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { auth } from '../firebaseConfig';
import {
  Battle, listenToBattle, acceptBattle, rejectBattle, cancelBattle,
  startChallengerRec, uploadBattleTrack, voteBattle, getMyVote,
  reconcileBattleCounters,
} from '../services/battleService';
import { getUsersPhotos } from '../services/firebaseService';

const REC_SECS = 30;

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: { extension: '.m4a', outputFormat: Audio.AndroidOutputFormat.MPEG_4, audioEncoder: Audio.AndroidAudioEncoder.AAC, sampleRate: 44100, numberOfChannels: 2, bitRate: 128000 },
  ios: { extension: '.m4a', outputFormat: Audio.IOSOutputFormat.MPEG4AAC, audioQuality: Audio.IOSAudioQuality.HIGH, sampleRate: 44100, numberOfChannels: 2, bitRate: 128000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  web: {},
};

function fmtSec(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function TimerBar({ seconds, total, color }: { seconds: number; total: number; color: string }) {
  const pct = Math.max(0, Math.min(1, seconds / total));
  return (
    <View style={s.timerTrack}>
      <View style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: color, borderRadius: 999 }} />
    </View>
  );
}

function PlayerCard({ name, avatar, photo, votes, trackDone, isRecording, isWinner, color }: {
  name: string; avatar: string; photo?: string; votes: number; trackDone: boolean;
  isRecording: boolean; isWinner: boolean; color: string;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isRecording) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 420, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  return (
    <Animated.View
      style={[
        s.playerCard,
        isWinner && s.playerCardWinner,
        { borderColor: isWinner ? '#D9FF5A' : `${color}55`, transform: [{ scale: pulse }] },
      ]}
    >
      {isWinner && <Text style={s.crownEmoji}>👑</Text>}
      {photo
        ? <Image source={{ uri: photo }} style={s.playerAvatarImg} />
        : <Text style={s.playerAvatar}>{avatar}</Text>}
      <Text style={s.playerName} numberOfLines={1}>{name}</Text>
      {trackDone && <Text style={s.trackReadyBadge}>READY</Text>}
      {isRecording && <Text style={[s.recBadge, { color }]}>LIVE REC</Text>}
      <View style={[s.votesBubble, { backgroundColor: `${color}18`, borderColor: `${color}44` }]}>
        <Text style={[s.votesCount, { color }]}>{votes}</Text>
        <Text style={s.votesLabel}>votes</Text>
      </View>
    </Animated.View>
  );
}

function CenterState({
  icon,
  title,
  description,
  children,
}: {
  icon: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={s.overlay}>
      <LinearGradient colors={['#050816', '#0b1230', '#180828']} style={StyleSheet.absoluteFill} />
      <View style={s.ambientA} />
      <View style={s.ambientB} />
      <View style={s.cardShell}>
        <Text style={s.heroEyebrow}>MIUSLYK BATTLE</Text>
        <Text style={s.centerIcon}>{icon}</Text>
        <Text style={s.cardTitle}>{title}</Text>
        {!!description && <Text style={s.cardDesc}>{description}</Text>}
        {children}
      </View>
    </View>
  );
}

interface Props { battleId: string; onClose: () => void; }

export default function BattleScreen({ battleId, onClose }: Props) {
  const { t } = useTranslation();
  const [battle, setBattle] = useState<Battle | null>(null);
  const [recSecs, setRecSecs] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState<'challenger' | 'opponent' | null>(null);
  const [playerPhotos, setPlayerPhotos] = useState<Record<string, string | null>>({});

  const recRef = useRef<Audio.Recording | null>(null);
  const photosLoadedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<Audio.Sound | null>(null);
  const recSecsRef = useRef(0);
  const battleRef = useRef<Battle | null>(null);
  const uid = auth.currentUser?.uid ?? '';

  useEffect(() => { battleRef.current = battle; }, [battle]);

  const isChallenger = battle?.challengerId === uid;
  const isParticipant = battle?.challengerId === uid || battle?.opponentId === uid;
  const myTrackDone = battle ? (isChallenger ? !!battle.challengerTrackUrl : !!battle.opponentTrackUrl) : false;
  const otherTrackDone = battle ? (isChallenger ? !!battle.opponentTrackUrl : !!battle.challengerTrackUrl) : false;

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
  };

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
      const dur = recSecsRef.current;
      const b = battleRef.current;
      const iAmChallenger = b?.challengerId === uid;
      setIsUploading(true);
      await uploadBattleTrack(battleId, uri, dur, iAmChallenger);
      setIsUploading(false);
    } catch {
      setIsUploading(false);
      Alert.alert(t('battle.errors.uploadError'), t('battle.errors.uploadRetry'));
    }
  }, [battleId, uid]);

  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  const startRecording = useCallback(async () => {
    if (recRef.current) return;
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: false });
      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      recRef.current = recording;
      recSecsRef.current = 0;
      setRecSecs(0);
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        recSecsRef.current += 1;
        setRecSecs(recSecsRef.current);
      }, 1000);
      maxTimerRef.current = setTimeout(() => stopRecordingRef.current(false), REC_SECS * 1000);
    } catch {
      Alert.alert(t('common.error'), t('battle.errors.cannotStart'));
    }
  }, []);

  useEffect(() => {
    const unsub = listenToBattle(battleId, async (b) => {
      setBattle(b);
      const iAmChallenger = b.challengerId === uid;
      if ((b.status === 'challenger_rec' && iAmChallenger) ||
          (b.status === 'opponent_rec' && !iAmChallenger)) {
        if (!recRef.current) startRecording();
      }
      if (!photosLoadedRef.current && b.challengerId && b.opponentId) {
        photosLoadedRef.current = true;
        const missing = ([
          !b.challengerPhoto ? b.challengerId : null,
          !b.opponentPhoto ? b.opponentId : null,
        ].filter(Boolean)) as string[];
        if (missing.length) {
          (getUsersPhotos(missing) as Promise<any>).then(p => setPlayerPhotos(p)).catch(() => {});
        }
      }
    });
    let cancelled = false;
    setMyVote(null);
    getMyVote(battleId)
      .then(async (v) => {
        if (cancelled) return;
        setMyVote(v);
        if (v) {
          await reconcileBattleCounters(battleId).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      unsub();
      cancelled = true;
      clearTimers();
      stopRecordingRef.current(true);
    };
  }, [battleId, startRecording, uid]);

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
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, shouldDuckAndroid: false });
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate(st => { if (st.isLoaded && st.didJustFinish) { setPreviewPlaying(null); } });
      previewRef.current = sound;
      setPreviewPlaying(who);
    } catch {
      Alert.alert(t('common.error'), t('battle.errors.cannotPlay'));
    }
  };

  const handleVote = async (votedForId: string) => {
    if (myVote) return;
    if (isParticipant) { Alert.alert(t('battle.errors.cannotVoteTitle'), t('battle.errors.cannotVoteDesc')); return; }
    try {
      await voteBattle(battleId, votedForId);
      setMyVote(votedForId);
    } catch (e: any) {
      Alert.alert('Errore', e.message);
    }
  };

  if (!battle) {
    return (
      <CenterState icon="⚔️" title={t('battle.syncingTitle')} description={t('battle.syncingDesc')}>
        <ActivityIndicator color="#67E8F9" size="large" />
      </CenterState>
    );
  }

  if (battle.status === 'pending' && !isChallenger) {
    return (
      <CenterState
        icon="⚔️"
        title={t('battle.challengeTitle', { name: battle.challengerName })}
        description={t('battle.challengeDesc')}
      >
        <View style={s.themePill}><Text style={s.themePillTxt}>🎯 {battle.theme}</Text></View>
        <View style={s.rowBtns}>
          <TouchableOpacity style={s.rejectBtn} onPress={() => { rejectBattle(battleId); onClose(); }}>
            <Text style={s.rejectTxt}>{t('battle.reject')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.acceptBtn} onPress={() => acceptBattle(battleId)}>
            <Text style={s.acceptTxt}>{t('battle.accept')}</Text>
          </TouchableOpacity>
        </View>
      </CenterState>
    );
  }

  if (battle.status === 'rejected' || battle.status === 'cancelled') {
    return (
      <CenterState
        icon="😔"
        title={battle.status === 'rejected' ? t('battle.rejectedTitle') : t('battle.cancelledTitle')}
        description={t('battle.inactiveDesc')}
      >
        <TouchableOpacity style={s.acceptBtn} onPress={onClose}>
          <Text style={s.acceptTxt}>{t('battle.close')}</Text>
        </TouchableOpacity>
      </CenterState>
    );
  }

  if (battle.status === 'pending' && isChallenger) {
    return (
      <CenterState
        icon="⌛"
        title={t('battle.waitingTitle', { name: battle.opponentName })}
        description={t('battle.waitingDesc')}
      >
        <View style={s.themePill}><Text style={s.themePillTxt}>🎯 {battle.theme}</Text></View>
        <ActivityIndicator color="#67E8F9" size="large" style={{ marginTop: 12 }} />
        <TouchableOpacity style={[s.rejectBtn, { marginTop: 24 }]} onPress={() => { cancelBattle(battleId); onClose(); }}>
          <Text style={s.rejectTxt}>{t('battle.cancelChallenge')}</Text>
        </TouchableOpacity>
      </CenterState>
    );
  }

  const votingOpen = battle.status === 'voting';
  const isDone = battle.status === 'done';
  const totalVotes = battle.challengerVotes + battle.opponentVotes;

  const timeLeftLabel = () => {
    if (!battle.votingEndsAt) return '';
    const ms = battle.votingEndsAt.getTime() - Date.now();
    if (ms <= 0) return t('battle.votingClosed');
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return t('battle.timeLeft', { h, m });
  };

  return (
    <View style={s.overlay}>
      <LinearGradient colors={['#050816', '#0b1230', '#180828']} style={StyleSheet.absoluteFill} />
      <View style={s.ambientA} />
      <View style={s.ambientB} />
      <View style={s.heroGlow} />

      <View style={s.header}>
        <TouchableOpacity
          style={s.closeBtn}
          onPress={() => {
            if (isRecording) { Alert.alert(t('battle.errors.recordingInProgress'), t('battle.errors.stopBeforeLeaving')); return; }
            onClose();
          }}
        >
          <Text style={s.closeTxt}>←</Text>
        </TouchableOpacity>
        <View style={s.headerMeta}>
          <Text style={s.heroEyebrow}>{t('battle.eyebrow')}</Text>
          <View style={s.themePillSmall}><Text style={s.themePillSmallTxt}>🎯 {battle.theme}</Text></View>
        </View>
        {isChallenger && ['accepted', 'challenger_rec', 'opponent_rec'].includes(battle.status) ? (
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={() => {
              if (isRecording) { Alert.alert(t('battle.errors.recordingInProgress'), t('battle.errors.stopBeforeCancelling')); return; }
              Alert.alert(
                t('battle.cancelTitle'),
                t('battle.cancelConfirm'),
                [
                  { text: t('common.no'), style: 'cancel' },
                  { text: t('battle.cancelTitle'), style: 'destructive', onPress: () => { cancelBattle(battleId); onClose(); } },
                ],
              );
            }}
          >
            <Text style={s.cancelTxt}>✕</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <View style={s.stageCard}>
        <View style={s.introBlock}>
          <Text style={s.heroTitle}>{t('battle.tagline')}</Text>
          <Text style={s.heroSub}>{t('battle.subtitle')}</Text>
        </View>

        <View style={s.vsRow}>
          <PlayerCard
            name={battle.challengerName}
            avatar={battle.challengerAvatar}
            photo={battle.challengerPhoto || playerPhotos[battle.challengerId] || undefined}
            votes={battle.challengerVotes}
            trackDone={!!battle.challengerTrackUrl}
            isRecording={battle.status === 'challenger_rec'}
            isWinner={isDone && battle.winnerId === battle.challengerId}
            color="#67E8F9"
          />
          <Text style={s.vsText}>VS</Text>
          <PlayerCard
            name={battle.opponentName}
            avatar={battle.opponentAvatar}
            photo={battle.opponentPhoto || playerPhotos[battle.opponentId] || undefined}
            votes={battle.opponentVotes}
            trackDone={!!battle.opponentTrackUrl}
            isRecording={battle.status === 'opponent_rec'}
            isWinner={isDone && battle.winnerId === battle.opponentId}
            color="#8B5CF6"
          />
        </View>

        {(votingOpen || isDone) && totalVotes > 0 && (
          <View style={s.voteBarWrap}>
            <View style={s.voteBarTrack}>
              <View style={[s.voteBarFill, { width: `${(battle.challengerVotes / totalVotes) * 100}%` }]} />
            </View>
            <View style={s.voteBarMeta}>
              <Text style={s.voteBarLeft}>{Math.round((battle.challengerVotes / totalVotes) * 100)}%</Text>
              <Text style={s.voteBarMid}>{t('battle.totalVotes', { count: totalVotes })}</Text>
              <Text style={s.voteBarRight}>{Math.round((battle.opponentVotes / totalVotes) * 100)}%</Text>
            </View>
          </View>
        )}

        <View style={s.controls}>
          {isRecording && (
            <View style={s.focusPanel}>
              <Text style={s.focusLabel}>{t('battle.recordingLive')}</Text>
              <Text style={s.recordCountdown}>{fmtSec(REC_SECS - recSecs)}</Text>
              <TimerBar seconds={recSecs} total={REC_SECS} color="#67E8F9" />
              <TouchableOpacity style={s.stopBtn} onPress={() => stopRecording(false)}>
                <Text style={s.stopBtnTxt}>{t('battle.stopBtn')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {isUploading && (
            <View style={s.focusPanel}>
              <ActivityIndicator color="#67E8F9" />
              <Text style={s.statusTitle}>{t('battle.uploading')}</Text>
              <Text style={s.statusSub}>{t('battle.uploadingDesc')}</Text>
            </View>
          )}

          {isChallenger && battle.status === 'accepted' && !isRecording && !isUploading && (
            <TouchableOpacity style={s.startBtn} onPress={() => startChallengerRec(battleId)}>
              <Text style={s.startBtnTxt}>{t('battle.startBtn')}</Text>
            </TouchableOpacity>
          )}

          {!isChallenger && battle.status === 'accepted' && !isRecording && !isUploading && (
            <View style={s.focusPanel}>
              <ActivityIndicator color="#8B5CF6" />
              <Text style={s.statusTitle}>{t('battle.waitingChallenger', { name: battle.challengerName })}</Text>
              <Text style={s.statusSub}>{t('battle.waitingFirstRound')}</Text>
            </View>
          )}

          {isParticipant && !isRecording && !isUploading && !myTrackDone &&
            ((isChallenger && battle.status === 'opponent_rec') ||
             (!isChallenger && battle.status === 'challenger_rec')) && (
            <View style={s.focusPanel}>
              <ActivityIndicator color="#8B5CF6" />
              <Text style={s.statusTitle}>{t('battle.opponentRecording', { name: isChallenger ? battle.opponentName : battle.challengerName })}</Text>
              <Text style={s.statusSub}>{t('battle.opponentRecordingDesc')}</Text>
            </View>
          )}

          {isParticipant && myTrackDone && !otherTrackDone && !votingOpen && !isDone && (
            <View style={s.focusPanel}>
              <ActivityIndicator color="#D9FF5A" />
              <Text style={s.successTitle}>{t('battle.trackUploaded')}</Text>
              <Text style={s.statusSub}>{t('battle.waitingOpponent', { name: isChallenger ? battle.opponentName : battle.challengerName })}</Text>
            </View>
          )}

          {(votingOpen || isDone) && (
            <View style={s.dualActionRow}>
              <TouchableOpacity
                style={[s.previewBtn, { borderColor: 'rgba(103,232,249,0.24)' }]}
                onPress={() => handlePreview('challenger')}
              >
                <Text style={{ color: '#67E8F9', fontSize: 16 }}>{previewPlaying === 'challenger' ? '⏹' : '▶'}</Text>
                <Text style={{ color: '#67E8F9', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{battle.challengerName}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.previewBtn, { borderColor: 'rgba(139,92,246,0.24)' }]}
                onPress={() => handlePreview('opponent')}
              >
                <Text style={{ color: '#8B5CF6', fontSize: 16 }}>{previewPlaying === 'opponent' ? '⏹' : '▶'}</Text>
                <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{battle.opponentName}</Text>
              </TouchableOpacity>
            </View>
          )}

          {votingOpen && !isParticipant && !myVote && (
            <View style={{ gap: 10, width: '100%' }}>
              <Text style={s.voteHint}>{timeLeftLabel()}</Text>
              <View style={s.dualActionRow}>
                <TouchableOpacity
                  style={[s.voteBtn, { borderColor: '#67E8F9', backgroundColor: 'rgba(103,232,249,0.12)' }]}
                  onPress={() => handleVote(battle.challengerId)}
                >
                  <Text style={{ color: '#67E8F9', fontWeight: '800', fontSize: 14 }}>▶ {battle.challengerName}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.voteBtn, { borderColor: '#8B5CF6', backgroundColor: 'rgba(139,92,246,0.12)' }]}
                  onPress={() => handleVote(battle.opponentId)}
                >
                  <Text style={{ color: '#8B5CF6', fontWeight: '800', fontSize: 14 }}>▶ {battle.opponentName}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {votingOpen && !isParticipant && myVote && (
            <View style={s.focusPanel}>
              <Text style={s.successTitle}>{t('battle.voted')}</Text>
              <Text style={s.voteHint}>{timeLeftLabel()}</Text>
            </View>
          )}

          {votingOpen && isParticipant && (
            <View style={s.focusPanel}>
              <Text style={s.statusTitle}>{t('battle.votingOpenPublic')}</Text>
              <Text style={s.voteHint}>{timeLeftLabel()}</Text>
            </View>
          )}

          {isDone && (
            <View style={s.focusPanel}>
              <Text style={s.winnerTitle}>
                {t('battle.winner', { name: battle.winnerId === battle.challengerId ? battle.challengerName : battle.opponentName })}
              </Text>
              <Text style={s.voteHint}>{t('battle.totalVotes', { count: totalVotes })}</Text>
              <TouchableOpacity style={[s.acceptBtn, { marginTop: 8 }]} onPress={onClose}>
                <Text style={s.acceptTxt}>{t('battle.close')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#050816' },
  ambientA: { position: 'absolute', right: -90, top: 84, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(103,232,249,0.08)' },
  ambientB: { position: 'absolute', left: -70, bottom: 120, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(139,92,246,0.08)' },
  heroGlow: { position: 'absolute', right: 28, top: 118, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(217,255,90,0.08)' },
  cardShell: { flex: 1, margin: 20, marginTop: 72, marginBottom: 36, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(163,177,255,0.14)', backgroundColor: 'rgba(9,12,28,0.82)', alignItems: 'center', justifyContent: 'center', padding: 32, overflow: 'hidden' },
  heroEyebrow: { color: '#67E8F9', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  centerIcon: { fontSize: 58, marginBottom: 10 },
  cardTitle: { color: '#F7F8FF', fontSize: 26, fontWeight: '800', marginBottom: 12, textAlign: 'center', letterSpacing: -0.7 },
  cardDesc: { color: '#97A4C7', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  themePill: { backgroundColor: 'rgba(103,232,249,0.12)', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(103,232,249,0.24)', marginBottom: 12 },
  themePillTxt: { color: '#67E8F9', fontWeight: '700', fontSize: 14 },
  themePillSmall: { backgroundColor: 'rgba(103,232,249,0.12)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(103,232,249,0.22)' },
  themePillSmallTxt: { color: '#67E8F9', fontSize: 11, fontWeight: '700' },
  rowBtns: { flexDirection: 'row', gap: 14 },
  acceptBtn: { paddingHorizontal: 26, paddingVertical: 13, borderRadius: 16, backgroundColor: '#8B5CF6' },
  acceptTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  rejectBtn: { paddingHorizontal: 22, paddingVertical: 13, borderRadius: 16, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  rejectTxt: { color: '#FF6B6B', fontWeight: '700', fontSize: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 52, paddingBottom: 12 },
  headerMeta: { alignItems: 'center', gap: 8 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(163,177,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#97A4C7', fontSize: 15 },
  cancelBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', alignItems: 'center', justifyContent: 'center' },
  cancelTxt: { color: '#FF6B6B', fontSize: 15, fontWeight: '700' },
  stageCard: { flex: 1, marginHorizontal: 16, marginBottom: 24, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(163,177,255,0.14)', backgroundColor: 'rgba(9,12,28,0.82)', overflow: 'hidden' },
  introBlock: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 },
  heroTitle: { color: '#F7F8FF', fontSize: 28, fontWeight: '800', letterSpacing: -0.9 },
  heroSub: { color: '#97A4C7', fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: '92%' },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 16, paddingVertical: 22 },
  vsText: { color: '#D9FF5A', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  playerCard: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 22, padding: 14, borderWidth: 1, marginHorizontal: 4 },
  playerCardWinner: { backgroundColor: 'rgba(217,255,90,0.08)', borderColor: '#D9FF5A' },
  crownEmoji: { fontSize: 20, position: 'absolute', top: -12 },
  playerAvatar: { fontSize: 44 },
  playerAvatarImg: { width: 56, height: 56, borderRadius: 28 },
  playerName: { color: '#F7F8FF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  trackReadyBadge: { color: '#D9FF5A', fontSize: 10, fontWeight: '700' },
  recBadge: { fontSize: 10, fontWeight: '800' },
  votesBubble: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, alignItems: 'center', marginTop: 4 },
  votesCount: { fontSize: 20, fontWeight: '900' },
  votesLabel: { color: '#97A4C7', fontSize: 9 },
  voteBarWrap: { paddingHorizontal: 20, marginBottom: 16 },
  voteBarTrack: { height: 10, backgroundColor: 'rgba(139,92,246,0.3)', borderRadius: 999, overflow: 'hidden' },
  voteBarFill: { height: '100%', backgroundColor: '#67E8F9' },
  voteBarMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  voteBarLeft: { color: '#67E8F9', fontSize: 11, fontWeight: '700' },
  voteBarMid: { color: '#97A4C7', fontSize: 11 },
  voteBarRight: { color: '#8B5CF6', fontSize: 11, fontWeight: '700' },
  controls: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 20, gap: 20 },
  focusPanel: { width: '100%', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 18, borderWidth: 1, borderColor: 'rgba(163,177,255,0.12)' },
  focusLabel: { color: '#67E8F9', fontSize: 11, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase' },
  recordCountdown: { color: '#F7F8FF', fontSize: 38, fontWeight: '900' },
  timerTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden', width: '100%' },
  statusTitle: { color: '#F7F8FF', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  statusSub: { color: '#97A4C7', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  successTitle: { color: '#D9FF5A', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  voteHint: { color: '#97A4C7', fontSize: 12, textAlign: 'center' },
  winnerTitle: { color: '#D9FF5A', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  startBtn: { backgroundColor: '#8B5CF6', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 18, shadowColor: '#8B5CF6', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  startBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 17 },
  stopBtn: { backgroundColor: 'rgba(239,68,68,0.14)', borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.28)' },
  stopBtnTxt: { color: '#FF6B6B', fontWeight: '800', fontSize: 15 },
  dualActionRow: { flexDirection: 'row', gap: 12, width: '100%' },
  previewBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 12, borderWidth: 1 },
  voteBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 16, borderWidth: 1.5 },
});
