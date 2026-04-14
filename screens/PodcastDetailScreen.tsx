import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, FlatList, Alert, StyleSheet, TextInput, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import PodcastPlayer from '../components/PodcastPlayer';
import {
  getPodcastById, getUserPlaylists, addPodcastToPlaylist, createPlaylist,
  Podcast, Playlist,
} from '../services/podcastService';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  podcastId: string;
  onBack: () => void;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PodcastDetailScreen({ podcastId, onBack }: Props) {
  const [podcast, setPodcast]         = useState<Podcast | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Stato modal "Aggiungi a playlist"
  const [showModal, setShowModal]         = useState(false);
  const [playlists, setPlaylists]         = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [adding, setAdding]               = useState<string | null>(null); // playlistId in corso
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newName, setNewName]             = useState('');
  const [creating, setCreating]           = useState(false);

  // ── Carica podcast ─────────────────────────────────────────────────────────

  useEffect(() => {
    getPodcastById(podcastId)
      .then((p) => {
        if (!p) setError('Podcast non trovato.');
        else setPodcast(p);
      })
      .catch(() => setError('Impossibile caricare il podcast.'))
      .finally(() => setLoading(false));
  }, [podcastId]);

  // ── Apri modal playlist ────────────────────────────────────────────────────

  const openPlaylistModal = async () => {
    setShowModal(true);
    setLoadingPlaylists(true);
    try {
      setPlaylists(await getUserPlaylists());
    } catch {
      Alert.alert('Errore', 'Impossibile caricare le playlist.');
    } finally {
      setLoadingPlaylists(false);
    }
  };

  // ── Aggiungi a playlist ────────────────────────────────────────────────────

  const handleAddToPlaylist = async (playlistId: string, playlistName: string) => {
    if (!podcast) return;
    setAdding(playlistId);
    try {
      await addPodcastToPlaylist(playlistId, podcast.id);
      setShowModal(false);
      Alert.alert('✓ Aggiunto', `"${podcast.title}" aggiunto a "${playlistName}".`);
    } catch {
      Alert.alert('Errore', 'Impossibile aggiungere alla playlist.');
    } finally {
      setAdding(null);
    }
  };

  // ── Crea nuova playlist e aggiungi ─────────────────────────────────────────

  const handleCreateAndAdd = async () => {
    const name = newName.trim();
    if (!name || !podcast) return;
    setCreating(true);
    try {
      const newId = await createPlaylist(name);
      await addPodcastToPlaylist(newId, podcast.id);
      setNewName('');
      setShowNewPlaylist(false);
      setShowModal(false);
      Alert.alert('✓ Fatto', `Playlist "${name}" creata e episodio aggiunto.`);
    } catch {
      Alert.alert('Errore', 'Impossibile creare la playlist.');
    } finally {
      setCreating(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.root}>
        <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
        <View style={s.centered}><ActivityIndicator color="#00FF9C" size="large" /></View>
      </View>
    );
  }

  if (error || !podcast) {
    return (
      <View style={s.root}>
        <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
        <View style={s.centered}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={s.errorTxt}>{error ?? 'Podcast non trovato.'}</Text>
          <TouchableOpacity style={s.backBtnFull} onPress={onBack}>
            <Text style={s.backBtnTxt}>← Indietro</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerLabel}>podcast</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Player */}
        <PodcastPlayer podcast={podcast} />

        {/* Descrizione */}
        {!!podcast.description && (
          <View style={s.descSection}>
            <Text style={s.descLabel}>Descrizione</Text>
            <Text style={s.descTxt}>{podcast.description}</Text>
          </View>
        )}

        {/* Meta: autore, categoria, badge ITS */}
        <View style={s.metaRow}>
          <Text style={s.metaAuthor}>@{podcast.username}</Text>
          {podcast.isITS && (
            <View style={s.itsBadge}>
              <Text style={s.itsBadgeTxt}>ITS</Text>
            </View>
          )}
          {podcast.category ? (
            <View style={s.categoryBadge}>
              <Text style={s.categoryTxt}>{podcast.category}</Text>
            </View>
          ) : null}
        </View>

        {/* Bottone Aggiungi a playlist */}
        <TouchableOpacity style={s.addBtn} onPress={openPlaylistModal} activeOpacity={0.8}>
          <Text style={s.addBtnTxt}>＋ Aggiungi a playlist</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Modal "Aggiungi a playlist" ─────────────────────────────────── */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.modalBox}>
            {/* Handle */}
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Aggiungi a playlist</Text>

            {loadingPlaylists ? (
              <ActivityIndicator color="#00FF9C" style={{ marginVertical: 24 }} />
            ) : (
              <>
                {/* Lista playlist esistenti */}
                {playlists.length > 0 ? (
                  <FlatList
                    data={playlists}
                    keyExtractor={(p) => p.id}
                    style={{ maxHeight: 260 }}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={s.playlistRow}
                        onPress={() => handleAddToPlaylist(item.id, item.name)}
                        disabled={adding === item.id}
                        activeOpacity={0.8}
                      >
                        <Text style={s.playlistRowIcon}>🎵</Text>
                        <Text style={s.playlistRowName} numberOfLines={1}>{item.name}</Text>
                        {adding === item.id
                          ? <ActivityIndicator color="#00FF9C" size="small" />
                          : <Text style={s.playlistRowCount}>{item.podcastIds.length} ep.</Text>
                        }
                      </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={s.separator} />}
                  />
                ) : (
                  <Text style={s.noPlaylistsTxt}>Nessuna playlist ancora.</Text>
                )}

                {/* Crea nuova playlist inline */}
                {showNewPlaylist ? (
                  <View style={s.newPlaylistRow}>
                    <TextInput
                      style={s.newPlaylistInput}
                      placeholder="Nome nuova playlist..."
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={newName}
                      onChangeText={setNewName}
                      autoFocus
                      maxLength={80}
                      returnKeyType="done"
                      onSubmitEditing={handleCreateAndAdd}
                    />
                    <TouchableOpacity
                      style={[s.newPlaylistConfirm, (!newName.trim() || creating) && { opacity: 0.4 }]}
                      onPress={handleCreateAndAdd}
                      disabled={!newName.trim() || creating}
                    >
                      {creating
                        ? <ActivityIndicator color="#050508" size="small" />
                        : <Text style={s.newPlaylistConfirmTxt}>✓</Text>
                      }
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={s.createNewBtn}
                    onPress={() => setShowNewPlaylist(true)}
                  >
                    <Text style={s.createNewTxt}>+ Crea nuova playlist</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Chiudi */}
            <TouchableOpacity
              style={s.modalCloseBtn}
              onPress={() => { setShowModal(false); setShowNewPlaylist(false); setNewName(''); }}
            >
              <Text style={s.modalCloseTxt}>Annulla</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerLabel: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: 2 },

  scroll: { paddingBottom: 40, gap: 20 },

  // Descrizione
  descSection: { paddingHorizontal: 24, gap: 6 },
  descLabel: { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: 1 },
  descTxt: { fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 21 },

  // Meta
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, flexWrap: 'wrap' },
  metaAuthor: { fontSize: 12, color: '#00FF9C', fontFamily: 'monospace' },
  itsBadge: {
    backgroundColor: 'rgba(0,255,156,0.15)', borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.4)', borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  itsBadgeTxt: { fontSize: 9, fontWeight: '700', color: '#00FF9C', letterSpacing: 1, fontFamily: 'monospace' },
  categoryBadge: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 5,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  categoryTxt: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },

  // Bottone aggiungi
  addBtn: {
    marginHorizontal: 24, paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(0,255,156,0.12)', borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.35)', alignItems: 'center',
  },
  addBtnTxt: { color: '#00FF9C', fontSize: 15, fontWeight: '700' },

  // Error
  errorIcon: { fontSize: 36 },
  errorTxt: { fontSize: 14, color: 'rgba(255,100,100,0.9)', textAlign: 'center' },
  backBtnFull: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(0,255,156,0.4)', backgroundColor: 'rgba(0,255,156,0.1)',
  },
  backBtnTxt: { color: '#00FF9C', fontSize: 13, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalBox: {
    backgroundColor: '#0D0D1A', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 12, borderTopWidth: 1, borderColor: 'rgba(0,255,156,0.15)',
    paddingBottom: 32,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 4,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'center' },

  playlistRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
  },
  playlistRowIcon: { fontSize: 18 },
  playlistRowName: { flex: 1, fontSize: 14, color: '#fff', fontWeight: '500' },
  playlistRowCount: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },

  noPlaylistsTxt: { fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', paddingVertical: 16 },

  newPlaylistRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  newPlaylistInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  newPlaylistConfirm: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#00FF9C', alignItems: 'center', justifyContent: 'center',
  },
  newPlaylistConfirmTxt: { color: '#050508', fontSize: 16, fontWeight: '700' },

  createNewBtn: {
    paddingVertical: 11, borderRadius: 10,
    backgroundColor: 'rgba(0,255,156,0.08)', borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.25)', alignItems: 'center',
  },
  createNewTxt: { color: '#00FF9C', fontSize: 13, fontWeight: '600' },

  modalCloseBtn: { paddingVertical: 11, alignItems: 'center' },
  modalCloseTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
});
