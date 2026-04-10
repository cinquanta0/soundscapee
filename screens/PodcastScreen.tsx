import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, Animated, Image, StatusBar,
  Dimensions, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { auth } from '../firebaseConfig';
import { getPodcasts, publishPodcast, updatePodcast, deletePodcast, Podcast } from '../services/podcastService';

const { width: SW } = Dimensions.get('window');
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Player modal ─────────────────────────────────────────────────────────────
function PodcastPlayer({ podcast, onClose }: { podcast: Podcast; onClose: () => void }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(podcast.duration || 0);
  const [loading, setLoading] = useState(true);
  const [speed, setSpeed] = useState(1);
  const seekBarWidth = SW - 80;

  useEffect(() => {
    loadAudio();
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const loadAudio = async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      // Estrae estensione reale dall'URL (decodifica il path Storage prima del ?)
      const urlPath = decodeURIComponent(podcast.audioUrl.split('?')[0]);
      const rawExt = urlPath.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
      const allowed = ['mp3', 'm4a', 'mp4', 'aac', 'wav', 'ogg', 'flac', 'webm'];
      const ext = allowed.includes(rawExt) ? rawExt : 'mp3';

      const localUri = FileSystem.cacheDirectory + `podcast_${podcast.id}.${ext}`;

      const onStatus = (status: any) => {
        if (!status.isLoaded) return;
        setPosition(status.positionMillis / 1000);
        setDuration(status.durationMillis ? status.durationMillis / 1000 : podcast.duration);
        setIsPlaying(status.isPlaying);
        if (status.didJustFinish) { setIsPlaying(false); setPosition(0); }
      };

      // Tenta prima con file locale (download + cache)
      try {
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
      } catch (localErr) {
        // File locale corrotto o formato non supportato da AVFoundation →
        // fallback: riproduci direttamente dall'URL (streaming)
        console.warn('Podcast local play failed, falling back to URL streaming:', localErr);
        await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
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

  const progress = duration > 0 ? position / duration : 0;

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
      <View style={pl.orb} />

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
          <Image source={{ uri: podcast.coverUrl }} style={pl.cover} resizeMode="cover" />
        ) : (
          <View style={[pl.cover, pl.coverFallback]}>
            <Text style={{ fontSize: 48 }}>🎙</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={pl.info}>
        <Text style={pl.podcastTitle} numberOfLines={2}>{podcast.title}</Text>
        <Text style={pl.podcastHost}>@{podcast.username}</Text>
        {podcast.description ? (
          <Text style={pl.podcastDesc} numberOfLines={3}>{podcast.description}</Text>
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
        <TouchableOpacity style={pl.playBtn} onPress={togglePlay} disabled={loading}>
          {loading ? (
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
    </Modal>
  );
}

// ─── Podcast card ──────────────────────────────────────────────────────────────
function PodcastCard({
  item, onPress, onEdit, onDelete,
}: {
  item: Podcast;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const mins = Math.floor(item.duration / 60);
  const isOwn = auth.currentUser?.uid === item.userId;

  const showMenu = () => {
    Alert.alert(item.title, '', [
      { text: 'Modifica', onPress: onEdit },
      { text: 'Elimina', style: 'destructive', onPress: onDelete },
      { text: 'Annulla', style: 'cancel' },
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
  const [loading, setLoading] = useState(false);

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permesso negato'); return; }
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
    if (!title.trim()) { Alert.alert('Inserisci un titolo'); return; }
    setLoading(true);
    try {
      await updatePodcast(podcast.id, {
        title: title.trim(),
        description: description.trim(),
        newCoverUri: coverUri,
      });
      onDone();
    } catch {
      Alert.alert('Errore', 'Impossibile salvare le modifiche.');
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
          <Text style={pm.sheetTitle}>✏️ Modifica Episodio</Text>

          <TextInput
            style={pm.input}
            placeholder="Titolo del podcast..."
            placeholderTextColor="#4A4D56"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[pm.input, { height: 72, textAlignVertical: 'top' }]}
            placeholder="Descrizione (opzionale)..."
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
                <Text style={pm.pickBtnTxt}>{coverPreview ? '🔄 Cambia copertina' : '🖼 Aggiungi copertina'}</Text>
              </TouchableOpacity>
              {coverPreview ? (
                <TouchableOpacity style={[pm.pickBtn, { marginTop: 8, borderColor: '#FF2D55' }]} onPress={removeCover}>
                  <Text style={[pm.pickBtnTxt, { color: '#FF2D55' }]}>🗑 Rimuovi copertina</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={pm.actions}>
            <TouchableOpacity style={pm.cancelBtn} onPress={onClose}>
              <Text style={pm.cancelTxt}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pm.publishBtn} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#050508" /> : <Text style={pm.publishTxt}>Salva</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Publish modal ────────────────────────────────────────────────────────────
function PublishModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setAudioUri(asset.uri);
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
      Alert.alert('Errore', 'Impossibile aprire il selettore file.');
    }
  };

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permesso negato'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setCoverUri(result.assets[0].uri);
    }
  };

  const handlePublish = async () => {
    if (!title.trim()) { Alert.alert('Inserisci un titolo'); return; }
    if (!audioUri) { Alert.alert('Seleziona un audio'); return; }
    const user = auth.currentUser;
    if (!user) { Alert.alert('Non autenticato'); return; }
    setLoading(true);
    try {
      await publishPodcast({
        audioUri,
        coverUri,
        title: title.trim(),
        description: description.trim(),
        duration: audioDuration,
        username: user.displayName ?? user.email ?? 'utente',
        userAvatar: user.photoURL ?? '',
      });
      onDone();
    } catch {
      Alert.alert('Errore', 'Impossibile pubblicare il podcast.');
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
          <Text style={pm.sheetTitle}>🎙 Pubblica Episodio</Text>

          <TextInput
            style={pm.input}
            placeholder="Titolo del podcast..."
            placeholderTextColor="#4A4D56"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[pm.input, { height: 72, textAlignVertical: 'top' }]}
            placeholder="Descrizione (opzionale)..."
            placeholderTextColor="#4A4D56"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <TouchableOpacity style={pm.pickBtn} onPress={pickAudio}>
            <Text style={pm.pickBtnTxt}>
              {audioUri ? `✅ ${audioName}` : '🎵 Scegli audio'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[pm.pickBtn, { marginTop: 8 }]} onPress={pickCover}>
            <Text style={pm.pickBtnTxt}>
              {coverUri ? '🖼 Copertina selezionata' : '🖼 Aggiungi copertina (opz.)'}
            </Text>
          </TouchableOpacity>

          <View style={pm.actions}>
            <TouchableOpacity style={pm.cancelBtn} onPress={onClose}>
              <Text style={pm.cancelTxt}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pm.publishBtn} onPress={handlePublish} disabled={loading}>
              {loading ? <ActivityIndicator color="#050508" /> : <Text style={pm.publishTxt}>Pubblica</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function PodcastScreen() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Podcast | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [editing, setEditing] = useState<Podcast | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { setPodcasts(await getPodcasts()); }
    catch { /* silenzioso */ }
    finally { setLoading(false); }
  };

  const handleDelete = (item: Podcast) => {
    Alert.alert(
      'Elimina episodio',
      `Vuoi eliminare "${item.title}"?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina', style: 'destructive', onPress: async () => {
            try {
              await deletePodcast(item.id);
              load();
            } catch {
              Alert.alert('Errore', 'Impossibile eliminare il podcast.');
            }
          },
        },
      ],
    );
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
        <Text style={sc.topBarTitle}>Podcast</Text>
        <TouchableOpacity style={sc.publishBtn} onPress={() => setShowPublish(true)}>
          <Text style={sc.publishBtnTxt}>+ Pubblica</Text>
        </TouchableOpacity>
      </View>

      {podcasts.length === 0 ? (
        <View style={sc.empty}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🎙</Text>
          <Text style={sc.emptyTitle}>Nessun podcast ancora</Text>
          <Text style={sc.emptyDesc}>Pubblica il primo episodio!</Text>
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
            />
          )}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
        />
      )}
      {selected && <PodcastPlayer podcast={selected} onClose={() => setSelected(null)} />}
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
  coverWrap: { alignItems: 'center', marginVertical: 20 },
  cover: { width: SW * 0.55, height: SW * 0.55, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0,255,156,0.2)' },
  coverFallback: { backgroundColor: '#0D0D1A', alignItems: 'center', justifyContent: 'center' },
  info: { paddingHorizontal: 28, marginBottom: 20 },
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
