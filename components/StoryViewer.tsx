import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, Modal, TouchableOpacity, Animated,
  Dimensions, StyleSheet, StatusBar, TouchableWithoutFeedback, Image, ScrollView,
  Alert, TextInput, Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';

const { width: SW, height: SH } = Dimensions.get('window');
const SCREEN_DURATION = 5000;
const SHEET_HEIGHT = SH * 0.55;

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
  onReplyStatoText?: (params: { statoId: string; ownerUserId: string; text: string }) => Promise<void> | void;
  getViewersForStato?: (statoId: string) => Promise<Array<{ id: string; name: string; avatar: string; photo?: string }>>;
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
  onReplyStatoText,
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
  const [viewers, setViewers] = useState<Array<{ id: string; name: string; avatar: string; photo?: string }>>([]);
  const [showReplySheet, setShowReplySheet] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingTextReply, setSendingTextReply] = useState(false);
  const pressStartRef = useRef<number>(0);
  const wasHoldRef = useRef(false);
  const screenDurationRef = useRef<number>(SCREEN_DURATION);
  const isAudioScreenRef = useRef<boolean>(false);
  const replyRecordingRef = useRef<Audio.Recording | null>(null);
  const replyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewerSheetAnim = useRef(new Animated.Value(0)).current;
  const replySheetAnim = useRef(new Animated.Value(0)).current;
  const swipeHintAnim = useRef(new Animated.Value(0)).current;
  const swipeHintLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

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

  const HOLD_THRESHOLD = 250;

  const handlePressIn = useCallback(() => {
    pressStartRef.current = Date.now();
    wasHoldRef.current = false;
    const t = setTimeout(() => {
      wasHoldRef.current = true;
      setPaused(true);
      animRef.current?.stop();
      soundRef.current?.pauseAsync().catch(() => {});
    }, HOLD_THRESHOLD);
    (pressStartRef as any)._holdTimer = t;
  }, []);

  const handlePressOut = useCallback(() => {
    clearTimeout((pressStartRef as any)._holdTimer);
    if (!wasHoldRef.current) return;
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
    soundRef.current?.playAsync().catch(() => {});
  }, [progressAnim, goForward]);

  // Progress animation
  useEffect(() => {
    if (!visible) return;
    const screen = groups[groupIdx]?.screens?.[screenIdx];
    if (!screen) return;
    progressAnim.setValue(0);
    animRef.current?.stop();
    timerRef.current && clearTimeout(timerRef.current);
    const prevSound = soundRef.current;
    soundRef.current = null;
    setAudioPlaying(false);
    prevSound?.unloadAsync().catch(() => {});
    let cancelled = false;
    isAudioScreenRef.current = !!(screen?.audioUrl);
    screenDurationRef.current = SCREEN_DURATION;

    const startTimer = (duration: number, onFinish: () => void) => {
      screenDurationRef.current = duration;
      animRef.current = Animated.timing(progressAnim, { toValue: 1, duration, useNativeDriver: false });
      animRef.current.start(({ finished }) => { if (finished && !cancelled) onFinish(); });
    };

    if (screen?.audioUrl) {
      let animStarted = false;
      Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true }).catch(() => {});
      Audio.Sound.createAsync({ uri: screen.audioUrl }, { shouldPlay: true }, (status) => {
        if (cancelled || !status.isLoaded) return;
        setAudioPlaying(status.isPlaying ?? false);
        if (!animStarted && status.durationMillis && status.durationMillis > 0) {
          animStarted = true;
          screenDurationRef.current = status.durationMillis;
          progressAnim.setValue(0);
          animRef.current = Animated.timing(progressAnim, { toValue: 1, duration: status.durationMillis, useNativeDriver: false });
          animRef.current.start();
        }
        if (status.didJustFinish) { setAudioPlaying(false); if (!cancelled) goForward(); }
      }).then(({ sound }) => {
        if (cancelled) { sound.unloadAsync().catch(() => {}); return; }
        soundRef.current = sound;
        setAudioPlaying(true);
      }).catch(() => { if (!cancelled) startTimer(SCREEN_DURATION, goForward); });
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
      viewerSheetAnim.setValue(0);
      setShowReplySheet(false);
      replySheetAnim.setValue(0);
      setReplyText('');
    }
  }, [visible, startGroupIndex]);

  // Swipe hint bounce
  useEffect(() => {
    if (!visible || isOwnGroup || isTutorial || showReplySheet) {
      swipeHintLoopRef.current?.stop();
      swipeHintAnim.setValue(0);
      return;
    }
    swipeHintLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(swipeHintAnim, { toValue: -8, duration: 600, useNativeDriver: true }),
        Animated.timing(swipeHintAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    );
    swipeHintLoopRef.current.start();
    return () => { swipeHintLoopRef.current?.stop(); };
  }, [visible, isOwnGroup, isTutorial, showReplySheet]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    return () => {
      if (replyTimerRef.current) clearInterval(replyTimerRef.current);
      replyRecordingRef.current?.stopAndUnloadAsync().catch(() => {});
      replyRecordingRef.current = null;
    };
  }, []);

  const resumeStory = useCallback(() => {
    setPaused(false);
    const currentValue = (progressAnim as any)._value ?? 0;
    if (currentValue < 1) {
      const remaining = Math.max(300, (1 - currentValue) * screenDurationRef.current);
      animRef.current = Animated.timing(progressAnim, { toValue: 1, duration: remaining, useNativeDriver: false });
      if (isAudioScreenRef.current) {
        animRef.current.start();
      } else {
        animRef.current.start(({ finished }) => { if (finished) goForward(); });
      }
    }
    soundRef.current?.playAsync().catch(() => {});
  }, [progressAnim, goForward]);

  const openReplySheet = useCallback(() => {
    setShowReplySheet(true);
    setPaused(true);
    animRef.current?.stop();
    soundRef.current?.pauseAsync().catch(() => {});
    Animated.spring(replySheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }, [replySheetAnim]);

  const closeReplySheet = useCallback(() => {
    Keyboard.dismiss();
    setReplyText('');
    Animated.timing(replySheetAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      setShowReplySheet(false);
      resumeStory();
    });
  }, [replySheetAnim, resumeStory]);

  const sendTextReply = useCallback(async () => {
    if (!replyText.trim() || !screen?.id || !group?.userId) return;
    setSendingTextReply(true);
    try {
      await onReplyStatoText?.({ statoId: screen.id, ownerUserId: group.userId, text: replyText.trim() });
      closeReplySheet();
    } catch {} finally {
      setSendingTextReply(false);
    }
  }, [replyText, screen?.id, group?.userId, onReplyStatoText, closeReplySheet]);

  const startVoiceReply = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync({
        isMeteringEnabled: false,
        android: { extension: '.m4a', outputFormat: Audio.AndroidOutputFormat.MPEG_4, audioEncoder: Audio.AndroidAudioEncoder.AAC, sampleRate: 44100, numberOfChannels: 1, bitRate: 64000 },
        ios: { extension: '.m4a', outputFormat: Audio.IOSOutputFormat.MPEG4AAC, audioQuality: Audio.IOSAudioQuality.MEDIUM, sampleRate: 44100, numberOfChannels: 1, bitRate: 64000 },
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
    if (replyTimerRef.current) { clearInterval(replyTimerRef.current); replyTimerRef.current = null; }
    try {
      await replyRecordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = replyRecordingRef.current.getURI();
      const duration = replySeconds;
      replyRecordingRef.current = null;
      setIsRecordingReply(false);
      if (!uri || !screen?.id || !group?.userId) return;
      setSendingReply(true);
      await onReplyStatoVoice?.({ statoId: screen.id, ownerUserId: group.userId, audioUri: uri, duration });
      closeReplySheet();
    } catch {
      setIsRecordingReply(false);
    } finally {
      setSendingReply(false);
      setReplySeconds(0);
    }
  }, [replySeconds, screen?.id, group?.userId, onReplyStatoVoice, closeReplySheet]);

  const openViewers = useCallback(async () => {
    if (!screen?.id || !isOwnGroup || !getViewersForStato) return;
    const data = await getViewersForStato(screen.id);
    setViewers(data);
    setShowViewers(true);
    setPaused(true);
    animRef.current?.stop();
    soundRef.current?.pauseAsync().catch(() => {});
    Animated.spring(viewerSheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }, [screen?.id, isOwnGroup, getViewersForStato, viewerSheetAnim]);

  const closeViewers = useCallback(() => {
    Animated.timing(viewerSheetAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      setShowViewers(false);
      resumeStory();
    });
  }, [viewerSheetAnim, resumeStory]);

  if (!group || !screen) return null;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />

      <View style={styles.orb} />

      {/* Progress bars */}
      <View style={styles.progressRow}>
        {group.screens.map((_, i) => (
          <View key={i} style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressFill, {
                width: i < screenIdx ? '100%'
                  : i === screenIdx
                    ? progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                    : '0%',
              }]}
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
            <TouchableOpacity style={styles.viewedWidget} onPress={openViewers}>
              <Text style={styles.viewedWidgetText}>{t('stories.viewedBy', { count: screen.seenBy?.length || 0 })}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.headerRight}>
          {isOwnGroup && !isTutorial && screen.id && (
            <TouchableOpacity
              style={styles.menuBtn}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              onPress={() =>
                Alert.alert(t('stories.options'), undefined, [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('stories.deleteStory'),
                    style: 'destructive',
                    onPress: () =>
                      Alert.alert(t('stories.deleteStory'), t('stories.deleteStoryConfirm'), [
                        { text: t('common.cancel'), style: 'cancel' },
                        { text: t('common.delete'), style: 'destructive', onPress: () => onDeleteStato?.(screen.id!) },
                      ]),
                  },
                ])
              }
            >
              <Feather name="more-vertical" size={20} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
            <Feather name="x" size={16} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tap zones */}
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

      {/* Pause indicator */}
      {paused && !showReplySheet && !showViewers && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <Text style={styles.pauseIcon}>⏸</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content} pointerEvents="none">
        <Text style={styles.screenEmoji}>{screen.emoji}</Text>
        {screen.imageUrl ? <Image source={{ uri: screen.imageUrl }} style={styles.storyImage} /> : null}
        <Text style={styles.screenTitle}>{screen.title}</Text>
        {screen.body ? <Text style={styles.screenBody}>{screen.body}</Text> : null}
        {screen.audioUrl && (
          <View style={styles.audioIndicator}>
            <Text style={styles.audioWave}>{audioPlaying ? '▶ 🎵  ▌▌▌▌▌▌▌▌' : t('stories.audioLoading')}</Text>
            {screen.audioDuration && <Text style={styles.audioDuration}>{screen.audioDuration}s</Text>}
          </View>
        )}
      </View>

      {/* Swipe-up reply hint */}
      {!isOwnGroup && !isTutorial && !showReplySheet && (
        <TouchableOpacity style={styles.swipeZone} onPress={openReplySheet} activeOpacity={0.7}>
          <Animated.View style={[styles.swipeHint, { transform: [{ translateY: swipeHintAnim }] }]}>
            <Feather name="chevron-up" size={22} color="rgba(255,255,255,0.6)" />
            <Text style={styles.swipeHintText}>{t('stories.reply')}</Text>
          </Animated.View>
        </TouchableOpacity>
      )}

      {/* Group dots */}
      {groups.length > 1 && (
        <View style={styles.groupDots}>
          {groups.map((_, i) => (
            <View key={i} style={[styles.groupDot, i === groupIdx && styles.groupDotActive]} />
          ))}
        </View>
      )}

      {screenIdx < totalScreens - 1 && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>{t('stories.tapNext')}</Text>
        </View>
      )}

      {/* Viewers sheet */}
      {isOwnGroup && !isTutorial && showViewers && (
        <>
          <TouchableWithoutFeedback onPress={closeViewers}>
            <Animated.View style={[StyleSheet.absoluteFill, {
              backgroundColor: '#000',
              opacity: viewerSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
              zIndex: 18,
            }]} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.bottomSheet, {
            transform: [{ translateY: viewerSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [SHEET_HEIGHT, 0] }) }],
          }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Feather name="eye" size={16} color="rgba(255,255,255,0.5)" />
              <Text style={styles.sheetTitle}>
                {viewers.length === 0
                  ? t('stories.noViews')
                  : t('stories.seenBySheet', { count: viewers.length })}
              </Text>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent} showsVerticalScrollIndicator={false}>
              {viewers.length === 0 ? (
                <View style={styles.sheetEmpty}>
                  <Feather name="eye-off" size={36} color="rgba(255,255,255,0.15)" />
                  <Text style={styles.sheetEmptyText}>{t('stories.noViewsYet')}</Text>
                </View>
              ) : (
                viewers.map((u) => (
                  <View key={u.id} style={styles.sheetRow}>
                    <View style={styles.sheetAvatarWrap}>
                      {u.photo
                        ? <Image source={{ uri: u.photo }} style={styles.sheetAvatarImg} />
                        : <Text style={styles.sheetAvatarEmoji}>{u.avatar}</Text>}
                    </View>
                    <Text style={styles.sheetRowName}>{u.name}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </>
      )}

      {/* Reply sheet */}
      {!isOwnGroup && !isTutorial && showReplySheet && (
        <>
          <TouchableWithoutFeedback onPress={closeReplySheet}>
            <Animated.View style={[StyleSheet.absoluteFill, {
              backgroundColor: '#000',
              opacity: replySheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
              zIndex: 18,
            }]} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.bottomSheet, {
            transform: [{ translateY: replySheetAnim.interpolate({ inputRange: [0, 1], outputRange: [SHEET_HEIGHT, 0] }) }],
          }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Feather name="message-circle" size={16} color="rgba(255,255,255,0.5)" />
              <Text style={styles.sheetTitle}>{t('stories.replyTo', { name: group.label })}</Text>
            </View>

            {/* Story preview */}
            <View style={styles.replyPreview}>
              <Text style={styles.replyPreviewEmoji}>{screen.emoji}</Text>
              <View style={styles.replyPreviewText}>
                <Text style={styles.replyPreviewTitle} numberOfLines={1}>{screen.title}</Text>
                {screen.body ? <Text style={styles.replyPreviewBody} numberOfLines={2}>{screen.body}</Text> : null}
              </View>
            </View>

            <View style={[styles.replyInputArea, { bottom: keyboardHeight }]}>
              {isRecordingReply ? (
                <View style={styles.recordingRow}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingTimer}>{replySeconds}s</Text>
                  <Text style={styles.recordingLabel}>{t('stories.recordingInProgress')}</Text>
                  <TouchableOpacity style={styles.stopVoiceBtn} onPress={stopVoiceReply} disabled={sendingReply}>
                    {sendingReply
                      ? <Text style={styles.stopVoiceBtnText}>{t('stories.replySending')}</Text>
                      : <><Feather name="stop-circle" size={18} color="#FF5C79" /><Text style={styles.stopVoiceBtnText}>{t('stories.stop')}</Text></>}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.replyInputRow}>
                  <TouchableOpacity style={styles.micBtn} onPress={startVoiceReply} disabled={sendingTextReply}>
                    <Feather name="mic" size={20} color="#00FF9C" />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.replyInput}
                    placeholder={t('stories.messagePlaceholder')}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={replyText}
                    onChangeText={setReplyText}
                    multiline
                    maxLength={500}
                    returnKeyType="send"
                    blurOnSubmit
                    onSubmitEditing={sendTextReply}
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, !replyText.trim() && styles.sendBtnDisabled]}
                    onPress={sendTextReply}
                    disabled={!replyText.trim() || sendingTextReply}
                  >
                    <Feather name="send" size={18} color="#000" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Animated.View>
        </>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
  menuBtn: {
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
  // Swipe hint
  swipeZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  swipeHint: {
    alignItems: 'center',
    gap: 4,
  },
  swipeHintText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  // Bottom sheet (shared by viewers + reply)
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#0F0F1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  sheetTitle: {
    color: '#F7F8FF',
    fontSize: 16,
    fontWeight: '700',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  sheetEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    gap: 12,
  },
  sheetEmptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    textAlign: 'center',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  sheetAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sheetAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  sheetAvatarEmoji: {
    fontSize: 20,
  },
  sheetRowName: {
    color: '#F7F8FF',
    fontSize: 15,
    fontWeight: '500',
  },
  // Reply sheet specific
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#00FF9C',
  },
  replyPreviewEmoji: {
    fontSize: 28,
  },
  replyPreviewText: {
    flex: 1,
    gap: 2,
  },
  replyPreviewTitle: {
    color: '#F7F8FF',
    fontSize: 13,
    fontWeight: '700',
  },
  replyPreviewBody: {
    color: 'rgba(247,248,255,0.5)',
    fontSize: 12,
    lineHeight: 17,
  },
  replyInputArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 12,
    backgroundColor: '#0F0F1A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  replyInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,255,156,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyInput: {
    flex: 1,
    color: '#F7F8FF',
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 4,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00FF9C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.35,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,92,121,0.1)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,92,121,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF5C79',
  },
  recordingTimer: {
    color: '#FF5C79',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 28,
  },
  recordingLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  stopVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,92,121,0.2)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stopVoiceBtnText: {
    color: '#FF5C79',
    fontSize: 13,
    fontWeight: '700',
  },
});
