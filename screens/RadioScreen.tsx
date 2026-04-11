import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, Alert, StatusBar, Animated, ScrollView,
  KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { auth } from '../firebaseConfig';
import {
  listenToLiveRooms, createRadioRoom, uploadTrack, endRadioRoom, skipToNextTrack,
  joinRadioRoom, leaveRadioRoom, listenToRoom, RadioRoom, PlaylistTrack,
  ChatMessage, HandRaise, Reaction,
  listenToChat, sendChatMessage, sendReaction, listenToReactions,
  raiseHand, lowerHand, listenToMyHandRaise, listenToHandRaises,
  pickListener, dismissPick, setHostMicLive,
} from '../services/radioService';
import {
  fetchAgoraToken, joinAsHost, joinAsAudience, leaveAgoraChannel,
  setMicActive, destroyAgoraEngine, refreshSpeakerphone,
} from '../services/agoraService';
import * as DocumentPicker from 'expo-document-picker';

const SW = Dimensions.get('window').width;

// ─── Tipi locali ──────────────────────────────────────────────────────────────
interface LocalTrack {
  uri: string;       // locale, prima dell'upload
  url?: string;      // dopo upload
  name: string;
  duration?: number; // secondi, rilevata da expo-av
  gapAfter: number;  // secondi di pausa dopo questa traccia
  uploaded: boolean;
}

const GAP_OPTIONS = [0, 3, 5, 10, 15, 30, 60];
const REACTION_EMOJIS = ['❤️', '🔥', '🎵', '🎧'];

// ─── Floating Reaction ────────────────────────────────────────────────────────
interface FloatingItem { id: string; emoji: string; x: number; }

function FloatingReaction({ item, onDone }: { item: FloatingItem; onDone: () => void }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -220, duration: 2200, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(opacity, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, []);
  return (
    <Animated.Text
      style={{ position: 'absolute', bottom: 180, left: item.x, fontSize: 28, transform: [{ translateY }], opacity }}
      pointerEvents="none"
    >
      {item.emoji}
    </Animated.Text>
  );
}

// ─── Waveform ─────────────────────────────────────────────────────────────────
function WaveBar({ index, active, color = '#FF2D55' }: { index: number; active: boolean; color?: string }) {
  const anim = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    if (!active) {
      Animated.timing(anim, { toValue: 0.25, duration: 200, useNativeDriver: false }).start();
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 0.5 + (index % 4) * 0.15, duration: 280 + index * 55, useNativeDriver: false }),
      Animated.timing(anim, { toValue: 0.15 + (index % 3) * 0.08, duration: 260 + index * 45, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active]);
  return (
    <Animated.View style={[ws.bar, {
      height: anim.interpolate({ inputRange: [0, 1], outputRange: [4, 44] }),
      backgroundColor: color,
    }]} />
  );
}

function WaveformAnim({ active, color }: { active: boolean; color?: string }) {
  return (
    <View style={ws.row}>
      {Array.from({ length: 14 }).map((_, i) => (
        <WaveBar key={i} index={i} active={active} color={color} />
      ))}
    </View>
  );
}

const ws = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 52, marginVertical: 12 },
  bar: { width: 4, borderRadius: 2 },
});

// ─── Riga scaletta (con gap indicator) ───────────────────────────────────────
function QueueRow({
  track, index, current, isGap, gapCountdown,
}: {
  track: PlaylistTrack;
  index: number;
  current: boolean;
  isGap?: boolean;
  gapCountdown?: number;
}) {
  const gap = track.gapAfter ?? 0;
  return (
    <View>
      <View style={[qt.row, current && qt.rowActive]}>
        <View style={[qt.numWrap, current && qt.numWrapActive]}>
          {current && !isGap
            ? <View style={qt.playingDot} />
            : <Text style={qt.num}>{index + 1}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[qt.name, current && qt.nameActive]} numberOfLines={1}>
            {track.name.replace(/\.[^.]+$/, '')}
          </Text>
          {track.duration !== undefined && (
            <Text style={qt.duration}>{fmtSec(track.duration)}</Text>
          )}
        </View>
        {current && isGap && gapCountdown !== undefined && (
          <View style={qt.gapBadge}>
            <Text style={qt.gapBadgeTxt}>⏸ {gapCountdown}s</Text>
          </View>
        )}
        {current && !isGap && <Text style={qt.onAir}>ON AIR</Text>}
      </View>
      {/* Gap separator */}
      {gap > 0 && (
        <View style={qt.gapRow}>
          <View style={qt.gapLine} />
          <Text style={qt.gapTxt}>⏸ {gap}s pausa</Text>
          <View style={qt.gapLine} />
        </View>
      )}
    </View>
  );
}

const qt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, marginBottom: 2, backgroundColor: 'rgba(255,255,255,0.03)' },
  rowActive: { backgroundColor: 'rgba(255,45,85,0.10)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.25)' },
  numWrap: { width: 26, height: 26, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  numWrapActive: { backgroundColor: 'rgba(255,45,85,0.2)' },
  num: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  playingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF2D55' },
  name: { fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 17 },
  nameActive: { color: '#fff', fontWeight: '600' },
  duration: { fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', marginTop: 1 },
  onAir: { fontSize: 8, color: '#FF2D55', fontFamily: 'monospace', letterSpacing: 1.5, fontWeight: '700' },
  gapBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  gapBadgeTxt: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 4, marginTop: 2 },
  gapLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  gapTxt: { fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', letterSpacing: 0.5 },
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function fmtSec(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
}

function elapsedStr(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── HOST PANEL ───────────────────────────────────────────────────────────────
function HostRadioModal({ room: initialRoom, onClose }: { room: RadioRoom; onClose: () => void }) {
  const [room, setRoom] = useState(initialRoom);
  const [ending, setEnding] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [trackElapsed, setTrackElapsed] = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<'playing' | 'chat' | 'hands'>('playing');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [handRaises, setHandRaises] = useState<HandRaise[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInGapAudio, setIsInGapAudio] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [micActive, setMicActive_] = useState(false);
  const [agoraJoined, setAgoraJoined] = useState(false);
  const autoAdvancedRef = useRef(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const chatUnsubRef = useRef<(() => void) | null>(null);
  const handsUnsubRef = useRef<(() => void) | null>(null);
  const chatListRef = useRef<FlatList<ChatMessage>>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const currentIndexRef = useRef(initialRoom.currentTrackIndex);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTrack = useCallback(async (r: RadioRoom) => {
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    const track = r.playlist[r.currentTrackIndex];
    if (!track) { setAudioLoading(false); return; }

    const now = Date.now();
    const startAt = r.trackStartedAt.getTime();
    const waitMs = startAt - now;

    if (waitMs > 200) {
      setIsInGapAudio(true);
      gapTimerRef.current = setTimeout(() => {
        setIsInGapAudio(false);
        loadTrack({ ...r, trackStartedAt: new Date(startAt) });
      }, waitMs + 100);
      setAudioLoading(false);
      return;
    }

    setIsInGapAudio(false);
    setAudioLoading(true);
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      refreshSpeakerphone();
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: track.url, headers: { 'Cache-Control': 'no-cache' } },
        { shouldPlay: false },
      );
      const durationMs = status.isLoaded && status.durationMillis ? status.durationMillis : Infinity;
      const elapsed = Math.max(0, now - startAt);
      const offset = Math.min(elapsed, isFinite(durationMs) && durationMs > 1000 ? durationMs - 1000 : elapsed);
      if (offset > 0) await sound.setPositionAsync(offset);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded) setIsPlaying(s.isPlaying); });
      soundRef.current = sound;
    } catch {}
    finally { setAudioLoading(false); }
  }, []);

  useEffect(() => {
    loadTrack(initialRoom);
    unsubRef.current = listenToRoom(room.id, (updated) => {
      setRoom(updated);
      autoAdvancedRef.current = false;
      if (updated.currentTrackIndex !== currentIndexRef.current) {
        currentIndexRef.current = updated.currentTrackIndex;
        loadTrack(updated);
      }
    });
    chatUnsubRef.current = listenToChat(room.id, (msgs) => {
      setChatMessages(msgs);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 80);
    });
    handsUnsubRef.current = listenToHandRaises(room.id, setHandRaises);
    // Agora: join as host (mic off by default)
    fetchAgoraToken(initialRoom.id).then(async (token) => {
      try {
        await joinAsHost(initialRoom.id, token);
        setAgoraJoined(true);
      } catch {}
    });

    return () => {
      if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
      soundRef.current?.unloadAsync().catch(() => {});
      unsubRef.current?.();
      chatUnsubRef.current?.();
      handsUnsubRef.current?.();
      // Agora cleanup
      setHostMicLive(initialRoom.id, false).catch(() => {});
      leaveAgoraChannel().catch(() => {});
      destroyAgoraEngine();
    };
  }, []);

  // Timer generale
  useEffect(() => {
    const t = setInterval(() => {
      setTrackElapsed(Math.max(0, Date.now() - room.trackStartedAt.getTime()));
      setTotalElapsed(Date.now() - room.startedAt.getTime());
    }, 1000);
    return () => clearInterval(t);
  }, [room.trackStartedAt, room.startedAt]);

  // Auto-advance quando la traccia finisce (se ha durata)
  useEffect(() => {
    const track = room.playlist[room.currentTrackIndex];
    if (!track?.duration) return;
    const elapsed = Date.now() - room.trackStartedAt.getTime();
    const remaining = track.duration * 1000 - elapsed;
    if (remaining <= 0) {
      if (!autoAdvancedRef.current && room.currentTrackIndex < room.playlist.length - 1) {
        autoAdvancedRef.current = true;
        const gap = track.gapAfter ?? 0;
        skipToNextTrack(room.id, room.currentTrackIndex + 1, gap).catch(() => {});
      }
      return;
    }
    const t = setTimeout(async () => {
      if (autoAdvancedRef.current) return;
      if (room.currentTrackIndex < room.playlist.length - 1) {
        autoAdvancedRef.current = true;
        const gap = track.gapAfter ?? 0;
        await skipToNextTrack(room.id, room.currentTrackIndex + 1, gap).catch(() => {});
      }
    }, remaining);
    return () => clearTimeout(t);
  }, [room.currentTrackIndex, room.trackStartedAt]);

  const handleSkip = async () => {
    if (room.currentTrackIndex >= room.playlist.length - 1) return;
    setSkipping(true);
    try {
      const currentGap = room.playlist[room.currentTrackIndex]?.gapAfter ?? 0;
      await skipToNextTrack(room.id, room.currentTrackIndex + 1, currentGap);
    } catch { Alert.alert('Errore', 'Impossibile avanzare.'); }
    finally { setSkipping(false); }
  };

  const handleEnd = () => {
    Alert.alert('Termina trasmissione?', 'Tutti gli ascoltatori verranno disconnessi.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Termina', style: 'destructive', onPress: async () => {
        setEnding(true);
        try { await endRadioRoom(room.id); } finally { onClose(); }
      }},
    ]);
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || sendingMsg) return;
    setSendingMsg(true);
    setChatInput('');
    try {
      const name = (auth.currentUser?.displayName ?? room.hostName) + ' (host)';
      await sendChatMessage(room.id, text, name);
    } catch {}
    finally { setSendingMsg(false); }
  };

  const handleMicToggle = async () => {
    if (!agoraJoined) return;
    const next = !micActive;
    setMicActive_(next);
    setMicActive(next);
    // Ducking: abbassa la musica quando il mic è attivo
    if (soundRef.current) {
      soundRef.current.setVolumeAsync(next ? 0.15 : 1.0).catch(() => {});
    }
    try { await setHostMicLive(room.id, next); } catch {}
  };

  const handlePickListener = async (h: HandRaise) => {
    try { await pickListener(room.id, h.userId, h.userName); }
    catch { Alert.alert('Errore', 'Impossibile scegliere il listener.'); }
  };

  const handleDismiss = async (h: HandRaise) => {
    try { await dismissPick(room.id, h.userId); } catch {}
  };

  const currentTrack = room.playlist[room.currentTrackIndex];
  const hasNext = room.currentTrackIndex < room.playlist.length - 1;
  const isInGap = room.trackStartedAt.getTime() > Date.now();
  const gapRemaining = isInGap ? Math.ceil((room.trackStartedAt.getTime() - Date.now()) / 1000) : 0;
  const pendingHands = handRaises.filter(h => h.status === 'pending');
  const pickedHands = handRaises.filter(h => h.status === 'picked');

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
      <View style={hm.orbA} />

      {/* Header */}
      <View style={hm.header}>
        <TouchableOpacity onPress={onClose} style={hm.closeBtn} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
          <Text style={hm.closeTxt}>✕</Text>
        </TouchableOpacity>
        <View style={hm.livePill}>
          <View style={hm.liveDot} />
          <Text style={hm.liveTxt}>ON AIR</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab bar */}
      <View style={hm.tabBar}>
        {(['playing', 'chat', 'hands'] as const).map((tab) => {
          const label = tab === 'playing' ? 'NOW PLAYING' : tab === 'chat' ? 'CHAT' : '🙋 MANI';
          const badge = tab === 'chat' ? chatMessages.length : tab === 'hands' ? pendingHands.length : 0;
          return (
            <TouchableOpacity key={tab} style={[hm.tab, activeTab === tab && hm.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[hm.tabTxt, activeTab === tab && hm.tabTxtActive]}>{label}</Text>
              {badge > 0 && (
                <View style={[hm.tabBadge, tab === 'hands' && { backgroundColor: '#FF2D55' }]}>
                  <Text style={hm.tabBadgeTxt}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab: NOW PLAYING */}
      {activeTab === 'playing' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={hm.content} showsVerticalScrollIndicator={false}>
          <Text style={hm.stationTitle}>{room.title}</Text>
          {room.description ? <Text style={hm.desc}>{room.description}</Text> : null}
          <View style={hm.statsRow}>
            <View style={hm.statBox}>
              <Text style={hm.statNum}>{room.listenerCount}</Text>
              <Text style={hm.statLabel}>ascoltatori</Text>
            </View>
            <View style={hm.statBox}>
              <Text style={hm.statNum}>{elapsedStr(totalElapsed)}</Text>
              <Text style={hm.statLabel}>in onda</Text>
            </View>
            <View style={hm.statBox}>
              <Text style={hm.statNum}>{room.playlist.length}</Text>
              <Text style={hm.statLabel}>tracce</Text>
            </View>
          </View>
          <View style={hm.nowCard}>
            <Text style={hm.nowLabel}>{isInGap ? 'PAUSA' : 'ORA IN ONDA'}</Text>
            {isInGap ? (
              <View>
                <Text style={hm.gapCountdown}>⏸  {gapRemaining}s</Text>
                {hasNext && <Text style={hm.gapNext}>prossima: {room.playlist[room.currentTrackIndex + 1]?.name.replace(/\.[^.]+$/, '')}</Text>}
              </View>
            ) : (
              <>
                <Text style={hm.nowTrackName} numberOfLines={2}>{currentTrack?.name.replace(/\.[^.]+$/, '') ?? '—'}</Text>
                <Text style={hm.trackMeta}>
                  {room.currentTrackIndex + 1} / {room.playlist.length}
                  {currentTrack?.duration ? `  ·  ${fmtSec(Math.min(trackElapsed / 1000, currentTrack.duration))} / ${fmtSec(currentTrack.duration)}` : `  ·  ${fmtSec(trackElapsed / 1000)}`}
                </Text>
                <WaveformAnim active={isPlaying && !isInGapAudio} color="#FF2D55" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'center', marginTop: 4 }}>
                  <TouchableOpacity
                    style={hm.hostPlayBtn}
                    onPress={async () => {
                      if (!soundRef.current) return;
                      if (isPlaying) await soundRef.current.pauseAsync();
                      else await soundRef.current.playAsync();
                    }}
                    disabled={audioLoading}
                  >
                    {audioLoading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={hm.hostPlayIcon}>{isPlaying ? '⏸' : '▶'}</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[hm.micBtn, micActive && hm.micBtnActive]}
                    onPress={handleMicToggle}
                    disabled={!agoraJoined}
                  >
                    <Text style={hm.micIcon}>{micActive ? '🎙' : '🔇'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
          <View style={hm.controls}>
            <TouchableOpacity style={[hm.skipBtn, (!hasNext || skipping) && hm.skipBtnDisabled]} onPress={handleSkip} disabled={!hasNext || skipping}>
              {skipping ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={hm.skipTxt}>{hasNext ? `⏭  Prossima${(currentTrack?.gapAfter ?? 0) > 0 ? ` (pausa ${currentTrack?.gapAfter}s)` : ''}` : '✓  Ultima traccia'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={hm.stopBtn} onPress={handleEnd} disabled={ending}>
              {ending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={hm.stopTxt}>⬛  Termina</Text>}
            </TouchableOpacity>
          </View>
          <Text style={hm.queueTitle}>SCALETTA COMPLETA</Text>
          {room.playlist.map((track, i) => (
            <QueueRow key={i} track={track} index={i} current={i === room.currentTrackIndex}
              isGap={isInGap && i === room.currentTrackIndex}
              gapCountdown={isInGap && i === room.currentTrackIndex ? gapRemaining : undefined} />
          ))}
        </ScrollView>
      )}

      {/* Tab: CHAT */}
      {activeTab === 'chat' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
          <FlatList
            ref={chatListRef}
            data={chatMessages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <View style={[hm.chatMsg, item.isPicked && hm.chatMsgPicked]}>
                <Text style={[hm.chatUser, item.userId === 'system' && hm.chatSystem]}>{item.userName}</Text>
                <Text style={hm.chatText}>{item.text}</Text>
              </View>
            )}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>💬</Text>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: 'monospace' }}>nessun messaggio ancora</Text>
              </View>
            }
          />
          <View style={hm.chatInputRow}>
            <TextInput style={hm.chatInput} placeholder="Scrivi ai tuoi ascoltatori..."
              placeholderTextColor="rgba(255,255,255,0.25)" value={chatInput}
              onChangeText={setChatInput} onSubmitEditing={handleSendChat} returnKeyType="send" />
            <TouchableOpacity style={[hm.chatSendBtn, (!chatInput.trim() || sendingMsg) && { opacity: 0.4 }]}
              onPress={handleSendChat} disabled={!chatInput.trim() || sendingMsg}>
              <Text style={hm.chatSendTxt}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Tab: MANI ALZATE */}
      {activeTab === 'hands' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {pickedHands.length > 0 && (
            <>
              <Text style={hm.handsSection}>IN EVIDENZA</Text>
              {pickedHands.map(h => (
                <View key={h.id} style={hm.handCardPicked}>
                  <Text style={hm.pickedStar}>⭐</Text>
                  <Text style={hm.handName}>{h.userName}</Text>
                  <TouchableOpacity style={hm.dismissBtn} onPress={() => handleDismiss(h)}>
                    <Text style={hm.dismissTxt}>Rimuovi</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {pendingHands.length > 0 ? (
            <>
              <Text style={[hm.handsSection, pickedHands.length > 0 && { marginTop: 20 }]}>HANNO ALZATO LA MANO</Text>
              {pendingHands.map(h => (
                <View key={h.id} style={hm.handCard}>
                  <View style={hm.handAvatar}><Text style={hm.handAvatarTxt}>{h.userName[0]?.toUpperCase()}</Text></View>
                  <Text style={hm.handName}>{h.userName}</Text>
                  <View style={hm.handBtns}>
                    <TouchableOpacity style={hm.pickBtn} onPress={() => handlePickListener(h)}>
                      <Text style={hm.pickBtnTxt}>Scegli</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={hm.ignoreBtn} onPress={() => handleDismiss(h)}>
                      <Text style={hm.ignoreBtnTxt}>Ignora</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          ) : (
            pickedHands.length === 0 && (
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>🙋</Text>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: 'monospace', textAlign: 'center' }}>
                  nessuno ha alzato la mano ancora
                </Text>
              </View>
            )
          )}
        </ScrollView>
      )}
    </Modal>
  );
}

const hm = StyleSheet.create({
  orbA: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(255,45,85,0.06)', top: -80, right: -80 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,45,85,0.18)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.35)' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF2D55' },
  liveTxt: { color: '#FF2D55', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  content: { padding: 20, paddingBottom: 48 },
  stationTitle: { fontSize: 26, fontWeight: '700', fontStyle: 'italic', color: '#fff', marginBottom: 4 },
  desc: { fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 17, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  statNum: { fontSize: 18, fontWeight: '700', color: '#FF2D55', marginBottom: 2 },
  statLabel: { fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  nowCard: { backgroundColor: 'rgba(255,45,85,0.08)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,45,85,0.18)', marginBottom: 12 },
  nowLabel: { fontSize: 9, color: '#FF2D55', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 8 },
  nowTrackName: { fontSize: 18, fontWeight: '700', color: '#fff', lineHeight: 24, marginBottom: 4 },
  trackMeta: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  gapCountdown: { fontSize: 36, fontWeight: '700', color: '#fff', textAlign: 'center', marginVertical: 8 },
  gapNext: { fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontFamily: 'monospace' },
  controls: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  skipBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  skipBtnDisabled: { opacity: 0.3 },
  skipTxt: { color: '#fff', fontSize: 14, fontWeight: '600' },
  stopBtn: { paddingHorizontal: 20, paddingVertical: 13, borderRadius: 12, backgroundColor: 'rgba(255,45,85,0.25)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.4)', alignItems: 'center' },
  stopTxt: { color: '#FF2D55', fontSize: 14, fontWeight: '700' },
  queueTitle: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 10 },
  hostPlayBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FF2D55', alignItems: 'center', justifyContent: 'center', shadowColor: '#FF2D55', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  hostPlayIcon: { fontSize: 22, color: '#fff' },
  micBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  micBtnActive: { backgroundColor: 'rgba(255,45,85,0.25)', borderColor: '#FF2D55', shadowColor: '#FF2D55', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  micIcon: { fontSize: 22 },
  // Tab bar
  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  tabActive: { backgroundColor: 'rgba(255,45,85,0.2)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  tabTxt: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: 1 },
  tabTxtActive: { color: '#FF2D55', fontWeight: '700' },
  tabBadge: { minWidth: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeTxt: { fontSize: 9, color: '#fff', fontWeight: '700' },
  // Chat
  chatMsg: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, marginBottom: 6 },
  chatMsgPicked: { backgroundColor: 'rgba(255,215,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)' },
  chatUser: { fontSize: 11, color: '#FF2D55', fontWeight: '700', marginBottom: 3, fontFamily: 'monospace' },
  chatSystem: { color: '#FFD700' },
  chatText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 19 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', paddingBottom: 28 },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chatSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FF2D55', alignItems: 'center', justifyContent: 'center' },
  chatSendTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  // Hand raises
  handsSection: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 12 },
  handCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  handCardPicked: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,215,0,0.07)', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)' },
  handAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,45,85,0.15)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)', alignItems: 'center', justifyContent: 'center' },
  handAvatarTxt: { color: '#FF2D55', fontSize: 16, fontWeight: '700' },
  handName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  pickedStar: { fontSize: 20 },
  handBtns: { flexDirection: 'row', gap: 6 },
  pickBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,45,85,0.2)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.4)' },
  pickBtnTxt: { color: '#FF2D55', fontSize: 12, fontWeight: '700' },
  ignoreBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  ignoreBtnTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  dismissBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)' },
  dismissTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' },
});

// ─── LISTENER SCREEN ──────────────────────────────────────────────────────────
function RadioListenerModal({ room: initialRoom, onClose }: { room: RadioRoom; onClose: () => void }) {
  const [room, setRoom] = useState(initialRoom);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInGap, setIsInGap] = useState(false);
  const [gapCountdown, setGapCountdown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'playing' | 'chat'>('playing');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [myHandRaise, setMyHandRaise] = useState<HandRaise | null>(null);
  const [floaters, setFloaters] = useState<FloatingItem[]>([]);
  const seenReactionsRef = useRef<Set<string>>(new Set());
  const soundRef = useRef<Audio.Sound | null>(null);
  const currentIndexRef = useRef(initialRoom.currentTrackIndex);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gapTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const chatUnsubRef = useRef<(() => void) | null>(null);
  const reactionsUnsubRef = useRef<(() => void) | null>(null);
  const handRaiseUnsubRef = useRef<(() => void) | null>(null);
  const chatListRef = useRef<FlatList<ChatMessage>>(null);
  const hostMicLiveRef = useRef(initialRoom.hostMicLive ?? false);

  const clearGapTimers = () => {
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    if (gapTickRef.current) clearInterval(gapTickRef.current);
  };

  const loadTrack = useCallback(async (r: RadioRoom) => {
    clearGapTimers();
    const track = r.playlist[r.currentTrackIndex];
    if (!track) { setLoading(false); return; }

    const now = Date.now();
    const startAt = r.trackStartedAt.getTime();
    const waitMs = startAt - now;

    if (waitMs > 200) {
      // Siamo nella pausa: aspetta e poi carica
      setIsInGap(true);
      setGapCountdown(Math.ceil(waitMs / 1000));
      gapTickRef.current = setInterval(() => {
        setGapCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
      gapTimerRef.current = setTimeout(() => {
        setIsInGap(false);
        setGapCountdown(0);
        loadTrack({ ...r, trackStartedAt: new Date(startAt) });
      }, waitMs + 100);
      setLoading(false);
      return;
    }

    setIsInGap(false);
    setGapCountdown(0);
    setLoading(true);

    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      refreshSpeakerphone();
      const elapsed = Math.max(0, now - startAt);
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay: true, positionMillis: elapsed > 500 ? elapsed : 0 },
      );
      sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded) setIsPlaying(s.isPlaying); });
      // Applica ducking se l'host sta già parlando quando carichiamo la traccia
      if (hostMicLiveRef.current) sound.setVolumeAsync(0.15).catch(() => {});
      soundRef.current = sound;
    } catch {
      Alert.alert('Errore', 'Impossibile caricare la traccia.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    joinRadioRoom(initialRoom.id).catch(() => {});
    loadTrack(initialRoom);
    unsubRef.current = listenToRoom(initialRoom.id, (updated) => {
      setRoom(updated);
      if (updated.currentTrackIndex !== currentIndexRef.current) {
        currentIndexRef.current = updated.currentTrackIndex;
        loadTrack(updated);
      }
    });
    chatUnsubRef.current = listenToChat(initialRoom.id, (msgs) => {
      setChatMessages(msgs);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 80);
    });
    reactionsUnsubRef.current = listenToReactions(initialRoom.id, (reactions) => {
      const newOnes = reactions.filter(r => !seenReactionsRef.current.has(r.id));
      if (newOnes.length > 0) {
        newOnes.forEach(r => seenReactionsRef.current.add(r.id));
        const items: FloatingItem[] = newOnes.map(r => ({
          id: r.id + Date.now(),
          emoji: r.emoji,
          x: Math.floor(Math.random() * (SW - 80)) + 20,
        }));
        setFloaters(prev => [...prev, ...items]);
      }
    });
    handRaiseUnsubRef.current = listenToMyHandRaise(initialRoom.id, setMyHandRaise);

    // Agora: join as audience
    fetchAgoraToken(initialRoom.id).then(async (token) => {
      try { await joinAsAudience(initialRoom.id, token); } catch {}
    });

    return () => {
      clearGapTimers();
      leaveRadioRoom(initialRoom.id).catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
      unsubRef.current?.();
      chatUnsubRef.current?.();
      reactionsUnsubRef.current?.();
      handRaiseUnsubRef.current?.();
      leaveAgoraChannel().catch(() => {});
    };
  }, []);

  // Ducking lato listener: abbassa la musica quando l'host attiva il microfono
  useEffect(() => {
    hostMicLiveRef.current = room.hostMicLive ?? false;
    soundRef.current?.setVolumeAsync(room.hostMicLive ? 0.15 : 1.0).catch(() => {});
  }, [room.hostMicLive]);

  const togglePlay = async () => {
    if (!soundRef.current) return;
    if (isPlaying) await soundRef.current.pauseAsync();
    else await soundRef.current.playAsync();
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || sendingMsg) return;
    setSendingMsg(true);
    setChatInput('');
    try {
      const name = auth.currentUser?.displayName ?? 'Ascoltatore';
      await sendChatMessage(room.id, text, name);
    } catch {}
    finally { setSendingMsg(false); }
  };

  const handleReaction = async (emoji: string) => {
    try { await sendReaction(room.id, emoji); } catch {}
  };

  const handleHandRaise = async () => {
    if (myHandRaise) {
      try { await lowerHand(room.id); } catch {}
    } else {
      const name = auth.currentUser?.displayName ?? 'Ascoltatore';
      try { await raiseHand(room.id, name); } catch {}
    }
  };

  const currentTrack = room.playlist[room.currentTrackIndex];
  const isPicked = myHandRaise?.status === 'picked';

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
      <View style={lm.orb} />

      {/* Floating reactions overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {floaters.map(item => (
          <FloatingReaction key={item.id} item={item} onDone={() =>
            setFloaters(prev => prev.filter(f => f.id !== item.id))
          } />
        ))}
      </View>

      {/* Header */}
      <View style={lm.header}>
        <TouchableOpacity onPress={onClose} style={lm.closeBtn} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
          <Text style={lm.closeTxt}>✕</Text>
        </TouchableOpacity>
        <View style={lm.liveBadge}>
          <View style={lm.liveDot} />
          <Text style={lm.liveTxt}>{isInGap ? 'PAUSA' : 'LIVE'}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab bar */}
      <View style={lm.tabBar}>
        <TouchableOpacity style={[lm.tab, activeTab === 'playing' && lm.tabActive]} onPress={() => setActiveTab('playing')}>
          <Text style={[lm.tabTxt, activeTab === 'playing' && lm.tabTxtActive]}>IN ONDA</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[lm.tab, activeTab === 'chat' && lm.tabActive]} onPress={() => setActiveTab('chat')}>
          <Text style={[lm.tabTxt, activeTab === 'chat' && lm.tabTxtActive]}>CHAT</Text>
          {chatMessages.length > 0 && <View style={lm.tabBadge}><Text style={lm.tabBadgeTxt}>{chatMessages.length > 99 ? '99+' : chatMessages.length}</Text></View>}
        </TouchableOpacity>
      </View>

      {/* Tab: IN ONDA */}
      {activeTab === 'playing' && (
        <ScrollView contentContainerStyle={lm.content} showsVerticalScrollIndicator={false}>
          <Text style={lm.stationName}>{room.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Text style={lm.hostLine}>condotta da @{room.hostName}</Text>
            {room.hostMicLive && (
              <View style={lm.micLiveBadge}>
                <Text style={lm.micLiveTxt}>🎙 in diretta</Text>
              </View>
            )}
          </View>

          {/* Scelto banner */}
          {isPicked && (
            <View style={lm.pickedBanner}>
              <Text style={lm.pickedBannerTxt}>⭐ Sei stato scelto dall'host!</Text>
            </View>
          )}

          <View style={lm.nowCard}>
            <Text style={lm.nowLabel}>{isInGap ? 'PAUSA' : 'ORA IN ONDA'}</Text>
            {isInGap ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={lm.gapNum}>{gapCountdown}s</Text>
                {currentTrack && <Text style={lm.gapInfo}>prossima: {currentTrack.name.replace(/\.[^.]+$/, '')}</Text>}
              </View>
            ) : (
              <>
                <Text style={lm.nowTrack} numberOfLines={2}>{currentTrack?.name.replace(/\.[^.]+$/, '') ?? '—'}</Text>
                <Text style={lm.trackPos}>{room.currentTrackIndex + 1} di {room.playlist.length} tracce</Text>
                <WaveformAnim active={isPlaying && !isInGap} color="#FF2D55" />
              </>
            )}
            {!isInGap && (
              <TouchableOpacity style={lm.playBtn} onPress={togglePlay} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={lm.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>}
              </TouchableOpacity>
            )}
          </View>

          {/* Reaction buttons */}
          <View style={lm.reactionsRow}>
            {REACTION_EMOJIS.map(emoji => (
              <TouchableOpacity key={emoji} style={lm.reactionBtn} onPress={() => handleReaction(emoji)}>
                <Text style={lm.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={lm.listenerTxt}>🎧 {room.listenerCount} {room.listenerCount === 1 ? 'ascoltatore' : 'ascoltatori'}</Text>

          <Text style={lm.queueTitle}>SCALETTA COMPLETA</Text>
          {room.playlist.map((track, i) => (
            <QueueRow key={i} track={track} index={i} current={i === room.currentTrackIndex}
              isGap={isInGap && i === room.currentTrackIndex}
              gapCountdown={isInGap && i === room.currentTrackIndex ? gapCountdown : undefined} />
          ))}
          {!room.isLive && <Text style={lm.offAir}>Trasmissione terminata</Text>}
        </ScrollView>
      )}

      {/* Tab: CHAT */}
      {activeTab === 'chat' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
          {isPicked && (
            <View style={lm.pickedBannerSmall}>
              <Text style={lm.pickedBannerTxt}>⭐ Sei in evidenza!</Text>
            </View>
          )}
          <FlatList
            ref={chatListRef}
            data={chatMessages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <View style={[lm.chatMsg, item.isPicked && lm.chatMsgPicked]}>
                <Text style={[lm.chatUser, item.userId === 'system' && lm.chatSystem]}>{item.userName}</Text>
                <Text style={lm.chatText}>{item.text}</Text>
              </View>
            )}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>💬</Text>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: 'monospace' }}>nessun messaggio ancora</Text>
              </View>
            }
          />
          {/* Reaction buttons */}
          <View style={lm.reactionsRow}>
            {REACTION_EMOJIS.map(emoji => (
              <TouchableOpacity key={emoji} style={lm.reactionBtn} onPress={() => handleReaction(emoji)}>
                <Text style={lm.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Input row */}
          <View style={lm.chatInputRow}>
            <TouchableOpacity
              style={[lm.handBtn, myHandRaise && (isPicked ? lm.handBtnPicked : lm.handBtnRaised)]}
              onPress={handleHandRaise}
            >
              <Text style={lm.handBtnTxt}>{myHandRaise ? (isPicked ? '⭐' : '✋') : '🙋'}</Text>
            </TouchableOpacity>
            <TextInput style={lm.chatInput} placeholder="Scrivi un messaggio..."
              placeholderTextColor="rgba(255,255,255,0.25)" value={chatInput}
              onChangeText={setChatInput} onSubmitEditing={handleSendChat} returnKeyType="send" />
            <TouchableOpacity style={[lm.chatSendBtn, (!chatInput.trim() || sendingMsg) && { opacity: 0.4 }]}
              onPress={handleSendChat} disabled={!chatInput.trim() || sendingMsg}>
              <Text style={lm.chatSendTxt}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}

const lm = StyleSheet.create({
  orb: { position: 'absolute', width: 350, height: 350, borderRadius: 175, backgroundColor: 'rgba(255,45,85,0.06)', top: -80, right: -100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,45,85,0.18)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.35)' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF2D55' },
  liveTxt: { color: '#FF2D55', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  content: { padding: 20, paddingBottom: 48 },
  stationName: { fontSize: 26, fontWeight: '700', fontStyle: 'italic', color: '#fff', marginBottom: 4 },
  hostLine: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  micLiveBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(255,45,85,0.15)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  micLiveTxt: { fontSize: 10, color: '#FF2D55', fontWeight: '700', fontFamily: 'monospace' },
  nowCard: { backgroundColor: 'rgba(255,45,85,0.08)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,45,85,0.18)', alignItems: 'center', marginBottom: 12 },
  nowLabel: { fontSize: 9, color: '#FF2D55', fontFamily: 'monospace', letterSpacing: 2.5, marginBottom: 10, alignSelf: 'flex-start' },
  nowTrack: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 26, marginBottom: 4 },
  trackPos: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  gapNum: { fontSize: 48, fontWeight: '700', color: '#fff', lineHeight: 54 },
  gapInfo: { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', marginTop: 6, textAlign: 'center' },
  playBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FF2D55', alignItems: 'center', justifyContent: 'center', shadowColor: '#FF2D55', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, marginTop: 4 },
  playIcon: { fontSize: 24, color: '#fff' },
  listenerTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', marginBottom: 24 },
  queueTitle: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 10 },
  offAir: { textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: 'monospace', marginTop: 20 },
  // Tab bar
  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  tabActive: { backgroundColor: 'rgba(255,45,85,0.2)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  tabTxt: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: 1 },
  tabTxtActive: { color: '#FF2D55', fontWeight: '700' },
  tabBadge: { minWidth: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeTxt: { fontSize: 9, color: '#fff', fontWeight: '700' },
  // Picked banner
  pickedBanner: { backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)', alignItems: 'center', marginBottom: 12 },
  pickedBannerSmall: { backgroundColor: 'rgba(255,215,0,0.1)', paddingVertical: 8, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,215,0,0.2)' },
  pickedBannerTxt: { color: '#FFD700', fontSize: 13, fontWeight: '700' },
  // Reactions
  reactionsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  reactionBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  reactionEmoji: { fontSize: 22 },
  // Chat
  chatMsg: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, marginBottom: 6 },
  chatMsgPicked: { backgroundColor: 'rgba(255,215,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)' },
  chatUser: { fontSize: 11, color: '#FF2D55', fontWeight: '700', marginBottom: 3, fontFamily: 'monospace' },
  chatSystem: { color: '#FFD700' },
  chatText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 19 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', paddingBottom: 28 },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chatSendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FF2D55', alignItems: 'center', justifyContent: 'center' },
  chatSendTxt: { color: '#fff', fontSize: 17, fontWeight: '700' },
  // Hand raise button
  handBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  handBtnRaised: { backgroundColor: 'rgba(255,165,0,0.2)', borderColor: 'rgba(255,165,0,0.5)' },
  handBtnPicked: { backgroundColor: 'rgba(255,215,0,0.2)', borderColor: 'rgba(255,215,0,0.5)' },
  handBtnTxt: { fontSize: 18 },
});

// ─── CREA STANZA ──────────────────────────────────────────────────────────────
function CreateRoomModal({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadIdx, setUploadIdx] = useState(0);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  const addTrack = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/flac', 'audio/aac'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      // Rileva durata
      let duration: number | undefined;
      try {
        const { sound, status } = await Audio.Sound.createAsync({ uri: asset.uri }, { shouldPlay: false });
        if (status.isLoaded && status.durationMillis) duration = Math.floor(status.durationMillis / 1000);
        await sound.unloadAsync();
      } catch {}

      setTracks(prev => [...prev, {
        uri: asset.uri,
        name: asset.name ?? `Traccia ${prev.length + 1}`,
        duration,
        gapAfter: 0,
        uploaded: false,
      }]);
    } catch { Alert.alert('Errore', 'Impossibile aprire il selettore.'); }
  };

  const removeTrack = (i: number) => setTracks(prev => prev.filter((_, idx) => idx !== i));

  const moveTrack = (i: number, dir: 'up' | 'down') => {
    setTracks(prev => {
      const arr = [...prev];
      const swap = dir === 'up' ? i - 1 : i + 1;
      if (swap < 0 || swap >= arr.length) return arr;
      [arr[i], arr[swap]] = [arr[swap], arr[i]];
      return arr;
    });
  };

  const setGap = (i: number, gap: number) => {
    setTracks(prev => prev.map((t, idx) => idx === i ? { ...t, gapAfter: gap } : t));
  };

  const startEditName = (i: number) => {
    setEditingName(i);
    setEditingNameValue(tracks[i].name.replace(/\.[^.]+$/, ''));
  };

  const confirmEditName = (i: number) => {
    if (editingNameValue.trim()) {
      const ext = tracks[i].name.includes('.') ? tracks[i].name.split('.').pop() : '';
      setTracks(prev => prev.map((t, idx) => idx === i
        ? { ...t, name: editingNameValue.trim() + (ext ? `.${ext}` : '') }
        : t));
    }
    setEditingName(null);
  };

  const handleCreate = async () => {
    if (!title.trim()) { Alert.alert('Inserisci un titolo'); return; }
    if (tracks.length === 0) { Alert.alert('Aggiungi almeno una traccia'); return; }
    const hostName = auth.currentUser?.displayName ?? auth.currentUser?.email ?? 'utente';
    setUploading(true);
    try {
      const uploaded: PlaylistTrack[] = [];
      for (let i = 0; i < tracks.length; i++) {
        setUploadIdx(i);
        const t = tracks[i];
        const pt = await uploadTrack({ uri: t.uri, name: t.name, duration: t.duration, gapAfter: t.gapAfter });
        uploaded.push(pt);
      }
      await createRadioRoom({ title: title.trim(), description: description.trim(), playlist: uploaded, hostName });
      onCreated();
    } catch { Alert.alert('Errore', 'Impossibile avviare la trasmissione.'); }
    finally { setUploading(false); }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={cm.overlay}>
        <View style={cm.sheet}>
          <LinearGradient colors={['#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} borderRadius={20} />
          <View style={cm.handle} />
          <Text style={cm.sheetTitle}>🎙  Vai in Radio</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TextInput
              style={cm.input}
              placeholder="Nome della stazione..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[cm.input, { height: 64, textAlignVertical: 'top' }]}
              placeholder="Descrizione (opzionale)..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={description}
              onChangeText={setDescription}
              multiline
            />

            {/* Playlist builder */}
            <View style={cm.section}>
              <Text style={cm.sectionLabel}>SCALETTA · {tracks.length} {tracks.length === 1 ? 'traccia' : 'tracce'}</Text>

              {tracks.map((t, i) => (
                <View key={i} style={cm.trackCard}>
                  {/* Riga principale */}
                  <View style={cm.trackTop}>
                    {/* Riordina */}
                    <View style={cm.reorderBtns}>
                      <TouchableOpacity onPress={() => moveTrack(i, 'up')} disabled={i === 0} style={[cm.reorderBtn, i === 0 && { opacity: 0.2 }]}>
                        <Text style={cm.reorderTxt}>↑</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => moveTrack(i, 'down')} disabled={i === tracks.length - 1} style={[cm.reorderBtn, i === tracks.length - 1 && { opacity: 0.2 }]}>
                        <Text style={cm.reorderTxt}>↓</Text>
                      </TouchableOpacity>
                    </View>
                    {/* Numero */}
                    <Text style={cm.trackNum}>{i + 1}</Text>
                    {/* Nome (toccabile per modificare) */}
                    <View style={{ flex: 1 }}>
                      {editingName === i ? (
                        <TextInput
                          style={cm.trackNameInput}
                          value={editingNameValue}
                          onChangeText={setEditingNameValue}
                          onBlur={() => confirmEditName(i)}
                          onSubmitEditing={() => confirmEditName(i)}
                          autoFocus
                        />
                      ) : (
                        <TouchableOpacity onPress={() => startEditName(i)}>
                          <Text style={cm.trackName} numberOfLines={1}>{t.name.replace(/\.[^.]+$/, '')}</Text>
                          {t.duration !== undefined && (
                            <Text style={cm.trackDuration}>{fmtSec(t.duration)}</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                    {/* Elimina */}
                    <TouchableOpacity onPress={() => removeTrack(i)} style={cm.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={cm.removeTxt}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Gap setting (non sull'ultima traccia) */}
                  {i < tracks.length - 1 && (
                    <View style={cm.gapRow}>
                      <Text style={cm.gapLabel}>⏸ pausa dopo:</Text>
                      {GAP_OPTIONS.map(g => (
                        <TouchableOpacity
                          key={g}
                          style={[cm.gapChip, t.gapAfter === g && cm.gapChipActive]}
                          onPress={() => setGap(i, g)}
                        >
                          <Text style={[cm.gapChipTxt, t.gapAfter === g && cm.gapChipTxtActive]}>
                            {g === 0 ? 'no' : `${g}s`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ))}

              <TouchableOpacity style={cm.addBtn} onPress={addTrack} disabled={uploading}>
                <Text style={cm.addBtnTxt}>+ Aggiungi traccia</Text>
              </TouchableOpacity>
            </View>

            {/* Upload progress */}
            {uploading && (
              <View style={cm.progressWrap}>
                <View style={cm.progressBar}>
                  <View style={[cm.progressFill, { width: `${((uploadIdx + 1) / tracks.length) * 100}%` as any }]} />
                </View>
                <Text style={cm.progressTxt}>Caricando traccia {uploadIdx + 1} di {tracks.length}...</Text>
              </View>
            )}

            <View style={cm.actions}>
              <TouchableOpacity style={cm.cancelBtn} onPress={onClose} disabled={uploading}>
                <Text style={cm.cancelTxt}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={cm.createBtn} onPress={handleCreate} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={cm.createTxt}>Vai Live 🔴</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const cm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, overflow: 'hidden', maxHeight: '92%' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontWeight: '700', fontStyle: 'italic', color: '#fff', marginBottom: 16 },
  input: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  section: { marginBottom: 14 },
  sectionLabel: { fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 10 },
  trackCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  trackTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reorderBtns: { gap: 2 },
  reorderBtn: { width: 22, height: 22, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  reorderTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 16 },
  trackNum: { width: 16, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', textAlign: 'center' },
  trackName: { fontSize: 13, color: '#fff', lineHeight: 17 },
  trackDuration: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginTop: 1 },
  trackNameInput: { fontSize: 13, color: '#fff', borderBottomWidth: 1, borderBottomColor: '#FF2D55', paddingVertical: 2 },
  removeBtn: { padding: 3 },
  removeTxt: { fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: '700' },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, flexWrap: 'wrap' },
  gapLabel: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginRight: 2 },
  gapChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  gapChipActive: { backgroundColor: 'rgba(255,45,85,0.2)', borderColor: 'rgba(255,45,85,0.4)' },
  gapChipTxt: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  gapChipTxtActive: { color: '#FF2D55', fontWeight: '700' },
  addBtn: { paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,255,156,0.25)', alignItems: 'center', marginTop: 4 },
  addBtnTxt: { color: '#00FF9C', fontSize: 13, fontFamily: 'monospace' },
  progressWrap: { marginBottom: 12 },
  progressBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#00FF9C', borderRadius: 2 },
  progressTxt: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  cancelTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  createBtn: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: '#FF2D55', alignItems: 'center' },
  createTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

// ─── Room card ────────────────────────────────────────────────────────────────
function RoomCard({ room, onPress }: { room: RadioRoom; onPress: () => void }) {
  const isOwn = auth.currentUser?.uid === room.hostId;
  const currentTrack = room.playlist[room.currentTrackIndex];
  return (
    <TouchableOpacity style={rc.card} onPress={onPress} activeOpacity={0.82}>
      <LinearGradient
        colors={isOwn ? ['rgba(255,45,85,0.12)', 'rgba(255,45,85,0.03)'] : ['rgba(255,255,255,0.04)', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      />
      <View style={rc.top}>
        <View style={rc.liveWrap}>
          <View style={rc.liveDot} />
          <Text style={rc.liveTxt}>LIVE</Text>
        </View>
        <Text style={rc.trackBadge}>{room.playlist.length} tracce</Text>
      </View>
      <Text style={rc.title} numberOfLines={2}>{room.title}</Text>
      {currentTrack && (
        <View style={rc.nowWrap}>
          <Text style={rc.nowIcon}>♪</Text>
          <Text style={rc.nowName} numberOfLines={1}>{currentTrack.name.replace(/\.[^.]+$/, '')}</Text>
          <Text style={rc.trackIdx}>{room.currentTrackIndex + 1}/{room.playlist.length}</Text>
        </View>
      )}
      <View style={rc.bottom}>
        <Text style={rc.host}>@{room.hostName}{isOwn ? ' (tu)' : ''}</Text>
        <View style={rc.rightRow}>
          <Text style={rc.listeners}>🎧 {room.listenerCount}</Text>
          <View style={[rc.btn, isOwn && rc.btnOwn]}>
            <Text style={rc.btnTxt}>{isOwn ? '⬛ Gestisci' : '▶ Entra'}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const rc = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,45,85,0.18)', padding: 16, marginBottom: 10, overflow: 'hidden', backgroundColor: '#0D0D1A' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  liveWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,45,85,0.15)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF2D55' },
  liveTxt: { fontSize: 9, color: '#FF2D55', fontWeight: '700', letterSpacing: 1.5, fontFamily: 'monospace' },
  trackBadge: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  title: { fontSize: 18, fontWeight: '700', fontStyle: 'italic', color: '#fff', marginBottom: 8, lineHeight: 22 },
  nowWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
  nowIcon: { fontSize: 11, color: '#FF2D55' },
  nowName: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  trackIdx: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  host: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listeners: { fontSize: 11, color: 'rgba(255,45,85,0.7)', fontFamily: 'monospace' },
  btn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,45,85,0.15)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  btnOwn: { backgroundColor: 'rgba(255,45,85,0.25)', borderColor: 'rgba(255,45,85,0.5)' },
  btnTxt: { color: '#FF2D55', fontSize: 12, fontWeight: '600' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function RadioScreen() {
  const [rooms, setRooms] = useState<RadioRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<RadioRoom | null>(null);
  const [hostRoom, setHostRoom] = useState<RadioRoom | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const unsub = listenToLiveRooms((liveRooms) => {
      setRooms(liveRooms);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleRoomPress = (room: RadioRoom) => {
    if (auth.currentUser?.uid === room.hostId) setHostRoom(room);
    else setSelectedRoom(room);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={ms.topBar}>
        <View>
          <Text style={ms.topTitle}>Radio Live</Text>
          {rooms.length > 0 && (
            <Text style={ms.topSub}>{rooms.length} {rooms.length === 1 ? 'stazione attiva' : 'stazioni attive'}</Text>
          )}
        </View>
        <TouchableOpacity style={ms.liveBtn} onPress={() => setShowCreate(true)}>
          <View style={ms.liveDot} />
          <Text style={ms.liveBtnTxt}>Vai Live</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={ms.center}><ActivityIndicator color="#FF2D55" /></View>
      ) : rooms.length === 0 ? (
        <View style={ms.empty}>
          <Text style={{ fontSize: 52, marginBottom: 14 }}>📻</Text>
          <Text style={ms.emptyTitle}>Nessuna radio live</Text>
          <Text style={ms.emptyDesc}>Sii il primo ad andare live con la tua playlist</Text>
          <TouchableOpacity style={ms.emptyBtn} onPress={() => setShowCreate(true)}>
            <Text style={ms.emptyBtnTxt}>🔴  Vai Live</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <RoomCard room={item} onPress={() => handleRoomPress(item)} />}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {selectedRoom && <RadioListenerModal room={selectedRoom} onClose={() => setSelectedRoom(null)} />}
      {hostRoom && <HostRadioModal room={hostRoom} onClose={() => setHostRoom(null)} />}
      {showCreate && <CreateRoomModal onCreated={() => setShowCreate(false)} onClose={() => setShowCreate(false)} />}
    </View>
  );
}

const ms = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  topTitle: { fontSize: 16, fontWeight: '700', fontStyle: 'italic', color: '#fff' },
  topSub: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', marginTop: 1 },
  liveBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,45,85,0.15)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF2D55' },
  liveBtnTxt: { color: '#FF2D55', fontSize: 13, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 20, color: '#fff', fontStyle: 'italic', marginBottom: 8, fontWeight: '700' },
  emptyDesc: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', marginBottom: 24, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { paddingHorizontal: 28, paddingVertical: 13, borderRadius: 24, backgroundColor: 'rgba(255,45,85,0.18)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.4)' },
  emptyBtnTxt: { color: '#FF2D55', fontSize: 15, fontWeight: '700' },
});
