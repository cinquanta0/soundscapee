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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { getNearbySounds, getSoundsForMap, incrementListens } from '../../services/firebaseService';
import { useTranslation } from 'react-i18next';

const { width, height } = Dimensions.get('window');

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

  const mapRef = useRef<any>(null);
  // Ref per l'istanza audio — evita il memory leak del closure nella cleanup
  const soundRef = useRef<Audio.Sound | null>(null);
  // Ref per la location — evita la race condition nel doppio caricamento
  const userLocationRef = useRef<any | null>(null);

  useEffect(() => {
    initializeMap();
    return () => {
      // Cleanup corretto: usa ref invece dello state (non soffre del closure stale)
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

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const userPos = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      userLocationRef.current = userPos;
      setUserLocation(userPos);

      // Carica i suoni passando la location direttamente — non dipende dallo state aggiornato
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
        const coordinates = nearby.map((s: any) => ({
          latitude: s.location.latitude,
          longitude: s.location.longitude,
        }));
        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
    } catch (_error) {
      Alert.alert(t('common.error'), t('map.errors.cannotLoad'));
    }
  };

  const loadAllSounds = async () => {
    try {
      const allSounds = await getSoundsForMap(200);
      setSounds(allSounds);
      if (allSounds.length > 0 && mapRef.current) {
        const coordinates = allSounds.map((s: any) => ({
          latitude: s.location.latitude,
          longitude: s.location.longitude,
        }));
        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: { top: 80, right: 40, bottom: 120, left: 40 },
          animated: true,
        });
      }
    } catch (_error) {
      Alert.alert(t('common.error'), t('map.errors.cannotLoad'));
    }
  };

  const handleMarkerPress = (soundData: any) => {
    setSelectedSound(soundData);
    setShowDetails(true);
  };

  const handlePlayPause = async (soundData: any) => {
    try {
      // Se c'è già un suono in riproduzione per un altro sound, scaricalo
      if (soundRef.current && playingId !== soundData.id) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setPlayingId(null);
        setIsPaused(false);
      }

      // Se è lo stesso suono — toggle play/pause
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

      // Nuovo suono — carica e avvia
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: soundData.audioUrl },
        { shouldPlay: true }
      );

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
    } catch (_error) {
      Alert.alert(t('common.error'), t('map.errors.cannotPlay'));
    }
  };

  const handleCloseModal = async () => {
    // Ferma l'audio quando si chiude il modal
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

  const getMoodColor = (mood: string) => {
    const colors = {
      Energico: '#f97316',
      Rilassante: '#3b82f6',
      Gioioso: '#eab308',
      Nostalgico: '#a855f7',
    };
    return colors[mood as keyof typeof colors] || '#6b7280';
  };

  const toggleViewMode = () => {
    const next = viewMode === 'nearby' ? 'all' : 'nearby';
    setViewMode(next);
    if (next === 'all') {
      loadAllSounds();
    } else {
      loadNearbySounds(userLocationRef.current);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00FF9C" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
      </View>
    );
  }

  if (!userLocation) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>❌ {t('map.errors.cannotLoad')}</Text>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={initializeMap}>
          <Text style={styles.retryButtonText}>{t('common.ok')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCurrentSoundPlaying = (id: string) => playingId === id && !isPaused;

  return (
    <View style={styles.container}>
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
        showsMyLocationButton
      >
        {viewMode === 'nearby' && (
          <Circle
            center={userLocation}
            radius={searchRadius * 1000}
            strokeColor="rgba(6, 182, 212, 0.5)"
            fillColor="rgba(6, 182, 212, 0.1)"
            strokeWidth={2}
          />
        )}

        {sounds.map((soundData) => (
          <Marker
            key={soundData.id}
            coordinate={{
              latitude: soundData.location.latitude,
              longitude: soundData.location.longitude,
            }}
            onPress={() => handleMarkerPress(soundData)}
          >
            <View
              style={[
                styles.marker,
                { backgroundColor: getMoodColor(soundData.mood) },
                isCurrentSoundPlaying(soundData.id) && styles.markerPlaying,
              ]}
            >
              <Text style={styles.markerIcon}>
                {isCurrentSoundPlaying(soundData.id) ? '🔊' : '🎵'}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(7,8,12,0.78)', 'rgba(7,8,12,0.12)', 'rgba(7,8,12,0.76)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Controlli superiori */}
      <View style={styles.topControls}>
        <TouchableOpacity style={styles.controlButton} onPress={toggleViewMode}>
          <Text style={styles.controlButtonText}>
            {viewMode === 'nearby' ? `📍 ${t('map.nearby')}` : `🌍 ${t('map.all')}`}
          </Text>
        </TouchableOpacity>

        {viewMode === 'nearby' && (
          <View style={styles.radiusControl}>
            <TouchableOpacity
              style={styles.radiusButton}
              onPress={() => setSearchRadius(Math.max(1, searchRadius - 5))}
            >
              <Text style={styles.radiusButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.radiusText}>{searchRadius}km</Text>
            <TouchableOpacity
              style={styles.radiusButton}
              onPress={() => setSearchRadius(Math.min(50, searchRadius + 5))}
            >
              <Text style={styles.radiusButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Badge contatore */}
      <View style={styles.counterBadge}>
        <Text style={styles.counterText}>🎵 {sounds.length}</Text>
      </View>

      {/* Modal dettagli suono */}
      <Modal
        visible={showDetails}
        animationType="slide"
        transparent
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailsCard}>
            {selectedSound && (
              <>
                <View style={styles.detailsHeader}>
                  <View style={styles.detailsUser}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {selectedSound.userAvatar}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.userName}>{selectedSound.username}</Text>
                      <Text style={styles.distance}>
                        {selectedSound.distance
                          ? `📍 ${selectedSound.distance.toFixed(1)} km`
                          : '📍 Posizione'}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.moodBadge,
                      { backgroundColor: getMoodColor(selectedSound.mood) },
                    ]}
                  >
                    <Text style={styles.moodText}>{selectedSound.mood}</Text>
                  </View>
                </View>

                <View style={styles.detailsContent}>
                  <Text style={styles.soundTitle}>{selectedSound.title}</Text>
                  {selectedSound.description && (
                    <Text style={styles.soundDescription}>
                      {selectedSound.description}
                    </Text>
                  )}

                  <View style={styles.stats}>
                    <View style={styles.stat}>
                      <Text style={styles.statIcon}>❤️</Text>
                      <Text style={styles.statText}>{selectedSound.likes}</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statIcon}>🎧</Text>
                      <Text style={styles.statText}>{selectedSound.listens}</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statIcon}>⏱️</Text>
                      <Text style={styles.statText}>{selectedSound.duration}s</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.detailsActions}>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={handleCloseModal}
                  >
                    <Text style={styles.closeButtonText}>{t('common.close')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.playButton,
                      isCurrentSoundPlaying(selectedSound.id) && styles.playButtonActive,
                    ]}
                    onPress={() => handlePlayPause(selectedSound)}
                  >
                    <Text style={styles.playButtonText}>
                      {playingId === selectedSound.id
                        ? (isPaused ? `▶️ ${t('map.listen')}` : `⏸ ${t('map.pause')}`)
                        : `▶️ ${t('map.listen')}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07080C',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    padding: 20,
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#00FF9C',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  marker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  markerPlaying: {
    transform: [{ scale: 1.2 }],
    borderColor: '#fbbf24',
  },
  markerIcon: {
    fontSize: 20,
  },
  topControls: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    backgroundColor: 'rgba(7, 10, 18, 0.82)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(125,255,208,0.18)',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  radiusControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 10, 18, 0.82)',
    borderRadius: 999,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(125,255,208,0.18)',
  },
  radiusButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radiusButtonText: {
    color: '#00FF9C',
    fontSize: 20,
    fontWeight: '700',
  },
  radiusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: 8,
  },
  counterBadge: {
    position: 'absolute',
    top: 110,
    left: 16,
    backgroundColor: 'rgba(99,214,255,0.88)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  counterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  detailsCard: {
    backgroundColor: 'rgba(12,16,24,0.98)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(125,255,208,0.18)',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailsUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00FF9C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  distance: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  moodBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  moodText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  detailsContent: {
    marginBottom: 20,
  },
  soundTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  soundDescription: {
    fontSize: 14,
    color: '#cbd5e1',
    lineHeight: 20,
    marginBottom: 16,
  },
  stats: {
    flexDirection: 'row',
    gap: 24,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statIcon: {
    fontSize: 16,
  },
  statText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '600',
  },
  detailsActions: {
    flexDirection: 'row',
    gap: 12,
  },
  closeButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  playButton: {
    flex: 2,
    backgroundColor: '#D7FF64',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  playButtonActive: {
    backgroundColor: '#63D6FF',
  },
  playButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#04110A',
  },
});
