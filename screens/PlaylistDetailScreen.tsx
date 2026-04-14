import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  Alert, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import PodcastCard from '../components/PodcastCard';
import PodcastPlayer from '../components/PodcastPlayer';
import {
  listenToPlaylist, removePodcastFromPlaylist,
  getPodcastById, Playlist, Podcast,
} from '../services/podcastService';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  playlistId: string;
  playlistName: string;
  onBack: () => void;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PlaylistDetailScreen({ playlistId, playlistName, onBack }: Props) {
  const [playlist, setPlaylist]       = useState<Playlist | null>(null);
  const [episodes, setEpisodes]       = useState<Podcast[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);

  // ── Ascolta playlist in real-time ──────────────────────────────────────────

  useEffect(() => {
    const unsub = listenToPlaylist(playlistId, async (pl) => {
      if (!pl) { setError('Playlist non trovata.'); setLoadingList(false); return; }
      setPlaylist(pl);
      setError(null);

      // Carica i dettagli di ogni episodio in parallelo
      try {
        const loaded = await Promise.all(pl.podcastIds.map((id) => getPodcastById(id)));
        setEpisodes(loaded.filter((p): p is Podcast => p !== null));
      } catch {
        setError('Impossibile caricare gli episodi.');
      } finally {
        setLoadingList(false);
      }
    });
    return unsub;
  }, [playlistId]);

  // ── Rimuovi episodio ───────────────────────────────────────────────────────

  const handleRemove = (podcast: Podcast, index: number) => {
    Alert.alert(
      'Rimuovi episodio',
      `Rimuovere "${podcast.title}" dalla playlist?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimuovi', style: 'destructive', onPress: async () => {
            try {
              await removePodcastFromPlaylist(playlistId, podcast.id);
              // Aggiusta currentIndex se l'episodio rimosso è prima o uguale al corrente
              if (currentIndex !== null) {
                if (index < currentIndex) setCurrentIndex((i) => (i! > 0 ? i! - 1 : 0));
                else if (index === currentIndex) setCurrentIndex(null);
              }
            } catch {
              Alert.alert('Errore', 'Impossibile rimuovere l\'episodio.');
            }
          },
        },
      ],
    );
  };

  // ── Auto-advance alla fine di una traccia ──────────────────────────────────

  const handleFinish = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev === null) return null;
      const next = prev + 1;
      return next < episodes.length ? next : null; // null = fine playlist
    });
  }, [episodes.length]);

  // ── Episodio corrente ──────────────────────────────────────────────────────

  const currentEpisode = currentIndex !== null ? episodes[currentIndex] ?? null : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{playlistName}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Loading */}
      {loadingList && (
        <View style={s.centered}>
          <ActivityIndicator color="#00FF9C" size="large" />
        </View>
      )}

      {/* Errore */}
      {!loadingList && error && (
        <View style={s.centered}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
        </View>
      )}

      {/* Lista episodi */}
      {!loadingList && !error && (
        <FlatList
          data={episodes}
          keyExtractor={(p) => p.id}
          contentContainerStyle={episodes.length === 0 ? s.emptyContainer : s.listContent}
          showsVerticalScrollIndicator={false}
          // Spazio extra in fondo se il player è visibile
          ListFooterComponent={<View style={{ height: currentEpisode ? 280 : 16 }} />}
          ListEmptyComponent={
            <View style={s.centered}>
              <Text style={s.emptyIcon}>🎙</Text>
              <Text style={s.emptyTxt}>Nessun episodio in questa playlist.{'\n'}Aggiungine uno dalla schermata del podcast.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={s.episodeRow}>
              {/* Indicatore traccia corrente */}
              {currentIndex === index && (
                <View style={s.nowPlayingDot} />
              )}
              <View style={s.cardWrap}>
                <PodcastCard
                  podcast={item}
                  onPress={() => setCurrentIndex(index)}
                />
              </View>
              {/* Bottone rimuovi */}
              <TouchableOpacity
                style={s.removeBtn}
                onPress={() => handleRemove(item, index)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={s.removeTxt}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Player fisso in basso — compare quando si seleziona un episodio */}
      {currentEpisode && (
        <View style={s.playerWrap}>
          <View style={s.playerHandle} />
          {/* Info episodio corrente + navigazione */}
          <View style={s.playerNav}>
            <Text style={s.playerNavTxt} numberOfLines={1}>
              {currentIndex! + 1} / {episodes.length} — {currentEpisode.title}
            </Text>
            <TouchableOpacity onPress={() => setCurrentIndex(null)}>
              <Text style={s.playerCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <PodcastPlayer
            key={currentEpisode.id}
            podcast={currentEpisode}
            autoPlay={true}
            onFinish={handleFinish}
          />
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  backTxt: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center', fontStyle: 'italic' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyContainer: { flexGrow: 1 },
  listContent: { padding: 16, gap: 10 },

  emptyIcon: { fontSize: 48 },
  emptyTxt: { fontSize: 14, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 21 },
  errorIcon: { fontSize: 36 },
  errorTxt: { fontSize: 14, color: 'rgba(255,100,100,0.9)', textAlign: 'center' },

  // Episode row
  episodeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  nowPlayingDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#00FF9C',
    alignSelf: 'center', flexShrink: 0,
  },
  cardWrap: { flex: 1 },
  removeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  removeTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },

  // Player bottom sheet
  playerWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#0D0D1A',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: 'rgba(0,255,156,0.2)',
    paddingBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 20,
  },
  playerHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginTop: 10,
  },
  playerNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  playerNavTxt: { flex: 1, fontSize: 12, color: '#00FF9C', fontFamily: 'monospace' },
  playerCloseTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 16, paddingLeft: 12 },
});
