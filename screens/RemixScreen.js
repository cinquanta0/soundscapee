import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
  Dimensions,
  PanResponder,
  TextInput,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { createRemix, requestRemixRendering, subscribeToRemix } from '../services/remixService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_WIDTH = SCREEN_WIDTH - 32;

export default function RemixScreen({ availableSounds = [], onClose }) {
  const { t } = useTranslation();
  // Stati principali
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(30);
  
  // Stati per editing
  const [editMode, setEditMode] = useState(null);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [remixName, setRemixName] = useState('');
  const [savedRemixes, setSavedRemixes] = useState([]);
  const [showLoadModal, setShowLoadModal] = useState(false);

  // Stati pubblicazione
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedRemixId, setPublishedRemixId] = useState(null);
  const [processingStatus, setProcessingStatus] = useState(null); // null | 'processing' | 'done' | 'error'

  // Ref per il listener real-time
  const remixUnsubscribeRef = useRef(null);
  
  // Audio players
  const soundObjects = useRef({});
  const playbackInterval = useRef(null);
  const startTimeRef = useRef(null);

  // 📥 Carica remix salvati all'avvio
  useEffect(() => {
    loadSavedRemixes();
  }, []);

  // 🧹 Cleanup al unmount
  useEffect(() => {
    return () => {
      stopAllSounds();
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current);
        playbackInterval.current = null;
      }
      if (remixUnsubscribeRef.current) {
        remixUnsubscribeRef.current();
        remixUnsubscribeRef.current = null;
      }
    };
  }, []);

  // ═══════════════════════════════════════════════════════
  // 💾 SAVE & LOAD SYSTEM
  // ═══════════════════════════════════════════════════════

  const loadSavedRemixes = async () => {
    try {
      const saved = await AsyncStorage.getItem('saved_remixes');
      if (saved) {
        setSavedRemixes(JSON.parse(saved));
      }
    } catch (_) {}
  };

  const saveRemix = async () => {
    if (!remixName.trim()) {
      Alert.alert(t('remix.nameRequired'), t('remix.nameRequiredMsg'));
      return;
    }

    if (tracks.length === 0) {
      Alert.alert(t('remix.tracksRequired'), t('remix.tracksRequiredMsg'));
      return;
    }

    try {
      const remixData = {
        id: Date.now().toString(),
        name: remixName.trim(),
        tracks: tracks.map(t => ({
          id: t.id,
          soundId: t.soundId,
          title: t.title,
          audioUrl: t.audioUrl,
          startTime: t.startTime,
          endTime: t.endTime,
          offsetStart: t.offsetStart,
          offsetEnd: t.offsetEnd,
          volume: t.volume,
          effects: t.effects,
          duration: t.duration,
          color: t.color,
        })),
        totalDuration,
        createdAt: new Date().toISOString(),
      };

      const existing = [...savedRemixes];
      existing.push(remixData);
      
      await AsyncStorage.setItem('saved_remixes', JSON.stringify(existing));
      setSavedRemixes(existing);
      setShowSaveModal(false);
      setRemixName('');
      
      Alert.alert(t('remix.saved'), t('remix.savedMsg', { name: remixData.name }));
    } catch (error) {
      Alert.alert(t('remix.errors.cannotSave'), t('remix.errors.cannotSaveMsg'));
    }
  };

  // Pubblica il remix su Firebase e avvia il processing
  const publishRemix = async () => {
    if (!remixName.trim()) {
      Alert.alert(t('remix.nameRequired'), t('remix.nameRequiredMsg'));
      return;
    }
    if (tracks.length === 0) {
      Alert.alert(t('remix.tracksRequired'), t('remix.tracksRequiredMsg'));
      return;
    }

    setIsPublishing(true);
    setShowSaveModal(false);

    try {
      // Salva metadata su Firestore
      const remixId = await createRemix({
        title: remixName.trim(),
        tracks,
        totalDuration,
        isPublic: true,
      });

      setPublishedRemixId(remixId);
      setProcessingStatus('processing');
      setRemixName('');

      // Sottoscrivi agli aggiornamenti real-time del remix
      if (remixUnsubscribeRef.current) remixUnsubscribeRef.current();
      remixUnsubscribeRef.current = subscribeToRemix(remixId, (updatedRemix) => {
        setProcessingStatus(updatedRemix.processingStatus || null);
        if (updatedRemix.isProcessed) {
          setIsPublishing(false);
          Alert.alert(t('remix.published'), t('remix.publishedMsg'));
          if (remixUnsubscribeRef.current) {
            remixUnsubscribeRef.current();
            remixUnsubscribeRef.current = null;
          }
        }
        if (updatedRemix.processingStatus === 'error') {
          setIsPublishing(false);
          Alert.alert(t('remix.errors.processingError'), updatedRemix.processingError || t('remix.errors.cannotPublishMsg'));
          if (remixUnsubscribeRef.current) {
            remixUnsubscribeRef.current();
            remixUnsubscribeRef.current = null;
          }
        }
      });

      // Avvia il processing sulla Cloud Function
      await requestRemixRendering(remixId);

    } catch (error) {
      setIsPublishing(false);
      setProcessingStatus('error');
      Alert.alert(t('remix.errors.cannotPublish'), t('remix.errors.cannotPublishMsg') + ': ' + error.message);
    }
  };

  const loadRemix = (remix) => {
    stopAllSounds();
    setTracks(remix.tracks);
    setTotalDuration(remix.totalDuration);
    setCurrentTime(0);
    setSelectedTrack(null);
    setShowLoadModal(false);
    Alert.alert(t('remix.loaded'), t('remix.loadedMsg', { name: remix.name }));
  };

  const deleteRemix = async (remixId) => {
    Alert.alert(
      t('remix.confirmDeleteTitle'),
      t('remix.confirmDeleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = savedRemixes.filter(r => r.id !== remixId);
              await AsyncStorage.setItem('saved_remixes', JSON.stringify(updated));
              setSavedRemixes(updated);
              Alert.alert(t('remix.deleted'), t('remix.deletedMsg'));
            } catch (error) {
              Alert.alert(t('remix.errors.cannotDelete'), t('remix.errors.cannotDeleteMsg'));
            }
          },
        },
      ]
    );
  };

  // ═══════════════════════════════════════════════════════
  // 🎵 GESTIONE TRACCE
  // ═══════════════════════════════════════════════════════

  const addTrack = async (sound) => {
    if (!sound.audioUrl || sound.audioUrl === '') {
      Alert.alert(t('remix.errors.noAudioUrl'), t('remix.errors.noAudioUrlMsg'));
      return;
    }

    // Se la durata è 0 o mancante (dati legacy), la leggiamo dall'audio reale
    let resolvedDuration = sound.duration || 0;
    if (!resolvedDuration) {
      try {
        const { sound: tmpSound } = await Audio.Sound.createAsync({ uri: sound.audioUrl });
        const st = await tmpSound.getStatusAsync();
        if (st.isLoaded && st.durationMillis) {
          resolvedDuration = Math.round(st.durationMillis / 1000);
        }
        await tmpSound.unloadAsync();
      } catch {}
    }

    const newTrack = {
      id: Date.now().toString(),
      soundId: sound.id,
      title: sound.title,
      audioUrl: sound.audioUrl,
      startTime: 0,
      endTime: resolvedDuration,
      offsetStart: 0,
      offsetEnd: resolvedDuration,
      volume: 1.0,
      effects: { reverb: 0, echo: 0, pitch: 0 },
      duration: resolvedDuration,
      color: getRandomColor(),
    };

    setTracks([...tracks, newTrack]);

    // Estendi la timeline se la traccia è più lunga della durata corrente
    if (resolvedDuration > totalDuration) {
      setTotalDuration(Math.ceil(resolvedDuration) + 2); // +2s di margine
    }

    setShowSoundPicker(false);
    Alert.alert(t('remix.trackAdded'), t('remix.trackAddedMsg', { title: sound.title }));
  };

  const removeTrack = (trackId) => {
    Alert.alert(
      t('remix.confirmRemoveTitle'),
      t('remix.confirmRemoveMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: () => {
            setTracks(tracks.filter(t => t.id !== trackId));
            if (selectedTrack?.id === trackId) {
              setSelectedTrack(null);
            }
          },
        },
      ]
    );
  };

  const updateTrack = (trackId, updates) => {
    setTracks(tracks.map(t => 
      t.id === trackId ? { ...t, ...updates } : t
    ));
  };

  // ═══════════════════════════════════════════════════════
  // 📥 DOWNLOAD LOCALE (fix Android 412)
  // ═══════════════════════════════════════════════════════

  const getLocalUri = async (uri, trackId) => {
    if (Platform.OS !== 'android' || !uri.startsWith('http')) return uri;
    try {
      const urlPath = uri.split('?')[0];
      const rawExt = urlPath.split('.').pop().toLowerCase();
      const ext = ['webm', 'ogg', 'm4a', 'mp3', 'mp4', 'aac'].includes(rawExt) ? rawExt : 'm4a';
      const localPath = `${FileSystem.cacheDirectory}remix_preview_${trackId}.${ext}`;
      const info = await FileSystem.getInfoAsync(localPath);
      if (info.exists && info.size > 100) return localPath;
      const dl = await FileSystem.downloadAsync(uri, localPath);
      return dl.uri;
    } catch {
      return uri;
    }
  };

  // ═══════════════════════════════════════════════════════
  // 🎮 PLAYBACK SYSTEM (FIXED!)
  // ═══════════════════════════════════════════════════════

  const handlePlayPause = async () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      await startPlayback();
    }
  };

  // 🎯 SEEK - Sposta il cursore manualmente
  const seekTo = (newTime) => {
    const validTime = Math.max(0, Math.min(newTime, totalDuration));
    setCurrentTime(validTime);
    
    if (isPlaying) {
      // Se sta suonando, riavvia dal nuovo punto
      stopPlayback().then(() => {
        setCurrentTime(validTime);
        startPlayback();
      });
    }
  };

  const stopPlayback = async () => {
    
    // 1. Ferma l'interval
    if (playbackInterval.current) {
      clearInterval(playbackInterval.current);
      playbackInterval.current = null;
    }

    // 2. Ferma tutti i suoni
    await stopAllSounds();

    // 3. Reset stati
    setIsPlaying(false);
    startTimeRef.current = null;
  };

  const resetPlayback = async () => {
    await stopPlayback();
    setCurrentTime(0);
  };

  const startPlayback = async () => {
    if (tracks.length === 0) {
      Alert.alert(t('remix.noTracksToPlay'), t('remix.noTracksToPlayMsg'));
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Fase 1: carica tutti i suoni PRIMA di avviare il timer
      const loadedSounds = await Promise.all(tracks.map(async (track) => {
        try {
          if (soundObjects.current[track.id]) {
            await soundObjects.current[track.id].unloadAsync().catch(() => {});
          }
          const localUri = await getLocalUri(track.audioUrl, track.id);
          const { sound } = await Audio.Sound.createAsync(
            { uri: localUri },
            { shouldPlay: false, volume: track.volume, isLooping: false }
          );
          soundObjects.current[track.id] = sound;
          return { sound, track };
        } catch (_) {
          return null;
        }
      }));

      // Fase 2: timer parte ADESSO, dopo che tutto è pronto
      const playStartTime = currentTime;
      startTimeRef.current = Date.now() - (playStartTime * 1000);
      setIsPlaying(true);

      // Fase 3: avvia ogni traccia al momento giusto
      for (const item of loadedSounds) {
        if (!item) continue;
        const { sound, track } = item;
        const trackStart = track.offsetStart;
        const trackEnd = track.offsetEnd;
        const trimmedDurationMs = (track.endTime - track.startTime) * 1000;

        if (playStartTime >= trackStart && playStartTime < trackEnd) {
          const seekMs = (playStartTime - trackStart) * 1000 + track.startTime * 1000;
          const remainingMs = trimmedDurationMs - (playStartTime - trackStart) * 1000;
          sound.setStatusAsync({ shouldPlay: true, positionMillis: Math.max(0, seekMs) });
          setTimeout(async () => {
            try { await sound.pauseAsync(); } catch (_) {}
          }, Math.max(0, remainingMs));
        } else if (playStartTime < trackStart) {
          const delayMs = (trackStart - playStartTime) * 1000;
          setTimeout(async () => {
            try {
              await sound.setStatusAsync({ shouldPlay: true, positionMillis: track.startTime * 1000 });
              setTimeout(async () => {
                try { await sound.pauseAsync(); } catch (_) {}
              }, trimmedDurationMs);
            } catch (_) {}
          }, Math.max(0, delayMs));
        }
      }

      // Fase 4: aggiorna il cursore
      playbackInterval.current = setInterval(() => {
        if (!startTimeRef.current) {
          stopPlayback();
          return;
        }
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        if (elapsed >= totalDuration) {
          stopPlayback();
          setCurrentTime(0);
        } else {
          setCurrentTime(elapsed);
        }
      }, 50);

    } catch (error) {
      Alert.alert(t('remix.errors.cannotPlay'), t('remix.errors.cannotPlayMsg'));
      await stopPlayback();
    }
  };

  const stopAllSounds = async () => {
    const promises = Object.keys(soundObjects.current).map(async (key) => {
      try {
        await soundObjects.current[key].stopAsync();
        await soundObjects.current[key].unloadAsync();
      } catch (e) {
      }
    });
    
    await Promise.all(promises);
    soundObjects.current = {};
  };

  // ═══════════════════════════════════════════════════════
  // ✂️ EDITING FUNCTIONS
  // ═══════════════════════════════════════════════════════

  const trimTrack = (trackId, newStart, newEnd) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    const validStart = Math.max(0, Math.min(newStart, track.duration));
    const validEnd = Math.max(validStart + 0.5, Math.min(newEnd, track.duration));

    updateTrack(trackId, {
      startTime: validStart,
      endTime: validEnd,
      offsetEnd: track.offsetStart + (validEnd - validStart),
    });
  };

  const moveTrack = (trackId, newOffset) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    const duration = track.endTime - track.startTime;
    const validOffset = Math.max(0, Math.min(newOffset, totalDuration - duration));

    updateTrack(trackId, {
      offsetStart: validOffset,
      offsetEnd: validOffset + duration,
    });
  };

  const duplicateTrack = (trackId) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    const newTrack = {
      ...track,
      id: Date.now().toString(),
      offsetStart: track.offsetEnd + 0.5,
      offsetEnd: track.offsetEnd + 0.5 + (track.endTime - track.startTime),
    };

    setTracks([...tracks, newTrack]);
    Alert.alert(t('remix.duplicated'), t('remix.duplicatedMsg'));
  };

  const clearAll = () => {
    Alert.alert(
      t('remix.confirmDeleteTitle'),
      t('remix.confirmDeleteMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Pulisci',
          style: 'destructive',
          onPress: async () => {
            await stopPlayback();
            setTracks([]);
            setSelectedTrack(null);
            setCurrentTime(0);
          },
        },
      ]
    );
  };

  // ═══════════════════════════════════════════════════════
  // 🎨 UTILITY
  // ═══════════════════════════════════════════════════════

  const getRandomColor = () => {
    const colors = ['#ef4444', '#f97316', '#eab308', '#06b6d4', '#8b5cf6', '#ec4899'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ═══════════════════════════════════════════════════════
  // 🎨 RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <View style={styles.container}>
      <LinearGradient 
        colors={['#0f172a', '#1e293b', '#0f172a']} 
        style={StyleSheet.absoluteFill} 
      />

      {/* Banner stato processing */}
      {isPublishing && (
        <View style={styles.processingBanner}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.processingText}>
            {processingStatus === 'processing'
              ? '⚙️ Elaborazione audio in corso...'
              : '📤 Caricamento...'}
          </Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onClose && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={onClose}
            >
              <Feather name="arrow-left" size={20} color="#06b6d4" />
            </TouchableOpacity>
          )}
          <Text style={styles.title} numberOfLines={1}>{t('remix.title')}</Text>
        </View>
        <View style={styles.headerButtons}>
  <TouchableOpacity 
    style={styles.headerButton}
    onPress={() => setShowLoadModal(true)}
  >
    <Feather name="folder" size={18} color="#fff" />
  </TouchableOpacity>
  <TouchableOpacity
    style={styles.headerButton}
    onPress={() => setShowSaveModal(true)}
  >
    <Feather name="save" size={18} color="#fff" />
  </TouchableOpacity>
  <TouchableOpacity
    style={styles.headerButton}
    onPress={() => setShowSoundPicker(true)}
  >
    <Feather name="plus" size={18} color="#fff" />
  </TouchableOpacity>
  <TouchableOpacity
    style={styles.headerButton}
    onPress={clearAll}
  >
    <Feather name="trash-2" size={18} color="#ef4444" />
  </TouchableOpacity>
</View>
      </View>

      {/* Timeline Canvas */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.canvasContainer}>
          {/* Time ruler */}
          <View style={styles.timeRuler}>
            {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
              <View key={i} style={styles.timeMarker}>
                <Text style={styles.timeLabel}>{i}s</Text>
                <View style={styles.timeTick} />
              </View>
            ))}
          </View>

          {/* Playhead */}
          <View 
            style={[
              styles.playhead, 
              { left: (currentTime / totalDuration) * CANVAS_WIDTH }
            ]} 
          />

          {/* Tracks */}
          <View style={styles.tracksContainer}>
            {tracks.length === 0 ? (
              <View style={styles.emptyCanvas}>
                <Text style={styles.emptyIcon}>🎵</Text>
                <Text style={styles.emptyText}>{t('remix.emptyCanvas')}</Text>
                <Text style={styles.emptySubtext}>
                  {t('remix.addSoundsHint')}
                </Text>
              </View>
            ) : (
              tracks.map((track, index) => (
                <TrackComponent
                  key={track.id}
                  track={track}
                  index={index}
                  isSelected={selectedTrack?.id === track.id}
                  onSelect={() => setSelectedTrack(track)}
                  onMove={(offset) => moveTrack(track.id, offset)}
                  onRemove={() => removeTrack(track.id)}
                  onDuplicate={() => duplicateTrack(track.id)}
                  totalDuration={totalDuration}
                  canvasWidth={CANVAS_WIDTH}
                />
              ))
            )}
          </View>
        </View>

        {/* Track Editor */}
        {selectedTrack && (
          <View style={styles.editorPanel}>
            <View style={styles.editorHeader}>
              <Text style={styles.editorTitle}>
                ✂️ {selectedTrack.title}
              </Text>
              <TouchableOpacity onPress={() => setSelectedTrack(null)}>
                <Feather name="x" size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Trim Controls */}
            <View style={styles.editorSection}>
              <Text style={styles.editorLabel}>
                ✂️ {t('remix.trimLabel', { start: formatTime(selectedTrack.startTime), end: formatTime(selectedTrack.endTime) })}
              </Text>
              <View style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>{t('remix.start')}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={selectedTrack.duration}
                  value={selectedTrack.startTime}
                  onValueChange={(val) => 
                    trimTrack(selectedTrack.id, val, selectedTrack.endTime)
                  }
                  minimumTrackTintColor="#06b6d4"
                  maximumTrackTintColor="#334155"
                  thumbTintColor="#06b6d4"
                />
              </View>
              <View style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>{t('remix.end')}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={selectedTrack.duration}
                  value={selectedTrack.endTime}
                  onValueChange={(val) => 
                    trimTrack(selectedTrack.id, selectedTrack.startTime, val)
                  }
                  minimumTrackTintColor="#06b6d4"
                  maximumTrackTintColor="#334155"
                  thumbTintColor="#06b6d4"
                />
              </View>
            </View>

            {/* Volume Control */}
            <View style={styles.editorSection}>
              <Text style={styles.editorLabel}>
                🔊 Volume: {Math.round(selectedTrack.volume * 100)}%
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={selectedTrack.volume}
                onValueChange={(val) => 
                  updateTrack(selectedTrack.id, { volume: val })
                }
                minimumTrackTintColor="#06b6d4"
                maximumTrackTintColor="#334155"
                thumbTintColor="#06b6d4"
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Transport Controls */}
      <View style={styles.transport}>
        <View style={styles.timeDisplay}>
          <Text style={styles.timeText}>
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </Text>
        </View>
        
        <View style={styles.transportButtons}>
          <TouchableOpacity 
            style={styles.transportButton}
            onPress={resetPlayback}
          >
            <Feather name="square" size={22} color="#fff" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.transportButton, styles.playButton]}
            onPress={handlePlayPause}
            disabled={tracks.length === 0}
          >
            <Feather name={isPlaying ? 'pause' : 'play'} size={28} color="#fff" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.transportButton}
            onPress={() => setTotalDuration(totalDuration + 10)}
          >
            <Feather name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sound Picker Modal */}
      <Modal
        visible={showSoundPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSoundPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📚 {t('remix.yourSounds')}</Text>
              <TouchableOpacity onPress={() => setShowSoundPicker(false)}>
                <Feather name="x" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.soundList}>
              {availableSounds.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🎤</Text>
                  <Text style={styles.emptyText}>{t('remix.noSounds')}</Text>
                  <Text style={styles.emptySubtext}>
                    {t('remix.noSoundsHint')}
                  </Text>
                </View>
              ) : (
                availableSounds.map(sound => (
                  <TouchableOpacity
                    key={sound.id}
                    style={styles.soundPickerItem}
                    onPress={() => addTrack(sound)}
                  >
                    <View style={styles.soundPickerInfo}>
                      <Text style={styles.soundPickerTitle}>{sound.title}</Text>
                      <Text style={styles.soundPickerMeta}>
                        {sound.duration}s · {sound.mood}
                      </Text>
                    </View>
                    <View style={styles.soundPickerAction}>
                      <Feather name="plus-circle" size={22} color="#fff" />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Save Modal */}
      <Modal
        visible={showSaveModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSaveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.saveModal}>
            <Text style={styles.saveModalTitle}>💾 {t('remix.saveTitle')}</Text>
            <TextInput
              style={styles.saveInput}
              placeholder={t('remix.namePlaceholder')}
              placeholderTextColor="#64748b"
              value={remixName}
              onChangeText={setRemixName}
              autoFocus
            />
            <View style={styles.saveModalButtons}>
              <TouchableOpacity
                style={[styles.saveModalButton, styles.cancelButton]}
                onPress={() => { setShowSaveModal(false); setRemixName(''); }}
              >
                <Text style={styles.saveModalButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveModalButton, styles.confirmButton]}
                onPress={saveRemix}
              >
                <Text style={styles.saveModalButtonText}>💾 Locale</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveModalButton, styles.publishButton]}
                onPress={publishRemix}
              >
                <Text style={styles.saveModalButtonText}>🌐 Pubblica</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Load Modal */}
      <Modal
        visible={showLoadModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLoadModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📂 {t('remix.loadTitle')}</Text>
              <TouchableOpacity onPress={() => setShowLoadModal(false)}>
                <Feather name="x" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.soundList}>
              {savedRemixes.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>📂</Text>
                  <Text style={styles.emptyText}>{t('remix.noRemixes')}</Text>
                  <Text style={styles.emptySubtext}>
                    {t('remix.noRemixesHint')}
                  </Text>
                </View>
              ) : (
                savedRemixes.map(remix => (
                  <View key={remix.id} style={styles.remixItem}>
                    <TouchableOpacity
                      style={styles.remixItemContent}
                      onPress={() => loadRemix(remix)}
                    >
                      <View style={styles.remixItemInfo}>
                        <Text style={styles.remixItemTitle}>{remix.name}</Text>
                        <Text style={styles.remixItemMeta}>
                          {remix.tracks.length} tracce · {formatTime(remix.totalDuration)}
                        </Text>
                        <Text style={styles.remixItemDate}>
                          {new Date(remix.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.remixDeleteButton}
                      onPress={() => deleteRemix(remix.id)}
                    >
                      <Feather name="trash-2" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════
// 🎨 STYLES
// ═══════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  backButton: {
    backgroundColor: '#1e293b',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#06b6d4',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    flexShrink: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
  },
  headerButton: {
    backgroundColor: '#1e293b',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  canvasContainer: {
    padding: 16,
    minHeight: 400,
  },
  timeRuler: {
    flexDirection: 'row',
    height: 40,
    marginBottom: 16,
  },
  timeMarker: {
    width: CANVAS_WIDTH / 30,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 4,
  },
  timeTick: {
    width: 1,
    height: 20,
    backgroundColor: '#334155',
  },
  playhead: {
    position: 'absolute',
    top: 40,
    width: 2,
    height: 400,
    backgroundColor: '#ef4444',
    zIndex: 100,
  },
  tracksContainer: {
    height: 300,
    position: 'relative',
  },
  emptyCanvas: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  track: {
    position: 'absolute',
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
  },
  trackDragging: {
    opacity: 0.8,
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  trackContent: {
    flex: 1,
    padding: 8,
    justifyContent: 'center',
  },
  trackTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  trackDuration: {
    fontSize: 10,
    color: '#e2e8f0',
  },
  trackActions: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    gap: 4,
  },
  trackActionButton: {
    backgroundColor: '#0f172a',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackActionIcon: {
    fontSize: 12,
  },
  editorPanel: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    margin: 16,
    marginTop: 0,
    borderWidth: 1,
    borderColor: '#334155',
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  editorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  editorClose: {
    fontSize: 20,
    color: '#94a3b8',
  },
  editorSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  editorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 12,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#64748b',
    width: 50,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  transport: {
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    padding: 16,
  },
  timeDisplay: {
    alignItems: 'center',
    marginBottom: 12,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#06b6d4',
  },
  transportButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  transportButton: {
    backgroundColor: '#334155',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    backgroundColor: '#06b6d4',
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  transportIcon: {
    fontSize: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '70%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modalClose: {
    fontSize: 24,
    color: '#94a3b8',
  },
  soundList: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  soundPickerItem: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  soundPickerInfo: {
    flex: 1,
  },
  soundPickerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  soundPickerMeta: {
    fontSize: 12,
    color: '#64748b',
  },
  soundPickerAction: {
    backgroundColor: '#06b6d4',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  soundPickerIcon: {
    fontSize: 18,
    color: '#fff',
  },
  // Save Modal Styles
  saveModal: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    margin: 32,
    borderWidth: 1,
    borderColor: '#334155',
  },
  saveModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  saveInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  saveModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  saveModalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#334155',
  },
  confirmButton: {
    backgroundColor: '#06b6d4',
  },
  publishButton: {
    backgroundColor: '#7c3aed',
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#7c3aed',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  processingText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  saveModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Remix Item Styles
  remixItem: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  remixItemContent: {
    flex: 1,
    padding: 16,
  },
  remixItemInfo: {
    flex: 1,
  },
  remixItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  remixItemMeta: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  remixItemDate: {
    fontSize: 11,
    color: '#475569',
  },
  remixDeleteButton: {
    backgroundColor: '#991b1b',
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  remixDeleteIcon: {
    fontSize: 20,
  },
});

// ═══════════════════════════════════════════════════════
// 🎨 TRACK COMPONENT
// ═══════════════════════════════════════════════════════

function TrackComponent({ 
  track, 
  index, 
  isSelected, 
  onSelect, 
  onMove,
  onRemove, 
  onDuplicate,
  totalDuration,
  canvasWidth 
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const initialOffset = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        dragStartX.current = evt.nativeEvent.pageX;
        initialOffset.current = track.offsetStart;
      },
      onPanResponderMove: (evt) => {
        const deltaX = evt.nativeEvent.pageX - dragStartX.current;
        const deltaTime = (deltaX / canvasWidth) * totalDuration;
        const newOffset = initialOffset.current + deltaTime;
        onMove(newOffset);
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
      },
    })
  ).current;

  const trackWidth = ((track.endTime - track.startTime) / totalDuration) * canvasWidth;
  const trackLeft = (track.offsetStart / totalDuration) * canvasWidth;

  return (
    <View 
      style={[
        styles.track,
        { 
          top: index * 70,
          left: trackLeft,
          width: trackWidth,
          borderColor: isSelected ? '#06b6d4' : track.color,
          backgroundColor: track.color + '40',
        },
        isDragging && styles.trackDragging,
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity 
        style={styles.trackContent}
        onPress={onSelect}
        activeOpacity={0.8}
      >
        <Text style={styles.trackTitle} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.trackDuration}>
          {((track.endTime - track.startTime)).toFixed(1)}s
        </Text>
      </TouchableOpacity>

      {isSelected && (
        <View style={styles.trackActions}>
          <TouchableOpacity 
            style={styles.trackActionButton}
            onPress={onDuplicate}
          >
            <Feather name="copy" size={11} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.trackActionButton}
            onPress={onRemove}
          >
            <Feather name="trash-2" size={11} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}