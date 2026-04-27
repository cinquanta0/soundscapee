import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, FlatList, Alert, StyleSheet, TextInput, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PodcastPlayer from '../components/PodcastPlayer';
import { C } from '../constants/design';
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
  const { t } = useTranslation();
  const [podcast, setPodcast]         = useState<Podcast | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  const [showModal, setShowModal]         = useState(false);
  const [playlists, setPlaylists]         = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [adding, setAdding]               = useState<string | null>(null);
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newName, setNewName]             = useState('');
  const [creating, setCreating]           = useState(false);

  useEffect(() => {
    getPodcastById(podcastId)
      .then((p) => {
        if (!p) setError(t('podcast.podcastDetail.notFound'));
        else setPodcast(p);
      })
      .catch(() => setError(t('podcast.podcastDetail.cannotLoad')))
      .finally(() => setLoading(false));
  }, [podcastId]);

  const openPlaylistModal = async () => {
    setShowModal(true);
    setLoadingPlaylists(true);
    try {
      setPlaylists(await getUserPlaylists());
    } catch {
      Alert.alert(t('common.error'), t('playlist.errors.cannotLoadPlaylists'));
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleAddToPlaylist = async (playlistId: string, playlistName: string) => {
    if (!podcast) return;
    setAdding(playlistId);
    try {
      await addPodcastToPlaylist(playlistId, podcast.id);
      setShowModal(false);
      Alert.alert(t('playlist.added'), t('playlist.addedMsg', { title: podcast.title, name: playlistName }));
    } catch {
      Alert.alert(t('common.error'), t('playlist.errors.cannotAdd'));
    } finally {
      setAdding(null);
    }
  };

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
      Alert.alert(t('playlist.added'), t('playlist.addedMsg', { title: podcast?.title ?? '', name }));
    } catch {
      Alert.alert(t('common.error'), t('playlist.errors.cannotCreate'));
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <View style={s.root}>
        <LinearGradient colors={['#0A0A0A', '#0D0D12', '#0A0A0A']} style={StyleSheet.absoluteFill} />
        <View style={s.centered}><ActivityIndicator color={C.accent} size="large" /></View>
      </View>
    );
  }

  if (error || !podcast) {
    return (
      <View style={s.root}>
        <LinearGradient colors={['#0A0A0A', '#0D0D12', '#0A0A0A']} style={StyleSheet.absoluteFill} />
        <View style={s.centered}>
          <Feather name="alert-circle" size={36} color="rgba(255,100,100,0.7)" />
          <Text style={s.errorTxt}>{error ?? t('podcast.podcastDetail.notFound')}</Text>
          <TouchableOpacity style={s.backBtnFull} onPress={onBack}>
            <Text style={s.backBtnTxt}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0A0A0A', '#0D0D12', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="chevron-left" size={22} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        <Text style={s.headerLabel}>{t('podcast.header')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Player — prende quasi tutto lo schermo */}
        <PodcastPlayer podcast={podcast} />

        {/* Divider */}
        <View style={s.divider} />

        {/* Descrizione */}
        {!!podcast.description && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>{t('podcast.descriptionPlaceholder').replace('...', '').trim()}</Text>
            <Text style={s.descTxt}>{podcast.description}</Text>
          </View>
        )}

        {/* Meta: autore, categoria, badge Scuola */}
        <View style={s.metaRow}>
          <View style={s.authorTag}>
            <Feather name="user" size={11} color={C.accent} />
            <Text style={s.metaAuthor}>@{podcast.username}</Text>
          </View>
          {podcast.isITS && (
            <View style={s.itsBadge}>
              <Text style={s.itsBadgeTxt}>{t('podcast.schoolBadge')}</Text>
            </View>
          )}
          {podcast.category ? (
            <View style={s.categoryBadge}>
              <Text style={s.categoryTxt}>{podcast.category}</Text>
            </View>
          ) : null}
        </View>

        {/* Aggiungi a playlist */}
        <TouchableOpacity style={s.addBtn} onPress={openPlaylistModal} activeOpacity={0.8}>
          <Feather name="plus" size={18} color={C.textOnAccent} />
          <Text style={s.addBtnTxt}>{t('playlist.addBtn')}</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Modal playlist */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.modalBox}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{t('podcast.podcastDetail.addToPlaylistTitle')}</Text>

            {loadingPlaylists ? (
              <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />
            ) : (
              <>
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
                        <Feather name="music" size={16} color={C.accent} />
                        <Text style={s.playlistRowName} numberOfLines={1}>{item.name}</Text>
                        {adding === item.id
                          ? <ActivityIndicator color={C.accent} size="small" />
                          : <Text style={s.playlistRowCount}>{item.podcastIds.length} ep.</Text>
                        }
                      </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={s.separator} />}
                  />
                ) : (
                  <Text style={s.noPlaylistsTxt}>{t('podcast.podcastDetail.noPlaylists')}</Text>
                )}

                {showNewPlaylist ? (
                  <View style={s.newPlaylistRow}>
                    <TextInput
                      style={s.newPlaylistInput}
                      placeholder={t('playlist.namePlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.25)"
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
                        ? <ActivityIndicator color={C.textOnAccent} size="small" />
                        : <Feather name="check" size={18} color={C.textOnAccent} />
                      }
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={s.createNewBtn} onPress={() => setShowNewPlaylist(true)}>
                    <Feather name="plus" size={14} color={C.accent} />
                    <Text style={s.createNewTxt}>{t('playlist.newPlaylist')}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <TouchableOpacity
              style={s.modalCloseBtn}
              onPress={() => { setShowModal(false); setShowNewPlaylist(false); setNewName(''); }}
            >
              <Text style={s.modalCloseTxt}>{t('common.cancel')}</Text>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerLabel: {
    fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, fontWeight: '600',
  },

  scroll: { paddingBottom: 48 },
  divider: { height: 1, backgroundColor: C.border, marginHorizontal: 24, marginVertical: 4 },

  // Sezione testo
  section: { paddingHorizontal: 24, paddingVertical: 16, gap: 8 },
  sectionLabel: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, fontWeight: '600' },
  descTxt: { fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 22 },

  // Meta
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, flexWrap: 'wrap', marginBottom: 8 },
  authorTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaAuthor: { fontSize: 12, color: C.accent, fontWeight: '600' },
  itsBadge: {
    backgroundColor: C.accentDim, borderWidth: 1,
    borderColor: C.borderAccent, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  itsBadgeTxt: { fontSize: 9, fontWeight: '700', color: C.accent, letterSpacing: 1 },
  categoryBadge: {
    backgroundColor: C.glass, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: C.border,
  },
  categoryTxt: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },

  // Aggiungi a playlist
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: 24, marginTop: 8,
    paddingVertical: 15, borderRadius: 14,
    backgroundColor: C.accent,
    shadowColor: C.accent, shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 6,
  },
  addBtnTxt: { color: C.textOnAccent, fontSize: 15, fontWeight: '700' },

  // Error
  errorTxt: { fontSize: 14, color: 'rgba(255,100,100,0.9)', textAlign: 'center', lineHeight: 20 },
  backBtnFull: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: C.borderAccent, backgroundColor: C.accentDim,
  },
  backBtnTxt: { color: C.accent, fontSize: 13, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  modalBox: {
    backgroundColor: '#111115', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, gap: 12, paddingBottom: 36,
    borderTopWidth: 1, borderColor: C.border,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 4,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center' },

  playlistRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13,
  },
  playlistRowName: { flex: 1, fontSize: 14, color: '#fff', fontWeight: '500' },
  playlistRowCount: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
  separator: { height: 1, backgroundColor: C.border },

  noPlaylistsTxt: { fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingVertical: 16 },

  newPlaylistRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  newPlaylistInput: {
    flex: 1, backgroundColor: C.bgInput, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 14,
    borderWidth: 1, borderColor: C.border,
  },
  newPlaylistConfirm: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },

  createNewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 10,
    backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.borderAccent,
  },
  createNewTxt: { color: C.accent, fontSize: 13, fontWeight: '600' },

  modalCloseBtn: { paddingVertical: 12, alignItems: 'center' },
  modalCloseTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 14 },
});
