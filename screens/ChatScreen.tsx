import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, StatusBar, Dimensions, Animated, Image,
  Alert, Vibration, TextInput, KeyboardAvoidingView, Platform, Keyboard, AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../firebaseConfig';
import {
  Messaggio, listenMessaggi, inviaMessaggio, inviaTestoMessaggio,
  segnaAscoltato, eliminaMessaggio, genWaveform, toggleReazione,
  setTypingStatus, listenTyping,
} from '../services/messaggiService';
import { blockUser, unblockUser, listenBlockedUsers } from '../services/blockService';
import { useCall } from '../context/CallContext';
import {
  initE2EKeys, getMySecretKey, getMyPublicKeyB64,
  decryptForConversation, openAudioKey, decryptAudioBytes,
  computeSharedKey, decodeBase64, encodeBase64,
} from '../services/e2eService';

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
  if (msg.type === 'text') {
    if (msg.enc && !msg.text) return '🔒 Messaggio cifrato';
    return (msg.text || '').trim().slice(0, 80);
  }
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
  openUpwards,
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
  openUpwards: boolean;
  playingId: string | null;
  playingPosition: number;
}) {
  const { t } = useTranslation();
  const isMine = msg.senderId === ME();

  if (msg.isDeleted) {
    return (
      <View style={[bs.row, isMine ? bs.rowRight : bs.rowLeft]}>
        <View style={[bs.bubble, isMine ? bs.bubbleMine : bs.bubbleTheirs, { opacity: 0.45 }]}>
          <Text style={[bs.messageText, { fontStyle: 'italic', color: '#7A8099' }]}>
            🗑 Messaggio eliminato
          </Text>
        </View>
      </View>
    );
  }

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
      {menuOpen && openUpwards && (
        <View style={[bs.menu, isMine ? bs.menuMine : bs.menuTheirs, bs.menuAbove]}>
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

      {menuOpen && !openUpwards && (
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

function RecordButton({ onSend, onStartRecording, onStopRecording }: {
  onSend: (uri: string, duration: number) => void;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
}) {
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
      onStartRecording?.();
    } catch {
      Alert.alert(t('common.error'), t('chat.errors.cannotRecord'));
    }
  };

  const stopRec = async () => {
    if (!recordingRef.current || !isRecording) return;
    clearInterval(timerRef.current!);
    setIsRecording(false);
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 8 }).start();
    onStopRecording?.();
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
  otherUserPhoto?: string;
  onBack: () => void;
  onViewProfile?: (userId: string) => void;
}

export default function ChatScreen({ conversationId, otherUserId, otherUserName, otherUserAvatar, otherUserPhoto, onBack, onViewProfile }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Messaggio[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingPosition, setPlayingPosition] = useState(0);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Messaggio['replyTo'] | null>(null);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const loadedIdRef = useRef<string | null>(null);
  const listRef = useRef<FlatList<Messaggio>>(null);
  const autoScrollRef = useRef(true);
  const isFirstRenderRef = useRef(true);
  const lastMessageIdRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const mySecretKeyRef = useRef<Uint8Array | null>(null);
  const myPublicKeyB64Ref = useRef<string | null>(null);
  const myUidRef = useRef<string>(auth.currentUser?.uid ?? '');
  const [e2eReady, setE2eReady] = useState(false);
  const { initiateCall, phase: callPhase } = useCall();

  useEffect(() => {
    (async () => {
      try { await initE2EKeys(); } catch {}
      setE2eReady(true);
      let sk: Uint8Array | null = null;
      let pkB64: string | null = null;
      try { sk = await getMySecretKey(); } catch {}
      try { pkB64 = await getMyPublicKeyB64(); } catch {}
      mySecretKeyRef.current = sk;
      myPublicKeyB64Ref.current = pkB64;
      try {
        setMessages((prev) => prev.map((m) => decryptMsg(m, sk, pkB64, myUidRef.current)));
      } catch {}
    })();
  }, []);

  function decryptMsg(
    msg: Messaggio,
    sk: Uint8Array | null,
    myPkB64: string | null,
    myUid: string,
  ): Messaggio {
    if (!msg.enc || !msg.n || !msg.spk || !msg.rpk || !sk) return msg;
    const plain = decryptForConversation(msg.enc, msg.n, msg.spk, msg.rpk, myUid, msg.senderId, sk);
    if (plain !== null) return { ...msg, text: plain };

    // Decifra fallita: capisce se e' un problema di chiave ruotata
    const myPkInMsg = msg.senderId === myUid ? msg.spk : msg.rpk;
    if (myPkB64 && myPkInMsg !== myPkB64) {
      return { ...msg, text: '🔐 Messaggio di un dispositivo precedente' };
    }
    return { ...msg, text: '🔒 [Impossibile decifrare]' };
  }

  useEffect(() => {
    isFirstRenderRef.current = true;
    autoScrollRef.current = true;
    setQueryError(null);
    const unsub = listenMessaggi(conversationId, (msgs) => {
      setQueryError(null);
      const prevLastId = lastMessageIdRef.current;
      const sk = mySecretKeyRef.current;
      const myUid = myUidRef.current;
      const nextLastId = msgs[msgs.length - 1]?.id;
      lastMessageIdRef.current = nextLastId ?? null;
      setMessages(msgs.map((m) => decryptMsg(m, sk, myPublicKeyB64Ref.current, myUid)));
      if (!isFirstRenderRef.current && (autoScrollRef.current || prevLastId !== nextLastId)) {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    }, (err) => {
      console.error('[MESSAGGI] listenMessaggi error:', err.code, err.message);
      setQueryError(err.code);
    });
    return () => {
      unsub();
      soundRef.current?.unloadAsync();
    };
  }, [conversationId]);

  useEffect(() => {
    if (callPhase === 'incoming' || callPhase === 'connecting' || callPhase === 'ringing' || callPhase === 'active') {
      soundRef.current?.stopAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      loadedIdRef.current = null;
      setPlayingId(null);
    }
  }, [callPhase]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => {
      setKeyboardVisible(true);
      closeMenu();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background' && state !== 'inactive') return;
      FileSystem.readDirectoryAsync(FileSystem.cacheDirectory!).then((files) => {
        for (const f of files) {
          if (f.startsWith('msg_') && f.endsWith('_dec.m4a')) {
            FileSystem.deleteAsync(FileSystem.cacheDirectory + f, { idempotent: true }).catch(() => {});
          }
        }
      }).catch(() => {});
    });
    return () => sub.remove();
  }, []);

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

      // Percorso finale da riprodurre (m4a in chiaro)
      let playUri: string;

      if (msg.audioEncrypted && msg.encAudioKey && msg.encAudioKeyNonce && msg.spk && msg.rpk) {
        // Audio E2E: verifica cache decifrata
        const decUri = FileSystem.cacheDirectory + `msg_${msg.id}_dec.m4a`;
        const decInfo = await FileSystem.getInfoAsync(decUri);

        if (!decInfo.exists || (decInfo.size !== undefined && decInfo.size < 100)) {
          // Scarica il file cifrato in un temporaneo
          const encUri = FileSystem.cacheDirectory + `msg_${msg.id}.enc`;
          const encInfo = await FileSystem.getInfoAsync(encUri);
          if (!encInfo.exists) {
            await FileSystem.downloadAsync(msg.audioUrl, encUri);
          }

          // Decifra
          const sk = mySecretKeyRef.current;
          if (!sk) throw new Error('Chiave E2E non disponibile');
          const myUid = myUidRef.current;
          const theirPK = myUid === msg.senderId
            ? decodeBase64(msg.rpk)
            : decodeBase64(msg.spk);
          const sharedKey = computeSharedKey(theirPK, sk);
          const keyPair = openAudioKey(msg.encAudioKey, msg.encAudioKeyNonce, sharedKey);
          if (!keyPair) throw new Error('Impossibile aprire la chiave audio');
          const encB64 = await FileSystem.readAsStringAsync(encUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const decBytes = decryptAudioBytes(decodeBase64(encB64), keyPair.audioKey, keyPair.audioNonce);
          if (!decBytes) throw new Error('Decifratura audio fallita');
          await FileSystem.writeAsStringAsync(decUri, encodeBase64(decBytes), {
            encoding: FileSystem.EncodingType.Base64,
          });
          // Pulizia file cifrato dalla cache
          FileSystem.deleteAsync(encUri, { idempotent: true }).catch(() => {});
        }
        playUri = decUri;
      } else {
        // Audio non cifrato (legacy)
        const localUri = FileSystem.cacheDirectory + `msg_${msg.id}.m4a`;
        const fileInfo = await FileSystem.getInfoAsync(localUri);
        if (!fileInfo.exists || (fileInfo.size !== undefined && fileInfo.size < 100)) {
          if (fileInfo.exists) await FileSystem.deleteAsync(localUri, { idempotent: true });
          await FileSystem.downloadAsync(msg.audioUrl!, localUri);
        }
        playUri = localUri;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: playUri },
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
    if (!trimmed || sendingRef.current) return;

    sendingRef.current = true;
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
      setTypingStatus(conversationId, false).catch(() => {});
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      closeMenu();
    } catch {
      Alert.alert(t('common.error'), t('chat.errors.cannotSend'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const [isBlocked, setIsBlocked] = useState(false);
  const [otherTypingStatus, setOtherTypingStatus] = useState<'typing' | 'recording' | false>(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    const unsub = listenBlockedUsers(myUid, (ids) => setIsBlocked(ids.includes(otherUserId)));
    return unsub;
  }, [otherUserId]);

  useEffect(() => {
    const unsub = listenTyping(conversationId, otherUserId, setOtherTypingStatus);
    return () => {
      unsub();
      setTypingStatus(conversationId, false).catch(() => {});
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [conversationId, otherUserId]);

  const handleBlockMenu = () => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    if (isBlocked) {
      Alert.alert(
        t('chat.unblockTitle', { name: otherUserName }),
        t('chat.unblockConfirm'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('chat.unblock'),
            onPress: () => unblockUser(myUid, otherUserId).catch(() => {}),
          },
        ],
      );
    } else {
      Alert.alert(
        t('chat.blockTitle', { name: otherUserName }),
        t('chat.blockConfirm'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('chat.block'),
            style: 'destructive',
            onPress: () => blockUser(myUid, otherUserId).catch(() => {}),
          },
        ],
      );
    }
  };

  const initial = otherUserName[0]?.toUpperCase() || '?';
  const listBottomPadding = keyboardVisible ? 8 : 16;

  return (
    <KeyboardAvoidingView
      style={cs.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
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
          {otherUserPhoto ? (
            <Image source={{ uri: otherUserPhoto }} style={cs.headerAvatarImg} />
          ) : (
            <View style={cs.headerAvatar}>
              {/^[a-z][a-z-]*$/.test(otherUserAvatar) ? (
                <Feather name={otherUserAvatar as any} size={18} color={C.purple} />
              ) : otherUserAvatar ? (
                <Text style={cs.headerAvatarEmoji}>{otherUserAvatar}</Text>
              ) : (
                <Text style={cs.headerAvatarTxt}>{initial}</Text>
              )}
            </View>
          )}
          <View>
            <Text style={cs.headerName}>{otherUserName}</Text>
            <Text style={cs.headerSub}>{t('chat.privateMessages')}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[cs.callBtn, !!callPhase && cs.callBtnDisabled]}
          onPress={() => initiateCall(otherUserId, otherUserName, otherUserAvatar)}
          disabled={!!callPhase}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={cs.callBtnTxt}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={cs.menuBtn}
          onPress={handleBlockMenu}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[cs.menuBtnTxt, isBlocked && { color: C.red }]}>⋯</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={cs.e2eBanner}
        onPress={() => Alert.alert(
          e2eReady ? '🔒 Crittografia end-to-end' : '⚠️ Crittografia',
          e2eReady
            ? 'I messaggi e i vocali in questa chat sono cifrati con crittografia end-to-end (X25519 + XSalsa20-Poly1305).\n\nSolo tu e il tuo interlocutore potete leggerli. MIUSLYK non ha accesso al contenuto.'
            : 'Inizializzazione crittografia in corso. I messaggi saranno cifrati non appena le chiavi sono pronte.',
          [{ text: 'OK' }],
        )}
        activeOpacity={0.7}
      >
        <Text style={[cs.e2eBannerTxt, { color: e2eReady ? '#00FF9C' : C.textMute }]}>
          {e2eReady ? '🔒 Crittografia end-to-end attiva  ›' : '⏳ Crittografia in inizializzazione...'}
        </Text>
      </TouchableOpacity>

      {queryError && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(255,92,121,0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,92,121,0.25)' }}>
          <Text style={{ color: '#FF5C79', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
            {queryError === 'failed-precondition'
              ? '⚠️ Indice Firestore mancante — esegui: firebase deploy --only firestore:indexes'
              : queryError === 'permission-denied'
              ? '⚠️ Accesso negato — esegui: firebase deploy --only firestore:rules'
              : `⚠️ Errore caricamento messaggi: ${queryError}`}
          </Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <MessageBubble
            msg={item}
            onPlay={handlePlay}
            onDelete={handleDelete}
            onReply={handleReply}
            onReact={handleReact}
            onToggleMenu={(msg) => setMenuMessageId((current) => {
              if (current === msg.id) return null;
              autoScrollRef.current = false;
              setTimeout(() => {
                try {
                  listRef.current?.scrollToItem({ item: msg, animated: true, viewPosition: 0.35 });
                } catch {}
              }, 50);
              return msg.id;
            })}
            menuOpen={menuMessageId === item.id}
            openUpwards={messages.slice(-2).some((m) => m.id === item.id)}
            playingId={playingId}
            playingPosition={playingPosition}
          />
        )}
        onContentSizeChange={() => {
          if (isFirstRenderRef.current) {
            listRef.current?.scrollToEnd({ animated: false });
            isFirstRenderRef.current = false;
          }
        }}
        onScrollBeginDrag={closeMenu}
        onScroll={({ nativeEvent }) => {
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          autoScrollRef.current = distanceFromBottom < 120;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[cs.list, { paddingBottom: listBottomPadding }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={cs.empty}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>💬</Text>
            <Text style={cs.emptyTxt}>{t('chat.empty')}</Text>
          </View>
        }
      />

      {!!otherTypingStatus && (
        <View style={cs.typingBubble}>
          <Text style={cs.typingTxt}>
            {otherUserName} {otherTypingStatus === 'recording' ? 'sta registrando...' : 'sta scrivendo...'}
          </Text>
        </View>
      )}

      <View style={[cs.inputShell, { paddingBottom: Math.max(insets.bottom + 10, 22) }]}>
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
              onChangeText={(val) => {
                setText(val);
                if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                setTypingStatus(conversationId, val.length > 0 ? 'typing' : false).catch(() => {});
                if (val.length > 0) {
                  typingTimerRef.current = setTimeout(() => {
                    setTypingStatus(conversationId, false).catch(() => {});
                  }, 8000);
                }
              }}
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
            : <RecordButton
                onSend={handleSendAudio}
                onStartRecording={() => setTypingStatus(conversationId, 'recording').catch(() => {})}
                onStopRecording={() => setTypingStatus(conversationId, false).catch(() => {})}
              />}
        </View>

        {!keyboardVisible && (
          <Text style={cs.inputHintTxt}>
            {sending ? t('chat.sending') : t('chat.holdHint')}
          </Text>
        )}
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
  menuAbove: { marginTop: 0, marginBottom: 6 },
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
  headerAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarTxt: { color: C.purple, fontSize: 18, fontStyle: 'italic' },
  headerAvatarEmoji: { fontSize: 20 },
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
  e2eBanner: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 10, marginBottom: 4 },
  e2eBannerTxt: { color: C.textMute, fontSize: 11, fontFamily: 'monospace', textAlign: 'center', lineHeight: 16 },
  typingBubble: { alignSelf: 'flex-start', marginHorizontal: 12, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(139,92,255,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(139,92,255,0.2)' },
  typingTxt: { color: C.textDim, fontSize: 12, fontStyle: 'italic' },
  callBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,255,156,0.1)', borderWidth: 1, borderColor: 'rgba(0,255,156,0.25)', alignItems: 'center', justifyContent: 'center' },
  callBtnDisabled: { opacity: 0.3 },
  callBtnTxt: { fontSize: 16 },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  menuBtnTxt: { fontSize: 22, color: C.textDim, lineHeight: 22 },
});
