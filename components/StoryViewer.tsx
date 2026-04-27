import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, Modal, TouchableOpacity, Animated,
  Dimensions, StyleSheet, StatusBar, TouchableWithoutFeedback, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';

const { width: SW, height: SH } = Dimensions.get('window');
const SCREEN_DURATION = 5000; // ms per schermata

export interface StoryScreen {
  id?: string;
  emoji: string;
  title: string;
  body: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  seenBy?: Array<{ id: string }>;
}

export interface StoryGroup {
  id: string;
  label: string;
  userId?: string;
  icon?: string;
  color?: string;
  screens: StoryScreen[];
}

interface Props {
  groups: StoryGroup[];
  startGroupIndex?: number;
  visible: boolean;
  onClose: () => void;
  onViewed?: (groupId: string) => void;
  currentUserId?: string;
  onDeleteStato?: (statoId: string) => Promise<void> | void;
  onReplyStatoVoice?: (params: { statoId: string; ownerUserId: string; audioUri: string; duration: number }) => Promise<void> | void;
  getViewersForStato?: (statoId: string) => Promise<Array<{ id: string; name: string; avatar: string }>>;
  onStatoOpened?: (statoId: string) => Promise<void> | void;
}

export default function StoryViewer({
  groups,
  startGroupIndex = 0,
  visible,
  onClose,
  onViewed,
  currentUserId,
  onDeleteStato,
  onReplyStatoVoice,
  getViewersForStato,
  onStatoOpened,
}: Props) {
  const { t } = useTranslation();
  const [groupIdx, setGroupIdx] = useState(startGroupIndex);
  const [screenIdx, setScreenIdx] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [isRecordingReply, setIsRecordingReply] = useState(false);
  const [replySeconds, setReplySeconds] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<Array<{ id: string; name: string; avatar: string }>>([]);
  const pressStartRef = useRef<number>(0);
  const wasHoldRef = useRef(false);
  const screenDurationRef = useRef<number>(SCREEN_DURATION); // durata reale dello screen corrente (ms)
  const isAudioScreenRef = useRef<boolean>(false);          // true se lo screen ha audio
  const replyRecordingRef = useRef<Audio.Recording | null>(null);
  const replyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const group = groups[groupIdx];
  const screen = group?.screens?.[screenIdx];
  const isOwnGroup = !!(group?.userId && currentUserId && group.userId === currentUserId);
  const isTutorial = group?.id?.startsWith('tutorial');
  const totalScreens = group?.screens.length ?? 1;

  const goForward = useCallback(() => {
    if (screenIdx < totalScreens - 1) {
      setScreenIdx((s) => s + 1);
    } else if (groupIdx < groups.length - 1) {
      onViewed?.(group.id);
      setGroupIdx((g) => g + 1);
      setScreenIdx(0);
    } else {
      onViewed?.(group.id);
      onClose();
    }
  }, [screenIdx, totalScreens, groupIdx, groups.length, group, onViewed, onClose]);

  const goBack = useCallback(() => {
    if (screenIdx > 0) {
      setScreenIdx((s) => s - 1);
    } else if (groupIdx > 0) {
      setGroupIdx((g) => g - 1);
      setScreenIdx(0);
    }
  }, [screenIdx, groupIdx]);

  const HOLD_THRESHOLD = 250; // ms: oltre questa durata è un hold, non un tap

  const handlePressIn = useCallback(() => {
    pressStartRef.current = Date.now();
    wasHoldRef.current = false;
    // Pausa solo dopo HOLD_THRESHOLD — evita flickering su tap veloci
    const t = setTimeout(() => {
      wasHoldRef.current = true;
      setPaused(true);
      animRef.current?.stop();
      soundRef.current?.pauseAsync().catch(() => {});
    }, HOLD_THRESHOLD);
    // Salviamo il timer nel ref per poterlo cancellare su tap veloce
    (pressStartRef as any)._holdTimer = t;
  }, []);

  const handlePressOut = useCallback(() => {
    clearTimeout((pressStartRef as any)._holdTimer);
    if (!wasHoldRef.current) return; // tap veloce: non fare nulla qui, ci pensa onPress
    setPaused(false);
    const currentValue = (progressAnim as any)._value ?? 0;
    if (currentValue < 1) {
      // Usa la durata reale dello screen (audio → durationMillis, testo → 5000ms)
      const remaining = Math.max(300, (1 - currentValue) * screenDurationRef.current);
      animRef.current = Animated.timing(progressAnim, {
        toValue: 1,
        duration: remaining,
        useNativeDriver: false,
      });
      if (isAudioScreenRef.current) {
        // Screen audio: non mettere goForward qui, ci pensa didJustFinish sull'audio
        animRef.current.start();
      } else {
        animRef.current.start(({ finished }) => {
          if (finished) goForward();
        });
      }
    }
    soundRef.current?.playAsync().catch(() => {});
  }, [progressAnim, goForward]);

  // Progress animation for current screen
  useEffect(() => {
    if (!visible) return;

    const screen = groups[groupIdx]?.screens?.[screenIdx];
    if (!screen) return;
    progressAnim.setValue(0);
    animRef.current?.stop();
    timerRef.current && clearTimeout(timerRef.current);

    // Pulisce l'audio del screen precedente
    const prevSound = soundRef.current;
    soundRef.current = null;
    setAudioPlaying(false);
    prevSound?.unloadAsync().catch(() => {});

    let cancelled = false;

    // Aggiorna i ref sul tipo di screen corrente
    isAudioScreenRef.current = !!(screen?.audioUrl);
    screenDurationRef.current = SCREEN_DURATION; // default, sovrascritto per audio

    const startTimer = (duration: number, onFinish: () => void) => {
      screenDurationRef.current = duration;
      animRef.current = Animated.timing(progressAnim, {
        toValue: 1,
        duration,
        useNativeDriver: false,
      });
      animRef.current.start(({ finished }) => {
        if (finished && !cancelled) onFinish();
      });
    };

    if (screen?.audioUrl) {
      // Modalità audio: la progress è guidata dalla durata reale dell'audio
      let animStarted = false;

      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      }).catch(() => {});

      Audio.Sound.createAsync(
        { uri: screen.audioUrl },
        { shouldPlay: true },
        (status) => {
          if (cancelled || !status.isLoaded) return;

          setAudioPlaying(status.isPlaying ?? false);

          // Avvia l'animazione una volta che conosciamo la durata reale
          if (!animStarted && status.durationMillis && status.durationMillis > 0) {
            animStarted = true;
            screenDurationRef.current = status.durationMillis; // durata reale audio
            progressAnim.setValue(0);
            animRef.current = Animated.timing(progressAnim, {
              toValue: 1,
              duration: status.durationMillis,
              useNativeDriver: false,
            });
            animRef.current.start();
          }

          if (status.didJustFinish) {
            setAudioPlaying(false);
            if (!cancelled) goForward();
          }
        }
      ).then(({ sound }) => {
        if (cancelled) {
          sound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = sound;
        setAudioPlaying(true);
      }).catch(() => {
        // Audio non caricato → fallback timer 5s
        if (!cancelled) startTimer(SCREEN_DURATION, goForward);
      });
    } else {
      startTimer(SCREEN_DURATION, goForward);
    }

    return () => {
      cancelled = true;
      animRef.current?.stop();
      timerRef.current && clearTimeout(timerRef.current);
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [visible, groupIdx, screenIdx]);

  useEffect(() => {
    if (!visible || isTutorial || isOwnGroup || !screen?.id) return;
    onStatoOpened?.(screen.id);
  }, [visible, screen?.id, isTutorial, isOwnGroup, onStatoOpened]);

  // Reset when opened
  useEffect(() => {
    if (visible) {
      setGroupIdx(startGroupIndex);
      setScreenIdx(0);
      setShowViewers(false);
    }
  }, [visible, startGroupIndex]);

  useEffect(() => {
    return () => {
      if (replyTimerRef.current) clearInterval(replyTimerRef.current);
      replyRecordingRef.current?.stopAndUnloadAsync().catch(() => {});
      replyRecordingRef.current = null;
    };
  }, []);

  const startVoiceReply = useCallback(async () => {
    try {
      // Evita che l'audio della storia finisca nella registrazione.
      setPaused(true);
      animRef.current?.stop();
      await soundRef.current?.pauseAsync().catch(() => {});

      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync({
        isMeteringEnabled: false,
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 64000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MEDIUM,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 64000,
        },
        web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
      });
      replyRecordingRef.current = recording;
      setReplySeconds(0);
      setIsRecordingReply(true);
      replyTimerRef.current = setInterval(() => setReplySeconds((s) => s + 1), 1000);
    } catch {}
  }, []);

  const stopVoiceReply = useCallback(async () => {
    if (!replyRecordingRef.current) return;
    if (replyTimerRef.current) {
      clearInterval(replyTimerRef.current);
      replyTimerRef.current = null;
    }
    try {
      await replyRecordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = replyRecordingRef.current.getURI();
      const duration = replySeconds;
      replyRecordingRef.current = null;
      setIsRecordingReply(false);
      if (!uri || !screen.id || !group?.userId) return;
      setSendingReply(true);
      await onReplyStatoVoice?.({ statoId: screen.id, ownerUserId: group.userId, audioUri: uri, duration });
    } catch {
      setIsRecordingReply(false);
    } finally {
      setSendingReply(false);
      setReplySeconds(0);
      setPaused(false);
      const currentValue = (progressAnim as any)._value ?? 0;
      if (currentValue < 1) {
        const remaining = Math.max(300, (1 - currentValue) * screenDurationRef.current);
        animRef.current = Animated.timing(progressAnim, {
          toValue: 1,
          duration: remaining,
          useNativeDriver: false,
        });
        if (isAudioScreenRef.current) {
          animRef.current.start();
        } else {
          animRef.current.start(({ finished }) => {
            if (finished) goForward();
          });
        }
      }
      await soundRef.current?.playAsync().catch(() => {});
    }
  }, [replySeconds, screen?.id, group?.userId, onReplyStatoVoice, progressAnim, goForward]);

  const toggleViewers = useCallback(async () => {
    if (!screen.id || !isOwnGroup || !getViewersForStato) return;
    if (!showViewers) {
      const data = await getViewersForStato(screen.id);
      setViewers(data);
    }
    setShowViewers((v) => !v);
  }, [screen?.id, isOwnGroup, getViewersForStato, showViewers]);

  if (!group || !screen) return null;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <LinearGradient
        colors={['#050508', '#0D0D1A', '#1A0A2E']}
        style={StyleSheet.absoluteFill}
      />

      {/* Glow orb bioluminescente */}
      <View style={styles.orb} />

      {/* Progress bars */}
      <View style={styles.progressRow}>
        {group.screens.map((_, i) => (
          <View key={i} style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: i < screenIdx ? '100%'
                    : i === screenIdx
                      ? progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                      : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={styles.storyHeader}>
        <View style={styles.headerLeftCol}>
          <View style={styles.storyAuthorRow}>
            <View style={styles.storyAvatarSmall}>
              <Text style={styles.storyAvatarEmoji}>{group.icon || '❓'}</Text>
            </View>
            <Text style={styles.storyAuthorName}>{group.label}</Text>
          </View>
          {isOwnGroup && !isTutorial && (
            <TouchableOpacity style={styles.viewedWidget} onPress={toggleViewers}>
              <Text style={styles.viewedWidgetText}>{t('stories.viewedBy', { count: screen.seenBy?.length || 0 })}</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
          <Feather name="x" size={16} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      </View>

      {/* Tap zones — pressIn/Out per pausa */}
      <View style={styles.tapZones} pointerEvents="box-none">
        <TouchableWithoutFeedback
          onPress={() => { if (!wasHoldRef.current) goBack(); }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <View style={styles.tapLeft} />
        </TouchableWithoutFeedback>
        <TouchableWithoutFeedback
          onPress={() => { if (!wasHoldRef.current) goForward(); }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <View style={styles.tapRight} />
        </TouchableWithoutFeedback>
      </View>

      {/* Indicatore pausa */}
      {paused && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <Text style={styles.pauseIcon}>⏸</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content} pointerEvents="none">
        <Text style={styles.screenEmoji}>{screen.emoji}</Text>
        {screen.imageUrl ? (
          <Image source={{ uri: screen.imageUrl }} style={styles.storyImage} />
        ) : null}
        <Text style={styles.screenTitle}>{screen.title}</Text>
        {screen.body ? <Text style={styles.screenBody}>{screen.body}</Text> : null}
        {screen.audioUrl && (
          <View style={styles.audioIndicator}>
            <Text style={styles.audioWave}>
              {audioPlaying ? '▶ 🎵  ▌▌▌▌▌▌▌▌' : t('stories.audioLoading')}
            </Text>
            {screen.audioDuration && (
              <Text style={styles.audioDuration}>{screen.audioDuration}s</Text>
            )}
          </View>
        )}
      </View>

      {!isTutorial && (
        <View style={styles.actionsBar}>
          {isOwnGroup && screen.id ? (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => onDeleteStato?.(screen.id!)}
            >
              <Text style={styles.deleteBtnText}>{t('common.delete')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.replyToggle}
                onPress={isRecordingReply ? stopVoiceReply : startVoiceReply}
                disabled={sendingReply}
              >
                <Text style={styles.replyToggleText}>
                  {sendingReply ? t('stories.replySending') : isRecordingReply ? t('stories.replyStop', { seconds: replySeconds }) : t('stories.replyVoice')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {isOwnGroup && !isTutorial && showViewers && (
        <View style={styles.viewersOverlay}>
          <View style={styles.viewersPanelTop}>
            {viewers.length === 0 ? (
              <Text style={styles.viewersEmpty}>{t('stories.noViews')}</Text>
            ) : (
              viewers.slice(0, 8).map((u) => (
                <Text key={u.id} style={styles.viewerItem}>{u.avatar} {u.name}</Text>
              ))
            )}
          </View>
        </View>
      )}

      {/* Group dots (se ci sono più group) */}
      {groups.length > 1 && (
        <View style={styles.groupDots}>
          {groups.map((_, i) => (
            <View key={i} style={[styles.groupDot, i === groupIdx && styles.groupDotActive]} />
          ))}
        </View>
      )}

      {/* Swipe hint */}
      {screenIdx < totalScreens - 1 && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>tap → avanti</Text>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(0,255,156,0.06)',
    bottom: -80,
    right: -80,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 8,
    zIndex: 10,
  },
  progressTrack: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00FF9C',
    borderRadius: 1,
  },
  storyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 10,
  },
  headerLeftCol: {
    flex: 1,
    gap: 8,
  },
  storyAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  storyAvatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#00FF9C',
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatarEmoji: {
    fontSize: 17,
  },
  storyAuthorName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewedWidget: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,255,156,0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  viewedWidgetText: {
    color: '#00FF9C',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tapZones: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    bottom: 130,
    flexDirection: 'row',
    zIndex: 5,
  },
  tapLeft: {
    width: '40%',
    height: '100%',
  },
  tapRight: {
    width: '60%',
    height: '100%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 6,
  },
  screenEmoji: {
    fontSize: 80,
    marginBottom: 32,
  },
  screenTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#00FF9C',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  screenBody: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 28,
  },
  groupDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 32,
    zIndex: 10,
  },
  groupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  groupDotActive: {
    backgroundColor: '#00FF9C',
    width: 18,
  },
  hint: {
    position: 'absolute',
    bottom: 100,
    right: 24,
    zIndex: 10,
  },
  hintText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: '500',
  },
  pauseOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  pauseIcon: {
    fontSize: 56,
    opacity: 0.6,
  },
  audioIndicator: {
    marginTop: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(0,255,156,0.09)',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.25)',
  },
  audioWave: {
    color: '#00FF9C',
    fontSize: 13,
    letterSpacing: 3,
    fontWeight: '600',
  },
  audioDuration: {
    color: 'rgba(0,255,156,0.5)',
    fontSize: 11,
    marginTop: 4,
  },
  storyImage: {
    width: Math.min(SW - 64, 320),
    height: Math.min(SH * 0.3, 260),
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  actionsBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 40,
    zIndex: 15,
  },
  replyToggle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,255,156,0.12)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.30)',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  replyToggleText: {
    color: '#00FF9C',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  deleteBtn: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,77,77,0.15)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  deleteBtnText: {
    color: '#ff6b6b',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
  },
  viewersOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 96,
    zIndex: 18,
  },
  viewersPanelTop: {
    maxWidth: 280,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  viewersEmpty: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    textAlign: 'center',
  },
  viewerItem: {
    color: '#fff',
    fontSize: 12,
    paddingVertical: 2,
  },
});
