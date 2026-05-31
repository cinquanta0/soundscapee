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
  onSnapshot,
} from 'firebase/firestore';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../../firebaseConfig';
import {
  ExploreBattleCard,
  ExploreChips,
  ExploreEmptyState,
  ExploreHeader,
  ExploreLeaderboard,
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
import { incrementListens, getFollowingList } from '../../services/firebaseService';
import { listenBlockedUsers } from '../../services/blockService';

let _TP: any = null; let _S: any = {};
try { const r = require('react-native-track-player'); _TP = r.default; _S = r.State || {}; } catch {}
const RNTP_SESSION_KEY = '@miuslyk/rntp_session';

const C = {
  cyan: '#1D4ED8',
  purple: '#8B5CFF',
  lime: '#D9FF5A',
  orange: '#FF9B5E',
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

type Section = 'suoni' | 'podcast' | 'radio' | 'battles' | 'utenti' | 'leaderboard';

type ExploreScreenProps = {
  onOpenUserProfile?: (userId: string) => void;
};

export default function ExploreScreen({ onOpenUserProfile }: ExploreScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const [section, setSection] = useState<Section>('suoni');
  const [searchText, setSearchText] = useState('');
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
  const [myFollowingIds, setMyFollowingIds] = useState<Set<string>>(new Set());
  const [userSearchText, setUserSearchText] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [lbPlayingId, setLbPlayingId] = useState<string | null>(null);
  const [lbSoundBusy, setLbSoundBusy] = useState(false);
  const lbSoundRef = useRef<Audio.Sound | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockedUsersRef = useRef<string[]>([]);

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
      if (user) {
        getFollowingList(user.uid)
          .then((list: any[]) => setMyFollowingIds(new Set(list.map((u: any) => u.id))))
          .catch(() => {});
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return listenBlockedUsers(uid, (blocked) => {
      blockedUsersRef.current = blocked;
      setSounds(prev => prev.filter((s: any) => !blocked.includes(s.userId)));
      setUsers(prev => prev.filter((u: any) => !blocked.includes(u.id)));
    });
  }, []);

  useEffect(() => {
    loadSounds();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [sortBy]);

  useEffect(() => {
    let unsubLeaderboard: any = null;
    if (section === 'leaderboard') {
      setLeaderboardLoading(true);
      const q = query(collection(db, 'sounds'), orderBy('listens', 'desc'), limit(10));
      unsubLeaderboard = onSnapshot(q, (snap) => {
        setLeaderboard(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLeaderboardLoading(false);
      }, () => {
        setLeaderboardLoading(false);
      });
    }
    
    return () => {
      if (unsubLeaderboard) unsubLeaderboard();
    };
  }, [section]);

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
      setUsers(results.filter((u: any) => !blockedUsersRef.current.includes(u.id)));
    } catch {
      Alert.alert(t('common.error'), t('explore.errors.cannotLoad'));
    } finally {
      setUsersLoading(false);
    }
  };

  const loadSounds = async () => {
    setLoading(true);
    try {
      const results = await searchSounds(searchText, 'Tutti', sortBy);
      setSounds(results.filter((s: any) => !blockedUsersRef.current.includes(s.userId)));
    } catch {
      Alert.alert(t('common.error'), t('explore.errors.cannotLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleLbPlayPause = async (item: any) => {
    if (lbSoundBusy) return;
    try {
      setLbSoundBusy(true);
      if (lbSoundRef.current && lbPlayingId === item.id) {
        await lbSoundRef.current.stopAsync();
        await lbSoundRef.current.unloadAsync();
        lbSoundRef.current = null;
        setLbPlayingId(null);
        return;
      }
      if (lbSoundRef.current) {
        await lbSoundRef.current.unloadAsync();
        lbSoundRef.current = null;
        setLbPlayingId(null);
      }
      if (!item.audioUrl) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: item.audioUrl },
        { shouldPlay: true },
        (status) => { if (!status.isLoaded || status.didJustFinish) { setLbPlayingId(null); lbSoundRef.current = null; } }
      );
      lbSoundRef.current = sound;
      setLbPlayingId(item.id);
      incrementListens(item.id).catch(() => {});
    } catch {
      setLbPlayingId(null);
    } finally {
      setLbSoundBusy(false);
    }
  };

  const handleCancelBattle = async (battleId: string) => {
    if (!auth.currentUser) {
      Alert.alert(t('common.error'), t('explore.notLoggedIn'));
      return;
    }

    Alert.alert(
      t('battle.cancelTitle'),
      t('explore.cancelBattleMsg'),
      [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('common.yes'),
          style: 'destructive',
          onPress: async () => {
            try {
              setCancelingBattleId(battleId);
              await cancelBattle(battleId);
            } catch {
              Alert.alert(t('common.error'), t('explore.cancelBattleError'));
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

  const modeItems = [
    { id: 'suoni', title: t('explore.modeSound'), subtitle: t('explore.modeSoundSubtitle'), icon: 'music', accent: C.cyan },
    { id: 'utenti', title: t('explore.modeUsers'), subtitle: t('explore.modeUsersSubtitle'), icon: 'users', accent: '#00FF9C' },
    { id: 'leaderboard', title: t('explore.modeLeaderboard'), subtitle: t('explore.modeLeaderboardSubtitle'), icon: 'bar-chart-2', accent: '#FFD166' },
    { id: 'podcast', title: t('explore.modePodcast'), subtitle: t('explore.modePodcastSubtitle'), icon: 'mic', accent: C.purple },
    { id: 'radio', title: t('explore.modeRadio'), subtitle: t('explore.modeRadioSubtitle'), icon: 'radio', accent: C.lime },
    { id: 'battles', title: t('explore.modeBattles'), subtitle: t('explore.modeBattlesSubtitle'), icon: 'crosshair', accent: C.orange },
  ] as const;

  const renderHeader = () => (
    <>
      <ExploreHeader
        title={t('explore.movesTitle')}
        subtitle={t('explore.movesSubtitle')}
      />

      <ExploreModeRail
        section={section}
        onSelect={setSection}
        items={modeItems as any}
      />

      {(section === 'suoni' || section === 'utenti' || section === 'battles') && (
        <ExploreSearchBar
          value={section === 'utenti' ? userSearchText : searchText}
          placeholder={
            section === 'utenti'
              ? t('explore.searchCreators')
              : section === 'battles'
                ? t('explore.searchBattles')
                : t('explore.searchPlaceholder')
          }
          onChangeText={section === 'utenti' ? setUserSearchText : setSearchText}
          onClear={() => section === 'utenti' ? setUserSearchText('') : setSearchText('')}
        />
      )}

      {section === 'suoni' && (
        <ExploreChips
          items={[
            { id: 'recent', label: t('explore.recent') },
            { id: 'likes', label: t('explore.likes') },
            { id: 'listens', label: t('explore.listens') },
          ]}
          activeId={sortBy}
          onSelect={setSortBy}
        />
      )}
    </>
  );

  const renderCompactTop = () => (
    <View style={s.compactTop}>
      <ExploreModeRail
        section={section}
        onSelect={setSection}
        items={modeItems as any}
      />
    </View>
  );

  if (section === 'leaderboard') {
    return (
      <View style={s.container}>
        <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />
        {renderCompactTop()}
        <View style={s.embeddedScreen}>
          {leaderboardLoading ? (
            <View style={s.center}><ActivityIndicator size="large" color="#FFD166" /></View>
          ) : (
            <ExploreLeaderboard
              items={leaderboard}
              playingId={lbPlayingId}
              busy={lbSoundBusy}
              onPlay={handleLbPlayPause}
            />
          )}
        </View>
      </View>
    );
  }

  if (section === 'podcast') {
    return (
      <View style={s.container}>
        <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />
        {renderCompactTop()}
        <View style={s.embeddedScreen}>
          <PodcastHubScreen compact />
        </View>
      </View>
    );
  }

  if (section === 'radio') {
    return (
      <View style={s.container}>
        <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />
        {renderCompactTop()}
        <View style={s.embeddedScreen}>
          <RadioScreen compact />
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />
      <View style={s.ambientA} />
      <View style={s.ambientB} />

      <FlatList
        data={section === 'utenti' ? users : section === 'battles' ? battles : sounds}
        keyExtractor={(item: any) => item.id}
        ListHeaderComponent={(
          <>
            {renderHeader()}
            {section === 'suoni' && (
              <ExploreSectionHeading title={t('explore.freshAudio')} caption={t('explore.discover')} counter={sounds.length} />
            )}
            {section === 'utenti' && (
              <ExploreSectionHeading title={t('explore.findCreators')} caption={t('explore.profiles')} counter={users.length} />
            )}
            {section === 'battles' && (
              <ExploreSectionHeading title={t('explore.openBattles')} caption={t('explore.competitiveAudio')} counter={battles.length} />
            )}
          </>
        )}
        renderItem={({ item }: { item: any }) => {
          if (section === 'utenti') {
            return (
              <ExploreUserCard
                user={item}
                myFollowingIds={myFollowingIds}
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
              isPlaying={isPlaying(item.id)}
              busy={soundBusy}
              onPress={() => handlePlayPause(item)}
            />
          );
        }}
        ListEmptyComponent={
          usersLoading || loading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={colors.textAccent} />
            </View>
          ) : section === 'utenti' ? (
            !userSearchText.trim() ? (
              <ExploreEmptyState
                icon="🔎"
                title={t('explore.noCreatorsTitle')}
                subtitle={t('explore.noCreatorsSubtitle')}
              />
            ) : (
              <ExploreEmptyState
                icon="👤"
                title={t('explore.noCreatorsFoundTitle')}
                subtitle={t('explore.noCreatorsFoundSubtitle')}
              />
            )
          ) : section === 'battles' ? (
            <ExploreEmptyState
              icon="⚔️"
              title={t('explore.noBattlesTitle')}
              subtitle={t('explore.noBattlesSubtitle')}
            />
          ) : (
            <ExploreEmptyState
              icon="🎧"
              title={t('home.noSoundsFound')}
              subtitle={t('explore.noSoundsSubtitle')}
            />
          )
        }
        contentContainerStyle={s.listContent}
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

function createStyles(colors: import('../../constants/themes').ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
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
    compactTop: {
      paddingTop: 8,
      paddingBottom: 6,
    },
    embeddedScreen: {
      flex: 1,
      minHeight: 0,
    },
    center: {
      minHeight: 240,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}
