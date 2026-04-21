import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Animated, Easing, Modal, TextInput,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { auth, storage } from '../firebaseConfig';
import { getRecentStati, createStato, StatiGroup, deleteStato, getStatoViewers, markStatoViewed } from '../services/statiService';
import { inviaMessaggio } from '../services/messaggiService';
import StoryViewer, { StoryGroup } from './StoryViewer';

const MAX_RECORDING_SECONDS = 15;

const RECORDING_OPTIONS_AAC: Audio.RecordingOptions = {
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
};

// ─── Tutorial stories (hardcoded) ────────────────────────────────────────────
const TUTORIAL_GROUPS: StoryGroup[] = [
  {
    id: 'tutorial_sound',
    label: 'Pubblica un suono',
    icon: '🎤',
    screens: [
      { emoji: '🎤', title: 'Registra', body: 'Tieni premuto il pulsante grande\nper catturare fino a 30 secondi\ndi audio' },
      { emoji: '🎵', title: 'Titolo & Mood', body: 'Dai un nome al suono\ne scegli il mood che\nlo descrive meglio' },
      { emoji: '📍', title: 'Posizione', body: 'Il suono viene geo-taggato\ne appare sulla mappa mondiale\nin tempo reale' },
      { emoji: '🌍', title: 'Nel feed', body: 'Tutti gli utenti vicino a te\npossono ascoltarlo\nnel loro feed' },
    ],
  },
  {
    id: 'tutorial_map',
    label: 'Usa la mappa',
    icon: '🗺️',
    screens: [
      { emoji: '🗺️', title: 'Mappa mondiale', body: 'Ogni punto sulla mappa\nè un suono reale registrato\nin quel posto' },
      { emoji: '👆', title: 'Tap sui punti', body: 'Tocca qualsiasi punto\nper ascoltare il suono\ndi quel luogo' },
      { emoji: '🔍', title: 'Esplora', body: 'Zoom in e out per scoprire\nsuoni nascosti nelle\ncittà di tutto il mondo' },
      { emoji: '🎯', title: 'Sei sulla mappa', body: 'I tuoi suoni appaiono\nautomaticamente nella\ntua posizione attuale' },
    ],
  },
  {
    id: 'tutorial_challenges',
    label: 'Le Sfide',
    icon: '🏆',
    screens: [
      { emoji: '🏆', title: 'Sfide settimanali', body: 'Ogni settimana una nuova\nsfida sonora con tema\ndiverso per tutti' },
      { emoji: '🎤', title: 'Partecipa', body: 'Registra un suono che risponde\nalla sfida e\nsottomettilo' },
      { emoji: '❤️', title: 'Vota', body: 'Dai like ai suoni\ndegli altri partecipanti\nper farli vincere' },
      { emoji: '🥇', title: 'Vinci', body: 'I suoni con più like\nvincono la sfida\ndella settimana' },
    ],
  },
  {
    id: 'tutorial_communities',
    label: 'Community',
    icon: '👥',
    screens: [
      { emoji: '👥', title: 'Community', body: 'Gruppi di persone unite\nda interessi sonori\ncomuni' },
      { emoji: '🎵', title: 'Unisciti', body: 'Entra nelle community\nche rispecchiano\ni tuoi gusti' },
      { emoji: '📻', title: 'Condividi', body: 'Pubblica suoni\ndirettamente nella\ncommunity' },
      { emoji: '🔔', title: 'Aggiornamenti', body: 'Ricevi notifiche dai\nnuovi suoni della\ncommunity' },
    ],
  },
];

// ─── Animated border ring ─────────────────────────────────────────────────────
function AnimatedRing({ viewed }: { viewed: boolean }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (viewed) return;
    const anim = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [viewed]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  if (viewed) {
    return <View style={[styles.ring, styles.ringViewed]} />;
  }

  return (
    <Animated.View style={[styles.ring, { transform: [{ rotate }] }]}>
      <View style={styles.ringGradient} />
    </Animated.View>
  );
}

// ─── Story circle item ─────────────────────────────────────────────────────────
function StoryCircle({
  emoji, label, viewed, onPress,
}: { emoji: string; label: string; viewed: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.circleWrap} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.circleOuter}>
        <AnimatedRing viewed={viewed} />
        <View style={styles.circleInner}>
          <Text style={styles.circleEmoji}>{emoji}</Text>
        </View>
      </View>
      <Text style={styles.circleLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

const EMOJI_OPTIONS = ['🎵','🎤','🎸','🥁','🎹','🎺','🎻','🔊','🎧','🌍','🌙','⚡','🔥','💫','🌊','🎭','📻','🎙️'];

// ─── Main component ────────────────────────────────────────────────────────────
export default function StoriesRow({ userProfile }: { userProfile?: any }) {
  const { t } = useTranslation();
  const [viewerVisible, setViewerVisible] = useState(false);
  const [activeGroups, setActiveGroups] = useState<StoryGroup[]>([]);
  const [startIdx, setStartIdx] = useState(0);
  const [viewedTutorial, setViewedTutorial] = useState(false);
  const [userStati, setUserStati] = useState<StatiGroup[]>([]);
  const [viewedStati, setViewedStati] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // Creazione stato
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState('🎵');
  const [statoTitle, setStatoTitle] = useState('');
  const [statoBody, setStatoBody] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [titleError, setTitleError] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  // Registrazione audio
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadUserStati();
  }, []);

  const loadUserStati = async () => {
    try {
      const uid = auth.currentUser?.uid;
      const stati = await getRecentStati();
      
      let followingSet = new Set<string>();
      if (uid) {
        try {
          const { getFollowingList } = require('../services/firebaseService');
          const following = await getFollowingList(uid);
          followingSet = new Set(following.map((f: any) => f.id));
          setFollowingIds(followingSet);
        } catch (err) {
          console.error("Errore caricamento following per storie:", err);
        }
      }

      const viewedSet = new Set<string>();
      stati.forEach(group => {
        const allSeen = group.screens.every(s => s.seenBy?.includes(uid || ''));
        if (allSeen) viewedSet.add(group.id);
      });
      setViewedStati(viewedSet);

      const sortedStati = [...stati].sort((a, b) => {
        const aViewed = viewedSet.has(a.id);
        const bViewed = viewedSet.has(b.id);
        const aFollowed = followingSet.has(a.userId);
        const bFollowed = followingSet.has(b.userId);

        if (aViewed !== bViewed) return aViewed ? 1 : -1;
        if (aFollowed !== bFollowed) return aFollowed ? -1 : 1;
        return 0;
      });

      setUserStati(sortedStati);
    } catch (e) {
      // silenzioso
    }
  };

  const openTutorial = () => {
    setActiveGroups(TUTORIAL_GROUPS);
    setStartIdx(0);
    setViewerVisible(true);
  };

  const openUserStory = (group: StatiGroup) => {
    setActiveGroups([group as unknown as StoryGroup]);
    setStartIdx(0);
    setViewerVisible(true);
  };

  const handleViewed = (groupId: string) => {
    if (groupId.startsWith('tutorial')) {
      setViewedTutorial(true);
    } else {
      // Aggiorna lo stato locale e ricarica per ri-ordinare
      setViewedStati((prev) => {
        const next = new Set(prev);
        next.add(groupId);
        return next;
      });
      // Facciamo un caricamento leggero o ri-ordiniamo i dati esistenti
      loadUserStati();
    }
  };

  const openCreate = () => {
    setSelectedEmoji('🎵');
    setStatoTitle('');
    setStatoBody('');
    setTitleError('');
    setRecordedUri(null);
    setSelectedImageUri(null);
    setRecordingSeconds(0);
    setIsRecording(false);
    setCreateVisible(true);
  };

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { setTitleError(t('stories.permissionDenied')); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS_AAC);
      recordingRef.current = recording;
      setRecordedUri(null);
      setRecordingSeconds(0);
      setIsRecording(true);
      const secondsRef = { current: 0 };
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setRecordingSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_RECORDING_SECONDS) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          stopRecording();
        }
      }, 1000);
    } catch (e) {
      setTitleError(t('stories.recordingError'));
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      if (uri) setRecordedUri(uri);
    } catch (e) {
      setIsRecording(false);
    }
  };

  const discardRecording = () => {
    setRecordedUri(null);
    setRecordingSeconds(0);
  };

  const uploadAudio = async (uri: string, uid: string): Promise<{ url: string; duration: number }> => {
    const fileName = `stati/${uid}/${Date.now()}.m4a`;
    const token = await auth.currentUser!.getIdToken();
    const bucket = storage.app.options.storageBucket as string;
    const encodedPath = encodeURIComponent(fileName);
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`;
    const result = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: 'POST',
      headers: { 'Content-Type': 'audio/mp4', Authorization: `Bearer ${token}` },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (result.status < 200 || result.status >= 300) throw new Error(`Upload failed: ${result.status}`);
    const data = JSON.parse(result.body);
    const audioUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${data.downloadTokens}`;
    return { url: audioUrl, duration: recordingSeconds };
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setTitleError(t('stories.galleryPermissionDenied'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setSelectedImageUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string, uid: string): Promise<string> => {
    const fileName = `stati/${uid}/${Date.now()}_photo.jpg`;
    const token = await auth.currentUser!.getIdToken();
    const bucket = storage.app.options.storageBucket as string;
    const encodedPath = encodeURIComponent(fileName);
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodedPath}`;
    const result = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: 'POST',
      headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${token}` },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (result.status < 200 || result.status >= 300) throw new Error(`Upload image failed: ${result.status}`);
    const data = JSON.parse(result.body);
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${data.downloadTokens}`;
  };

  const handlePublishStato = async () => {
    if (!statoTitle.trim()) {
      setTitleError(t('stories.titleRequired'));
      return;
    }
    setTitleError('');
    setPublishing(true);
    try {
      const uid = auth.currentUser?.uid;
      let imageUrl: string | undefined;
      let audioUrl: string | undefined;
      let audioDuration: number | undefined;

      if (selectedImageUri && uid) {
        imageUrl = await uploadImage(selectedImageUri, uid);
      }

      if (recordedUri && uid) {
        const uploaded = await uploadAudio(recordedUri, uid);
        audioUrl = uploaded.url;
        audioDuration = uploaded.duration;
      }

      await createStato({
        emoji: selectedEmoji,
        title: statoTitle.trim(),
        body: statoBody.trim(),
        username: userProfile?.username || auth.currentUser?.email?.split('@')[0] || 'utente',
        avatar: userProfile?.avatar || '🎧',
        imageUrl,
        audioUrl,
        audioDuration,
      });
      setCreateVisible(false);
      await loadUserStati();
    } catch (e) {
      setTitleError(t('stories.publishError'));
    } finally {
      setPublishing(false);
    }
  };

  const currentUid = auth.currentUser?.uid;
  const myGroup = userStati.find((g) => g.userId === currentUid);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.row}
        contentContainerStyle={styles.rowContent}
      >
        {/* "Come funziona" — sempre primo */}
        <StoryCircle
          emoji="❓"
          label={t('stories.howItWorks')}
          viewed={viewedTutorial}
          onPress={openTutorial}
        />

        {/* Cerchio stato personale */}
        <TouchableOpacity
          style={styles.circleWrap}
          onPress={() => myGroup ? openUserStory(myGroup) : openCreate()}
          activeOpacity={0.8}
        >
          <View style={styles.circleOuter}>
            <View style={[styles.ring, myGroup ? {} : styles.ringDashed]} />
            <View style={styles.circleInner}>
              <Text style={styles.circleEmoji}>{myGroup ? myGroup.icon : '＋'}</Text>
            </View>
            {/* Badge "+" sempre visibile per aggiungere un nuovo stato */}
            <TouchableOpacity style={styles.addBadge} onPress={openCreate} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={styles.addBadgeText}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.circleLabel} numberOfLines={2}>
            {myGroup ? t('stories.myStatus') : t('stories.newStatusLabel')}
          </Text>
        </TouchableOpacity>

        {/* Storie degli altri utenti */}
        {userStati
          .filter((g) => g.userId !== currentUid)
          .map((group) => (
            <StoryCircle
              key={group.id}
              emoji={group.icon || '🎵'}
              label={group.label}
              viewed={viewedStati.has(group.id)}
              onPress={() => openUserStory(group)}
            />
          ))}
      </ScrollView>

      <StoryViewer
        groups={activeGroups}
        startGroupIndex={startIdx}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        onViewed={handleViewed}
        currentUserId={currentUid}
        onDeleteStato={async (statoId) => {
          try {
            await deleteStato(statoId);
            await loadUserStati();
            setViewerVisible(false);
          } catch {
            Alert.alert(t('common.error'), t('stories.errors.cannotDelete'));
          }
        }}
        onReplyStatoVoice={async ({ statoId, ownerUserId, audioUri, duration }) => {
          try {
            if (!ownerUserId || ownerUserId === currentUid) return;
            const owner = userStati.find((g) => g.userId === ownerUserId);
            await inviaMessaggio({
              receiverId: ownerUserId,
              receiverName: owner?.label || 'Utente',
              receiverAvatar: owner?.icon || '🎵',
              audioUri,
              duration,
              statusReply: true,
              statusReplyLabel: t('stories.replySentTitle'),
              statusId: statoId,
            });
            Alert.alert(t('stories.replySentTitle'), t('stories.replySentMsg'));
          } catch {
            Alert.alert(t('common.error'), t('stories.errors.cannotReply'));
          }
        }}
        getViewersForStato={getStatoViewers}
        onStatoOpened={markStatoViewed}
      />

      {/* Modal creazione stato */}
      <Modal visible={createVisible} transparent animationType="slide" onRequestClose={() => setCreateVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.createModal}>
                <Text style={styles.createTitle}>{t('stories.newStatus')}</Text>
                <Text style={styles.createSubtitle}>{t('stories.disappears')}</Text>

                {/* Selezione emoji */}
                <Text style={styles.fieldLabel}>{t('stories.emojiLabel')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
                  {EMOJI_OPTIONS.map((e) => (
                    <TouchableOpacity
                      key={e}
                      style={[styles.emojiOption, selectedEmoji === e && styles.emojiSelected]}
                      onPress={() => setSelectedEmoji(e)}
                    >
                      <Text style={styles.emojiText}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Clip audio opzionale */}
                <Text style={styles.fieldLabel}>{t('stories.audioClip')}</Text>
                {!recordedUri && !isRecording && (
                  <TouchableOpacity style={styles.recordBtn} onPress={startRecording}>
                    <Text style={styles.recordBtnIcon}>🎤</Text>
                    <Text style={styles.recordBtnText}>{t('stories.recordClip')}</Text>
                  </TouchableOpacity>
                )}
                {isRecording && (
                  <View style={styles.recordingActive}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingTimer}>
                      {recordingSeconds}s / {MAX_RECORDING_SECONDS}s
                    </Text>
                    <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
                      <Text style={styles.stopBtnText}>■ Stop</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {recordedUri && (
                  <View style={styles.clipReady}>
                    <Text style={styles.clipReadyText}>{t('stories.clipReady', { seconds: recordingSeconds })}</Text>
                    <TouchableOpacity onPress={discardRecording}>
                      <Text style={styles.clipDiscard}>{t('stories.removeClip')}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Foto opzionale */}
                <Text style={styles.fieldLabel}>{t('stories.photoLabel')}</Text>
                {!selectedImageUri ? (
                  <TouchableOpacity style={styles.recordBtn} onPress={pickImage}>
                    <Text style={styles.recordBtnIcon}>🖼️</Text>
                    <Text style={styles.recordBtnText}>{t('stories.choosePhoto')}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.photoPreviewWrap}>
                    <Image source={{ uri: selectedImageUri }} style={styles.photoPreview} />
                    <TouchableOpacity onPress={() => setSelectedImageUri(null)}>
                      <Text style={styles.clipDiscard}>{t('stories.removePhoto')}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Titolo */}
                <Text style={styles.fieldLabel}>{t('stories.titleLabel')}</Text>
                <TextInput
                  style={[styles.input, titleError ? styles.inputError : null]}
                  placeholder={t('stories.titlePlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={statoTitle}
                  onChangeText={(t) => { setStatoTitle(t); setTitleError(''); }}
                  maxLength={60}
                />
                {titleError ? <Text style={styles.errorText}>{titleError}</Text> : null}

                {/* Testo */}
                <Text style={styles.fieldLabel}>{t('stories.textLabel')}</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  placeholder={t('stories.textPlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={statoBody}
                  onChangeText={setStatoBody}
                  multiline
                  maxLength={200}
                />

                {/* Anteprima */}
                <View style={styles.preview}>
                  <Text style={styles.previewEmoji}>{selectedEmoji}</Text>
                  <View>
                    <Text style={styles.previewTitle}>{statoTitle || t('stories.titlePreviewPlaceholder')}</Text>
                    {statoBody ? <Text style={styles.previewBody}>{statoBody}</Text> : null}
                    {selectedImageUri ? <Text style={styles.previewBody}>{t('stories.photoAttached')}</Text> : null}
                  </View>
                </View>

                {/* Bottoni */}
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateVisible(false)} disabled={publishing}>
                    <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.publishBtn} onPress={handlePublishStato} disabled={publishing}>
                    {publishing
                      ? <ActivityIndicator color="#000" size="small" />
                      : <Text style={styles.publishBtnText}>{t('stories.publishBtn')}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const CIRCLE_SIZE = 62;

const styles = StyleSheet.create({
  row: {
    marginVertical: 12,
  },
  rowContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  circleWrap: {
    alignItems: 'center',
    width: CIRCLE_SIZE + 10,
  },
  circleOuter: {
    width: CIRCLE_SIZE + 6,
    height: CIRCLE_SIZE + 6,
    borderRadius: (CIRCLE_SIZE + 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    width: CIRCLE_SIZE + 6,
    height: CIRCLE_SIZE + 6,
    borderRadius: (CIRCLE_SIZE + 6) / 2,
    borderWidth: 2,
    borderColor: '#00FF9C',
    shadowColor: '#00FF9C',
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  ringViewed: {
    borderColor: 'rgba(255,255,255,0.2)',
    shadowOpacity: 0,
    elevation: 0,
  },
  ringGradient: {
    flex: 1,
    borderRadius: (CIRCLE_SIZE + 6) / 2,
  },
  circleInner: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: '#0D0D1A',
    borderWidth: 2,
    borderColor: '#050508',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleEmoji: {
    fontSize: 26,
  },
  circleLabel: {
    marginTop: 6,
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontFamily: 'monospace',
    lineHeight: 13,
  },
  ringDashed: {
    borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
    shadowOpacity: 0,
    elevation: 0,
  },
  addBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#00FF9C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBadgeText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  // Modal creazione stato
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  createModal: {
    backgroundColor: '#0D0D1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  createTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  createSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emojiRow: {
    marginBottom: 16,
  },
  emojiOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  emojiSelected: {
    backgroundColor: 'rgba(0,255,156,0.2)',
    borderWidth: 1.5,
    borderColor: '#00FF9C',
  },
  emojiText: {
    fontSize: 20,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: 14,
    fontFamily: 'monospace',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  inputMulti: {
    height: 72,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#FF4D4D',
  },
  errorText: {
    color: '#FF4D4D',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: -10,
    marginBottom: 10,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    gap: 12,
  },
  previewEmoji: {
    fontSize: 28,
  },
  previewTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  previewBody: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'monospace',
    fontSize: 14,
  },
  publishBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#00FF9C',
    alignItems: 'center',
  },
  publishBtnText: {
    color: '#000',
    fontWeight: '700',
    fontFamily: 'monospace',
    fontSize: 14,
  },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  recordBtnIcon: { fontSize: 18 },
  recordBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  recordingActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,60,60,0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,60,60,0.3)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3C3C',
  },
  recordingTimer: {
    flex: 1,
    color: '#FF3C3C',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  stopBtn: {
    backgroundColor: '#FF3C3C',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stopBtnText: {
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
  },
  clipReady: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,255,156,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.25)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  clipReadyText: {
    color: '#00FF9C',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  clipDiscard: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  photoPreviewWrap: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  photoPreview: {
    width: '100%',
    height: 140,
    borderRadius: 8,
  },
});
