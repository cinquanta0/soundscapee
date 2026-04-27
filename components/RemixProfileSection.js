// components/RemixProfileSection.js
import React, { useState, useEffect, useRef } from 'react';
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

export default function RemixProfileSection({ onOpenRemixStudio, userId = null }) {
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
        <ActivityIndicator size="large" color="#00FF9C" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Card */}
      {stats && (
        <LinearGradient colors={['#00FF9C', '#3b82f6']} style={styles.statsCard}>
          <Text style={styles.statsTitle}>📊 Le Tue Stats Remix</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.totalRemixes}</Text>
              <Text style={styles.statLabel}>Remix</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.totalPlays}</Text>
              <Text style={styles.statLabel}>Play</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.totalLikes}</Text>
              <Text style={styles.statLabel}>Likes</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{(stats.avgTracksPerRemix ?? 0).toFixed(1)}</Text>
              <Text style={styles.statLabel}>Avg Tracce</Text>
            </View>
          </View>
        </LinearGradient>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>🎛️ {isOwnProfile ? 'I Miei Remix' : 'Remix'} ({remixes.length})</Text>
        {isOwnProfile && (
          <TouchableOpacity style={styles.createButton} onPress={onOpenRemixStudio}>
            <Text style={styles.createButtonText}>➕ Nuovo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Empty State */}
      {remixes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎛️</Text>
          <Text style={styles.emptyText}>Nessun remix ancora</Text>
          {isOwnProfile && (
            <>
              <Text style={styles.emptySubtext}>Crea il tuo primo remix mixando i tuoi suoni!</Text>
              <TouchableOpacity style={styles.emptyButton} onPress={onOpenRemixStudio}>
                <Text style={styles.emptyButtonText}>🎵 Inizia a Remixare</Text>
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
            <View style={styles.detailsCard}>
              <View style={styles.detailsHeader}>
                <Text style={styles.detailsTitle}>{selectedRemix.title}</Text>
                <TouchableOpacity onPress={() => setSelectedRemix(null)}>
                  <Text style={styles.detailsClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Player bar */}
              {selectedRemix.isProcessed && selectedRemix.audioUrl ? (
                <View style={styles.playerBar}>
                  <TouchableOpacity
                    style={styles.playerPlayBtn}
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
                  <View style={styles.playerProgress}>
                    <View style={styles.playerProgressBg}>
                      <View
                        style={[
                          styles.playerProgressFill,
                          {
                            width: playingId === selectedRemix.id && playbackDuration > 0
                              ? `${(playbackPosition / playbackDuration) * 100}%`
                              : '0%',
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.playerTimes}>
                      <Text style={styles.playerTime}>
                        {playingId === selectedRemix.id ? formatTime(playbackPosition) : '0:00'}
                      </Text>
                      <Text style={styles.playerTime}>
                        {playingId === selectedRemix.id && playbackDuration > 0
                          ? formatTime(playbackDuration)
                          : `${(selectedRemix.totalDuration ?? 0).toFixed(0)}s`}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={[styles.statusBadge, { backgroundColor: '#eab308', marginBottom: 12 }]}>
                  <Text style={styles.statusText}>⏳ In elaborazione...</Text>
                </View>
              )}

              <Text style={styles.detailsDescription}>
                {selectedRemix.description || 'Nessuna descrizione'}
              </Text>

              <View style={styles.detailsInfo}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>📊 Tracce:</Text>
                  <Text style={styles.infoValue}>{selectedRemix.tracksCount}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>⏱️ Durata:</Text>
                  <Text style={styles.infoValue}>{(selectedRemix.totalDuration ?? 0).toFixed(1)}s</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>📅 Creato:</Text>
                  <Text style={styles.infoValue}>{formatDate(selectedRemix.createdAt)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>👁️ Pubblico:</Text>
                  <Text style={styles.infoValue}>{selectedRemix.isPublic ? '✓ Sì' : '✗ No'}</Text>
                </View>
              </View>

              <View style={styles.detailsStats}>
                <View style={styles.detailsStat}>
                  <Feather name="play-circle" size={20} color="#00FF9C" style={{ marginBottom: 4 }} />
                  <Text style={styles.detailsStatNumber}>{selectedRemix.plays || 0}</Text>
                </View>
                <View style={styles.detailsStat}>
                  <Feather name="heart" size={20} color="#ef4444" style={{ marginBottom: 4 }} />
                  <Text style={styles.detailsStatNumber}>{selectedRemix.likes || 0}</Text>
                </View>
                <View style={styles.detailsStat}>
                  <Feather name="share-2" size={20} color="#a855f7" style={{ marginBottom: 4 }} />
                  <Text style={styles.detailsStatNumber}>{selectedRemix.shares || 0}</Text>
                </View>
              </View>

              {selectedRemix.isProcessed && (
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>✅ Processato</Text>
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

function RemixCard({ remix, onPress, onPlay, onDelete, isSelected, isPlaying, isLoadingAudio, canDelete }) {
  return (
    <TouchableOpacity
      style={[styles.remixCard, isSelected && styles.remixCardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={isPlaying ? ['#0e4f66', '#1e6fa0'] : ['#161616', 'rgba(255,255,255,0.08)']}
        style={styles.remixCardGradient}
      >
        <View style={styles.remixCardHeader}>
          {remix.isProcessed && remix.audioUrl ? (
            <TouchableOpacity
              style={[styles.remixPlayBtn, isPlaying && styles.remixPlayBtnActive]}
              onPress={(e) => { e.stopPropagation(); onPlay(); }}
            >
              {isLoadingAudio ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name={isPlaying ? 'square' : 'play'} size={16} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.remixIconContainer}>
              <Text style={styles.remixIcon}>🎛️</Text>
            </View>
          )}
          {canDelete && (
            <TouchableOpacity
              style={styles.remixDeleteButton}
              onPress={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Feather name="trash-2" size={13} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.remixCardTitle} numberOfLines={2}>{remix.title}</Text>

        <View style={styles.remixCardMeta}>
          <Text style={styles.remixCardMetaText}>{remix.tracksCount} tracce</Text>
          <Text style={styles.remixCardMetaText}>•</Text>
          <Text style={styles.remixCardMetaText}>{(remix.totalDuration ?? 0).toFixed(0)}s</Text>
        </View>

        <View style={styles.remixCardStats}>
          <View style={styles.remixCardStat}>
            <Feather name="play-circle" size={12} color="#00FF9C" />
            <Text style={styles.remixCardStatText}>{remix.plays || 0}</Text>
          </View>
          <View style={styles.remixCardStat}>
            <Feather name="heart" size={12} color="#ef4444" />
            <Text style={styles.remixCardStatText}>{remix.likes || 0}</Text>
          </View>
        </View>

        <View style={styles.remixCardFooter}>
          <View style={[styles.remixStatusDot, !remix.isProcessed && { backgroundColor: '#eab308' }]} />
          <Text style={styles.remixStatusText}>
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

  statsCard: { borderRadius: 16, padding: 20, marginBottom: 16 },
  statsTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 16, textAlign: 'center' },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 11, color: '#fff', opacity: 0.8, marginTop: 4 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  createButton: { backgroundColor: '#00FF9C', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  createButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  emptyState: { backgroundColor: '#161616', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#94a3b8', marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 20 },
  emptyButton: { backgroundColor: '#00FF9C', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  emptyButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  remixScroll: { marginBottom: 16 },

  remixCard: { width: 180, marginRight: 12, borderRadius: 16, overflow: 'hidden' },
  remixCardSelected: { transform: [{ scale: 1.05 }] },
  remixCardGradient: { padding: 16, minHeight: 200 },
  remixCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  remixPlayBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#00FF9C', justifyContent: 'center', alignItems: 'center' },
  remixPlayBtnActive: { backgroundColor: '#ef4444' },
  remixPlayIcon: { fontSize: 16, color: '#fff' },
  remixIconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  remixIcon: { fontSize: 20 },
  remixDeleteButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
  remixDeleteIcon: { fontSize: 12 },
  remixCardTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 8, minHeight: 40 },
  remixCardMeta: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  remixCardMetaText: { fontSize: 11, color: '#94a3b8' },
  remixCardStats: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  remixCardStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  remixCardStatIcon: { fontSize: 12 },
  remixCardStatText: { fontSize: 12, color: '#cbd5e1', fontWeight: '600' },
  remixCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto' },
  remixStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  remixStatusText: { fontSize: 10, color: '#64748b' },

  detailsCard: { backgroundColor: '#161616', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  detailsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailsTitle: { fontSize: 18, fontWeight: '700', color: '#fff', flex: 1 },
  detailsClose: { fontSize: 20, color: '#94a3b8' },

  playerBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A0A0A', borderRadius: 12, padding: 12, marginBottom: 12, gap: 12 },
  playerPlayBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#00FF9C', justifyContent: 'center', alignItems: 'center' },
  playerPlayIcon: { fontSize: 20 },
  playerProgress: { flex: 1 },
  playerProgressBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  playerProgressFill: { height: '100%', backgroundColor: '#00FF9C', borderRadius: 2 },
  playerTimes: { flexDirection: 'row', justifyContent: 'space-between' },
  playerTime: { fontSize: 11, color: '#64748b' },

  detailsDescription: { fontSize: 13, color: '#cbd5e1', marginBottom: 16 },
  detailsInfo: { backgroundColor: '#0A0A0A', borderRadius: 12, padding: 12, marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  infoLabel: { fontSize: 13, color: '#94a3b8' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#fff' },
  detailsStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  detailsStat: { alignItems: 'center' },
  detailsStatIcon: { fontSize: 20, marginBottom: 4 },
  detailsStatNumber: { fontSize: 16, fontWeight: '700', color: '#fff' },
  statusBadge: { backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignSelf: 'center', marginBottom: 12 },
  statusText: { fontSize: 12, fontWeight: '600', color: '#fff' },
});
