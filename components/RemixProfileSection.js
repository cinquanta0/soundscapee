// components/RemixProfileSection.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import {
  getUserRemixes,
  deleteRemix,
  getUserRemixStats,
  incrementRemixPlays,
} from '../services/remixService';
import { useTheme } from '../context/ThemeContext';

export default function RemixProfileSection({ onOpenRemixStudio, userId = null }) {
  const { colors } = useTheme();
  const dynStyles = useMemo(() => createRemixStyles(colors), [colors]);
  const isOwnProfile = !userId;
  const [remixes, setRemixes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRemix, setSelectedRemix] = useState(null);

  // Audio playback state
  const [playingId, setPlayingId] = useState(null);
  const [loadingAudioId, setLoadingAudioId] = useState(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const soundRef = useRef(null);
  const statusIntervalRef = useRef(null);

  useEffect(() => {
    loadData();
    return () => { stopAudio(); };
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [remixesData, statsData] = await Promise.all([
        getUserRemixes(userId),
        getUserRemixStats(userId),
      ]);
      setRemixes(remixesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading remix data:', error);
      Alert.alert('Errore', 'Impossibile caricare i remix');
    } finally {
      setLoading(false);
    }
  };

  // ───────────────────────��──────────────────────────────
  // AUDIO PLAYBACK
  // ──────────────────────────────────────────────────────

  const getLocalUri = async (uri, remixId) => {
    if (Platform.OS !== 'android' || !uri.startsWith('http')) return uri;
    try {
      // 🔧 FIX: estrai l'estensione reale dall'URL invece di forzare .m4a
      const urlPath = uri.split('?')[0];
      const rawExt = urlPath.split('.').pop().toLowerCase();
      const ext = ['webm', 'ogg', 'm4a', 'mp3', 'mp4', 'aac', 'wav'].includes(rawExt)
        ? rawExt
        : 'm4a';
      const localPath = `${FileSystem.cacheDirectory}remix_play_${remixId}.${ext}`;
      const info = await FileSystem.getInfoAsync(localPath);
      if (info.exists && info.size > 100) return localPath;
      const dl = await FileSystem.downloadAsync(uri, localPath);
      return dl.uri;
    } catch {
      return uri;
    }
  };

  const stopAudio = async () => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (_) {}
      soundRef.current = null;
    }
    setPlayingId(null);
    setPlaybackPosition(0);
    setPlaybackDuration(0);
  };

  const togglePlay = async (remix) => {
    if (!remix.audioUrl) {
      Alert.alert('Non disponibile', 'Il remix è ancora in elaborazione o non ha audio.');
      return;
    }

    if (playingId === remix.id) {
      await stopAudio();
      return;
    }

    await stopAudio();

    try {
      setLoadingAudioId(remix.id);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const localUri = await getLocalUri(remix.audioUrl, remix.id);

      const { sound } = await Audio.Sound.createAsync(
        { uri: localUri },
        { shouldPlay: true, volume: 1.0, isLooping: false }
      );

      soundRef.current = sound;
      setPlayingId(remix.id);
      setLoadingAudioId(null);

      statusIntervalRef.current = setInterval(async () => {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
            setPlaybackPosition(status.positionMillis || 0);
            setPlaybackDuration(status.durationMillis || 0);
            if (status.didJustFinish) await stopAudio();
          }
        } catch (_) {}
      }, 200);

      incrementRemixPlays(remix.id).catch(() => {});
    } catch (error) {
      console.error('Remix play error:', error);
      setLoadingAudioId(null);
      Alert.alert('Errore', 'Impossibile riprodurre il remix.');
    }
  };

  const formatTime = (ms) => {
    if (!ms) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  // ──────────────────────────────────────────────────────
  // DELETE
  // ──────────────────────────────────────────────────────

  const handleDelete = async (remixId) => {
    Alert.alert(
      'Elimina Remix',
      'Vuoi davvero eliminare questo remix?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              if (playingId === remixId) await stopAudio();
              await deleteRemix(remixId);
              setRemixes(remixes.filter(r => r.id !== remixId));
              if (selectedRemix?.id === remixId) setSelectedRemix(null);
              await loadData();
            } catch (error) {
              Alert.alert('Errore', 'Impossibile eliminare il remix');
            }
          },
        },
      ]
    );
  };

  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('it-IT', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.textAccent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Card */}
      {stats && (
        <View style={dynStyles.statsCard}>
          <View style={dynStyles.statsTitleRow}>
            <Feather name="bar-chart-2" size={15} color="#a855f7" />
            <Text style={dynStyles.statsTitle}>Stats Remix</Text>
          </View>
          <View style={dynStyles.statsGrid}>
            <View style={dynStyles.statItem}>
              <Text style={dynStyles.statNumber}>{stats.totalRemixes}</Text>
              <Text style={dynStyles.statLabel}>Remix</Text>
            </View>
            <View style={dynStyles.statItem}>
              <Text style={dynStyles.statNumber}>{stats.totalPlays}</Text>
              <Text style={dynStyles.statLabel}>Play</Text>
            </View>
            <View style={dynStyles.statItem}>
              <Text style={dynStyles.statNumber}>{stats.totalLikes}</Text>
              <Text style={dynStyles.statLabel}>Likes</Text>
            </View>
            <View style={dynStyles.statItem}>
              <Text style={dynStyles.statNumber}>{(stats.avgTracksPerRemix ?? 0).toFixed(1)}</Text>
              <Text style={dynStyles.statLabel}>Avg Tracce</Text>
            </View>
          </View>
        </View>
      )}

      {/* Header */}
      <View style={dynStyles.header}>
        <Text style={dynStyles.sectionTitle}>{isOwnProfile ? 'I Miei Remix' : 'Remix'} ({remixes.length})</Text>
        {isOwnProfile && (
          <TouchableOpacity style={dynStyles.createButton} onPress={onOpenRemixStudio}>
            <Text style={dynStyles.createButtonText}>Nuovo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Empty State */}
      {remixes.length === 0 ? (
        <View style={dynStyles.emptyState}>
          <Feather name="sliders" size={40} color={colors.textAccent} style={{ marginBottom: 12 }} />
          <Text style={dynStyles.emptyText}>Nessun remix ancora</Text>
          {isOwnProfile && (
            <>
              <Text style={dynStyles.emptySubtext}>Crea il tuo primo remix mixando i tuoi suoni!</Text>
              <TouchableOpacity style={dynStyles.emptyButton} onPress={onOpenRemixStudio}>
                <Text style={dynStyles.emptyButtonText}>Inizia a Remixare</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
        <>
          {/* Remixes List */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.remixScroll}>
            {remixes.map((remix) => (
              <RemixCard
                key={remix.id}
                remix={remix}
                colors={colors}
                isSelected={selectedRemix?.id === remix.id}
                isPlaying={playingId === remix.id}
                isLoadingAudio={loadingAudioId === remix.id}
                canDelete={isOwnProfile}
                onPress={() => setSelectedRemix(remix)}
                onPlay={() => togglePlay(remix)}
                onDelete={() => handleDelete(remix.id)}
              />
            ))}
          </ScrollView>

          {/* Selected Remix Details */}
          {selectedRemix && (
            <View style={dynStyles.detailsCard}>
              <View style={dynStyles.detailsHeader}>
                <Text style={dynStyles.detailsTitle}>{selectedRemix.title}</Text>
                <TouchableOpacity onPress={() => setSelectedRemix(null)}>
                  <Text style={dynStyles.detailsClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Player bar */}
              {selectedRemix.isProcessed && selectedRemix.audioUrl ? (
                <View style={dynStyles.playerBar}>
                  <TouchableOpacity
                    style={dynStyles.playerPlayBtn}
                    onPress={() => togglePlay(selectedRemix)}
                    disabled={loadingAudioId === selectedRemix.id}
                  >
                    {loadingAudioId === selectedRemix.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Feather
                        name={playingId === selectedRemix.id ? 'square' : 'play'}
                        size={20}
                        color="#fff"
                      />
                    )}
                  </TouchableOpacity>
                  <View style={dynStyles.playerProgress}>
                    <View style={dynStyles.playerProgressBg}>
                      <View
                        style={[
                          dynStyles.playerProgressFill,
                          {
                            width: playingId === selectedRemix.id && playbackDuration > 0
                              ? `${(playbackPosition / playbackDuration) * 100}%`
                              : '0%',
                          },
                        ]}
                      />
                    </View>
                    <View style={dynStyles.playerTimes}>
                      <Text style={dynStyles.playerTime}>
                        {playingId === selectedRemix.id ? formatTime(playbackPosition) : '0:00'}
                      </Text>
                      <Text style={dynStyles.playerTime}>
                        {playingId === selectedRemix.id && playbackDuration > 0
                          ? formatTime(playbackDuration)
                          : `${(selectedRemix.totalDuration ?? 0).toFixed(0)}s`}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={[dynStyles.statusBadge, { backgroundColor: 'rgba(234,179,8,0.15)', marginBottom: 12 }]}>
                  <Text style={[dynStyles.statusText, { color: '#ca8a04' }]}>⏳ In elaborazione...</Text>
                </View>
              )}

              <Text style={dynStyles.detailsDescription}>
                {selectedRemix.description || 'Nessuna descrizione'}
              </Text>

              <View style={dynStyles.detailsInfo}>
                <View style={dynStyles.infoRow}>
                  <Text style={dynStyles.infoLabel}>📊 Tracce:</Text>
                  <Text style={dynStyles.infoValue}>{selectedRemix.tracksCount}</Text>
                </View>
                <View style={dynStyles.infoRow}>
                  <Text style={dynStyles.infoLabel}>⏱️ Durata:</Text>
                  <Text style={dynStyles.infoValue}>{(selectedRemix.totalDuration ?? 0).toFixed(1)}s</Text>
                </View>
                <View style={dynStyles.infoRow}>
                  <Text style={dynStyles.infoLabel}>📅 Creato:</Text>
                  <Text style={dynStyles.infoValue}>{formatDate(selectedRemix.createdAt)}</Text>
                </View>
                <View style={dynStyles.infoRow}>
                  <Text style={dynStyles.infoLabel}>👁️ Pubblico:</Text>
                  <Text style={dynStyles.infoValue}>{selectedRemix.isPublic ? '✓ Sì' : '✗ No'}</Text>
                </View>
              </View>

              <View style={dynStyles.detailsStats}>
                <View style={dynStyles.detailsStat}>
                  <Feather name="play-circle" size={20} color="#a855f7" style={{ marginBottom: 4 }} />
                  <Text style={dynStyles.detailsStatNumber}>{selectedRemix.plays || 0}</Text>
                </View>
                <View style={dynStyles.detailsStat}>
                  <Feather name="heart" size={20} color="#ef4444" style={{ marginBottom: 4 }} />
                  <Text style={dynStyles.detailsStatNumber}>{selectedRemix.likes || 0}</Text>
                </View>
                <View style={dynStyles.detailsStat}>
                  <Feather name="share-2" size={20} color="#a855f7" style={{ marginBottom: 4 }} />
                  <Text style={dynStyles.detailsStatNumber}>{selectedRemix.shares || 0}</Text>
                </View>
              </View>

              {selectedRemix.isProcessed && (
                <View style={dynStyles.statusBadge}>
                  <Text style={dynStyles.statusText}>✅ Processato</Text>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ════════════════════════��═══════════════════════════════���══════════════
// REMIX CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════

function RemixCard({ remix, onPress, onPlay, onDelete, isSelected, isPlaying, isLoadingAudio, canDelete, colors }) {
  const cardDyn = useMemo(() => createRemixStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.remixCard, isSelected && styles.remixCardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={isPlaying ? ['#0e4f66', '#1e6fa0'] : [colors.bgCard, colors.bgElevated]}
        style={styles.remixCardGradient}
      >
        <View style={styles.remixCardHeader}>
          {remix.isProcessed && remix.audioUrl ? (
            <TouchableOpacity
              style={[cardDyn.remixPlayBtn, isPlaying && cardDyn.remixPlayBtnActive]}
              onPress={(e) => { e.stopPropagation(); onPlay(); }}
            >
              {isLoadingAudio ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name={isPlaying ? 'square' : 'play'} size={16} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <View style={cardDyn.remixIconContainer}>
              <Text style={styles.remixIcon}>🎛️</Text>
            </View>
          )}
          {canDelete && (
            <TouchableOpacity
              style={cardDyn.remixDeleteButton}
              onPress={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Feather name="trash-2" size={13} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <Text style={cardDyn.remixCardTitle} numberOfLines={2}>{remix.title}</Text>

        <View style={styles.remixCardMeta}>
          <Text style={cardDyn.remixCardMetaText}>{remix.tracksCount} tracce</Text>
          <Text style={cardDyn.remixCardMetaText}>•</Text>
          <Text style={cardDyn.remixCardMetaText}>{(remix.totalDuration ?? 0).toFixed(0)}s</Text>
        </View>

        <View style={styles.remixCardStats}>
          <View style={styles.remixCardStat}>
            <Feather name="play-circle" size={12} color="#a855f7" />
            <Text style={cardDyn.remixCardStatText}>{remix.plays || 0}</Text>
          </View>
          <View style={styles.remixCardStat}>
            <Feather name="heart" size={12} color="#ef4444" />
            <Text style={cardDyn.remixCardStatText}>{remix.likes || 0}</Text>
          </View>
        </View>

        <View style={styles.remixCardFooter}>
          <View style={[cardDyn.remixStatusDot, !remix.isProcessed && { backgroundColor: '#eab308' }]} />
          <Text style={cardDyn.remixStatusText}>
            {remix.isProcessed ? (isPlaying ? '🔊 In riproduzione' : 'Pronto') : 'Processing...'}
          </Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ═════════════════════════════════════════════════════════════════════��═
// STYLES
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  loadingContainer: { padding: 40, alignItems: 'center' },
  remixScroll: { marginBottom: 16 },
  remixCard: { width: 180, marginRight: 12, borderRadius: 16, overflow: 'hidden' },
  remixCardSelected: { transform: [{ scale: 1.05 }] },
  remixCardGradient: { padding: 16, minHeight: 200 },
  remixCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  remixIcon: { fontSize: 20 },
  remixCardMeta: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  remixCardStats: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  remixCardStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  remixCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto' },
});

// ─── Dynamic theme-aware styles ───────────────────────────────────────────────
function createRemixStyles(colors) {
  return StyleSheet.create({
    // Stats card
    statsCard: { borderRadius: 16, padding: 20, marginBottom: 16, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)' },
    statsTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    statsTitle: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginLeft: 8 },
    statsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
    statItem: { alignItems: 'center' },
    statNumber: { fontSize: 24, fontWeight: '800', color: '#a855f7' },
    statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    createButton: { backgroundColor: '#a855f7', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    createButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },
    // Empty state
    emptyState: { backgroundColor: colors.bgCard, borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    emptyText: { fontSize: 16, color: colors.textSecondary, marginBottom: 4 },
    emptySubtext: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
    emptyButton: { backgroundColor: '#a855f7', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
    emptyButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
    // Remix card inner
    remixPlayBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#a855f7', justifyContent: 'center', alignItems: 'center' },
    remixPlayBtnActive: { backgroundColor: '#ef4444' },
    remixIconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },
    remixDeleteButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
    remixCardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8, minHeight: 40 },
    remixCardMetaText: { fontSize: 11, color: colors.textMuted },
    remixCardStatText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    remixStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#a855f7' },
    remixStatusText: { fontSize: 10, color: '#a855f7' },
    // Details card
    detailsCard: { backgroundColor: colors.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
    detailsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    detailsTitle: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 },
    detailsClose: { fontSize: 20, color: colors.textMuted },
    // Player
    playerBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgElevated, borderRadius: 12, padding: 12, marginBottom: 12, gap: 12 },
    playerPlayBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#a855f7', justifyContent: 'center', alignItems: 'center' },
    playerProgress: { flex: 1 },
    playerProgressBg: { height: 4, backgroundColor: colors.surfaceMedium, borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
    playerProgressFill: { height: '100%', backgroundColor: '#a855f7', borderRadius: 2 },
    playerTimes: { flexDirection: 'row', justifyContent: 'space-between' },
    playerTime: { fontSize: 11, color: colors.textMuted },
    // Details content
    detailsDescription: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
    detailsInfo: { backgroundColor: colors.bgElevated, borderRadius: 12, padding: 12, marginBottom: 12 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    infoLabel: { fontSize: 13, color: colors.textSecondary },
    infoValue: { fontSize: 13, fontWeight: '600', color: colors.text },
    detailsStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
    detailsStat: { alignItems: 'center' },
    detailsStatNumber: { fontSize: 16, fontWeight: '700', color: colors.text },
    statusBadge: { backgroundColor: 'rgba(168,85,247,0.15)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.35)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignSelf: 'center', marginBottom: 12 },
    statusText: { fontSize: 12, fontWeight: '600', color: '#a855f7' },
  });
}
