import { Audio } from 'expo-av';
import { onAuthStateChanged } from 'firebase/auth';
import {
    collection,
    getDocs,
    limit,
    orderBy,
    query,
    where,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../../firebaseConfig';
import BattleScreen from '../../screens/BattleScreen';
import PodcastHubScreen from '../../screens/PodcastHubScreen';
import RadioScreen from '../../screens/RadioScreen';
import { Battle, cancelBattle, finalizeBattle, listenToActiveBattles } from '../../services/battleService';
import { incrementListens } from '../../services/firebaseService';

const MOOD_KEYS = ['Tutti', 'Rilassante', 'Energico', 'Gioioso', 'Nostalgico'];

const MOOD_COLORS: Record<string, string> = {
  Energico: '#f97316',
  Rilassante: '#3b82f6',
  Gioioso: '#eab308',
  Nostalgico: '#a855f7',
};

async function searchSounds(searchText: string, mood: string, sortBy: string) {
  const constraints: any[] = [orderBy('createdAt', 'desc'), limit(30)];

  if (mood && mood !== 'Tutti') { // key stays Italian for Firestore
    constraints.unshift(where('mood', '==', mood));
  }

  if (sortBy === 'likes') {
    constraints.splice(constraints.findIndex(c => c.type === 'orderBy'), 1);
    constraints.push(orderBy('likes', 'desc'));
  } else if (sortBy === 'listens') {
    constraints.splice(constraints.findIndex(c => c.type === 'orderBy'), 1);
    constraints.push(orderBy('listens', 'desc'));
  }

  const q = query(collection(db, 'sounds'), ...constraints);
  const snapshot = await getDocs(q);

  let results = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

  // Filtra per testo lato client (Firestore non supporta full-text search nativo)
  if (searchText.trim()) {
    const lower = searchText.toLowerCase();
    results = results.filter(
      s =>
        s.title?.toLowerCase().includes(lower) ||
        s.description?.toLowerCase().includes(lower) ||
        s.username?.toLowerCase().includes(lower)
    );
  }

  return results;
}

type Section = 'suoni' | 'podcast' | 'radio' | 'battles';

export default function ExploreScreen() {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('suoni');
  const [searchText, setSearchText] = useState('');
  const [selectedMood, setSelectedMood] = useState('Tutti');
  const [sortBy, setSortBy] = useState('recent'); // recent | likes | listens
  const [sounds, setSounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [cancelingBattleId, setCancelingBattleId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(auth.currentUser?.uid);

  const soundRef = useRef<Audio.Sound | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid ?? null);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    loadSounds();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [selectedMood, sortBy]);

  useEffect(() => {
    if (section !== 'battles') return;
    console.log('🎯 Battles section selected, listening to active battles...');
    const unsub = listenToActiveBattles(async (bs) => {
      console.log('🎯 Received battles:', bs.length);
      // Chiudi battaglie scadute
      const now = new Date();
      for (const b of bs) {
        if (b.votingEndsAt && b.votingEndsAt < now) {
          await finalizeBattle(b.id).catch(() => {});
        }
      }
      setBattles(bs.filter(b => !b.votingEndsAt || b.votingEndsAt > now));
    });
    return unsub;
  }, [section]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      loadSounds();
    }, 400);
  }, [searchText]);

  const loadSounds = async () => {
    setLoading(true);
    try {
      const results = await searchSounds(searchText, selectedMood, sortBy);
      setSounds(results);
    } catch {
      Alert.alert(t('common.error'), t('explore.errors.cannotLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBattle = async (battleId: string) => {
    if (!auth.currentUser) {
      Alert.alert('Errore', 'Devi essere loggato per annullare una battaglia.');
      return;
    }

    Alert.alert(
      'Annulla battaglia',
      'Sei sicuro di voler annullare questa battaglia? Solo il creatore può farlo.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sì',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancelingBattleId(battleId);
              await cancelBattle(battleId);
            } catch {
              Alert.alert('Errore', 'Impossibile annullare la battaglia.');
            } finally {
              setCancelingBattleId(null);
            }
          },
        },
      ]
    );
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

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: soundData.audioUrl },
        { shouldPlay: true }
      );

      soundRef.current = sound;
      setPlayingId(soundData.id);
      setIsPaused(false);
      await incrementListens(soundData.id);

      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          setPlayingId(null);
          setIsPaused(false);
          soundRef.current = null;
          sound.unloadAsync();
        }
      });
    } catch {
      Alert.alert(t('common.error'), t('explore.errors.cannotPlay'));
    }
  };

  const isPlaying = (id: string) => playingId === id && !isPaused;

  const renderSound = ({ item }: { item: any }) => (
    <View style={styles.soundCard}>
      <View style={styles.soundCardLeft}>
        <View style={[styles.moodDot, { backgroundColor: MOOD_COLORS[item.mood] || '#6b7280' }]} />
        <View style={styles.soundInfo}>
          <Text style={styles.soundTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.soundMeta}>
            {item.username} · {item.duration}s · {item.mood}
          </Text>
          <View style={styles.soundStats}>
            <Text style={styles.statText}>❤️ {item.likes || 0}</Text>
            <Text style={styles.statText}>🎧 {item.listens || 0}</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.playBtn, isPlaying(item.id) && styles.playBtnActive]}
        onPress={() => handlePlayPause(item)}
      >
        <Text style={styles.playBtnText}>
          {playingId === item.id ? (isPaused ? '▶' : '⏸') : '▶'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Sub-tabs */}
      <View style={styles.subTabs}>
        {([
          { id: 'suoni', label: '🎵 Suoni' },
          { id: 'podcast', label: '🎙 Podcast' },
          { id: 'radio', label: '📻 Radio' },
          { id: 'battles', label: '⚔️ Battles' },
        ] as { id: Section; label: string }[]).map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.subTab, section === tab.id && styles.subTabActive]}
            onPress={() => setSection(tab.id)}
          >
            <Text style={[styles.subTabTxt, section === tab.id && styles.subTabTxtActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {section === 'podcast' && <PodcastHubScreen />}
      {section === 'radio' && <RadioScreen />}

      {section === 'battles' && (
        <FlatList
          data={battles}
          keyExtractor={b => b.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <Text style={{ fontSize: 48 }}>⚔️</Text>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Nessuna battaglia in corso</Text>
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center' }}>Sfida un utente dal suo profilo{'\n'}per iniziare una battaglia</Text>
            </View>
          }
          renderItem={({ item: b }) => {
            const total = b.challengerVotes + b.opponentVotes;
            const challPct = total > 0 ? Math.round((b.challengerVotes / total) * 100) : 50;
            const timeLeft = b.votingEndsAt ? Math.max(0, b.votingEndsAt.getTime() - Date.now()) : 0;
            const hLeft = Math.floor(timeLeft / 3600000);
            const mLeft = Math.floor((timeLeft % 3600000) / 60000);
            const statusLabel = b.status === 'accepted'
              ? 'In attesa dell’avversario'
              : b.status === 'challenger_rec'
                ? `${b.challengerName} sta registrando`
                : b.status === 'opponent_rec'
                  ? `${b.opponentName} sta registrando`
                  : 'Votazione aperta';
            return (
              <TouchableOpacity
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(249,115,22,0.2)', gap: 12 }}
                onPress={() => setActiveBattleId(b.id)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ backgroundColor: 'rgba(249,115,22,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(249,115,22,0.3)' }}>
                    <Text style={{ color: '#f97316', fontSize: 11, fontWeight: '700' }}>🎯 {b.theme}</Text>
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>⏱ {hLeft}h {mLeft}m</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, flex: 1 }}>{statusLabel}</Text>
                  {currentUserId === b.challengerId && (
                    <TouchableOpacity
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(248,113,113,0.35)', backgroundColor: 'rgba(248,113,113,0.12)' }}
                      onPress={() => handleCancelBattle(b.id)}
                      disabled={cancelingBattleId === b.id}
                    >
                      <Text style={{ color: '#fb7185', fontSize: 11, fontWeight: '700' }}>
                        {cancelingBattleId === b.id ? 'Annullando…' : 'Annulla'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ alignItems: 'center', gap: 2, flex: 1 }}>
                    <Text style={{ fontSize: 28 }}>{b.challengerAvatar}</Text>
                    <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{b.challengerName}</Text>
                    <Text style={{ color: '#f97316', fontSize: 16, fontWeight: '900' }}>{b.challengerVotes}</Text>
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18, fontWeight: '900', paddingHorizontal: 8 }}>VS</Text>
                  <View style={{ alignItems: 'center', gap: 2, flex: 1 }}>
                    <Text style={{ fontSize: 28 }}>{b.opponentAvatar}</Text>
                    <Text style={{ color: '#a855f7', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{b.opponentName}</Text>
                    <Text style={{ color: '#a855f7', fontSize: 16, fontWeight: '900' }}>{b.opponentVotes}</Text>
                  </View>
                </View>
                {total > 0 && (
                  <View style={{ height: 6, backgroundColor: '#a855f7', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${challPct}%`, backgroundColor: '#f97316' }} />
                  </View>
                )}
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center' }}>
                  {total} voti · Tocca per ascoltare e votare
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {activeBattleId && (
        <Modal visible animationType="slide" onRequestClose={() => setActiveBattleId(null)}>
          <BattleScreen battleId={activeBattleId} onClose={() => setActiveBattleId(null)} />
        </Modal>
      )}

      {section === 'suoni' && <>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={t('explore.searchPlaceholder')}
          placeholderTextColor="#64748b"
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Mood filter */}
      <FlatList
        horizontal
        data={MOOD_KEYS}
        keyExtractor={m => m}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.moodList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.moodChip, selectedMood === item && styles.moodChipActive]}
            onPress={() => setSelectedMood(item)}
          >
            <Text style={[styles.moodChipText, selectedMood === item && styles.moodChipTextActive]}>
              {item === 'Tutti' ? t('moods.all') : t(`moods.${item.toLowerCase()}`, item)}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Sort */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>{t('explore.sortBy')}</Text>
        {(['recent', 'likes', 'listens'] as const).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.sortBtn, sortBy === s && styles.sortBtnActive]}
            onPress={() => setSortBy(s)}
          >
            <Text style={[styles.sortBtnText, sortBy === s && styles.sortBtnTextActive]}>
              {s === 'recent' ? t('explore.recent') : s === 'likes' ? t('explore.likes') : t('explore.listens')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#06b6d4" />
        </View>
      ) : sounds.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyText}>{t('explore.noResults')}</Text>
          <Text style={styles.emptySubtext}>{t('explore.noResultsHint')}</Text>
        </View>
      ) : (
        <FlatList
          data={sounds}
          keyExtractor={item => item.id}
          renderItem={renderSound}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  subTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#334155',
  },
  subTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  subTabActive: {
    backgroundColor: 'rgba(0,255,156,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.3)',
  },
  subTabTxt: {
    fontSize: 12,
    color: '#475569',
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  subTabTxtActive: {
    color: '#00FF9C',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    marginHorizontal: 16,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  clearBtn: {
    color: '#64748b',
    fontSize: 16,
    paddingHorizontal: 4,
  },
  moodList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  moodChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 8,
  },
  moodChipActive: {
    backgroundColor: '#06b6d4',
    borderColor: '#06b6d4',
  },
  moodChipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  moodChipTextActive: {
    color: '#fff',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  sortLabel: {
    color: '#64748b',
    fontSize: 13,
    marginRight: 4,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#1e293b',
  },
  sortBtnActive: {
    backgroundColor: '#334155',
  },
  sortBtnText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  sortBtnTextActive: {
    color: '#fff',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  soundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  soundCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moodDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  soundInfo: {
    flex: 1,
  },
  soundTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  soundMeta: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 5,
  },
  soundStats: {
    flexDirection: 'row',
    gap: 12,
  },
  statText: {
    color: '#64748b',
    fontSize: 12,
  },
  playBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#06b6d4',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  playBtnActive: {
    backgroundColor: '#f97316',
  },
  playBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtext: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
