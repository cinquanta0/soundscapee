import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, StatusBar, Dimensions, Animated,
  Alert, Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';

const RECORDING_OPTIONS_AAC: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
};
import * as FileSystem from 'expo-file-system/legacy';
import { auth } from '../firebaseConfig';
import {
  Messaggio, listenMessaggi, inviaMessaggio,
  segnaAscoltato, eliminaMessaggio, genWaveform, convId,
} from '../services/messaggiService';

const { width: SW } = Dimensions.get('window');
const ME = () => auth.currentUser?.uid ?? '';

// ─── Waveform bubble ──────────────────────────────────────────────────────────
function WaveformBars({ waveform, isPlaying, isMine }: { waveform: number[]; isPlaying: boolean; isMine: boolean }) {
  const color = isMine ? '#00FF9C' : '#A855F7';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 }}>
      {waveform.map((h, i) => (
        <View
          key={i}
          style={{
            width: 3,
            height: h * 28,
            borderRadius: 2,
            backgroundColor: isPlaying ? color : `${color}80`,
          }}
        />
      ))}
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  onPlay,
  onDelete,
  playingId,
  playingPosition,
}: {
  msg: Messaggio;
  onPlay: (msg: Messaggio) => void;
  onDelete: (msg: Messaggio) => void;
  playingId: string | null;
  playingPosition: number;
}) {
  const isMine = msg.senderId === ME();
  const isPlaying = playingId === msg.id;
  const wf = msg.waveform?.length ? msg.waveform : genWaveform(msg.id);
  const color = isMine ? '#00FF9C' : '#A855F7';

  const durDisplay = isPlaying
    ? `${playingPosition}s / ${msg.duration}s`
    : `${msg.duration}s`;

  function fmtTime(d: Date) {
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear().toString().slice(-2);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  return (
    <View style={[bs.row, isMine ? bs.rowRight : bs.rowLeft]}>
      <TouchableOpacity
        style={[bs.bubble, isMine ? bs.bubbleMine : bs.bubbleTheirs]}
        onPress={() => onPlay(msg)}
        onLongPress={() => isMine && onDelete(msg)}
        delayLongPress={500}
        activeOpacity={0.85}
      >
        {msg.soundTitle && (
          <Text style={bs.soundRef}>🎵 {msg.soundTitle}</Text>
        )}
        {msg.statusReply && (
          <View style={[bs.statusReplyTag, isMine ? bs.statusReplyTagMine : bs.statusReplyTagTheirs]}>
            <Text style={bs.statusReplyTxt}>💬 {msg.statusReplyLabel || 'Risposta allo stato'}</Text>
          </View>
        )}
        <View style={bs.audioRow}>
          <View style={[bs.playCircle, isMine ? bs.playCircleMine : bs.playCircleTheirs]}>
            <Text style={[bs.playIcon, { color }]}>
              {isPlaying ? '⏸' : '▶'}
            </Text>
          </View>
          <WaveformBars waveform={wf} isPlaying={isPlaying} isMine={isMine} />
          <Text style={[bs.durTxt, isPlaying && { color }]}>{durDisplay}</Text>
        </View>
        <View style={bs.meta}>
          <Text style={bs.timeTxt}>{fmtTime(msg.timestamp)}</Text>
          {isMine && (
            <Text style={[bs.check, msg.ascoltato && bs.checkRead]}>
              {msg.ascoltato ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Record button ─────────────────────────────────────────────────────────────
function RecordButton({ onSend }: { onSend: (uri: string, duration: number) => void }) {
  const { t } = useTranslation();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const startRec = async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        RECORDING_OPTIONS_AAC,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setElapsed(0);
      Vibration.vibrate(30);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      Animated.spring(scaleAnim, { toValue: 1.25, useNativeDriver: true, tension: 200, friction: 8 }).start();
    } catch {
      Alert.alert(t('common.error'), t('chat.errors.cannotRecord'));
    }
  };

  const stopRec = async () => {
    if (!recordingRef.current || !isRecording) return;
    clearInterval(timerRef.current!);
    setIsRecording(false);
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 8 }).start();
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      const status = await recordingRef.current.getStatusAsync();
      // elapsed è il counter live (secondi interi) — più affidabile di durationMillis dopo unload
      const dur = elapsed > 0 ? elapsed : Math.ceil(((status as any).durationMillis ?? 0) / 1000);
      if (uri && dur >= 1) {
        onSend(uri, dur);
      }
      recordingRef.current = null;
      setElapsed(0);
    } catch { /* silenzioso */ }
  };

  return (
    <View style={rb.wrap}>
      {isRecording && (
        <View style={rb.recordingHint}>
          <View style={rb.recDot} />
          <Text style={rb.recTxt}>{t('chat.recHint', { elapsed })}</Text>
        </View>
      )}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[rb.btn, isRecording && rb.btnActive]}
          onLongPress={startRec}
          onPressOut={stopRec}
          delayLongPress={300}
          activeOpacity={0.85}
        >
          <Text style={rb.icon}>🎤</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Main chat screen ──────────────────────────────────────────────────────────
interface Props {
  conversationId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserAvatar: string;
  onBack: () => void;
  onViewProfile?: (userId: string) => void;
}

export default function ChatScreen({ conversationId, otherUserId, otherUserName, otherUserAvatar, onBack, onViewProfile }: Props) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Messaggio[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingPosition, setPlayingPosition] = useState(0); // secondi, aggiornato live
  const [sending, setSending] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const loadedIdRef = useRef<string | null>(null); // ID del messaggio attualmente caricato nel player
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsub = listenMessaggi(conversationId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => { unsub(); soundRef.current?.unloadAsync(); };
  }, [conversationId]);

  // Segna come ascoltati i messaggi ricevuti quando arrivi nella chat
  useEffect(() => {
    messages
      .filter((m) => m.receiverId === ME() && !m.ascoltato)
      .forEach((m) => segnaAscoltato(m.id, conversationId));
  }, [messages]);

  const handlePlay = useCallback(async (msg: Messaggio) => {
    if (msg.receiverId === ME() && !msg.ascoltato) {
      segnaAscoltato(msg.id, conversationId);
    }

    // Stesso messaggio già caricato: toggle play/pause mantenendo la posizione
    if (loadedIdRef.current === msg.id && soundRef.current) {
      if (playingId === msg.id) {
        await soundRef.current.pauseAsync();
        setPlayingId(null);
      } else {
        await soundRef.current.playAsync();
        setPlayingId(msg.id);
      }
      return;
    }

    // Messaggio diverso: scarica il precedente, carica il nuovo
    await soundRef.current?.unloadAsync();
    soundRef.current = null;
    loadedIdRef.current = null;
    setPlayingPosition(0);
    setPlayingId(msg.id);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const localUri = FileSystem.cacheDirectory + `msg_${msg.id}.m4a`;
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      const needsDownload = !fileInfo.exists || (fileInfo.size !== undefined && fileInfo.size < 100);
      if (needsDownload) {
        if (fileInfo.exists) await FileSystem.deleteAsync(localUri, { idempotent: true });
        await FileSystem.downloadAsync(msg.audioUrl, localUri);
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: localUri },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          setPlayingPosition(Math.floor(status.positionMillis / 1000));
          if (status.didJustFinish) {
            setPlayingId(null);
            setPlayingPosition(0);
            loadedIdRef.current = null;
          }
        },
      );
      soundRef.current = sound;
      loadedIdRef.current = msg.id;
    } catch { setPlayingId(null); }
  }, [playingId, conversationId]);

  const handleDelete = (msg: Messaggio) => {
    Alert.alert(t('chat.deleteMessage'), t('chat.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive', onPress: async () => {
          // Se il messaggio è in riproduzione, fermalo prima
          if (playingId === msg.id) {
            await soundRef.current?.unloadAsync();
            soundRef.current = null;
            loadedIdRef.current = null;
            setPlayingId(null);
            setPlayingPosition(0);
          }
          try {
            await eliminaMessaggio(msg.id, conversationId, msg.audioUrl);
          } catch {
            Alert.alert(t('common.error'), t('chat.errors.cannotDelete'));
          }
        },
      },
    ]);
  };

  const handleSend = async (uri: string, duration: number) => {
    setSending(true);
    try {
      await inviaMessaggio({
        receiverId: otherUserId,
        receiverName: otherUserName,
        receiverAvatar: otherUserAvatar,
        audioUri: uri,
        duration,
      });
    } catch {
      Alert.alert(t('common.error'), t('chat.errors.cannotSend'));
    } finally {
      setSending(false);
    }
  };

  const initial = otherUserName[0]?.toUpperCase() || '?';

  return (
    <View style={cs.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#050508', '#0D0D1A']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={cs.header}>
        <TouchableOpacity onPress={onBack} style={cs.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={cs.backTxt}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onViewProfile?.(otherUserId)}
          activeOpacity={onViewProfile ? 0.7 : 1}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
        >
          <View style={cs.headerAvatar}>
            <Text style={cs.headerAvatarTxt}>{initial}</Text>
          </View>
          <View>
            <Text style={cs.headerName}>{otherUserName}</Text>
            <Text style={cs.headerSub}>{t('chat.voiceMessages')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MessageBubble msg={item} onPlay={handlePlay} onDelete={handleDelete} playingId={playingId} playingPosition={playingPosition} />
        )}
        contentContainerStyle={cs.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={cs.empty}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🎤</Text>
            <Text style={cs.emptyTxt}>{t('chat.holdToRecord')}</Text>
          </View>
        }
      />

      {/* Input bar */}
      <View style={cs.inputBar}>
        <View style={cs.inputHint}>
          <Text style={cs.inputHintTxt}>
            {sending ? t('chat.sending') : t('chat.holdHint')}
          </Text>
        </View>
        {sending
          ? <ActivityIndicator color="#00FF9C" style={{ marginRight: 8 }} />
          : <RecordButton onSend={handleSend} />
        }
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const bs = StyleSheet.create({
  row: { marginVertical: 3, paddingHorizontal: 12 },
  rowRight: { alignItems: 'flex-end' },
  rowLeft: { alignItems: 'flex-start' },
  bubble: { maxWidth: SW * 0.72, borderRadius: 18, padding: 10 },
  bubbleMine: { backgroundColor: '#0D1F14', borderWidth: 1, borderColor: 'rgba(0,255,156,0.3)', borderTopRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#150D2A', borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)', borderTopLeftRadius: 4 },
  soundRef: { fontSize: 11, color: '#9A9A9A', fontFamily: 'monospace', marginBottom: 6 },
  statusReplyTag: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
    borderWidth: 1,
  },
  statusReplyTagMine: {
    backgroundColor: 'rgba(0,255,156,0.12)',
    borderColor: 'rgba(0,255,156,0.35)',
  },
  statusReplyTagTheirs: {
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderColor: 'rgba(168,85,247,0.35)',
  },
  statusReplyTxt: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playCircle: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  playCircleMine: { borderColor: '#00FF9C', backgroundColor: 'rgba(0,255,156,0.1)' },
  playCircleTheirs: { borderColor: '#A855F7', backgroundColor: 'rgba(168,85,247,0.1)' },
  playIcon: { fontSize: 13, fontWeight: '700' },
  durTxt: { fontSize: 11, color: '#9A9A9A', fontFamily: 'monospace', minWidth: 28 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  timeTxt: { fontSize: 9, color: '#858585', fontFamily: 'monospace' },
  check: { fontSize: 11, color: '#858585' },
  checkRead: { color: '#00FF9C' },
});

const rb = StyleSheet.create({
  wrap: { alignItems: 'flex-end', gap: 6 },
  recordingHint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,45,85,0.15)' },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF2D55' },
  recTxt: { color: '#FF2D55', fontSize: 10, fontFamily: 'monospace' },
  btn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,255,156,0.12)', borderWidth: 1.5, borderColor: 'rgba(0,255,156,0.4)', alignItems: 'center', justifyContent: 'center' },
  btnActive: { backgroundColor: 'rgba(255,45,85,0.2)', borderColor: '#FF2D55' },
  icon: { fontSize: 22 },
});

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050508' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,255,156,0.08)' },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#00FF9C', fontSize: 28, fontWeight: '300', lineHeight: 32 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1A0A2E', borderWidth: 1.5, borderColor: 'rgba(168,85,247,0.4)', alignItems: 'center', justifyContent: 'center' },
  headerAvatarTxt: { color: '#A855F7', fontSize: 18, fontStyle: 'italic' },
  headerName: { color: '#fff', fontSize: 15, fontWeight: '600', fontStyle: 'italic' },
  headerSub: { color: '#858585', fontSize: 10, fontFamily: 'monospace' },
  list: { paddingVertical: 12, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyTxt: { color: '#858585', fontSize: 13, fontFamily: 'monospace', textAlign: 'center', lineHeight: 20 },
  inputBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,255,156,0.08)', paddingBottom: 28 },
  inputHint: { flex: 1 },
  inputHintTxt: { color: '#858585', fontSize: 12, fontFamily: 'monospace' },
});
