import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, StyleSheet, Modal, KeyboardAvoidingView,
  Platform, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import {
  getUserPlaylists, createPlaylist, deletePlaylist, Playlist,
} from '../services/podcastService';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onSelectPlaylist: (playlistId: string, name: string) => void;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PlaylistListScreen({ onSelectPlaylist }: Props) {
  const { t } = useTranslation();
  const [playlists, setPlaylists]     = useState<Playlist[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [newName, setNewName]         = useState('');
  const [creating, setCreating]       = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setPlaylists(await getUserPlaylists());
    } catch {
      setError(t('playlist.errors.cannotLoad'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Crea playlist ──────────────────────────────────────────────────────────

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createPlaylist(name);
      setNewName('');
      setShowCreate(false);
      await load();
    } catch {
      Alert.alert(t('common.error'), t('playlist.errors.cannotCreate'));
    } finally {
      setCreating(false);
    }
  };

  // ── Elimina playlist ───────────────────────────────────────────────────────

  const handleDelete = (p: Playlist) => {
    Alert.alert(
      t('playlist.delete'),
      t('playlist.deleteConfirmMsg', { name: p.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive', onPress: async () => {
            try {
              await deletePlaylist(p.id);
              setPlaylists((prev) => prev.filter((x) => x.id !== p.id));
            } catch {
              Alert.alert(t('common.error'), t('playlist.errors.cannotDelete'));
            }
          },
        },
      ],
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('playlist.title')}</Text>
        <TouchableOpacity style={s.newBtn} onPress={() => setShowCreate(true)}>
          <Text style={s.newBtnTxt}>{t('playlist.create')}</Text>
        </TouchableOpacity>
      </View>

      {/* Loading */}
      {loading && (
        <View style={s.centered}>
          <ActivityIndicator color="#00FF9C" size="large" />
        </View>
      )}

      {/* Errore */}
      {!loading && error && (
        <View style={s.centered}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryTxt}>{t('common.ok')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Lista */}
      {!loading && !error && (
        <FlatList
          data={playlists}
          keyExtractor={(p) => p.id}
          contentContainerStyle={playlists.length === 0 ? s.emptyContainer : s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#00FF9C"
              colors={['#00FF9C']}
            />
          }
          ListEmptyComponent={
            <View style={s.centered}>
              <Text style={s.emptyIcon}>🎵</Text>
              <Text style={s.emptyTxt}>{t('playlist.empty')}{'\n'}{t('playlist.emptyHint')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.row}
              onPress={() => onSelectPlaylist(item.id, item.name)}
              activeOpacity={0.8}
            >
              <View style={s.rowIcon}>
                <Text style={s.rowIconTxt}>🎵</Text>
              </View>
              <View style={s.rowInfo}>
                <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.rowCount}>
                  {item.podcastIds.length} ep.
                </Text>
              </View>
              <TouchableOpacity
                style={s.deleteBtn}
                onPress={() => handleDelete(item)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={s.deleteTxt}>🗑</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Modal crea playlist */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>{t('playlist.newPlaylistTitle')}</Text>
            <TextInput
              style={s.modalInput}
              placeholder={t('playlist.namePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={newName}
              onChangeText={setNewName}
              autoFocus
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => { setShowCreate(false); setNewName(''); }}
              >
                <Text style={s.modalCancelTxt}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirmBtn, (!newName.trim() || creating) && { opacity: 0.4 }]}
                onPress={handleCreate}
                disabled={!newName.trim() || creating}
              >
                {creating
                  ? <ActivityIndicator color="#050508" size="small" />
                  : <Text style={s.modalConfirmTxt}>{t('common.create')}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff', fontStyle: 'italic' },
  newBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(0,255,156,0.15)', borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.4)',
  },
  newBtnTxt: { color: '#00FF9C', fontSize: 13, fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyContainer: { flexGrow: 1 },
  listContent: { padding: 16, gap: 10 },

  emptyIcon: { fontSize: 48 },
  emptyTxt: { fontSize: 15, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 22 },

  errorIcon: { fontSize: 36 },
  errorTxt: { fontSize: 14, color: 'rgba(255,100,100,0.9)', textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(0,255,156,0.4)', backgroundColor: 'rgba(0,255,156,0.1)',
  },
  retryTxt: { color: '#00FF9C', fontSize: 13, fontWeight: '600' },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1e293b', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#334155',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  rowIcon: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: 'rgba(0,255,156,0.1)', borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  rowIconTxt: { fontSize: 20 },
  rowInfo: { flex: 1, gap: 3 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  rowCount: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  deleteBtn: { padding: 4 },
  deleteTxt: { fontSize: 18 },

  // Modal crea
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalBox: {
    width: '100%', backgroundColor: '#0D0D1A', borderRadius: 16,
    padding: 20, gap: 16, borderWidth: 1, borderColor: 'rgba(0,255,156,0.15)',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center' },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center',
  },
  modalCancelTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  modalConfirmBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#00FF9C', alignItems: 'center',
  },
  modalConfirmTxt: { color: '#050508', fontSize: 14, fontWeight: '700' },
});
