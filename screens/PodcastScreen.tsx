import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, Animated, Image, StatusBar,
  Dimensions, Alert, Platform, ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { auth } from '../firebaseConfig';
import {
  getPodcasts, publishPodcast, updatePodcast, deletePodcast, searchSounds,
  togglePodcastLike, togglePodcastDislike, getPodcastVotes,
  listenPodcastComments, addPodcastComment, deletePodcastComment,
  getUserPlaylists, addPodcastToPlaylist, createPlaylist,
  Podcast, PodcastComment, SoundResult, Playlist,
} from '../services/podcastService';

const { width: SW } = Dimensions.get('window');
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Player modal ─────────────────────────────────────────────────────────────
function PodcastPlayer({ podcast, onClose, currentUsername }: { podcast: Podcast; onClose: () => void; currentUsername: string }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(podcast.duration || 0);
  const [loading, setLoading] = useState(true);
  const [speed, setSpeed] = useState(1);
  const seekBarWidth = SW - 80;

  // Likes / dislikes / commenti
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [likesCount, setLikesCount] = useState(podcast.likesCount ?? 0);
  const [dislikesCount, setDislikesCount] = useState(podcast.dislikesCount ?? 0);
  const [commentsCount, setCommentsCount] = useState(podcast.commentsCount ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PodcastComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  const isBuffering = false;
  const progress = duration > 0 ? position / duration : 0;

  useEffect(() => {
    loadAudio();
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  useEffect(() => {
    getPodcastVotes(podcast.id).then(({ liked, disliked }) => {
      setLiked(liked);
      setDisliked(disliked);
    });
  }, [podcast.id]);

  useEffect(() => {
    if (!showComments) return;
    const unsub = listenPodcastComments(podcast.id, (c) => {
      setComments(c);
      setCommentsCount(c.length);
    });
    return unsub;
  }, [showComments, podcast.id]);

  const handleLike = async () => {
    try {
      const nowLiked = await togglePodcastLike(podcast.id);
      setLiked(nowLiked);
      if (nowLiked) { setLikesCount(n => n + 1); if (disliked) { setDisliked(false); setDislikesCount(n => n - 1); } }
      else setLikesCount(n => n - 1);
    } catch {}
  };

  const handleDislike = async () => {
    try {
      const nowDisliked = await togglePodcastDislike(podcast.id);
      setDisliked(nowDisliked);
      if (nowDisliked) { setDislikesCount(n => n + 1); if (liked) { setLiked(false); setLikesCount(n => n - 1); } }
      else setDislikesCount(n => n - 1);
    } catch {}
  };

  const handleSendComment = async () => {
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      await addPodcastComment(podcast.id, commentText, currentUsername);
      setCommentText('');
    } catch {} finally { setSendingComment(false); }
  };

  const handleDeleteComment = (commentId: string) => {
    Alert.alert('Elimina commento', 'Sicuro?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: () => deletePodcastComment(podcast.id, commentId).catch(() => {}) },
    ]);
  };

  const loadAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      const urlPath = decodeURIComponent(podcast.audioUrl.split('?')[0]);
      const rawExt = urlPath.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
      const allowed = ['mp3', 'm4a', 'mp4', 'aac', 'wav', 'ogg', 'flac', 'webm'];
      const ext = allowed.includes(rawExt) ? rawExt : 'mp3';

      const onStatus = (status: any) => {
        if (!status.isLoaded) return;
        setPosition(status.positionMillis / 1000);
        setDuration(status.durationMillis ? status.durationMillis / 1000 : podcast.duration);
        setIsPlaying(status.isPlaying);
        if (status.didJustFinish) { setIsPlaying(false); setPosition(0); }
      };

      try {
        const localUri = FileSystem.cacheDirectory + `podcast_${podcast.id}.${ext}`;
        const fileInfo = await FileSystem.getInfoAsync(localUri);
        const needsDownload = !fileInfo.exists || (fileInfo.size !== undefined && fileInfo.size < 100);
        if (needsDownload) {
          if (fileInfo.exists) await FileSystem.deleteAsync(localUri, { idempotent: true });
          await FileSystem.downloadAsync(podcast.audioUrl, localUri);
        }
        const { sound } = await Audio.Sound.createAsync(
          { uri: localUri },
          { shouldPlay: true, rate: speed },
          onStatus,
        );
        soundRef.current = sound;
      } catch {
        await FileSystem.deleteAsync(
          FileSystem.cacheDirectory + `podcast_${podcast.id}.${ext}`,
          { idempotent: true },
        ).catch(() => {});
        const { sound } = await Audio.Sound.createAsync(
          { uri: podcast.audioUrl },
          { shouldPlay: true, rate: speed },
          onStatus,
        );
        soundRef.current = sound;
      }
    } catch (e) {
      console.error('Podcast load error', e);
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = async () => {
    if (!soundRef.current) return;
    if (isPlaying) await soundRef.current.pauseAsync();
    else await soundRef.current.playAsync();
  };

  const seekTo = async (ratio: number) => {
    if (!soundRef.current || !duration) return;
    await soundRef.current.setPositionAsync(ratio * duration * 1000);
  };

  const changeSpeed = async (s: number) => {
    setSpeed(s);
    await soundRef.current?.setRateAsync(s, true);
  };

  const skip = async (secs: number) => {
    if (!soundRef.current) return;
    const newPos = Math.max(0, Math.min((position + secs) * 1000, duration * 1000));
    await soundRef.current.setPositionAsync(newPos);
  };

  const SH = Dimensions.get('window').height;
  const coverSize = Math.min(SW * 0.48, SH * 0.22);

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
      <View style={pl.orb} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Contenuto superiore scrollabile */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={pl.header}>
            <TouchableOpacity onPress={onClose} style={pl.closeBtn} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
              <Text style={pl.closeTxt}>✕</Text>
            </TouchableOpacity>
            <Text style={pl.headerLabel}>podcast</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Cover */}
          <View style={pl.coverWrap}>
            {podcast.coverUrl ? (
              <Image source={{ uri: podcast.coverUrl }} style={[pl.cover, { width: coverSize, height: coverSize }]} resizeMode="cover" />
            ) : (
              <View style={[pl.cover, pl.coverFallback, { width: coverSize, height: coverSize }]}>
                <Text style={{ fontSize: coverSize * 0.35 }}>🎙</Text>
              </View>
            )}
          </View>

          {/* Info */}
          <View style={pl.info}>
            <Text style={pl.podcastTitle} numberOfLines={2}>{podcast.title}</Text>
            <Text style={pl.podcastHost}>@{podcast.username}</Text>
            {podcast.description ? (
              <Text style={pl.podcastDesc} numberOfLines={2}>{podcast.description}</Text>
            ) : null}
          </View>

          {/* Progress bar */}
          <View style={pl.seekSection}>
            <TouchableOpacity
              style={pl.seekTrack}
              onPress={(e) => seekTo(e.nativeEvent.locationX / seekBarWidth)}
              activeOpacity={1}
            >
              <View style={[pl.seekFill, { width: `${progress * 100}%` }]} />
              <View style={[pl.seekThumb, { left: `${progress * 100}%` }]} />
            </TouchableOpacity>
            <View style={pl.seekTimes}>
              <Text style={pl.seekTime}>{fmtTime(position)}</Text>
              <Text style={pl.seekTime}>{fmtTime(duration)}</Text>
            </View>
          </View>

          {/* Controls */}
          <View style={pl.controls}>
            <TouchableOpacity style={pl.skipBtn} onPress={() => skip(-15)}>
              <Text style={pl.skipTxt}>-15s</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pl.playBtn} onPress={togglePlay} disabled={loading || isBuffering}>
              {(loading || isBuffering) ? (
                <ActivityIndicator color="#050508" size="small" />
              ) : (
                <Text style={pl.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={pl.skipBtn} onPress={() => skip(15)}>
              <Text style={pl.skipTxt}>+15s</Text>
            </TouchableOpacity>
          </View>

          {/* Speed selector */}
          <View style={pl.speedRow}>
            {SPEEDS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[pl.speedBtn, speed === s && pl.speedBtnActive]}
                onPress={() => changeSpeed(s)}
              >
                <Text style={[pl.speedTxt, speed === s && pl.speedTxtActive]}>{s}×</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Like / Dislike / Commenti */}
          <View style={pl.actionsRow}>
            <TouchableOpacity style={pl.actionBtn} onPress={handleLike}>
              <Text style={[pl.actionIcon, liked && pl.actionActive]}>👍</Text>
              <Text style={[pl.actionCount, liked && pl.actionActive]}>{likesCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pl.actionBtn} onPress={handleDislike}>
              <Text style={[pl.actionIcon, disliked && pl.actionActiveRed]}>👎</Text>
              <Text style={[pl.actionCount, disliked && pl.actionActiveRed]}>{dislikesCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pl.actionBtn} onPress={() => setShowComments(v => !v)}>
              <Text style={[pl.actionIcon, showComments && { opacity: 0.6 }]}>💬</Text>
              <Text style={pl.actionCount}>{commentsCount}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Sezione commenti — fissa in fondo, sopra la tastiera */}
        {showComments && (
          <View style={pl.commentsSection}>
            <ScrollView
              style={pl.commentsList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {comments.length === 0 ? (
                <Text style={pl.noComments}>Nessun commento ancora</Text>
              ) : (
                comments.map((c) => (
                  <View key={c.id} style={pl.commentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={pl.commentUser}>@{c.username}</Text>
                      <Text style={pl.commentText}>{c.text}</Text>
                    </View>
                    {c.userId === auth.currentUser?.uid && (
                      <TouchableOpacity onPress={() => handleDeleteComment(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
            <View style={pl.commentInput}>
              <TextInput
                style={pl.commentField}
                placeholder="Scrivi un commento..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={commentText}
                onChangeText={setCommentText}
                maxLength={300}
              />
              <TouchableOpacity
                style={[pl.sendBtn, (!commentText.trim() || sendingComment) && { opacity: 0.4 }]}
                onPress={handleSendComment}
                disabled={!commentText.trim() || sendingComment}
              >
                {sendingComment ? <ActivityIndicator color="#fff" size="small" /> : <Text style={pl.sendTxt}>↑</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Podcast card ──────────────────────────────────────────────────────────────
function PodcastCard({
  item, onPress, onEdit, onDelete, onAddToPlaylist,
}: {
  item: Podcast;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddToPlaylist: () => void;
}) {
  const mins = Math.floor(item.duration / 60);
  const isOwn = auth.currentUser?.uid === item.userId;

  const { t } = useTranslation();
  const showMenu = () => {
    Alert.alert(item.title, '', [
      { text: t('podcast.editMenu'), onPress: onEdit },
      { text: t('common.delete'), style: 'destructive', onPress: onDelete },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <TouchableOpacity style={pc.card} onPress={onPress} activeOpacity={0.85}>
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={pc.cover} resizeMode="cover" />
      ) : (
        <View style={[pc.cover, pc.coverFallback]}>
          <Text style={{ fontSize: 28 }}>🎙</Text>
        </View>
      )}
      <View style={pc.info}>
        <Text style={pc.title} numberOfLines={2}>{item.title}</Text>
        <Text style={pc.host}>@{item.username}</Text>
        {item.description ? <Text style={pc.desc} numberOfLines={2}>{item.description}</Text> : null}
        <Text style={pc.duration}>⏱ {mins > 0 ? `${mins} min` : `${item.duration}s`}</Text>
        <TouchableOpacity style={pc.playlistBtn} onPress={onAddToPlaylist} activeOpacity={0.8}>
          <Text style={pc.playlistBtnTxt}>+ Playlist</Text>
        </TouchableOpacity>
      </View>
      {isOwn ? (
        <TouchableOpacity onPress={showMenu} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={pc.menuBtn}>
          <Text style={pc.menuTxt}>⋯</Text>
        </TouchableOpacity>
      ) : (
        <View style={pc.playPill}>
          <Text style={pc.playPillTxt}>▶</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────
function EditPodcastModal({
  podcast, onDone, onClose,
}: {
  podcast: Podcast;
  onDone: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(podcast.title);
  const [description, setDescription] = useState(podcast.description ?? '');
  const [coverUri, setCoverUri] = useState<string | null | undefined>(undefined); // undefined = invariata
  const [coverPreview, setCoverPreview] = useState<string | null>(podcast.coverUrl);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(t('permissions.denied')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setCoverUri(result.assets[0].uri);
      setCoverPreview(result.assets[0].uri);
    }
  };

  const removeCover = () => {
    setCoverUri(null);
    setCoverPreview(null);
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert(t('podcast.titleRequired')); return; }
    setLoading(true);
    try {
      await updatePodcast(podcast.id, {
        title: title.trim(),
        description: description.trim(),
        newCoverUri: coverUri,
      });
      onDone();
    } catch {
      Alert.alert(t('common.error'), t('podcast.errors.cannotSaveChanges'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={pm.overlay}>
        <View style={pm.sheet}>
          <LinearGradient colors={['#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} borderRadius={20} />
          <View style={pm.handle} />
          <Text style={pm.sheetTitle}>{t('podcast.editTitle')}</Text>

          <TextInput
            style={pm.input}
            placeholder={t('podcast.titlePlaceholderLong')}
            placeholderTextColor="#4A4D56"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[pm.input, { height: 72, textAlignVertical: 'top' }]}
            placeholder={t('podcast.descriptionPlaceholder')}
            placeholderTextColor="#4A4D56"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          {/* Cover preview + actions */}
          <View style={pm.coverRow}>
            {coverPreview ? (
              <Image source={{ uri: coverPreview }} style={pm.coverThumb} resizeMode="cover" />
            ) : (
              <View style={[pm.coverThumb, pm.coverThumbEmpty]}>
                <Text style={{ fontSize: 24 }}>🖼</Text>
              </View>
            )}
            <View style={pm.coverBtns}>
              <TouchableOpacity style={pm.pickBtn} onPress={pickCover}>
                <Text style={pm.pickBtnTxt}>{coverPreview ? t('podcast.changeCover') : t('podcast.addCover')}</Text>
              </TouchableOpacity>
              {coverPreview ? (
                <TouchableOpacity style={[pm.pickBtn, { marginTop: 8, borderColor: '#FF2D55' }]} onPress={removeCover}>
                  <Text style={[pm.pickBtnTxt, { color: '#FF2D55' }]}>{t('podcast.removeCover')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={pm.actions}>
            <TouchableOpacity style={pm.cancelBtn} onPress={onClose}>
              <Text style={pm.cancelTxt}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pm.publishBtn} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#050508" /> : <Text style={pm.publishTxt}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Search view (usata dentro PublishModal, non Modal separata) ──────────────
function SoundSearchView({
  onSelect,
  onBack,
}: {
  onSelect: (sound: SoundResult) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<SoundResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { doSearch(''); }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(queryText), 300);
    return () => clearTimeout(t);
  }, [queryText]);

  const doSearch = async (text: string) => {
    setLoading(true);
    try { setResults(await searchSounds(text)); }
    catch {}
    finally { setLoading(false); }
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <TouchableOpacity
          onPress={onBack}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(0,255,156,0.1)', borderWidth: 1, borderColor: 'rgba(0,255,156,0.3)' }}
        >
          <Text style={{ color: '#00FF9C', fontSize: 14 }}>←</Text>
          <Text style={{ color: '#00FF9C', fontSize: 13, fontFamily: 'monospace' }}>{t('podcast.back')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={pm.sheetTitle}>{t('podcast.searchSoundScape')}</Text>
      <TextInput
        style={pm.input}
        placeholder={t('podcast.searchPlaceholder')}
        placeholderTextColor="#4A4D56"
        value={queryText}
        onChangeText={setQueryText}
      />
      {loading ? (
        <ActivityIndicator color="#00FF9C" style={{ marginVertical: 24 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          style={{ maxHeight: 340, marginTop: 4 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity style={ss.row} onPress={() => onSelect(item)} activeOpacity={0.75}>
              <View style={{ flex: 1 }}>
                <Text style={ss.soundTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={ss.soundMeta}>@{item.username} · {fmtTime(item.duration)}</Text>
              </View>
              <View style={ss.usaBtn}>
                <Text style={ss.usaTxt}>{t('podcast.use')}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={ss.emptyTxt}>{t('podcast.noSoundsFound')}</Text>}
        />
      )}
    </>
  );
}

// ─── Publish modal ────────────────────────────────────────────────────────────
function PublishModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isITS, setIsITS] = useState(false);
  const [category, setCategory] = useState('');
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [soundscapeAudioUrl, setSoundscapeAudioUrl] = useState<string | null>(null);

  const handleSelectSound = (sound: SoundResult) => {
    setSoundscapeAudioUrl(sound.audioUrl);
    setAudioUri(null);
    setAudioName(sound.title);
    setAudioDuration(sound.duration);
    setShowSearch(false);
  };

  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setAudioUri(asset.uri);
        setSoundscapeAudioUrl(null);
        setAudioName(asset.name ?? 'audio');
        // Misura durata
        try {
          const { sound } = await Audio.Sound.createAsync({ uri: asset.uri });
          const status = await sound.getStatusAsync();
          if (status.isLoaded && status.durationMillis) {
            setAudioDuration(Math.round(status.durationMillis / 1000));
          }
          await sound.unloadAsync();
        } catch { /* durata non disponibile, usa 0 */ }
      }
    } catch {
      Alert.alert(t('common.error'), t('podcast.errors.cannotSelect'));
    }
  };

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(t('permissions.denied')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const handlePublish = async () => {
    if (!title.trim()) { Alert.alert(t('podcast.titleRequired')); return; }
    if (!audioUri && !soundscapeAudioUrl) { Alert.alert(t('podcast.audioRequired')); return; }
    const user = auth.currentUser;
    if (!user) { Alert.alert(t('podcast.notAuthenticated')); return; }
    setLoading(true);
    try {
      await publishPodcast({
        audioUri: audioUri ?? undefined,
        audioUrl: soundscapeAudioUrl ?? undefined,
        coverUri,
        title: title.trim(),
        description: description.trim(),
        duration: audioDuration,
        username: user.displayName ?? user.email ?? 'utente',
        userAvatar: user.photoURL ?? '',
        isITS,
        category: category.trim() || undefined,
      });
      onDone();
    } catch {
      Alert.alert(t('common.error'), t('podcast.errors.cannotPublish'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={showSearch ? () => setShowSearch(false) : onClose}>
      <View style={pm.overlay}>
        <View style={pm.sheet}>
          <LinearGradient colors={['#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} borderRadius={20} />
          <View style={pm.handle} />

          {showSearch ? (
            <SoundSearchView
              onSelect={handleSelectSound}
              onBack={() => setShowSearch(false)}
            />
          ) : (
          <>
          <Text style={pm.sheetTitle}>{t('podcast.publishTitle')}</Text>

          <TextInput
            style={pm.input}
            placeholder={t('podcast.titlePlaceholderLong')}
            placeholderTextColor="#4A4D56"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[pm.input, { height: 72, textAlignVertical: 'top' }]}
            placeholder={t('podcast.descriptionPlaceholder')}
            placeholderTextColor="#4A4D56"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <View style={pm.itsRow}>
            <TouchableOpacity
              style={[pm.itsToggle, isITS && pm.itsToggleActive]}
              onPress={() => setIsITS((v) => !v)}
            >
              <Text style={[pm.itsToggleText, isITS && pm.itsToggleTextActive]}>
                {isITS ? 'ITS: ON' : 'ITS: OFF'}
              </Text>
            </TouchableOpacity>
            <TextInput
              style={[pm.input, pm.categoryInput]}
              placeholder="Categoria (opzionale)"
              placeholderTextColor="#4A4D56"
              value={category}
              onChangeText={setCategory}
              maxLength={40}
            />
          </View>

          <TouchableOpacity style={pm.pickBtn} onPress={pickAudio}>
            <Text style={pm.pickBtnTxt}>
              {audioUri ? `✅ ${audioName}` : t('podcast.chooseFile')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[pm.pickBtn, { marginTop: 8, borderColor: 'rgba(0,255,156,0.4)' }]} onPress={() => setShowSearch(true)}>
            <Text style={[pm.pickBtnTxt, soundscapeAudioUrl && { color: '#00FF9C' }]}>
              {soundscapeAudioUrl ? `✅ ${audioName}` : `🔍 ${t('podcast.searchSoundScape')}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[pm.pickBtn, { marginTop: 8 }]} onPress={pickCover}>
            <Text style={pm.pickBtnTxt}>
              {coverUri ? t('podcast.coverSelectedLabel') : t('podcast.addCoverOptional')}
            </Text>
          </TouchableOpacity>

          <View style={pm.actions}>
            <TouchableOpacity style={pm.cancelBtn} onPress={onClose}>
              <Text style={pm.cancelTxt}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pm.publishBtn} onPress={handlePublish} disabled={loading}>
              {loading ? <ActivityIndicator color="#050508" /> : <Text style={pm.publishTxt}>{t('podcast.publish').replace(' 🎙', '')}</Text>}
            </TouchableOpacity>
          </View>
          </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function PodcastScreen() {
  const { t } = useTranslation();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Podcast | null>(null);
  const [currentUsername, setCurrentUsername] = useState('utente');
  const [showPublish, setShowPublish] = useState(false);
  const [editing, setEditing] = useState<Podcast | null>(null);
  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
  const [playlistTarget, setPlaylistTarget] = useState<Podcast | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  useEffect(() => {
    load();
    // Carica username corrente
    const user = auth.currentUser;
    if (user) {
      import('../firebaseConfig').then(({ db }) => {
        import('firebase/firestore').then(({ doc, getDoc }) => {
          getDoc(doc(db, 'users', user.uid)).then((snap) => {
            if (snap.exists()) setCurrentUsername(snap.data()?.username || user.email?.split('@')[0] || 'utente');
          }).catch(() => {});
        });
      });
    }
  }, []);

  const load = async () => {
    setLoading(true);
    try { setPodcasts(await getPodcasts()); }
    catch { /* silenzioso */ }
    finally { setLoading(false); }
  };

  const handleDelete = (item: Podcast) => {
    Alert.alert(
      t('podcast.deleteConfirmTitle'),
      t('podcast.deleteConfirmMsg', { title: item.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive', onPress: async () => {
            try {
              await deletePodcast(item.id);
              load();
            } catch {
              Alert.alert(t('common.error'), t('podcast.errors.cannotDelete'));
            }
          },
        },
      ],
    );
  };

  const ensureNotAnonymous = () => {
    if (auth.currentUser?.isAnonymous) {
      Alert.alert('Funzione non disponibile', 'Le playlist non sono disponibili con account ospite.');
      return false;
    }
    return true;
  };

  const openPlaylistModal = async (podcast: Podcast) => {
    if (!ensureNotAnonymous()) return;
    setPlaylistTarget(podcast);
    setPlaylistModalVisible(true);
    setLoadingPlaylists(true);
    try {
      const list = await getUserPlaylists();
      setPlaylists(list);
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Impossibile caricare le playlist.');
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!ensureNotAnonymous()) return;
    const name = newPlaylistName.trim();
    if (!name) return;
    setCreatingPlaylist(true);
    try {
      const newId = await createPlaylist(name);
      const created = { id: newId, name, userId: auth.currentUser?.uid ?? '', podcastIds: [], createdAt: new Date() };
      setPlaylists((prev) => [created, ...prev]);
      setNewPlaylistName('');
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Impossibile creare la playlist.');
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const handleAddToPlaylist = async (playlist: Playlist) => {
    if (!playlistTarget) return;
    try {
      await addPodcastToPlaylist(playlist.id, playlistTarget.id);
      Alert.alert('Fatto', `"${playlistTarget.title}" aggiunto a "${playlist.name}".`);
      setPlaylistModalVisible(false);
    } catch (error: any) {
      Alert.alert('Errore', error?.message || 'Impossibile aggiungere il podcast alla playlist.');
    }
  };

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#00FF9C" />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Header con pulsante pubblica */}
      <View style={sc.topBar}>
        <Text style={sc.topBarTitle}>{t('podcast.header')}</Text>
        <TouchableOpacity style={sc.publishBtn} onPress={() => setShowPublish(true)}>
          <Text style={sc.publishBtnTxt}>{t('podcast.publishBtn')}</Text>
        </TouchableOpacity>
      </View>

      {podcasts.length === 0 ? (
        <View style={sc.empty}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🎙</Text>
          <Text style={sc.emptyTitle}>{t('podcast.empty')}</Text>
          <Text style={sc.emptyDesc}>{t('podcast.emptyDesc')}</Text>
        </View>
      ) : (
        <FlatList
          data={podcasts}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <PodcastCard
              item={item}
              onPress={() => setSelected(item)}
              onEdit={() => setEditing(item)}
              onDelete={() => handleDelete(item)}
              onAddToPlaylist={() => openPlaylistModal(item)}
            />
          )}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
        />
      )}
      {selected && <PodcastPlayer podcast={selected} onClose={() => setSelected(null)} currentUsername={currentUsername} />}
      {showPublish && (
        <PublishModal
          onDone={() => { setShowPublish(false); load(); }}
          onClose={() => setShowPublish(false)}
        />
      )}
      {editing && (
        <EditPodcastModal
          podcast={editing}
          onDone={() => { setEditing(null); load(); }}
          onClose={() => setEditing(null)}
        />
      )}
      <Modal visible={playlistModalVisible} transparent animationType="slide" onRequestClose={() => setPlaylistModalVisible(false)}>
        <View style={pm.overlay}>
          <View style={pm.sheet}>
            <LinearGradient colors={['#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} borderRadius={20} />
            <View style={pm.handle} />
            <Text style={pm.sheetTitle}>Aggiungi a playlist</Text>
            {!!playlistTarget && (
              <Text style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 12 }} numberOfLines={1}>
                {playlistTarget.title}
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[pm.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Nuova playlist..."
                placeholderTextColor="#4A4D56"
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                maxLength={80}
              />
              <TouchableOpacity
                style={[pm.publishBtn, { flex: 0, paddingHorizontal: 16 }, (!newPlaylistName.trim() || creatingPlaylist) && { opacity: 0.4 }]}
                onPress={handleCreatePlaylist}
                disabled={!newPlaylistName.trim() || creatingPlaylist}
              >
                {creatingPlaylist ? <ActivityIndicator color="#050508" size="small" /> : <Text style={pm.publishTxt}>Crea</Text>}
              </TouchableOpacity>
            </View>

            {loadingPlaylists ? (
              <ActivityIndicator color="#00FF9C" style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={(p) => p.id}
                style={{ maxHeight: 280 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={pc.card} onPress={() => handleAddToPlaylist(item)} activeOpacity={0.8}>
                    <View style={[pc.playPill, { marginLeft: 0 }]}>
                      <Text style={pc.playPillTxt}>🎵</Text>
                    </View>
                    <View style={pc.info}>
                      <Text style={pc.title} numberOfLines={1}>{item.name}</Text>
                      <Text style={pc.duration}>{item.podcastIds.length} episodi</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                ListEmptyComponent={<Text style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', paddingVertical: 16 }}>Nessuna playlist</Text>}
              />
            )}

            <View style={pm.actions}>
              <TouchableOpacity style={pm.cancelBtn} onPress={() => setPlaylistModalVisible(false)}>
                <Text style={pm.cancelTxt}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const pl = StyleSheet.create({
  orb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(0,255,156,0.05)', top: -60, right: -80 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerLabel: { color: '#00FF9C', fontSize: 12, fontFamily: 'monospace', letterSpacing: 1 },
  coverWrap: { alignItems: 'center', marginVertical: 12 },
  cover: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(0,255,156,0.2)' },
  coverFallback: { backgroundColor: '#0D0D1A', alignItems: 'center', justifyContent: 'center' },
  info: { paddingHorizontal: 24, marginBottom: 12 },
  podcastTitle: { fontSize: 22, fontWeight: '700', fontStyle: 'italic', color: '#fff', marginBottom: 4, lineHeight: 28 },
  podcastHost: { fontSize: 12, color: '#00FF9C', fontFamily: 'monospace', marginBottom: 8 },
  podcastDesc: { fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 18 },
  seekSection: { paddingHorizontal: 28, marginBottom: 8 },
  seekTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, position: 'relative', marginBottom: 6 },
  seekFill: { height: '100%', backgroundColor: '#00FF9C', borderRadius: 2 },
  seekThumb: { position: 'absolute', top: -6, marginLeft: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: '#00FF9C', shadowColor: '#00FF9C', shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  seekTimes: { flexDirection: 'row', justifyContent: 'space-between' },
  seekTime: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 24 },
  skipBtn: { padding: 10 },
  skipTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontFamily: 'monospace' },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#00FF9C', alignItems: 'center', justifyContent: 'center', shadowColor: '#00FF9C', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  playIcon: { fontSize: 26, color: '#050508' },
  speedRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  speedBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'transparent' },
  speedBtnActive: { borderColor: '#00FF9C', backgroundColor: 'rgba(0,255,156,0.1)' },
  speedTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace' },
  speedTxtActive: { color: '#00FF9C' },
  actionsRow: { flexDirection: 'row', justifyContent: 'center', gap: 32, paddingVertical: 16 },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionIcon: { fontSize: 24 },
  actionCount: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' },
  actionActive: { color: '#00FF9C' },
  actionActiveRed: { color: '#FF4444' },
  commentsSection: { maxHeight: 280, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  commentsList: { flexGrow: 0, maxHeight: 180, paddingHorizontal: 16, paddingTop: 8 },
  noComments: { color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  commentUser: { fontSize: 11, color: '#00FF9C', fontFamily: 'monospace', marginBottom: 2 },
  commentText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 18 },
  commentInput: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  commentField: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14, maxHeight: 80 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#00FF9C', alignItems: 'center', justifyContent: 'center' },
  sendTxt: { fontSize: 18, color: '#050508', fontWeight: '700' },
});

const pc = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#0D0D1A', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,255,156,0.1)', padding: 12, gap: 12, alignItems: 'flex-start' },
  cover: { width: 72, height: 72, borderRadius: 10 },
  coverFallback: { backgroundColor: '#1A0A2E', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 3, fontStyle: 'italic' },
  host: { fontSize: 11, color: '#00FF9C', fontFamily: 'monospace', marginBottom: 4 },
  desc: { fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 17 },
  duration: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginTop: 6 },
  playlistBtn: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,255,156,0.35)', backgroundColor: 'rgba(0,255,156,0.08)' },
  playlistBtnTxt: { color: '#00FF9C', fontSize: 11, fontWeight: '700' },
  playPill: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,255,156,0.12)', borderWidth: 1, borderColor: 'rgba(0,255,156,0.25)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  playPillTxt: { color: '#00FF9C', fontSize: 12 },
  menuBtn: { paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  menuTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 20, letterSpacing: 1 },
});

const sc = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  topBarTitle: { fontSize: 16, fontWeight: '700', fontStyle: 'italic', color: '#fff' },
  publishBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(0,255,156,0.12)', borderWidth: 1, borderColor: 'rgba(0,255,156,0.3)' },
  publishBtnTxt: { color: '#00FF9C', fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, color: '#fff', fontStyle: 'italic', marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
});

const pm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, overflow: 'hidden' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '700', fontStyle: 'italic', color: '#fff', marginBottom: 20 },
  input: { backgroundColor: '#1e293b', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, color: '#fff', fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  itsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  itsToggle: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#334155', backgroundColor: '#1e293b' },
  itsToggleActive: { borderColor: 'rgba(0,255,156,0.45)', backgroundColor: 'rgba(0,255,156,0.08)' },
  itsToggleText: { color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' },
  itsToggleTextActive: { color: '#00FF9C' },
  categoryInput: { flex: 1, marginBottom: 0 },
  pickBtn: { padding: 14, borderRadius: 12, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', alignItems: 'center', marginBottom: 4 },
  pickBtnTxt: { color: '#00FF9C', fontSize: 14, fontFamily: 'monospace' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#1e293b', alignItems: 'center' },
  cancelTxt: { color: '#94a3b8', fontSize: 14 },
  publishBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#00FF9C', alignItems: 'center' },
  publishTxt: { color: '#050508', fontSize: 14, fontWeight: '700' },
  coverRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 4 },
  coverThumb: { width: 72, height: 72, borderRadius: 10 },
  coverThumbEmpty: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  coverBtns: { flex: 1 },
});

const ss = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  soundTitle: { fontSize: 14, color: '#fff', fontWeight: '600', marginBottom: 2 },
  soundMeta: { fontSize: 11, color: '#00FF9C', fontFamily: 'monospace' },
  usaBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(0,255,156,0.12)', borderWidth: 1, borderColor: 'rgba(0,255,156,0.3)' },
  usaTxt: { color: '#00FF9C', fontSize: 12, fontWeight: '700' },
  emptyTxt: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: 'monospace', textAlign: 'center', marginTop: 24 },
});
