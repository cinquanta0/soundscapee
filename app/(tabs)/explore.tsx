import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import {
    collection,
    getDocs,
    limit,
    orderBy,
    query,
    where,
} from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
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
import { C, T, S, R } from '../../constants/design';
import BattleScreen from '../../screens/BattleScreen';
import PodcastHubScreen from '../../screens/PodcastHubScreen';
import RadioScreen from '../../screens/RadioScreen';
import { Battle, cancelBattle, finalizeBattle, listenToActiveBattles } from '../../services/battleService';
import { incrementListens } from '../../services/firebaseService';

// RNTP lazy import — stesso pattern di RadioScreen per evitare crash su web
let _TP: any = null; let _S: any = {};
try { const r = require('react-native-track-player'); _TP = r.default; _S = r.State || {}; } catch {}
const RNTP_SESSION_KEY = '@soundscape/rntp_session';

const MOOD_KEYS = ['Tutti', 'Rilassante', 'Energico', 'Gioioso', 'Nostalgico'];

const MOOD_COLORS: Record<string, string> = {
  Energico: '#f97316',
  Rilassante: '#3b82f6',
  Gioioso: '#eab308',
  Nostalgico: '#a855f7',
};

async function searchUsers(searchText: string) {
  const lower = searchText.trim().toLowerCase();
  if (!lower) {
    // No query — return a few recent users
    const q = query(collection(db, 'users'), orderBy('username'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  }
  // Firestore prefix range trick for username search
  const q = query(
    collection(db, 'users'),
    where('username', '>=', lower),
    where('username', '<=', lower + ''),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
}

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

type Section = 'suoni' | 'podcast' | 'radio' | 'battles' | 'utenti';

type ExploreScreenProps = {
  onOpenUserProfile?: (userId: string) => void;
};

export default function ExploreScreen({ onOpenUserProfile }: ExploreScreenProps) {
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
  const [userSearchText, setUserSearchText] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-ripristino sessione RNTP: se l'app è ripartita dopo un kill
  // (notifica Android toccata), naviga direttamente alla sezione corretta.
  useEffect(() => {
    (async () => {
      if (!_TP) return;
      try {
        const sessionStr = await AsyncStorage.getItem(RNTP_SESSION_KEY);
        if (!sessionStr) return;
        const session = JSON.parse(sessionStr);
        const ps = await _TP.getPlaybackState().catch(() => null);
        const state = ps?.state ?? ps;
        if (state !== _S.Playing && state !== _S.Buffering && state !== _S.Loading) return;
        if (session.type === 'radio') setSection('radio');
        else if (session.type === 'podcast') setSection('podcast');
      } catch {}
    })();
  }, []);


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

  useEffect(() => {
    if (section !== 'utenti') return;
    if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);
    userSearchTimeout.current = setTimeout(() => {
      loadUsers();
    }, 400);
  }, [userSearchText, section]);

  const loadUsers = async () => {
    if (!userSearchText.trim()) {
      setUsers([]);
      return;
    }
    setUsersLoading(true);
    try {
      const results = await searchUsers(userSearchText);
      setUsers(results);
    } catch {
      Alert.alert(t('common.error'), t('explore.errors.cannotLoad'));
    } finally {
      setUsersLoading(false);
    }
  };

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
            {item.username} · {item.duration > 0 ? `${item.duration}s` : '?s'} · {item.mood}
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
          { id: 'utenti', label: '👤 Utenti' },
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

      {section === 'utenti' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchBar}>
            <Feather name="search" size={16} color="#64748b" />
            <TextInput
              style={styles.searchInput}
              placeholder="Cerca utenti per username…"
              placeholderTextColor="#64748b"
              value={userSearchText}
              onChangeText={setUserSearchText}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {userSearchText.length > 0 && (
              <TouchableOpacity onPress={() => setUserSearchText('')}>
                <Text style={styles.clearBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {usersLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={C.accent} />
            </View>
          ) : !userSearchText.trim() ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>Cerca un utente</Text>
              <Text style={styles.emptySubtext}>Digita un username per trovarlo</Text>
            </View>
          ) : users.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={styles.emptyText}>Nessun utente trovato</Text>
              <Text style={styles.emptySubtext}>Prova con un altro username</Text>
            </View>
          ) : (
            <FlatList
              data={users}
              keyExtractor={u => u.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: u }) => (
                <TouchableOpacity
                  style={styles.userCard}
                  onPress={() => onOpenUserProfile?.(u.id)}
                  activeOpacity={0.75}
                >
                  <View style={styles.userAvatarWrap}>
                    <Text style={{ fontSize: 28 }}>{u.avatar || '🎧'}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.userUsername}>@{u.username || 'utente'}</Text>
                    {u.bio ? (
                      <Text style={styles.userBio} numberOfLines={1}>{u.bio}</Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={C.textMuted} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

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
          <ActivityIndicator size="large" color={C.accent} />
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
    backgroundColor: C.bg,
  },
  subTabs: {
    flexDirection: 'row',
    marginHorizontal: S.lg,
    marginTop: S.md,
    marginBottom: S.md,
    backgroundColor: C.bgCard,
    borderRadius: R.sm,
    padding: 3,
    borderWidth: 1,
    borderColor: C.border,
  },
  subTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: R.xs,
  },
  subTabActive: {
    backgroundColor: C.accentDim,
    borderWidth: 1,
    borderColor: C.borderAccent,
  },
  subTabTxt: {
    ...T.labelS,
    color: C.textMuted,
    fontWeight: '600',
  },
  subTabTxtActive: {
    color: C.accent,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bgCard,
    marginHorizontal: S.lg,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
    gap: S.sm + 2,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 15,
  },
  clearBtn: {
    color: C.textMuted,
    fontSize: 16,
    paddingHorizontal: S.xs,
  },
  moodList: {
    paddingHorizontal: S.lg,
    paddingVertical: S.md,
    gap: S.sm,
  },
  moodChip: {
    paddingHorizontal: S.lg,
    paddingVertical: 7,
    borderRadius: R.full,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: S.sm,
  },
  moodChipActive: {
    backgroundColor: C.accentDim,
    borderColor: C.borderAccent,
  },
  moodChipText: {
    ...T.bodyS,
    color: C.textSecondary,
    fontWeight: '600',
  },
  moodChipTextActive: {
    color: C.accent,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.lg,
    paddingBottom: S.md,
    gap: S.sm,
  },
  sortLabel: {
    color: C.textMuted,
    fontSize: 13,
    marginRight: S.xs,
  },
  sortBtn: {
    paddingHorizontal: S.md,
    paddingVertical: 6,
    borderRadius: R.sm,
    backgroundColor: C.bgCard,
  },
  sortBtnActive: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  sortBtnText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sortBtnTextActive: {
    color: C.textPrimary,
  },
  list: {
    paddingHorizontal: S.lg,
    paddingBottom: 100,
  },
  soundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bgCard,
    borderRadius: R.md,
    padding: S.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  soundCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
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
    ...T.h4,
    color: C.textPrimary,
    marginBottom: 3,
  },
  soundMeta: {
    ...T.bodyS,
    color: C.textSecondary,
    marginBottom: 5,
  },
  soundStats: {
    flexDirection: 'row',
    gap: S.md,
  },
  statText: {
    ...T.label,
    color: C.textMuted,
  },
  playBtn: {
    width: 42,
    height: 42,
    borderRadius: R.full,
    backgroundColor: C.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  playBtnActive: {
    backgroundColor: C.warning,
  },
  playBtnText: {
    color: C.textOnAccent,
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
    marginBottom: S.md,
  },
  emptyText: {
    ...T.h2,
    color: C.textPrimary,
    marginBottom: S.sm - 2,
  },
  emptySubtext: {
    ...T.body,
    color: C.textMuted,
    textAlign: 'center',
    paddingHorizontal: S.xxxl,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    padding: S.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  userAvatarWrap: {
    width: 52,
    height: 52,
    borderRadius: R.full,
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userUsername: {
    ...T.h4,
    color: C.textPrimary,
  },
  userBio: {
    ...T.bodyS,
    color: C.textSecondary,
    marginTop: 2,
  },
  userStat: {
    ...T.label,
    color: C.textMuted,
  },
});
