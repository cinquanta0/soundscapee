import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, Circle } from 'react-native-maps';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { auth } from '../../firebaseConfig';
import { blockUser } from '../../services/blockService';
import { getNearbySounds, getSoundsForMap, incrementListens } from '../../services/firebaseService';
import { useTranslation } from 'react-i18next';
import ReportModal from '../../components/ReportModal';

const { width, height } = Dimensions.get('window');

const AVATAR_COLORS = ['#7C3AED','#0EA5E9','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#84CC16'];
const FEATHER_MAP_ICONS = ['music','headphones','radio','mic','speaker','disc','volume-2','play-circle','star','zap','heart','sun','moon','cloud','wind','droplet'];

function getAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function isFeatherIcon(val: string | undefined): boolean {
  return !!val && FEATHER_MAP_ICONS.includes(val);
}

export default function MapScreen() {
  const { t } = useTranslation();
  const [userLocation, setUserLocation] = useState<any | null>(null);
  const [sounds, setSounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSound, setSelectedSound] = useState<any | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [searchRadius, setSearchRadius] = useState(10);
  const [viewMode, setViewMode] = useState('nearby');
  const [errorMsg, setErrorMsg] = useState('');

  // Report Modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTargetId, setReportTargetId] = useState<string>('');
  const [reportTargetType, setReportTargetType] = useState<'audio' | 'user' | 'map'>('audio');

  const mapRef = useRef<any>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const userLocationRef = useRef<any | null>(null);

  useEffect(() => {
    initializeMap();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (userLocation && viewMode === 'nearby') {
      loadNearbySounds(userLocation);
    }
  }, [searchRadius, viewMode]);

  const initializeMap = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg(t('map.errors.permissionDenied'));
        Alert.alert(t('map.errors.permissionDenied'), t('map.errors.permissionMsg'));
        setLoading(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const userPos = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      userLocationRef.current = userPos;
      setUserLocation(userPos);
      await loadNearbySounds(userPos);
      setLoading(false);
    } catch (error: any) {
      setErrorMsg(error?.message || t('map.errors.cannotLoad'));
      Alert.alert(t('common.error'), error?.message || t('map.errors.cannotLoad'));
      setLoading(false);
    }
  };

  const loadNearbySounds = async (location?: any) => {
    const loc = location || userLocationRef.current;
    if (!loc) return;
    try {
      const nearby = await getNearbySounds(loc, searchRadius);
      setSounds(nearby);
      if (nearby.length > 0 && mapRef.current) {
        mapRef.current.fitToCoordinates(
          nearby.map((s: any) => ({ latitude: s.location.latitude, longitude: s.location.longitude })),
          { edgePadding: { top: 80, right: 40, bottom: 120, left: 40 }, animated: true }
        );
      }
    } catch {
      Alert.alert(t('common.error'), t('map.errors.cannotLoad'));
    }
  };

  const loadAllSounds = async () => {
    try {
      const allSounds = await getSoundsForMap(200);
      setSounds(allSounds);
      if (allSounds.length > 0 && mapRef.current) {
        mapRef.current.fitToCoordinates(
          allSounds.map((s: any) => ({ latitude: s.location.latitude, longitude: s.location.longitude })),
          { edgePadding: { top: 80, right: 40, bottom: 120, left: 40 }, animated: true }
        );
      }
    } catch {
      Alert.alert(t('common.error'), t('map.errors.cannotLoad'));
    }
  };

  const handleMarkerPress = (soundData: any) => {
    setSelectedSound(soundData);
    setShowDetails(true);
  };

  const handlePlayPause = async (soundData: any) => {
    try {
      if (soundRef.current && playingId !== soundData.id) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setPlayingId(null);
        setIsPaused(false);
      }
      if (soundRef.current && playingId === soundData.id) {
        if (isPaused) {
          await soundRef.current.playAsync();
          setIsPaused(false);
        } else {
          await soundRef.current.pauseAsync();
          setIsPaused(true);
        }
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: soundData.audioUrl }, { shouldPlay: true });
      soundRef.current = newSound;
      setPlayingId(soundData.id);
      setIsPaused(false);
      await incrementListens(soundData.id);
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          setIsPaused(false);
          soundRef.current = null;
          newSound.unloadAsync().catch(() => {});
        }
      });
    } catch {
      Alert.alert(t('common.error'), t('map.errors.cannotPlay'));
    }
  };

  const handleCloseModal = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      setPlayingId(null);
      setIsPaused(false);
    }
    setShowDetails(false);
    setSelectedSound(null);
  };

  const handleShare = async (soundData: any) => {
    if (soundData.allowExternalShare === false) {
      Alert.alert(t('common.info', 'Info'), t('map.shareDenied', "L'autore non permette la condivisione esterna di questo audio."));
      return;
    }
    try {
      await Share.share({
        message: `Ascolta "${soundData.title || 'questo audio'}" su MIUSLYK 🎵\nsoundscapemobile://sound/${soundData.id}`,
        url: `soundscapemobile://sound/${soundData.id}`,
      });
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    }
  };

  const handleBlockUser = (userId: string) => {
    const me = auth.currentUser;
    if (!me) return;
    Alert.alert(
      t('map.blockConfirmTitle', 'Blocca utente'),
      t('map.blockConfirmDesc', 'Sei sicuro di voler bloccare questo utente? Non vedrai più i suoi audio.'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: t('common.block', 'Blocca'), 
          style: 'destructive', 
          onPress: async () => {
            try {
              await blockUser(me.uid, userId);
              Alert.alert(t('common.success'), t('map.blockedSuccess', 'Utente bloccato con successo.'));
              handleCloseModal();
              setSounds(prev => prev.filter(s => s.userId !== userId));
            } catch (err) {
              Alert.alert(t('common.error'), t('map.blockError', 'Errore durante il blocco.'));
            }
          }
        }
      ]
    );
  };

  const handleReport = (soundData: any) => {
    setReportTargetId(soundData.id);
    setReportTargetType('audio');
    setShowReportModal(true);
  };

  const getMoodColor = (mood: string) => {
    const colors: Record<string, string> = {
      Energico: '#f97316',
      Rilassante: '#3b82f6',
      Gioioso: '#eab308',
      Nostalgico: '#a855f7',
    };
    return colors[mood] || '#6b7280';
  };

  const toggleViewMode = () => {
    const next = viewMode === 'nearby' ? 'all' : 'nearby';
    setViewMode(next);
    if (next === 'all') loadAllSounds();
    else loadNearbySounds(userLocationRef.current);
  };

  const isCurrentSoundPlaying = (id: string) => playingId === id && !isPaused;

  const renderMarkerAvatar = (soundData: any) => {
    if (soundData.userPhoto) {
      return <Image source={{ uri: soundData.userPhoto }} style={styles.markerPhoto} />;
    }
    const bg = isFeatherIcon(soundData.userAvatar)
      ? getAvatarColor(soundData.username || soundData.userId || '')
      : getMoodColor(soundData.mood);
    return (
      <View style={[styles.markerAvatarBg, { backgroundColor: bg }]}>
        {isFeatherIcon(soundData.userAvatar) ? (
          <Feather name={soundData.userAvatar as any} size={18} color="#fff" />
        ) : (
          <Text style={styles.markerEmoji}>{soundData.userAvatar || '🎵'}</Text>
        )}
      </View>
    );
  };

  const renderModalAvatar = (soundData: any, size = 46) => {
    if (soundData.userPhoto) {
      return <Image source={{ uri: soundData.userPhoto }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    }
    const bg = isFeatherIcon(soundData.userAvatar)
      ? getAvatarColor(soundData.username || '')
      : getMoodColor(soundData.mood);
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, justifyContent: 'center', alignItems: 'center' }}>
        {isFeatherIcon(soundData.userAvatar) ? (
          <Feather name={soundData.userAvatar as any} size={Math.round(size * 0.42)} color="#fff" />
        ) : (
          <Text style={{ fontSize: Math.round(size * 0.44) }}>{soundData.userAvatar || '🎵'}</Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#050816', '#0B1230', '#180828']} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingPanel}>
          <Text style={styles.loadingEyebrow}>Sound map</Text>
          <ActivityIndicator size="large" color="#67E8F9" />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
      </View>
    );
  }

  if (!userLocation) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#050816', '#0B1230', '#180828']} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingPanel}>
          <Text style={styles.loadingEyebrow}>Sound map</Text>
          <Text style={styles.errorText}>❌ {t('map.errors.cannotLoad')}</Text>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
        <TouchableOpacity style={styles.retryButton} onPress={initializeMap}>
          <Text style={styles.retryButtonText}>{t('common.ok')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mappa a schermo intero */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {viewMode === 'nearby' && (
          <Circle
            center={userLocation}
            radius={searchRadius * 1000}
            strokeColor="rgba(6,182,212,0.4)"
            fillColor="rgba(6,182,212,0.06)"
            strokeWidth={1.5}
          />
        )}

        {sounds.map((soundData) => {
          const playing = isCurrentSoundPlaying(soundData.id);
          return (
            <Marker
              key={soundData.id}
              coordinate={{ latitude: soundData.location.latitude, longitude: soundData.location.longitude }}
              onPress={() => handleMarkerPress(soundData)}
              tracksViewChanges={playing}
            >
              <View style={styles.markerContainer}>
                <View style={[styles.markerBubble, playing && styles.markerBubblePlaying]}>
                  {renderMarkerAvatar(soundData)}
                </View>
                {playing && <View style={styles.markerPlayDot} />}
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Gradiente sottile solo in alto per leggibilità controlli */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.0)']}
        style={styles.topGradient}
      />

      {/* Barra controlli in alto */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.pillButton} onPress={toggleViewMode}>
          <Feather name={viewMode === 'nearby' ? 'navigation' : 'globe'} size={13} color="#67E8F9" />
          <Text style={styles.pillButtonText}>{viewMode === 'nearby' ? t('map.nearby') : t('map.all')}</Text>
        </TouchableOpacity>

        {viewMode === 'nearby' && (
          <View style={styles.radiusPill}>
            <TouchableOpacity
              style={styles.radiusBtn}
              onPress={() => setSearchRadius(Math.max(1, searchRadius - 5))}
            >
              <Text style={styles.radiusBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.radiusValue}>{searchRadius} km</Text>
            <TouchableOpacity
              style={styles.radiusBtn}
              onPress={() => setSearchRadius(Math.min(50, searchRadius + 5))}
            >
              <Text style={styles.radiusBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.countPill}>
          <Feather name="music" size={11} color="#D9FF5A" />
          <Text style={styles.countText}>{sounds.length}</Text>
        </View>
      </View>

      {/* Modal dettagli */}
      <Modal
        visible={showDetails}
        animationType="slide"
        transparent
        onRequestClose={handleCloseModal}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={handleCloseModal} />
        <View style={styles.bottomSheet}>
          {/* Handle */}
          <View style={styles.sheetHandle} />

          {selectedSound && (
            <>
              {/* Header utente */}
              <View style={styles.sheetHeader}>
                <View style={styles.sheetAvatarWrap}>
                  {renderModalAvatar(selectedSound, 50)}
                  <View style={[styles.moodDot, { backgroundColor: getMoodColor(selectedSound.mood) }]} />
                </View>
                <View style={styles.sheetUserInfo}>
                  <Text style={styles.sheetUsername}>{selectedSound.username}</Text>
                  <View style={styles.sheetMeta}>
                    {selectedSound.distance ? (
                      <View style={styles.metaChip}>
                        <Feather name="map-pin" size={11} color="#94a3b8" />
                        <Text style={styles.metaChipText}>{selectedSound.distance.toFixed(1)} km</Text>
                      </View>
                    ) : null}
                    <View style={[styles.metaChip, { backgroundColor: getMoodColor(selectedSound.mood) + '22' }]}>
                      <Text style={[styles.metaChipText, { color: getMoodColor(selectedSound.mood) }]}>{selectedSound.mood}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Titolo e descrizione */}
              <View style={styles.sheetBody}>
                <Text style={styles.sheetTitle}>{selectedSound.title}</Text>
                {selectedSound.description ? (
                  <Text style={styles.sheetDesc}>{selectedSound.description}</Text>
                ) : null}

                {/* Stats */}
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Feather name="heart" size={14} color="#ef4444" />
                    <Text style={styles.statValue}>{selectedSound.likes}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Feather name="headphones" size={14} color="#67E8F9" />
                    <Text style={styles.statValue}>{selectedSound.listens}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Feather name="clock" size={14} color="#94a3b8" />
                    <Text style={styles.statValue}>{selectedSound.duration}s</Text>
                  </View>
                </View>
              </View>

              {/* Azioni Secondarie */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16, justifyContent: 'space-between' }}>
                <TouchableOpacity style={styles.actionIconBtn} onPress={() => handleShare(selectedSound)}>
                  <Feather name="share" size={18} color="#94a3b8" />
                  <Text style={styles.actionIconText}>{t('map.share', 'Condividi')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionIconBtn} onPress={() => handleReport(selectedSound)}>
                  <Feather name="flag" size={18} color="#94a3b8" />
                  <Text style={styles.actionIconText}>{t('map.report', 'Segnala')}</Text>
                </TouchableOpacity>
                {selectedSound.userId !== auth.currentUser?.uid && (
                  <TouchableOpacity style={styles.actionIconBtn} onPress={() => handleBlockUser(selectedSound.userId)}>
                    <Feather name="slash" size={18} color="#ef4444" />
                    <Text style={styles.actionIconTextRed}>{t('map.block', 'Blocca')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Azioni Primarie */}
              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.closeBtn} onPress={handleCloseModal}>
                  <Text style={styles.closeBtnText}>{t('common.close')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.playBtn, isCurrentSoundPlaying(selectedSound.id) && styles.playBtnPausing]}
                  onPress={() => handlePlayPause(selectedSound)}
                >
                  <Feather
                    name={playingId === selectedSound.id && !isPaused ? 'pause' : 'play'}
                    size={16}
                    color="#fff"
                  />
                  <Text style={styles.playBtnText}>
                    {playingId === selectedSound.id
                      ? (isPaused ? t('map.listen') : t('map.pause'))
                      : t('map.listen')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetId={reportTargetId}
        targetType={reportTargetType}
      />
    </View>
  );
}

const TOP_OFFSET = Platform.OS === 'ios' ? 54 : 14;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  map: { width: '100%', height: '100%' },

  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 130,
  },

  topBar: {
    position: 'absolute',
    top: TOP_OFFSET,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(7,10,20,0.82)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillButtonText: {
    color: '#F7F8FF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  radiusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7,10,20,0.82)',
    borderRadius: 999,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  radiusBtn: {
    width: 32,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radiusBtnText: {
    color: '#67E8F9',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  radiusValue: {
    color: '#F7F8FF',
    fontSize: 13,
    fontWeight: '700',
    minWidth: 46,
    textAlign: 'center',
  },

  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(7,10,20,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginLeft: 'auto',
  },
  countText: {
    color: '#D9FF5A',
    fontSize: 13,
    fontWeight: '800',
  },

  // Marker
  markerContainer: { alignItems: 'center' },
  markerBubble: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 3,
    borderColor: '#ffffff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  markerBubblePlaying: {
    borderColor: '#FBBF24',
    shadowColor: '#FBBF24',
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },
  markerPhoto: { width: 40, height: 40 },
  markerAvatarBg: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerEmoji: { fontSize: 20 },
  markerPlayDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#FBBF24',
    borderWidth: 2,
    borderColor: '#fff',
    marginTop: -5,
  },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingPanel: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.14)',
    backgroundColor: 'rgba(9,12,28,0.84)',
  },
  loadingEyebrow: {
    color: '#67E8F9',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  loadingText: { color: '#F7F8FF', fontSize: 15, fontWeight: '700' },
  errorText: { color: '#ef4444', marginTop: 8, fontSize: 14, textAlign: 'center' },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#8B5CFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
  },
  retryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Modal / Bottom sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  bottomSheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 18,
  },

  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  sheetAvatarWrap: { position: 'relative' },
  moodDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#111827',
  },
  sheetUserInfo: { flex: 1, gap: 6 },
  sheetUsername: { color: '#F7F8FF', fontSize: 16, fontWeight: '700' },
  sheetMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  metaChipText: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },

  sheetBody: { marginBottom: 20 },
  sheetTitle: { color: '#F7F8FF', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  sheetDesc: { color: '#94a3b8', fontSize: 13, lineHeight: 18, marginBottom: 14 },

  statsRow: { flexDirection: 'row', gap: 20 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },

  sheetActions: { flexDirection: 'row', gap: 10 },
  closeBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  closeBtnText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
  playBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#8B5CFF',
  },
  playBtnPausing: { backgroundColor: '#67E8F9' },
  playBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  actionIconBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  actionIconText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  actionIconTextRed: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
});
