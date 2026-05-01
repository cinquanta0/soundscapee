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
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../../firebaseConfig';
import {
  ExploreBattleCard,
  ExploreChips,
  ExploreEmptyState,
  ExploreFeatureStrip,
  ExploreHeader,
  ExploreModeRail,
  ExploreSearchBar,
  ExploreSectionHeading,
  ExploreSoundCard,
  ExploreUserCard,
} from '../../components/explore/PremiumExplore';
import BattleScreen from '../../screens/BattleScreen';
import PodcastHubScreen from '../../screens/PodcastHubScreen';
import RadioScreen from '../../screens/RadioScreen';
import { Battle, cancelBattle, finalizeBattle, listenToActiveBattles } from '../../services/battleService';
import { incrementListens } from '../../services/firebaseService';

let _TP: any = null; let _S: any = {};
try { const r = require('react-native-track-player'); _TP = r.default; _S = r.State || {}; } catch {}
const RNTP_SESSION_KEY = '@soundscape/rntp_session';

const MOOD_KEYS = ['Tutti', 'Rilassante', 'Energico', 'Gioioso', 'Nostalgico'];

const MOOD_COLORS: Record<string, string> = {
  Energico: '#FF9B5E',
  Rilassante: '#67E8F9',
  Gioioso: '#D9FF5A',
  Nostalgico: '#8B5CFF',
};

async function searchUsers(searchText: string) {
  const lower = searchText.trim().toLowerCase();
  if (!lower) {
    const q = query(collection(db, 'users'), orderBy('username'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  }
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

  if (mood && mood !== 'Tutti') {
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
  const [sortBy, setSortBy] = useState('recent');
  const [sounds, setSounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [soundBusy, setSoundBusy] = useState(false);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [cancelingBattleId, setCancelingBattleId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [userSearchText, setUserSearchText] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const unsub = listenToActiveBattles(async (bs) => {
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
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchText]);

  useEffect(() => {
    if (section !== 'utenti') return;
    if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);
    userSearchTimeout.current = setTimeout(() => {
      loadUsers();
    }, 400);
    return () => {
      if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);
    };
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
      setSoundBusy(true);

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
    } finally {
      setSoundBusy(false);
    }
  };

  const isPlaying = (id: string) => playingId === id && !isPaused;

  const renderHeader = (showFeatureStrip = true) => (
    <>
      <ExploreHeader
        title="Explore what moves"
        subtitle="Trova audio, creator, live radio, podcast e battle in un hub più ordinato e immediato."
      />

      <ExploreModeRail
        section={section}
        onSelect={setSection}
        items={[
          { id: 'suoni', title: 'Suoni', subtitle: 'clip, drop, frammenti vocali', icon: 'music', accent: '#67E8F9' },
          { id: 'utenti', title: 'Utenti', subtitle: 'creator, profili, bio audio', icon: 'users', accent: '#8B5CFF' },
          { id: 'podcast', title: 'Podcast', subtitle: 'serie, episodi, hub', icon: 'mic', accent: '#F472FF' },
          { id: 'radio', title: 'Radio', subtitle: 'stazioni, live room, DJ', icon: 'radio', accent: '#D9FF5A' },
          { id: 'battles', title: 'Battles', subtitle: 'sfide e votazioni', icon: 'crosshair', accent: '#FF9B5E' },
        ]}
      />

      {(section === 'suoni' || section === 'utenti' || section === 'battles') && (
        <ExploreSearchBar
          value={section === 'utenti' ? userSearchText : searchText}
          placeholder={
            section === 'utenti'
              ? 'Cerca creator per username…'
              : section === 'battles'
                ? 'Scopri battle e temi attivi…'
                : t('explore.searchPlaceholder')
          }
          onChangeText={section === 'utenti' ? setUserSearchText : setSearchText}
          onClear={() => section === 'utenti' ? setUserSearchText('') : setSearchText('')}
        />
      )}

      {section === 'suoni' && (
        <>
          <ExploreChips
            items={MOOD_KEYS.map((m) => ({
              id: m,
              label: m === 'Tutti' ? t('moods.all') : t(`moods.${m.toLowerCase()}`, m),
            }))}
            activeId={selectedMood}
            onSelect={setSelectedMood}
          />
          <ExploreChips
            items={[
              { id: 'recent', label: t('explore.recent') },
              { id: 'likes', label: t('explore.likes') },
              { id: 'listens', label: t('explore.listens') },
            ]}
            activeId={sortBy}
            onSelect={setSortBy}
          />
        </>
      )}

      {showFeatureStrip && (
        <ExploreFeatureStrip section={section} onOpenSection={setSection} />
      )}
    </>
  );

  if (section === 'podcast') {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#050816', '#090E1E', '#070812']} style={StyleSheet.absoluteFill} />
        {renderHeader(false)}
        <ExploreSectionHeading
          title="Podcast vault"
          caption="Long-form listening"
        />
        <View style={styles.embeddedScreen}>
          <PodcastHubScreen />
        </View>
      </View>
    );
  }

  if (section === 'radio') {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#050816', '#090E1E', '#070812']} style={StyleSheet.absoluteFill} />
        {renderHeader(false)}
        <ExploreSectionHeading
          title="Live radio"
          caption="Always on"
        />
        <View style={styles.embeddedScreen}>
          <RadioScreen />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#050816', '#090E1E', '#070812']} style={StyleSheet.absoluteFill} />
      <View style={styles.ambientA} />
      <View style={styles.ambientB} />

      <FlatList
        data={section === 'utenti' ? users : section === 'battles' ? battles : sounds}
        keyExtractor={(item: any) => item.id}
        ListHeaderComponent={(
          <>
            {renderHeader()}
            {section === 'suoni' && (
              <ExploreSectionHeading title="Fresh audio" caption="Discover" counter={sounds.length} />
            )}
            {section === 'utenti' && (
              <ExploreSectionHeading title="Find creators" caption="Profiles" counter={users.length} />
            )}
            {section === 'battles' && (
              <ExploreSectionHeading title="Open battles" caption="Competitive audio" counter={battles.length} />
            )}
          </>
        )}
        renderItem={({ item }: { item: any }) => {
          if (section === 'utenti') {
            return (
              <ExploreUserCard
                user={item}
                onPress={() => onOpenUserProfile?.(item.id)}
              />
            );
          }

          if (section === 'battles') {
            return (
              <ExploreBattleCard
                battle={item}
                canCancel={currentUserId === item.challengerId}
                canceling={cancelingBattleId === item.id}
                onPress={() => setActiveBattleId(item.id)}
                onCancel={() => handleCancelBattle(item.id)}
              />
            );
          }

          return (
            <ExploreSoundCard
              item={item}
              moodColor={MOOD_COLORS[item.mood] || '#6b7280'}
              isPlaying={isPlaying(item.id)}
              busy={soundBusy}
              onPress={() => handlePlayPause(item)}
            />
          );
        }}
        ListEmptyComponent={
          usersLoading || loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#67E8F9" />
            </View>
          ) : section === 'utenti' ? (
            !userSearchText.trim() ? (
              <ExploreEmptyState
                icon="🔎"
                title="Cerca un creator"
                subtitle="Digita un username per trovare profili, bio e creator da seguire."
              />
            ) : (
              <ExploreEmptyState
                icon="👤"
                title="Nessun utente trovato"
                subtitle="Prova con un altro username o un nome più corto."
              />
            )
          ) : section === 'battles' ? (
            <ExploreEmptyState
              icon="⚔️"
              title="Nessuna battle attiva"
              subtitle="Apri un profilo e lancia una sfida per iniziare una nuova votazione."
            />
          ) : (
            <ExploreEmptyState
              icon="🎧"
              title={t('home.noSoundsFound')}
              subtitle="Cambia mood, ordina diversamente o prova una ricerca più ampia."
            />
          )
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {activeBattleId && (
        <Modal visible animationType="slide" onRequestClose={() => setActiveBattleId(null)}>
          <BattleScreen battleId={activeBattleId} onClose={() => setActiveBattleId(null)} />
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050816',
  },
  ambientA: {
    position: 'absolute',
    right: -80,
    top: 70,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(103,232,249,0.08)',
  },
  ambientB: {
    position: 'absolute',
    left: -70,
    top: 280,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(139,92,255,0.08)',
  },
  listContent: {
    paddingBottom: 110,
  },
  embeddedScreen: {
    flex: 1,
  },
  center: {
    minHeight: 240,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
