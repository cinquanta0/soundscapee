// screens/TimeMachine.js
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import {
  getSoundsAtLocationByTime,
  getSoundTimeline,
  incrementListens,
} from '../../services/firebaseService';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');

export default function TimeMachineScreen() {
  const { t } = useTranslation();
  const [userLocation, setUserLocation] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [selectedSound, setSelectedSound] = useState<any | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  
  // Time controls
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [timeRange, setTimeRange] = useState('day'); // day, week, month, year
  const [selectedHour, setSelectedHour] = useState(12);
  
  // Stats
  const [locationStats, setLocationStats] = useState<any | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareDate, setCompareDate] = useState<Date | null>(null);
  const [compareSounds, setCompareSounds] = useState<any[]>([]);

  useEffect(() => {
    initializeTimeMachine();
    return () => {
      sound?.unloadAsync().catch(() => {});
    };
  }, [sound]);

  useEffect(() => {
    if (userLocation) {
      loadTimeline();
    }
  }, [selectedDate, timeRange, selectedHour, userLocation]);

  const initializeTimeMachine = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('timeMachine.errors.permissionDenied'), t('timeMachine.errors.permissionMsg'));
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
      
      setUserLocation(userPos);
      setLoading(false);
    } catch (error) {
      console.error('Error initializing:', error);
      Alert.alert(t('common.error'), t('timeMachine.errors.cannotGetLocation'));
      setLoading(false);
    }
  };

  const loadTimeline = async () => {
    if (!userLocation) return;

    try {
      setLoading(true);
      
      // Get timeline data for this location
      const timeline = await getSoundTimeline(
        userLocation,
        selectedDate,
        timeRange,
        selectedHour
      );
      
      setTimelineData(timeline.sounds || []);
      setLocationStats(timeline.stats || null);
    } catch (error) {
      console.error('Error loading timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlaySound = async (soundData: any) => {
    try {
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
        setPlayingId(null);
      }

      if (playingId === soundData.id) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: soundData.audioUrl },
        { shouldPlay: true }
      );

      setSound(newSound);
      setPlayingId(soundData.id);
      await incrementListens(soundData.id);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          newSound.unloadAsync().catch(() => {});
        }
      });
    } catch (error) {
      console.error('Error playing sound:', error);
      Alert.alert(t('common.error'), t('timeMachine.errors.cannotPlay'));
    }
  };

  const jumpToDate = (daysOffset: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + daysOffset);
    setSelectedDate(newDate);
  };

  const toggleCompareMode = async () => {
    if (!compareMode) {
      // Enter compare mode
      setCompareDate(new Date(selectedDate.getTime() - 30 * 24 * 60 * 60 * 1000)); // 1 month ago
      const oldSounds = await getSoundsAtLocationByTime(
        userLocation,
        new Date(selectedDate.getTime() - 30 * 24 * 60 * 60 * 1000),
        selectedHour
      );
      setCompareSounds(oldSounds);
    } else {
      // Exit compare mode
      setCompareDate(null);
      setCompareSounds([]);
    }
    setCompareMode(!compareMode);
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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTimeOfDay = (hour: number) => {
    if (hour < 6) return { emoji: '🌙', label: t('timeMachine.night') };
    if (hour < 12) return { emoji: '🌅', label: t('timeMachine.morning') };
    if (hour < 18) return { emoji: '☀️', label: t('timeMachine.afternoon') };
    if (hour < 22) return { emoji: '🌆', label: t('timeMachine.evening') };
    return { emoji: '🌙', label: t('timeMachine.night') };
  };

  if (loading && !userLocation) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#0A0A0A', '#161616']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#00FF9C" />
        <Text style={styles.loadingText}>{t('timeMachine.loading')}</Text>
      </View>
    );
  }

  const timeOfDay = getTimeOfDay(selectedHour);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0A', '#161616', '#0A0A0A']} style={StyleSheet.absoluteFill} />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient
          colors={['#3b82f6', '#8b5cf6']}
          style={styles.header}
        >
          <Text style={styles.headerEmoji}>⏰</Text>
          <Text style={styles.headerTitle}>{t('timeMachine.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('timeMachine.subtitle')}</Text>
        </LinearGradient>

        {/* Date Selector */}
        <View style={styles.dateCard}>
          <View style={styles.dateHeader}>
            <TouchableOpacity
              style={styles.dateNavButton}
              onPress={() => jumpToDate(-1)}
            >
              <Text style={styles.dateNavText}>◀</Text>
            </TouchableOpacity>
            
            <View style={styles.dateInfo}>
              <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
              <Text style={styles.dateSubtext}>
                {selectedDate.toLocaleDateString() === new Date().toLocaleDateString()
                  ? t('timeMachine.todayLabel')
                  : t('timeMachine.daysAgo', { count: Math.floor((new Date().getTime() - selectedDate.getTime()) / (1000 * 60 * 60 * 24)) })}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.dateNavButton,
                selectedDate >= new Date() && styles.dateNavButtonDisabled
              ]}
              onPress={() => jumpToDate(1)}
              disabled={selectedDate >= new Date()}
            >
              <Text style={styles.dateNavText}>▶</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Jump */}
          <View style={styles.quickJump}>
            <TouchableOpacity
              style={styles.quickJumpButton}
              onPress={() => setSelectedDate(new Date())}
            >
              <Text style={styles.quickJumpText}>{t('timeMachine.today')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickJumpButton}
              onPress={() => jumpToDate(-7)}
            >
              <Text style={styles.quickJumpText}>{t('timeMachine.weekMinus')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickJumpButton}
              onPress={() => jumpToDate(-30)}
            >
              <Text style={styles.quickJumpText}>{t('timeMachine.monthMinus')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickJumpButton}
              onPress={() => jumpToDate(-365)}
            >
              <Text style={styles.quickJumpText}>{t('timeMachine.yearMinus')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hour Slider */}
        <View style={styles.hourCard}>
          <View style={styles.hourHeader}>
            <Text style={styles.hourEmoji}>{timeOfDay.emoji}</Text>
            <View>
              <Text style={styles.hourLabel}>{timeOfDay.label}</Text>
              <Text style={styles.hourTime}>
                {selectedHour.toString().padStart(2, '0')}:00
              </Text>
            </View>
          </View>
          
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={23}
            step={1}
            value={selectedHour}
            onValueChange={setSelectedHour}
            minimumTrackTintColor="#00FF9C"
            maximumTrackTintColor="rgba(255,255,255,0.08)"
            thumbTintColor="#00FF9C"
          />

          <View style={styles.hourMarkers}>
            <Text style={styles.hourMarker}>00:00</Text>
            <Text style={styles.hourMarker}>06:00</Text>
            <Text style={styles.hourMarker}>12:00</Text>
            <Text style={styles.hourMarker}>18:00</Text>
            <Text style={styles.hourMarker}>23:00</Text>
          </View>
        </View>

        {/* Stats Card */}
        {locationStats && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>{t('timeMachine.statsTitle')}</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{locationStats.totalSounds}</Text>
                <Text style={styles.statLabel}>{t('timeMachine.totalSounds')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{locationStats.uniqueUsers}</Text>
                <Text style={styles.statLabel}>{t('timeMachine.users')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{locationStats.mostPopularMood}</Text>
                <Text style={styles.statLabel}>{t('timeMachine.topMood')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{locationStats.avgDuration}s</Text>
                <Text style={styles.statLabel}>{t('timeMachine.avgDuration')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Compare Mode Toggle */}
        <TouchableOpacity
          style={[styles.compareButton, compareMode && styles.compareButtonActive]}
          onPress={toggleCompareMode}
        >
          <Text style={styles.compareButtonText}>
            {compareMode ? t('timeMachine.compareModeOn') : t('timeMachine.comparePast')}
          </Text>
        </TouchableOpacity>

        {/* Timeline */}
        <View style={styles.timelineSection}>
          <Text style={styles.sectionTitle}>
            {t('timeMachine.soundsAt', { date: formatDate(selectedDate), hour: selectedHour })}
          </Text>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color="#00FF9C" />
            </View>
          ) : timelineData.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔇</Text>
              <Text style={styles.emptyText}>{t('timeMachine.noSounds')}</Text>
              <Text style={styles.emptySubtext}>{t('timeMachine.noSoundsHint')}</Text>
            </View>
          ) : (
            timelineData.map((soundData) => (
              <View key={soundData.id} style={styles.soundCard}>
                <View style={styles.soundHeader}>
                  <View style={styles.soundUser}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{soundData.userAvatar}</Text>
                    </View>
                    <View>
                      <Text style={styles.userName}>{soundData.username}</Text>
                      <Text style={styles.soundTime}>
                        {new Date(soundData.createdAt).toLocaleTimeString('it-IT', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.moodBadge,
                      { backgroundColor: getMoodColor(soundData.mood) }
                    ]}
                  >
                    <Text style={styles.moodText}>{soundData.mood}</Text>
                  </View>
                </View>

                <Text style={styles.soundTitle}>{soundData.title}</Text>
                {soundData.description && (
                  <Text style={styles.soundDescription}>{soundData.description}</Text>
                )}

                <View style={styles.soundStats}>
                  <Text style={styles.soundStat}>❤️ {soundData.likes}</Text>
                  <Text style={styles.soundStat}>🎧 {soundData.listens}</Text>
                  <Text style={styles.soundStat}>⏱️ {soundData.duration}s</Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.playButton,
                    playingId === soundData.id && styles.playButtonActive
                  ]}
                  onPress={() => handlePlaySound(soundData)}
                >
                  <Text style={styles.playButtonText}>
                    {playingId === soundData.id ? t('timeMachine.pause') : t('timeMachine.listen')}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Compare Section */}
        {compareMode && compareSounds.length > 0 && (
          <View style={styles.compareSection}>
            <Text style={styles.sectionTitle}>
              {t('timeMachine.comparison', { date: compareDate ? formatDate(compareDate) : '' })}
            </Text>
            {compareSounds.map((soundData) => (
              <View key={soundData.id} style={styles.soundCardCompare}>
                <View style={styles.soundHeader}>
                  <Text style={styles.userName}>{soundData.username}</Text>
                  <Text style={styles.soundTime}>
                    {new Date(soundData.createdAt).toLocaleTimeString('it-IT', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </Text>
                </View>
                <Text style={styles.soundTitle}>{soundData.title}</Text>
                <TouchableOpacity
                  style={styles.playButtonSmall}
                  onPress={() => handlePlaySound(soundData)}
                >
                  <Text style={styles.playButtonText}>
                    {playingId === soundData.id ? '⏸' : '▶️'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 16,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    marginBottom: 16,
  },
  headerEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  dateCard: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dateNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateNavButtonDisabled: {
    opacity: 0.3,
  },
  dateNavText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  dateInfo: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  dateSubtext: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  quickJump: {
    flexDirection: 'row',
    gap: 8,
  },
  quickJumpButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  quickJumpText: {
    color: '#00FF9C',
    fontSize: 12,
    fontWeight: '600',
  },
  hourCard: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  hourHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  hourEmoji: {
    fontSize: 32,
  },
  hourLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  hourTime: {
    fontSize: 24,
    fontWeight: '800',
    color: '#00FF9C',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  hourMarkers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  hourMarker: {
    fontSize: 10,
    color: '#64748b',
  },
  statsCard: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#00FF9C',
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  compareButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#475569',
  },
  compareButtonActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#a78bfa',
  },
  compareButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  timelineSection: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  loadingState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyState: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  soundCard: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  soundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  soundUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00FF9C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  soundTime: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  moodBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  moodText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  soundTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  soundDescription: {
    fontSize: 13,
    color: '#cbd5e1',
    marginBottom: 12,
  },
  soundStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  soundStat: {
    fontSize: 12,
    color: '#94a3b8',
  },
  playButton: {
    backgroundColor: '#00FF9C',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  playButtonActive: {
    backgroundColor: '#f97316',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  compareSection: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  soundCardCompare: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#a78bfa',
  },
  playButtonSmall: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
});
