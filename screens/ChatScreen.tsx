import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, StatusBar, Dimensions, Animated,
  Alert, Vibration, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { auth } from '../firebaseConfig';
import {
  Messaggio, listenMessaggi, inviaMessaggio, inviaTestoMessaggio,
  segnaAscoltato, eliminaMessaggio, genWaveform, toggleReazione,
} from '../services/messaggiService';

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

const REACTION_EMOJIS = ['❤️', '🔥', '🎵', '👏', '😂', '🎤'];
const { width: SW } = Dimensions.get('window');
const ME = () => auth.currentUser?.uid ?? '';

const C = {
  text: '#F7F8FF',
  textDim: '#97A4C7',
  textMute: '#687392',
  cyan: '#67E8F9',
  blue: '#4F7CFF',
  purple: '#8B5CFF',
  pink: '#F472FF',
  red: '#FF5C79',
};

function fmtTime(d: Date) {
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear().toString().slice(-2);
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function previewForMessage(msg: Messaggio, t: (key: string, opts?: object) => string) {
  if (msg.type === 'text') return (msg.text || '').trim().slice(0, 80);
  return t('chat.voicePreview', { seconds: msg.duration ?? 0 });
}

function WaveformBars({ waveform, isPlaying, isMine }: { waveform: number[]; isPlaying: boolean; isMine: boolean }) {
  const color = isMine ? C.cyan : C.purple;
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

function MessageBubble({
  msg,
  onPlay,
  onDelete,
  onReply,
  onReact,
  onToggleMenu,
  menuOpen,
  playingId,
  playingPosition,
}: {
  msg: Messaggio;
  onPlay: (msg: Messaggio) => void;
  onDelete: (msg: Messaggio) => void;
  onReply: (msg: Messaggio) => void;
  onReact: (msg: Messaggio, emoji: string) => void;
  onToggleMenu: (msg: Messaggio) => void;
  menuOpen: boolean;
  playingId: string | null;
  playingPosition: number;
}) {
  const { t } = useTranslation();
  const isMine = msg.senderId === ME();
  const isPlaying = playingId === msg.id;
  const wf = msg.waveform?.length ? msg.waveform : genWaveform(msg.id);
  const color = isMine ? C.cyan : C.purple;
  const myUid = ME();
  const reactionEntries = Object.entries(msg.reactions ?? {}).filter(([, users]) => users.length > 0);

  const durDisplay = isPlaying
    ? `${playingPosition}s / ${msg.duration ?? 0}s`
    : `${msg.duration ?? 0}s`;

  return (
    <View style={[bs.row, isMine ? bs.rowRight : bs.rowLeft]}>
      <TouchableOpacity
        style={[bs.bubble, isMine ? bs.bubbleMine : bs.bubbleTheirs]}
        onPress={() => {
          if (msg.type === 'audio') onPlay(msg);
        }}
        onLongPress={() => onToggleMenu(msg)}
        delayLongPress={280}
        activeOpacity={0.88}
      >
        {msg.replyTo && (
          <View style={[bs.replyCard, isMine ? bs.replyCardMine : bs.replyCardTheirs]}>
            <Text style={bs.replyName}>{msg.replyTo.senderName}</Text>
            <Text style={bs.replyPreview} numberOfLines={1}>{msg.replyTo.preview}</Text>
          </View>
        )}

        {msg.soundTitle && (
          <Text style={bs.soundRef}>🎵 {msg.soundTitle}</Text>
        )}

        {msg.statusReply && (
          <View style={[bs.statusReplyTag, isMine ? bs.statusReplyTagMine : bs.statusReplyTagTheirs]}>
            <Text style={bs.statusReplyTxt}>💬 {msg.statusReplyLabel || t('chat.statusReply')}</Text>
          </View>
        )}

        {msg.type === 'text' ? (
          <Text style={bs.messageText}>{msg.text}</Text>
        ) : (
          <View style={bs.audioRow}>
            <View style={[bs.playCircle, isMine ? bs.playCircleMine : bs.playCircleTheirs]}>
              <Text style={[bs.playIcon, { color }]}>
                {isPlaying ? '⏸' : '▶'}
              </Text>
            </View>
            <WaveformBars waveform={wf} isPlaying={isPlaying} isMine={isMine} />
            <Text style={[bs.durTxt, isPlaying && { color }]}>{durDisplay}</Text>
          </View>
        )}

        {reactionEntries.length > 0 && (
          <View style={bs.reactionsRow}>
            {reactionEntries.map(([emoji, users]) => (
              <TouchableOpacity
                key={emoji}
                style={[bs.reactionChip, users.includes(myUid) && bs.reactionChipActive]}
                onPress={() => onReact(msg, emoji)}
              >
                <Text style={bs.reactionChipTxt}>{emoji} {users.length}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={bs.meta}>
          <Text style={bs.timeTxt}>{fmtTime(msg.timestamp)}</Text>
          {isMine && (
            <Text style={[bs.check, msg.ascoltato && bs.checkRead]}>
              {msg.ascoltato ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {menuOpen && (
        <View style={[bs.menu, isMine ? bs.menuMine : bs.menuTheirs]}>
          <View style={bs.menuEmojiRow}>
            {REACTION_EMOJIS.map((emoji) => (
              <TouchableOpacity key={emoji} style={bs.menuEmojiBtn} onPress={() => onReact(msg, emoji)}>
                <Text style={bs.menuEmojiTxt}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={bs.menuActions}>
            <TouchableOpacity style={bs.menuActionBtn} onPress={() => onReply(msg)}>
              <Text style={bs.menuActionTxt}>{t('chat.reply')}</Text>
            </TouchableOpacity>
            {isMine && (
              <TouchableOpacity style={[bs.menuActionBtn, bs.menuActionBtnDanger]} onPress={() => onDelete(msg)}>
                <Text style={[bs.menuActionTxt, bs.menuActionTxtDanger]}>{t('common.delete')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

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
      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS_AAC);
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
      const dur = elapsed > 0 ? elapsed : Math.ceil(((status as { durationMillis?: number }).durationMillis ?? 0) / 1000);
      if (uri && dur >= 1) onSend(uri, dur);
      recordingRef.current = null;
      setElapsed(0);
    } catch {}
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
  const [playingPosition, setPlayingPosition] = useState(0);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Messaggio['replyTo'] | null>(null);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const loadedIdRef = useRef<string | null>(null);
  const listRef = useRef<FlatList<Messaggio>>(null);

  useEffect(() => {
    const unsub = listenMessaggi(conversationId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => {
      unsub();
      soundRef.current?.unloadAsync();
    };
  }, [conversationId]);

  useEffect(() => {
    messages
      .filter((m) => m.receiverId === ME() && !m.ascoltato)
      .forEach((m) => segnaAscoltato(m.id, conversationId));
  }, [messages, conversationId]);

  const closeMenu = () => setMenuMessageId(null);

  const handlePlay = useCallback(async (msg: Messaggio) => {
    if (msg.type !== 'audio' || !msg.audioUrl) return;

    if (msg.receiverId === ME() && !msg.ascoltato) {
      segnaAscoltato(msg.id, conversationId);
    }

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
    } catch {
      setPlayingId(null);
    }
  }, [playingId, conversationId]);

  const handleDelete = (msg: Messaggio) => {
    closeMenu();
    Alert.alert(t('chat.deleteMessage'), t('chat.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
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

  const buildReplyPayload = (msg: Messaggio) => ({
    id: msg.id,
    senderName: msg.senderId === ME() ? t('messages.you') : otherUserName,
    preview: previewForMessage(msg, t),
  });

  const handleReply = (msg: Messaggio) => {
    setReplyTo(buildReplyPayload(msg));
    closeMenu();
  };

  const handleReact = async (msg: Messaggio, emoji: string) => {
    closeMenu();
    try {
      await toggleReazione(msg.id, emoji);
    } catch {
      Alert.alert(t('common.error'), t('chat.errors.cannotReact'));
    }
  };

  const handleSendAudio = async (uri: string, duration: number) => {
    setSending(true);
    try {
      await inviaMessaggio({
        receiverId: otherUserId,
        receiverName: otherUserName,
        receiverAvatar: otherUserAvatar,
        audioUri: uri,
        duration,
        ...(replyTo ? { replyTo } : {}),
      });
      setReplyTo(null);
      closeMenu();
    } catch {
      Alert.alert(t('common.error'), t('chat.errors.cannotSend'));
    } finally {
      setSending(false);
    }
  };

  const handleSendText = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await inviaTestoMessaggio({
        receiverId: otherUserId,
        receiverName: otherUserName,
        receiverAvatar: otherUserAvatar,
        text: trimmed,
        ...(replyTo ? { replyTo } : {}),
      });
      setText('');
      setReplyTo(null);
      closeMenu();
    } catch {
      Alert.alert(t('common.error'), t('chat.errors.cannotSend'));
    } finally {
      setSending(false);
    }
  };

  const initial = otherUserName[0]?.toUpperCase() || '?';

  return (
    <KeyboardAvoidingView style={cs.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#050508', '#0D0D1A']} style={StyleSheet.absoluteFill} />

      <View style={cs.header}>
        <TouchableOpacity onPress={onBack} style={cs.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={cs.backTxt}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onViewProfile?.(otherUserId)}
          activeOpacity={onViewProfile ? 0.7 : 1}
          style={cs.headerMain}
        >
          <View style={cs.headerAvatar}>
            <Text style={cs.headerAvatarTxt}>{initial}</Text>
          </View>
          <View>
            <Text style={cs.headerName}>{otherUserName}</Text>
            <Text style={cs.headerSub}>{t('chat.privateMessages')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MessageBubble
            msg={item}
            onPlay={handlePlay}
            onDelete={handleDelete}
            onReply={handleReply}
            onReact={handleReact}
            onToggleMenu={(msg) => setMenuMessageId((current) => current === msg.id ? null : msg.id)}
            menuOpen={menuMessageId === item.id}
            playingId={playingId}
            playingPosition={playingPosition}
          />
        )}
        onScrollBeginDrag={closeMenu}
        contentContainerStyle={cs.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={cs.empty}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>💬</Text>
            <Text style={cs.emptyTxt}>{t('chat.empty')}</Text>
          </View>
        }
      />

      <View style={cs.inputShell}>
        {replyTo && (
          <View style={cs.replyBar}>
            <View style={{ flex: 1 }}>
              <Text style={cs.replyBarTitle}>{t('chat.replyingTo', { name: replyTo.senderName })}</Text>
              <Text style={cs.replyBarPreview} numberOfLines={1}>{replyTo.preview}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={cs.replyBarClose}>
              <Text style={cs.replyBarCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={cs.inputBar}>
          <View style={cs.textInputWrap}>
            <TextInput
              style={cs.textInput}
              placeholder={t('chat.textPlaceholder')}
              placeholderTextColor={C.textMute}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={600}
            />
          </View>

          <TouchableOpacity
            style={[cs.sendBtn, (!text.trim() || sending) && cs.sendBtnDisabled]}
            onPress={handleSendText}
            disabled={!text.trim() || sending}
          >
            {sending && text.trim()
              ? <ActivityIndicator color="#08111E" />
              : <Text style={cs.sendBtnTxt}>→</Text>}
          </TouchableOpacity>

          {sending
            ? <ActivityIndicator color={C.cyan} style={{ marginLeft: 6, marginBottom: 12 }} />
            : <RecordButton onSend={handleSendAudio} />}
        </View>

        <Text style={cs.inputHintTxt}>
          {sending ? t('chat.sending') : t('chat.holdHint')}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const bs = StyleSheet.create({
  row: { marginVertical: 3, paddingHorizontal: 12 },
  rowRight: { alignItems: 'flex-end' },
  rowLeft: { alignItems: 'flex-start' },
  bubble: { maxWidth: SW * 0.76, borderRadius: 18, padding: 10 },
  bubbleMine: { backgroundColor: 'rgba(16,28,50,0.96)', borderWidth: 1, borderColor: 'rgba(103,232,249,0.28)', borderTopRightRadius: 4 },
  bubbleTheirs: { backgroundColor: 'rgba(23,17,49,0.96)', borderWidth: 1, borderColor: 'rgba(139,92,255,0.28)', borderTopLeftRadius: 4 },
  soundRef: { fontSize: 11, color: C.textMute, fontFamily: 'monospace', marginBottom: 6 },
  statusReplyTag: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6, borderWidth: 1 },
  statusReplyTagMine: { backgroundColor: 'rgba(103,232,249,0.12)', borderColor: 'rgba(103,232,249,0.3)' },
  statusReplyTagTheirs: { backgroundColor: 'rgba(139,92,255,0.12)', borderColor: 'rgba(139,92,255,0.32)' },
  statusReplyTxt: { color: 'rgba(255,255,255,0.82)', fontSize: 10, fontFamily: 'monospace' },
  replyCard: { borderLeftWidth: 2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  replyCardMine: { backgroundColor: 'rgba(103,232,249,0.08)', borderLeftColor: C.cyan },
  replyCardTheirs: { backgroundColor: 'rgba(139,92,255,0.08)', borderLeftColor: C.purple },
  replyName: { color: C.text, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  replyPreview: { color: C.textDim, fontSize: 11, lineHeight: 15 },
  messageText: { color: C.text, fontSize: 15, lineHeight: 21 },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playCircle: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  playCircleMine: { borderColor: C.cyan, backgroundColor: 'rgba(103,232,249,0.12)' },
  playCircleTheirs: { borderColor: C.purple, backgroundColor: 'rgba(139,92,255,0.1)' },
  playIcon: { fontSize: 13, fontWeight: '700' },
  durTxt: { fontSize: 11, color: C.textMute, fontFamily: 'monospace', minWidth: 28 },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  reactionChip: { borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  reactionChipActive: { borderColor: 'rgba(103,232,249,0.35)', backgroundColor: 'rgba(103,232,249,0.1)' },
  reactionChipTxt: { color: C.text, fontSize: 11 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
  timeTxt: { fontSize: 9, color: C.textMute, fontFamily: 'monospace' },
  check: { fontSize: 11, color: C.textMute },
  checkRead: { color: C.cyan },
  menu: { width: SW * 0.76, marginTop: 6, borderRadius: 18, padding: 10, borderWidth: 1, backgroundColor: 'rgba(7,11,24,0.96)' },
  menuMine: { borderColor: 'rgba(103,232,249,0.22)' },
  menuTheirs: { borderColor: 'rgba(139,92,255,0.22)' },
  menuEmojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  menuEmojiBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  menuEmojiTxt: { fontSize: 18 },
  menuActions: { flexDirection: 'row', gap: 8 },
  menuActionBtn: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  menuActionBtnDanger: { backgroundColor: 'rgba(255,92,121,0.08)' },
  menuActionTxt: { color: C.text, fontSize: 12, fontWeight: '700' },
  menuActionTxtDanger: { color: C.red },
});

const rb = StyleSheet.create({
  wrap: { alignItems: 'flex-end', gap: 6 },
  recordingHint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,45,85,0.15)' },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF2D55' },
  recTxt: { color: '#FF2D55', fontSize: 10, fontFamily: 'monospace' },
  btn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(103,232,249,0.14)', borderWidth: 1.5, borderColor: 'rgba(103,232,249,0.34)', alignItems: 'center', justifyContent: 'center' },
  btnActive: { backgroundColor: 'rgba(255,45,85,0.2)', borderColor: '#FF2D55' },
  icon: { fontSize: 22 },
});

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050816' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(103,232,249,0.08)' },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: C.cyan, fontSize: 28, fontWeight: '300', lineHeight: 32 },
  headerMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(23,17,49,0.96)', borderWidth: 1.5, borderColor: 'rgba(139,92,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  headerAvatarTxt: { color: C.purple, fontSize: 18, fontStyle: 'italic' },
  headerName: { color: C.text, fontSize: 15, fontWeight: '700' },
  headerSub: { color: C.textMute, fontSize: 10, fontFamily: 'monospace' },
  list: { paddingVertical: 12, flexGrow: 1, paddingBottom: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyTxt: { color: C.textMute, fontSize: 13, fontFamily: 'monospace', textAlign: 'center', lineHeight: 20 },
  inputShell: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 22, borderTopWidth: 1, borderTopColor: 'rgba(103,232,249,0.08)' },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 12, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  replyBarTitle: { color: C.cyan, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  replyBarPreview: { color: C.textDim, fontSize: 12 },
  replyBarClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  replyBarCloseTxt: { color: C.text, fontSize: 12 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  textInputWrap: { flex: 1, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 10, minHeight: 52, maxHeight: 120 },
  textInput: { color: C.text, fontSize: 14, lineHeight: 20, padding: 0 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cyan },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnTxt: { color: '#08111E', fontSize: 20, fontWeight: '800' },
  inputHintTxt: { color: C.textMute, fontSize: 12, fontFamily: 'monospace', marginTop: 8 },
});
