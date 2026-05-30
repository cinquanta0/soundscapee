// screens/TimeMachine.js
import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
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
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../constants/themes';

const { width } = Dimensions.get('window');

export default function TimeMachineScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
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
    const moodColors = {
      Energico: '#f97316',
      Rilassante: '#3b82f6',
      Gioioso: '#eab308',
      Nostalgico: '#a855f7',
    };
    return moodColors[mood as keyof typeof moodColors] || '#6b7280';
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
      <View style={s.loadingContainer}>
        <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#00FF9C" />
        <Text style={s.loadingText}>{t('timeMachine.loading')}</Text>
      </View>
    );
  }

  const timeOfDay = getTimeOfDay(selectedHour);

  return (
    <View style={s.container}>
      <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />
      <View style={s.ambientA} />
      <View style={s.ambientB} />

      <ScrollView style={s.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient
          colors={['#3b82f6', '#8b5cf6']}
          style={s.header}
        >
          <Text style={s.headerEmoji}>⏰</Text>
          <Text style={s.headerTitle}>{t('timeMachine.title')}</Text>
          <Text style={s.headerSubtitle}>{t('timeMachine.subtitle')}</Text>
        </LinearGradient>

        {/* Date Selector */}
        <View style={s.dateCard}>
          <View style={s.dateHeader}>
            <TouchableOpacity
              style={s.dateNavButton}
              onPress={() => jumpToDate(-1)}
            >
              <Text style={s.dateNavText}>◀</Text>
            </TouchableOpacity>

            <View style={s.dateInfo}>
              <Text style={s.dateText}>{formatDate(selectedDate)}</Text>
              <Text style={s.dateSubtext}>
                {selectedDate.toLocaleDateString() === new Date().toLocaleDateString()
                  ? t('timeMachine.todayLabel')
                  : t('timeMachine.daysAgo', { count: Math.floor((new Date().getTime() - selectedDate.getTime()) / (1000 * 60 * 60 * 24)) })}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                s.dateNavButton,
                selectedDate >= new Date() && s.dateNavButtonDisabled
              ]}
              onPress={() => jumpToDate(1)}
              disabled={selectedDate >= new Date()}
            >
              <Text style={s.dateNavText}>▶</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Jump */}
          <View style={s.quickJump}>
            <TouchableOpacity
              style={s.quickJumpButton}
              onPress={() => setSelectedDate(new Date())}
            >
              <Text style={s.quickJumpText}>{t('timeMachine.today')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.quickJumpButton}
              onPress={() => jumpToDate(-7)}
            >
              <Text style={s.quickJumpText}>{t('timeMachine.weekMinus')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.quickJumpButton}
              onPress={() => jumpToDate(-30)}
            >
              <Text style={s.quickJumpText}>{t('timeMachine.monthMinus')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.quickJumpButton}
              onPress={() => jumpToDate(-365)}
            >
              <Text style={s.quickJumpText}>{t('timeMachine.yearMinus')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hour Slider */}
        <View style={s.hourCard}>
          <View style={s.hourHeader}>
            <Text style={s.hourEmoji}>{timeOfDay.emoji}</Text>
            <View>
              <Text style={s.hourLabel}>{timeOfDay.label}</Text>
              <Text style={s.hourTime}>
                {selectedHour.toString().padStart(2, '0')}:00
              </Text>
            </View>
          </View>

          <Slider
            style={s.slider}
            minimumValue={0}
            maximumValue={23}
            step={1}
            value={selectedHour}
            onValueChange={setSelectedHour}
            minimumTrackTintColor="#00FF9C"
            maximumTrackTintColor={colors.borderSubtle}
            thumbTintColor="#00FF9C"
          />

          <View style={s.hourMarkers}>
            <Text style={s.hourMarker}>00:00</Text>
            <Text style={s.hourMarker}>06:00</Text>
            <Text style={s.hourMarker}>12:00</Text>
            <Text style={s.hourMarker}>18:00</Text>
            <Text style={s.hourMarker}>23:00</Text>
          </View>
        </View>

        {/* Stats Card */}
        {locationStats && (
          <View style={s.statsCard}>
            <Text style={s.statsTitle}>{t('timeMachine.statsTitle')}</Text>
            <View style={s.statsGrid}>
              <View style={s.statItem}>
                <Text style={s.statValue}>{locationStats.totalSounds}</Text>
                <Text style={s.statLabel}>{t('timeMachine.totalSounds')}</Text>
              </View>
              <View style={s.statItem}>
                <Text style={s.statValue}>{locationStats.uniqueUsers}</Text>
                <Text style={s.statLabel}>{t('timeMachine.users')}</Text>
              </View>
              <View style={s.statItem}>
                <Text style={s.statValue}>{locationStats.mostPopularMood}</Text>
                <Text style={s.statLabel}>{t('timeMachine.topMood')}</Text>
              </View>
              <View style={s.statItem}>
                <Text style={s.statValue}>{locationStats.avgDuration}s</Text>
                <Text style={s.statLabel}>{t('timeMachine.avgDuration')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Compare Mode Toggle */}
        <TouchableOpacity
          style={[s.compareButton, compareMode && s.compareButtonActive]}
          onPress={toggleCompareMode}
        >
          <Text style={s.compareButtonText}>
            {compareMode ? t('timeMachine.compareModeOn') : t('timeMachine.comparePast')}
          </Text>
        </TouchableOpacity>

        {/* Timeline */}
        <View style={s.timelineSection}>
          <Text style={s.sectionTitle}>
            {t('timeMachine.soundsAt', { date: formatDate(selectedDate), hour: selectedHour })}
          </Text>

          {loading ? (
            <View style={s.loadingState}>
              <ActivityIndicator size="large" color="#00FF9C" />
            </View>
          ) : timelineData.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>🔇</Text>
              <Text style={s.emptyText}>{t('timeMachine.noSounds')}</Text>
              <Text style={s.emptySubtext}>{t('timeMachine.noSoundsHint')}</Text>
            </View>
          ) : (
            timelineData.map((soundData) => (
              <View key={soundData.id} style={s.soundCard}>
                <View style={s.soundHeader}>
                  <View style={s.soundUser}>
                    <View style={[s.avatar, soundData.userPhoto ? { overflow: 'hidden', backgroundColor: 'transparent' } : null]}>
                      {soundData.userPhoto
                        ? <Image source={{ uri: soundData.userPhoto }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                        : <Text style={s.avatarText}>{soundData.userAvatar}</Text>}
                    </View>
                    <View>
                      <Text style={s.userName}>{soundData.username}</Text>
                      <Text style={s.soundTime}>
                        {new Date(soundData.createdAt).toLocaleTimeString('it-IT', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      s.moodBadge,
                      { backgroundColor: getMoodColor(soundData.mood) }
                    ]}
                  >
                    <Text style={s.moodText}>{soundData.mood}</Text>
                  </View>
                </View>

                <Text style={s.soundTitle}>{soundData.title}</Text>
                {soundData.description && (
                  <Text style={s.soundDescription}>{soundData.description}</Text>
                )}

                <View style={s.soundStats}>
                  <Text style={s.soundStat}>❤️ {soundData.likes}</Text>
                  <Text style={s.soundStat}>🎧 {soundData.listens}</Text>
                  <Text style={s.soundStat}>⏱️ {soundData.duration}s</Text>
                </View>

                <TouchableOpacity
                  style={[
                    s.playButton,
                    playingId === soundData.id && s.playButtonActive
                  ]}
                  onPress={() => handlePlaySound(soundData)}
                >
                  <Text style={s.playButtonText}>
                    {playingId === soundData.id ? t('timeMachine.pause') : t('timeMachine.listen')}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Compare Section */}
        {compareMode && compareSounds.length > 0 && (
          <View style={s.compareSection}>
            <Text style={s.sectionTitle}>
              {t('timeMachine.comparison', { date: compareDate ? formatDate(compareDate) : '' })}
            </Text>
            {compareSounds.map((soundData) => (
              <View key={soundData.id} style={s.soundCardCompare}>
                <View style={s.soundHeader}>
                  <Text style={s.userName}>{soundData.username}</Text>
                  <Text style={s.soundTime}>
                    {new Date(soundData.createdAt).toLocaleTimeString('it-IT', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </Text>
                </View>
                <Text style={s.soundTitle}>{soundData.title}</Text>
                <TouchableOpacity
                  style={s.playButtonSmall}
                  onPress={() => handlePlaySound(soundData)}
                >
                  <Text style={s.playButtonText}>
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    ambientA: {
      position: 'absolute',
      top: -20,
      left: -20,
      width: 180,
      height: 180,
      borderRadius: 999,
      backgroundColor: 'rgba(99,214,255,0.08)',
    },
    ambientB: {
      position: 'absolute',
      top: 70,
      right: -30,
      width: 200,
      height: 200,
      borderRadius: 999,
      backgroundColor: 'rgba(0,255,156,0.08)',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      color: colors.textSecondary,
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
      borderBottomLeftRadius: 36,
      borderBottomRightRadius: 36,
      marginBottom: 16,
      marginHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
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
      backgroundColor: colors.bgCard,
      borderRadius: 22,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
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
      backgroundColor: colors.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dateNavButtonDisabled: {
      opacity: 0.3,
    },
    dateNavText: {
      color: colors.text,
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
      color: colors.text,
      textAlign: 'center',
    },
    dateSubtext: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    quickJump: {
      flexDirection: 'row',
      gap: 8,
    },
    quickJumpButton: {
      flex: 1,
      backgroundColor: colors.surfaceLight,
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
      backgroundColor: colors.bgCard,
      borderRadius: 22,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
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
      color: colors.text,
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
      color: colors.textMuted,
    },
    statsCard: {
      backgroundColor: colors.bgCard,
      borderRadius: 22,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statsTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
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
      backgroundColor: colors.surfaceLight,
      borderRadius: 16,
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
      color: colors.textSecondary,
      marginTop: 4,
    },
    compareButton: {
      backgroundColor: colors.surfaceLight,
      marginHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 16,
      borderWidth: 2,
      borderColor: colors.border,
    },
    compareButtonActive: {
      backgroundColor: '#8b5cf6',
      borderColor: '#a78bfa',
    },
    compareButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    timelineSection: {
      paddingHorizontal: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 16,
    },
    loadingState: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    emptyState: {
      backgroundColor: colors.bgCard,
      borderRadius: 22,
      padding: 32,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyIcon: {
      fontSize: 64,
      marginBottom: 16,
    },
    emptyText: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '600',
      marginBottom: 4,
    },
    emptySubtext: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    soundCard: {
      backgroundColor: colors.bgCard,
      borderRadius: 20,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
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
      color: colors.text,
    },
    soundTime: {
      fontSize: 12,
      color: colors.textSecondary,
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
      color: colors.text,
      marginBottom: 4,
    },
    soundDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 12,
    },
    soundStats: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 12,
    },
    soundStat: {
      fontSize: 12,
      color: colors.textSecondary,
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
}
