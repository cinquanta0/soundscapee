import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  TextInput,
  Modal,
  StatusBar,
  Alert,
  ActivityIndicator,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  Image,
  AppState,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';

// Opzioni di registrazione cross-platform: AAC-LC in M4A, compatibile con Android ExoPlayer e iOS AVFoundation
const RECORDING_OPTIONS_AAC: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { auth, functions } from '../../firebaseConfig';
import { httpsCallable } from 'firebase/functions';


import * as Notifications from 'expo-notifications';
import {
  registerForPushNotifications,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../../services/notificationService';

import {
  toggleFollow,
  isFollowing,
  sendFriendRequest,
  cancelFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  getFriendStatus,
  getFriendsList,
  listenPendingFriendRequests,
} from '../../services/firebaseService';




import { signOut, deleteUser, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, getDoc, writeBatch, doc as firestoreDoc, addDoc, serverTimestamp, getCountFromServer, updateDoc } from 'firebase/firestore';
import { db as firestoreDb } from '../../firebaseConfig';
import {
  subscribeToSoundsFeed,
  createSound,
  createSoundWithGeohash,  // ⭐ AGGIUNGI QUESTA RIGA
  deleteSound,
  toggleLike,
  hasUserLiked,
  getUserProfile,
  createOrUpdateUserProfile,
  getUserSounds,
  incrementListens,
  updatePublishStreak,
  getComments,
  addComment,
  updateUserProfile,  // ⭐ AGGIUNGI QUESTO
  getActiveChallenges,           // ⭐ AGGIUNGI QUESTA
  submitSoundToChallenge,        // ⭐ AGGIUNGI QUESTA
  getFollowersList,
  getFollowingList,
  getFollowStats,
  deleteComment,
} from '../../services/firebaseService';

import CommunitiesScreen from './communities';
import MapScreen from './MapScreen';
import TimeMachineScreen from './TimeMachine';
import ChallengesScreen from './ChallengesScreen';
import ExploreScreen from './explore';
import RemixScreen from '../../screens/RemixScreen';
import RemixProfileSection from '../../components/RemixProfileSection';
import CollabSessionScreen from '../../screens/CollabSessionScreen';
import BattleScreen from '../../screens/BattleScreen';
import { createCollabSession, listenToIncomingCollab, CollabSession } from '../../services/collabService';
import { createBattle, listenToIncomingBattle, Battle } from '../../services/battleService';
import MessagesScreen from '../../screens/MessagesScreen';
import BottomNavBar from '../../components/BottomNavBar';
import OnboardingScreen from '../../components/OnboardingScreen';
import MiniPlayer from '../../components/MiniPlayer';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import StoriesRow from '../../components/StoriesRow';
import BackstageViewer from '../../components/BackstageViewer';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';

// ─── Avatar helpers ──────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#00FF9C','#8b5cf6','#f59e0b','#ef4444','#10b981','#f97316','#ec4899','#3b82f6'];

function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Avatar field può essere: emoji ("🎵"), nome icona Feather ("music"), o vuoto (→ iniziali)
const FEATHER_ICON_OPTIONS = ['music','headphones','radio','mic','speaker','disc','volume-2','play-circle','star','zap','heart','sun','moon','cloud','wind','droplet'];

function isFeatherIcon(val: string | undefined): boolean {
  return !!val && FEATHER_ICON_OPTIONS.includes(val);
}

function AppAvatar({ avatar, username, size = 36 }: { avatar?: string; username?: string; size?: number }) {
  const color = getAvatarColor(username || avatar || '?');
  const r = size / 2;
  const initial = (username?.[0] || '?').toUpperCase();

  if (isFeatherIcon(avatar)) {
    return (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: color, justifyContent: 'center', alignItems: 'center' }}>
        <Feather name={avatar as any} size={Math.round(size * 0.44)} color="#fff" />
      </View>
    );
  }
  if (avatar && avatar.trim().length > 0) {
    // emoji o testo custom — sfondo tenue della stessa palette
    return (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: color + '28', borderWidth: 1.5, borderColor: color + '55', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: Math.round(size * 0.44) }}>{avatar}</Text>
      </View>
    );
  }
  // default: iniziale + colore
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: color, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: Math.round(size * 0.38), fontWeight: '700' }}>{initial}</Text>
    </View>
  );
}

// ─── Profile themes ──────────────────────────────────────────────────────────

const PROFILE_THEMES = [
  { id: 'default',  name: 'Default',     colors: ['#161616', '#0A0A0A'] as const },
  { id: 'neon',     name: 'Neon Night',  colors: ['#0d0221', '#4a0080', '#00ff9c'] as const },
  { id: 'sunset',   name: 'Sunset',      colors: ['#7c2d12', '#c2410c', '#ec4899'] as const },
  { id: 'ocean',    name: 'Ocean',       colors: ['#164e63', '#00FF9C', '#00FF9C'] as const },
  { id: 'aurora',   name: 'Aurora',      colors: ['#064e3b', '#1e3a5f', '#4c1d95'] as const },
  { id: 'fire',     name: 'Fire',        colors: ['#7f1d1d', '#c2410c', '#f59e0b'] as const },
  { id: 'galaxy',   name: 'Galaxy',      colors: ['#0f0728', '#312e81', '#6d28d9'] as const },
  { id: 'gold',     name: 'Gold',        colors: ['#422006', '#92400e', '#d97706'] as const },
  { id: 'rose',     name: 'Rose',        colors: ['#4c0519', '#9f1239', '#e11d48'] as const },
  { id: 'matrix',   name: 'Matrix',      colors: ['#001a00', '#052e16', '#16a34a'] as const },
  { id: 'midnight', name: 'Midnight',    colors: ['#0A0A0A', '#1e1b4b', '#312e81'] as const },
  { id: 'cherry',   name: 'Cherry',      colors: ['#1a0010', '#831843', '#db2777'] as const },
];

function getProfileThemeColors(themeId?: string): readonly [string, string, ...string[]] {
  const theme = PROFILE_THEMES.find(t => t.id === themeId) ?? PROFILE_THEMES[0];
  return theme.colors;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { t } = useTranslation();
  const { currentlyRunning } = useUpdates();
  const insets = useSafeAreaInsets();
  // Altezza reale della BottomNavBar: parte fissa ~58px + bottom inset del dispositivo
  const navBarHeight = 58 + Math.max(insets.bottom, 8);
  const [activeTab, setActiveTab] = useState('home');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const soundObjRef = useRef<any>(null); // ref per evitare closure stale
  const isLoadingSound = useRef(false);  // guard contro tap multipli
  const mainScrollViewRef = useRef<any>(null);
  // Deduplication notifiche: su Android, getLastNotificationResponseAsync e
  // addNotificationResponseReceivedListener possono sparare per la stessa notifica.
  const lastHandledNotifId = useRef<string | null>(null);
  const [playPosition, setPlayPosition] = useState(0); // secondi correnti
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordedSound, setRecordedSound] = useState<any | null>(null);
  const [location, setLocation] = useState<any | null>(null);
  
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);

  // Friend requests
  const [friendStatus, setFriendStatus] = useState<'none'|'pending_sent'|'pending_received'|'friends'>('none');
  const [loadingFriend, setLoadingFriend] = useState(false);
  const [pendingFriendRequests, setPendingFriendRequests] = useState<any[]>([]);
  const [showFriendRequestsModal, setShowFriendRequestsModal] = useState(false);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  
  
  // Form per nuovo suono
  const [newSoundTitle, setNewSoundTitle] = useState('');
  const [newSoundDescription, setNewSoundDescription] = useState('');
  const [newSoundMood, setNewSoundMood] = useState('Rilassante');

  // Scelta tipo pubblicazione
  const [showPublishTypeModal, setShowPublishTypeModal] = useState(false);

  // Backstage
  const [backstageUri, setBackstageUri] = useState<string | null>(null);
  const [backstageTipo, setBackstageTipo] = useState<'foto' | 'video' | null>(null);
  const [showBackstageViewer, setShowBackstageViewer] = useState(false);
  const [backstageViewerUrl, setBackstageViewerUrl] = useState('');
  const [backstageViewerTipo, setBackstageViewerTipo] = useState<'foto' | 'video'>('foto');
  const [backstageViewerTitle, setBackstageViewerTitle] = useState('');

  // Stati per challenges
  const [selectedChallengeForSubmit, setSelectedChallengeForSubmit] = useState<any | null>(null);
  const [availableChallenges, setAvailableChallenges] = useState<any[]>([]);
  
  
  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('soundscape_onboarding_done').then((val) => {
      if (!val) setShowOnboarding(true);
    });
  }, []);

  // Se RNTP sta suonando una stazione radio al boot (app riavviata da Xiaomi/Android
  // dopo tap sulla notifica), naviga direttamente alla tab explore invece del feed.
  // NOTA: sia radio che podcast vivono nel tab 'explore' — mai usare 'radio' che non è un tab valido.
  useEffect(() => {
    (async () => {
      try {
        const sessionStr = await AsyncStorage.getItem('@soundscape/rntp_session');
        if (!sessionStr) return;
        const session = JSON.parse(sessionStr);
        if (session.type !== 'radio' && session.type !== 'podcast') return;
        let TP: any = null;
        let S: any = {};
        try { const r = require('react-native-track-player'); TP = r.default; S = r; } catch {}
        if (!TP) return;
        const ps = await TP.getPlaybackState().catch(() => null);
        const st = ps?.state ?? ps;
        if (st === S.State?.Playing || st === S.State?.Buffering || st === S.State?.Loading || st === S.State?.Paused) {
          setActiveTab('explore');
        }
      } catch {}
    })();
  }, []);

  // iOS: quando l'app va in background, forza updateNowPlayingMetadata per garantire
  // che il widget lock screen appaia anche dopo che il player full-screen si è smontato.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'background') return;
      try {
        const r = require('react-native-track-player');
        const TP = r.default; const S = r;
        const [track, ps] = await Promise.all([TP.getActiveTrack(), TP.getPlaybackState()]);
        const st = ps?.state ?? ps;
        if (!track || st === S.State?.Stopped || st === S.State?.None) return;
        TP.updateNowPlayingMetadata?.({
          title: track.title ?? '',
          artist: track.artist ?? '',
          album: track.album ?? '',
          artwork: track.artwork,
        }).catch(() => {});
      } catch {}
    });
    return () => sub.remove();
  }, []);

  // Android: quando l'app torna in foreground (o al boot), se RNTP è ancora attivo
  // ma non esiste una sessione valida in AsyncStorage (es. app killata dal task manager
  // senza che il ForegroundService si sia fermato), resetta completamente il player.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const cleanStaleRNTP = async () => {
      try {
        const r = require('react-native-track-player');
        const TP = r.default; const S = r;
        const [track, ps, sessionStr] = await Promise.all([
          TP.getActiveTrack(),
          TP.getPlaybackState(),
          AsyncStorage.getItem('@soundscape/rntp_session'),
        ]);
        const st = ps?.state ?? ps;
        const isActive = st === S.State?.Playing || st === S.State?.Paused || st === S.State?.Buffering || st === S.State?.Loading;
        if (isActive && !sessionStr) {
          await TP.reset();
        }
      } catch {}
    };
    cleanStaleRNTP();
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') cleanStaleRNTP();
    });
    return () => sub.remove();
  }, []);

  // Mini-player
  interface MiniPlayerData { title: string; artist: string; artwork?: string; isPlaying: boolean; type: 'radio' | 'podcast'; }
  const [miniPlayerData, setMiniPlayerData] = useState<MiniPlayerData | null>(null);

  useEffect(() => {
    let TP: any = null; let S: any = {};
    try { const r = require('react-native-track-player'); TP = r.default; S = r; } catch {}
    if (!TP) return;

    const syncMiniPlayer = async () => {
      try {
        const [track, ps, sessionStr] = await Promise.all([
          TP.getActiveTrack(),
          TP.getPlaybackState(),
          AsyncStorage.getItem('@soundscape/rntp_session'),
        ]);
        const st = ps?.state ?? ps;
        const isActive = st === S.State?.Playing || st === S.State?.Paused || st === S.State?.Buffering || st === S.State?.Loading;
        if (!isActive || !track || !sessionStr) { setMiniPlayerData(null); return; }
        const session = JSON.parse(sessionStr);
        if (session.type !== 'radio' && session.type !== 'podcast') { setMiniPlayerData(null); return; }
        setMiniPlayerData({
          title: track.title ?? '',
          artist: track.artist ?? '',
          artwork: track.artwork as string | undefined,
          isPlaying: st === S.State?.Playing || st === S.State?.Buffering,
          type: session.type,
        });
      } catch { setMiniPlayerData(null); }
    };

    syncMiniPlayer();
    const sub = TP.addEventListener(S.Event?.PlaybackState, () => syncMiniPlayer());
    return () => sub?.remove?.();
  }, []);

  // UI States
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMood, setFilterMood] = useState('all');

  // Title validation
  const [titleError, setTitleError] = useState('');

  // Report states
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  // Firebase data
  const [sounds, setSounds] = useState<any[]>([]);
  const [totalSoundsCount, setTotalSoundsCount] = useState<number | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [myStreakCount, setMyStreakCount] = useState(0);
  const [activeCollabSessionId, setActiveCollabSessionId] = useState<string | null>(null);
  const [incomingCollab, setIncomingCollab] = useState<CollabSession | null>(null);
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [incomingBattle, setIncomingBattle] = useState<Battle | null>(null);
  const [showBattleThemePicker, setShowBattleThemePicker] = useState(false);
  const [mySounds, setMySounds] = useState<any[]>([]);
  const [viewedUserSounds, setViewedUserSounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [likedSounds, setLikedSounds] = useState(new Set());
  // Stati per commenti
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [selectedSoundForComments, setSelectedSoundForComments] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [pendingChat, setPendingChat] = useState<{ userId: string; userName: string; userAvatar: string } | null>(null);
  
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Profile background theme
  const [showThemeModal, setShowThemeModal] = useState(false);
  
  // 🎛️ STATI PER REMIX
  const [showRemixStudio, setShowRemixStudio] = useState(false);
  const [remixSounds, setRemixSounds] = useState<any[]>([]);
  const [loadingRemixSounds, setLoadingRemixSounds] = useState(false);
  
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [followStats, setFollowStats] = useState<{ followers: number; following: number }>({ followers: 0, following: 0 });
  
  
  // Load user and sounds on mount
  useEffect(() => {
    let feedUnsubscribe: (() => void) | undefined;

    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        initializeApp().then((unsub) => {
          feedUnsubscribe = unsub;
        });
      }
    });

    requestPermissions();

    return () => {
      authUnsubscribe();
      if (feedUnsubscribe) feedUnsubscribe();
    };
  }, []);

  
  // Listener inviti collab in arrivo
  useEffect(() => {
    const unsub = listenToIncomingCollab((session) => setIncomingCollab(session));
    return () => unsub();
  }, []);

  // Listener sfide battle in arrivo
  useEffect(() => {
    const unsub = listenToIncomingBattle((b) => setIncomingBattle(b));
    return () => unsub();
  }, []);

  // Scroll to top quando si cambia tab
  useEffect(() => {
    mainScrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeTab]);

  // Setup notifiche push
useEffect(() => {
  const setupNotifications = async () => {
    const user = auth.currentUser;
    if (!user) return;

    // PRIMA di tutto: gestisci notifica pendente al cold-start.
    // Deve stare PRIMA di registerForPushNotifications (lenta: ~1-5 sec di rete)
    // altrimenti getLastNotificationResponseAsync verrebbe chiamata in ritardo e
    // causerebbe un secondo caricamento della radio/podcast "dopo qualche secondo".
    try {
      const pendingResponse = await Notifications.getLastNotificationResponseAsync();
      if (pendingResponse?.notification?.request?.content?.data) {
        const notifId = pendingResponse.notification.request.identifier;
        const prevId = await AsyncStorage.getItem('@soundscape/last_handled_notif').catch(() => null);
        if (prevId !== notifId && lastHandledNotifId.current !== notifId) {
          lastHandledNotifId.current = notifId;
          AsyncStorage.setItem('@soundscape/last_handled_notif', notifId).catch(() => {});
          handleNotificationNavigation(pendingResponse.notification.request.content.data);
        }
      }
    } catch {}

    // Registra dispositivo (lento: chiamata di rete + Firestore)
    await registerForPushNotifications(user.uid);

    // Carica notifiche esistenti
    const userNotifications: any[] = await getUserNotifications(user.uid);
    setNotifications(userNotifications);
    setUnreadCount(userNotifications.filter((n: any) => !n.read).length);

    // Listener per notifiche in tempo reale
    const subscription = Notifications.addNotificationReceivedListener(() => {
      loadNotifications();
    });

    // Background → foreground: l'utente tocca la notifica mentre l'app è in background.
    // Salviamo l'ID in AsyncStorage così la sessione successiva non la riprocessa.
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const notifId = response.notification.request.identifier;
      if (lastHandledNotifId.current === notifId) return;
      lastHandledNotifId.current = notifId;
      AsyncStorage.setItem('@soundscape/last_handled_notif', notifId).catch(() => {});
      handleNotificationNavigation(response.notification.request.content.data);
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  };

  setupNotifications();
}, []);
  
  
  
// Quando visiti profilo di un altro utente:
useEffect(() => {
  if (userProfile && userProfile.id !== auth.currentUser?.uid) {
    isFollowing(userProfile.id).then(setIsFollowingUser);
    getFriendStatus(userProfile.id).then(setFriendStatus);
  } else {
    setFriendStatus('none');
  }
}, [userProfile]);

// Listener richieste amicizia in entrata (solo quando sei sul tuo profilo)
useEffect(() => {
  const user = auth.currentUser;
  if (!user) return;
  const unsub = listenPendingFriendRequests((reqs: any[]) => setPendingFriendRequests(reqs));
  return unsub;
}, []);


// Timer per registrazione
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 600) {
            stopRecording();
            return 600;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Initialize app
  const initializeApp = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      // Create/update user profile
      await createOrUpdateUserProfile(user.uid, {
        email: user.email,
        username: user.email?.split('@')[0] || `user_${user.uid.slice(0, 6)}`
      });

      // Get user profile
      const profile: any = await getUserProfile(user.uid);
      setUserProfile(profile);
      setMyStreakCount(profile?.streakCount || 0);
      getFollowStats(user.uid).then(setFollowStats);

      // Garantisce il salvataggio del push token anche per nuovi utenti
      // (il doc è ora certamente creato dal createOrUpdateUserProfile sopra)
      registerForPushNotifications(user.uid).catch(() => {});

      // Conta il totale reale dei suoni (non limitato a 20)
      getCountFromServer(collection(firestoreDb, 'sounds'))
        .then((snap) => setTotalSoundsCount(snap.data().count))
        .catch(() => {});

      // Subscribe to feed
      const unsubscribe = subscribeToSoundsFeed((newSounds: any[]) => {
        setSounds(newSounds);
        setLoading(false);
        // Riaggiorna il contatore ad ogni nuovo suono nel feed
        getCountFromServer(collection(firestoreDb, 'sounds'))
          .then((snap) => setTotalSoundsCount(snap.data().count))
          .catch(() => {});
      });

      // Get user sounds
      loadMySounds();

      return unsubscribe;
    } catch (error) {
      console.error('Error initializing app:', error);
      setLoading(false);
    }
  };

  // Load user sounds
  const loadMySounds = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const userSounds = await getUserSounds(user.uid);
      setMySounds(userSounds);
    } catch (error) {
      console.error('Error loading user sounds:', error);
    }
  };

  
  // 🎛️ CARICA SUONI PER REMIX
const loadSoundsForRemix = async () => {
  try {
    setLoadingRemixSounds(true);
    const user = auth.currentUser;
    if (!user) return;

    const userSounds = await getUserSounds(user.uid);
    setRemixSounds(userSounds);
  } catch (error) {
    console.error('Error loading sounds for remix:', error);
    Alert.alert(t('common.error'), t('explore.errors.cannotLoad'));
  } finally {
    setLoadingRemixSounds(false);
  }
};


  // Request permissions
  const requestPermissions = async () => {
    try {
      const audioPermission = await Audio.requestPermissionsAsync();
      if (!audioPermission.granted) {
        Alert.alert(t('permissions.microphoneDenied'), t('permissions.microphoneMsg'));
      }

      const locationPermission = await Location.requestForegroundPermissionsAsync();
      if (locationPermission.granted) {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      }
    } catch (err) {
      console.error('Error requesting permissions:', err);
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      // Stop any playing audio before activating recording session (iOS audio session conflict)
      await stopCurrentSound();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        RECORDING_OPTIONS_AAC
      );
      
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert(t('common.error'), t('upload.errors.cannotRecord'));
    }
  };

  // Stop recording
  const stopRecording = async () => {
    if (!recording) return;

    try {
      // Cattura subito il tempo corrente prima che setIsRecording(false) resetti il timer
      const capturedTime = recordingTime;
      setIsRecording(false);

      const uri = recording.getURI();
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      // Leggo la durata dal file audio scritto su disco — unico modo affidabile
      // su Android (durationMillis durante la registrazione può essere 0).
      let durationSec = capturedTime;
      try {
        const { sound: tmpSound } = await Audio.Sound.createAsync({ uri: uri! });
        const st = await tmpSound.getStatusAsync();
        if (st.isLoaded && st.durationMillis) {
          durationSec = Math.round(st.durationMillis / 1000);
        }
        await tmpSound.unloadAsync();
      } catch {}
      if (!durationSec) durationSec = capturedTime;

      setRecordedSound({
        uri,
        duration: durationSec,
      });

      setRecording(null);
      setShowRecordModal(true);
    } catch (err) {
      console.error('Failed to stop recording:', err);
      Alert.alert(t('common.error'), t('upload.errors.cannotStop'));
    }
  };

  // Handle record button
  const handleRecord = () => {
    if (isRecording && recordingTime >= 3) {
      stopRecording();
    } else if (!isRecording) {
      startRecording();
    } else {
      Alert.alert(t('upload.errors.tooShort'), t('upload.errors.tooShortMsg'));
    }
  };

  // Publish recording
// Backstage: mostra scelta fotocamera / galleria
const selectBackstage = (tipo: 'foto' | 'video') => {
  const label = tipo === 'foto' ? t('upload.photo') : t('upload.videoMax30');
  Alert.alert(label, '', [
    { text: t('upload.camera'), onPress: () => captureBackstage(tipo) },
    { text: t('upload.gallery'), onPress: () => pickBackstageFromGallery(tipo) },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
};

const _handleBackstageAsset = (result: ImagePicker.ImagePickerResult, tipo: 'foto' | 'video') => {
  if (!result.canceled && result.assets[0]) {
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 50 * 1024 * 1024) {
      Alert.alert(t('permissions.fileTooLarge'), t('permissions.maxSize50'));
      return;
    }
    setBackstageUri(asset.uri);
    setBackstageTipo(tipo);
  }
};

const captureBackstage = async (tipo: 'foto' | 'video') => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(t('permissions.denied'), t('permissions.cameraMsg'));
    return;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: tipo === 'foto' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
    quality: 0.8,
    videoMaxDuration: 30,
    allowsEditing: false,
  });
  _handleBackstageAsset(result, tipo);
};

const pickBackstageFromGallery = async (tipo: 'foto' | 'video') => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(t('permissions.denied'), t('permissions.galleryMsg'));
    return;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: tipo === 'foto' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
    quality: 0.8,
    videoMaxDuration: 30,
    allowsEditing: true,
  });
  _handleBackstageAsset(result, tipo);
};

// Publish recording
const handlePublish = async () => {
  if (!newSoundTitle.trim()) {
    setTitleError(t('upload.titleRequired'));
    return;
  }
  setTitleError('');

  setUploading(true);
  try {
    // Crea il suono
    const soundId = await createSoundWithGeohash({
      audioUri: recordedSound.uri,
      title: newSoundTitle,
      description: newSoundDescription,
      mood: newSoundMood,
      duration: recordedSound.duration,
      location: location ? {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      } : null,
      isPublic: true,
      backstageUri: backstageUri || undefined,
      backstageTipo: backstageTipo || undefined,
    });

    // 🔥 Aggiorna streak pubblicazione
    const currentUser = auth.currentUser;
    if (currentUser) {
      const newStreak = await updatePublishStreak(currentUser.uid);
      if (newStreak) {
        setUserProfile((prev: any) => prev ? { ...prev, streakCount: newStreak } : prev);
        setMyStreakCount(newStreak);
      }
    }

    // 🏆 Se è stata selezionata una challenge, partecipa!
    if (selectedChallengeForSubmit && soundId) {
      await submitSoundToChallenge(selectedChallengeForSubmit.id, soundId);
      Alert.alert(
        t('upload.challengeFantastic'),
        t('upload.challengeJoined', { title: selectedChallengeForSubmit.title })
      );
    }

    // Reset form
    setNewSoundTitle('');
    setNewSoundDescription('');
    setNewSoundMood('Rilassante');
    setSelectedChallengeForSubmit(null);
    setBackstageUri(null);
    setBackstageTipo(null);
    setShowRecordModal(false);
    setRecordedSound(null);

    // Reload user sounds
    await loadMySounds();

    if (!selectedChallengeForSubmit) {
      Alert.alert(t('upload.published'), t('upload.publishedMsg'));
    }
  } catch (error) {
    console.error('Error publishing sound:', error);
    const msg = error instanceof Error ? error.message : t('upload.errors.cannotPublish');
    Alert.alert(t('common.error'), msg);
  } finally {
    setUploading(false);
  }
};

  // Play sound
const [playProgress, setPlayProgress] = useState(0);

const stopCurrentSound = async () => {
  if (soundObjRef.current) {
    await soundObjRef.current.unloadAsync().catch(() => {});
    soundObjRef.current = null;
    setSound(null);
  }
  setPlayingId(null);
  setPlayProgress(0);
  setPlayPosition(0);
};

const onPlaybackStatusUpdate = (status: any) => {
  if (!status.isLoaded) return;
  if (status.durationMillis > 0) {
    setPlayProgress((status.positionMillis / status.durationMillis) * 100);
    setPlayPosition(Math.floor(status.positionMillis / 1000));
  }
  if (status.didJustFinish) {
    soundObjRef.current?.unloadAsync().catch(() => {});
    soundObjRef.current = null;
    setSound(null);
    setPlayingId(null);
    setPlayProgress(0);
    setPlayPosition(0);
  }
};

const handlePlay = async (item: any) => {
  // Blocca tap multipli mentre carica
  if (isLoadingSound.current) return;

  try {
    const currentId = playingId;

    // Ferma sempre il suono corrente
    isLoadingSound.current = true;
    await stopCurrentSound();

    // Stesso suono → stop (toggle)
    if (currentId === item.id) {
      return;
    }

    // Verifica che audioUrl esista
    if (!item.audioUrl) {
      console.error('❌ [PLAY] No audioUrl found!');
      Alert.alert(t('common.error'), t('permissions.audioUrl'));
      return;
    }

    // iOS non supporta WebM — converti via Cloud Function se necessario
    const isWebm = item.audioUrl.includes('.webm') || item.audioUrl.includes('.ogg');
    if (isWebm && Platform.OS === 'ios') {
      if (item.converted === true) {
        // Già convertito ma audioUrl non aggiornato nel post locale — ricarica non necessaria, skip
      } else {
        try {
          const convertFn = httpsCallable(functions, 'convertWebmToM4a');
          const result: any = await convertFn({ soundId: item.id, audioUrl: item.audioUrl, userId: item.userId });
          if (result.data?.audioUrl) {
            // Usa il nuovo URL M4A per questa riproduzione
            item = { ...item, audioUrl: result.data.audioUrl };
          } else {
            Alert.alert(t('permissions.formatNotSupported'), t('permissions.formatIosMsg'));
            return;
          }
        } catch (convErr) {
          Alert.alert(t('permissions.formatNotSupported'), t('permissions.formatIosMsg'));
          return;
        }
      }
    }

    console.log('🎧 [PLAY] Setting audio mode...');
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    const ext = item.audioUrl.includes('.webm') ? 'webm' : item.audioUrl.includes('.ogg') ? 'ogg' : 'm4a';
    const localUri = FileSystem.cacheDirectory + `sound_${item.id}.${ext}`;

    // Scarica localmente per bypassare il 412 di Firebase Storage su Android.
    // Controlla anche la dimensione: un download precedente interrotto lascia un file corrotto.
    const downloadAudio = async () => {
      if (fileInfo.exists) await FileSystem.deleteAsync(localUri, { idempotent: true });
      const dlResult = await FileSystem.downloadAsync(item.audioUrl, localUri);
      if (dlResult.status !== 200) {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        throw new Error(`Download audio fallito (HTTP ${dlResult.status})`);
      }
    };

    const fileInfo = await FileSystem.getInfoAsync(localUri);
    const needsDownload = !fileInfo.exists || (fileInfo.size !== undefined && fileInfo.size < 100);
    if (needsDownload) await downloadAudio();

    let sound: Audio.Sound;
    try {
      const result = await Audio.Sound.createAsync(
        { uri: localUri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      sound = result.sound;
    } catch {
      // Cache stale o corrotta — re-download e riprova una volta
      await downloadAudio();
      const result = await Audio.Sound.createAsync(
        { uri: localUri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      sound = result.sound;
    }

    const newSound = sound;

    soundObjRef.current = newSound;
    setSound(newSound);
    setPlayingId(item.id);

    // Se la durata era 0 (dati legacy), la aggiorniamo dal file caricato
    if (item.duration === 0 || !item.duration) {
      try {
        const st = await newSound.getStatusAsync();
        if (st.isLoaded && st.durationMillis) {
          const actualDuration = Math.round(st.durationMillis / 1000);
          setSounds(prev => prev.map(s => s.id === item.id ? { ...s, duration: actualDuration } : s));
          setMySounds(prev => prev.map(s => s.id === item.id ? { ...s, duration: actualDuration } : s));
          // Persiste in Firestore solo se sei il proprietario
          if (auth.currentUser?.uid === item.userId) {
            updateDoc(firestoreDoc(firestoreDb, 'sounds', item.id), { duration: actualDuration }).catch(() => {});
          }
        }
      } catch {}
    }

    await incrementListens(item.id);
  } catch (err: any) {
    console.error('❌ [PLAY] Error playing sound:', err?.message || err);
    try {
      const ext = item.audioUrl?.includes('.webm') ? 'webm' : item.audioUrl?.includes('.ogg') ? 'ogg' : 'm4a';
      await FileSystem.deleteAsync(FileSystem.cacheDirectory + `sound_${item.id}.${ext}`, { idempotent: true });
    } catch {}
    Alert.alert(t('common.error'), t('explore.errors.cannotPlay'));
  } finally {
    isLoadingSound.current = false;
  }
};

  // Delete sound
  const handleDelete = async (id: string) => {
    Alert.alert(
      t('common.confirm'),
      t('home.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSound(id);
              await loadMySounds();
              Alert.alert('✓', t('home.soundDeleted'));
            } catch (error) {
              console.error('Error deleting sound:', error);
              Alert.alert(t('common.error'), t('explore.errors.cannotLoad'));
            }
          },
        },
      ]
    );
  };

  // Handle like
  const handleLike = async (soundId: string) => {
    try {
      const isLiked = await toggleLike(soundId);
      
      // Update local state
      setLikedSounds(prev => {
        const newSet = new Set(prev);
        if (isLiked) {
          newSet.add(soundId);
        } else {
          newSet.delete(soundId);
        }
        return newSet;
      });
    } catch (error) {
      console.error('Error toggling like:', error);
      Alert.alert(t('common.error'), t('explore.errors.cannotPlay'));
    }
  };

  
  // Load comments
  const loadComments = async (soundId: string) => {
    try {
      setLoadingComments(true);
      const data = await getComments(soundId);
      setComments(data);
    } catch (error) {
      console.error('Error loading comments:', error);
      Alert.alert(t('common.error'), t('comments.errors.cannotLoad'));
    } finally {
      setLoadingComments(false);
    }
  };

  // Send comment
  const handleSendComment = async () => {
    if (!newComment.trim()) return;

    try {
      setSendingComment(true);
      await addComment(selectedSoundForComments, newComment);
      setNewComment('');
      await loadComments(selectedSoundForComments);
      Alert.alert(t('common.ok'), t('comments.published'));
    } catch (error) {
      console.error('Error sending comment:', error);
      Alert.alert(t('common.error'), t('comments.errors.cannotSend'));
    } finally {
      setSendingComment(false);
    }
  };

  // Delete comment
  const handleDeleteComment = (comment: any) => {
    Alert.alert(t('comments.deleteComment'), t('comments.deleteCommentConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(selectedSoundForComments, comment.id);
            await loadComments(selectedSoundForComments);
          } catch {
            Alert.alert(t('common.error'), t('comments.errors.cannotDelete'));
          }
        },
      },
    ]);
  };

  // Open comments modal
  const openCommentsModal = (soundId: string) => {
    setSelectedSoundForComments(soundId);
    setShowCommentsModal(true);
    loadComments(soundId);
  };
  
  // Check if user liked sound
  const checkLikedSounds = async () => {
    try {
      const liked = new Set();
      for (const sound of sounds) {
        const isLiked = await hasUserLiked(sound.id);
        if (isLiked) liked.add(sound.id);
      }
      setLikedSounds(liked);
    } catch (error) {
      console.error('Error checking liked sounds:', error);
    }
  };

  useEffect(() => {
    if (sounds.length > 0) {
      checkLikedSounds();
    }
  }, [sounds]);

  
  // Carica challenges quando apri il modal di registrazione
useEffect(() => {
  if (showRecordModal) {
    loadAvailableChallenges();
  }
}, [showRecordModal]);

const loadAvailableChallenges = async () => {
  try {
    const challenges = await getActiveChallenges();
    setAvailableChallenges(challenges);
  } catch (error) {
    console.error('Error loading challenges:', error);
  }
};
  
  
 // 🎛️ CARICA SUONI QUANDO APRI REMIX
useEffect(() => {
  if (showRemixStudio) {
    loadSoundsForRemix();
  }
}, [showRemixStudio]);


// Handle logout
  
  // Ricarica notifiche
const loadNotifications = async () => {
  const user = auth.currentUser;
  if (!user) return;
  
  const userNotifications: any[] = await getUserNotifications(user.uid);
  setNotifications(userNotifications);
  setUnreadCount(userNotifications.filter((n: any) => !n.read).length);
};

  const handleCheckUpdates = async () => {
    const isEmbedded = currentlyRunning.isEmbeddedLaunch;
    const channel = currentlyRunning.channel ?? "non impostato";
    const runtimeVersion = currentlyRunning.runtimeVersion ?? "?";
    Alert.alert(
      isEmbedded ? "Bundle embedded" : "Bundle OTA attivo ✅",
      `Canale: ${channel}\nRuntime: ${runtimeVersion}`,
    );
  };
  
  const handleLogout = async () => {
    Alert.alert(
      t('settings.logout'),
      t('auth.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('auth.logoutAction'),
          style: 'destructive',
          onPress: async () => {
            try {
              await stopCurrentSound();
              await signOut(auth);
            } catch (error) {
              console.error('Error logging out:', error);
            }
          },
        },
      ]
    );
  };

  const openReport = (soundId: string) => {
    setReportTargetId(soundId);
    setReportReason('');
    setReportNote('');
    setReportSent(false);
    setShowReportModal(true);
  };

  const handleSendReport = async () => {
    if (!reportReason) return;
    setReportLoading(true);
    try {
      await addDoc(collection(firestoreDb, 'reports'), {
        userId: auth.currentUser?.uid || 'anonymous',
        audioId: reportTargetId,
        reason: reportReason,
        note: reportNote.trim(),
        timestamp: serverTimestamp(),
      });
      setReportSent(true);
    } catch (err) {
      console.error('Report error:', err);
      Alert.alert(t('common.error'), t('report.errors.cannotSend'));
    } finally {
      setReportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setDeletingAccount(true);
    try {
      const uid = currentUser.uid;
      const batch = writeBatch(firestoreDb);

      // Delete user's sounds + subcollections
      const soundsSnap = await getDocs(query(collection(firestoreDb, 'sounds'), where('userId', '==', uid)));
      for (const soundDoc of soundsSnap.docs) {
        const soundId = soundDoc.id;
        const likesSnap = await getDocs(collection(firestoreDb, 'sounds', soundId, 'likes'));
        likesSnap.forEach((d) => batch.delete(d.ref));
        const commentsSnap = await getDocs(collection(firestoreDb, 'sounds', soundId, 'comments'));
        commentsSnap.forEach((d) => batch.delete(d.ref));
        batch.delete(soundDoc.ref);
      }

      // Delete reports, followers, following, profile
      const reportsSnap = await getDocs(query(collection(firestoreDb, 'reports'), where('userId', '==', uid)));
      reportsSnap.forEach((d) => batch.delete(d.ref));
      const followersSnap = await getDocs(collection(firestoreDb, 'users', uid, 'followers'));
      followersSnap.forEach((d) => batch.delete(d.ref));
      const followingSnap = await getDocs(collection(firestoreDb, 'users', uid, 'following'));
      followingSnap.forEach((d) => batch.delete(d.ref));
      batch.delete(firestoreDoc(firestoreDb, 'users', uid));

      await batch.commit();
      await stopCurrentSound();
      await deleteUser(currentUser);
    } catch (error) {
      console.error('Delete account error:', error);
      Alert.alert('Errore', 'Impossibile eliminare l\'account. Riprova.');
      setDeletingAccount(false);
    }
  };

  
  // Apri modal di modifica profilo
const handleEditProfile = () => {
  setEditUsername(userProfile?.username || '');
  setEditBio(userProfile?.bio || '');
  setEditAvatar(userProfile?.avatar || '🎧');
  setShowEditProfileModal(true);
};

// Salva modifiche profilo
const handleSaveProfile = async () => {
  if (!editUsername.trim()) {
    Alert.alert(t('common.error'), t('profile.errors.usernameRequired'));
    return;
  }

  if (editUsername.length < 3) {
    Alert.alert(t('common.error'), t('profile.errors.usernameTooShort'));
    return;
  }

  setSavingProfile(true);
  try {
    const user = auth.currentUser;
    if (!user) return;
    await updateUserProfile(user.uid, {
      username: editUsername.trim(),
      bio: editBio.trim(),
      avatar: editAvatar,
    });

    // Ricarica profilo
    const newProfile: any = await getUserProfile(user.uid);
    setUserProfile(newProfile);
    setMyStreakCount(newProfile?.streakCount || 0);
    getFollowStats(user.uid).then(setFollowStats);

    setShowEditProfileModal(false);
    Alert.alert(t('profile.profileUpdated'), t('profile.profileUpdatedMsg'));
  } catch (error) {
    console.error('Error saving profile:', error);
    Alert.alert(t('common.error'), t('profile.errors.cannotSave'));
  } finally {
    setSavingProfile(false);
  }
};
  
  const getMoodColor = (mood: string) => {
    const colors = {
      Energico: '#f97316',
      Rilassante: '#3b82f6',
      Gioioso: '#eab308',
      Nostalgico: '#a855f7',
    };
    return colors[mood as keyof typeof colors] || '#6b7280';
  };

  // Filter sounds
  const filteredPosts = sounds.filter(post => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (post.title ?? '').toLowerCase().includes(q) ||
      (post.description ?? '').toLowerCase().includes(q);
    const matchesMood = filterMood === 'all' || post.mood === filterMood;
    return matchesSearch && matchesMood;
  });

  // Format time ago — gestisce Firestore Timestamp, Date JS e numeri
  const timeAgo = (date: any) => {
    if (!date) return '';
    const d = date?.toDate ? date.toDate() : (date instanceof Date ? date : new Date(date));
    const seconds = Math.floor((new Date().getTime() - d.getTime()) / 1000);
    if (seconds < 60) return 'ora';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m fa`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h fa`;
    const days = Math.floor(hours / 24);
    return `${days}g fa`;
  };

  
  // Handler friend request
const handleFriendAction = async (action: 'send'|'cancel'|'accept'|'reject'|'remove') => {
  if (!userProfile || loadingFriend) return;
  setLoadingFriend(true);
  try {
    if (action === 'send') await sendFriendRequest(userProfile.id);
    else if (action === 'cancel') await cancelFriendRequest(userProfile.id);
    else if (action === 'remove') await removeFriend(userProfile.id);
    else if (action === 'accept') await acceptFriendRequest(userProfile.id);
    else if (action === 'reject') await rejectFriendRequest(userProfile.id);
    const updated = await getFriendStatus(userProfile.id);
    setFriendStatus(updated);
  } catch (e) {
    Alert.alert(t('common.error'), t('profile.errors.cannotFollow'));
  } finally {
    setLoadingFriend(false);
  }
};

  // Handler bottone
const handleFollowToggle = async () => {
  setLoadingFollow(true);
  try {
    const res = await toggleFollow(userProfile.id); // id utente che stai vedendo!
    setIsFollowingUser(res);
    const updated = await getUserProfile(userProfile.id);
    setUserProfile(updated);
    getFollowStats(userProfile.id).then(setFollowStats);
  } catch (e) {
    Alert.alert(t('common.error'), t('profile.errors.cannotFollow'));
  } finally {
    setLoadingFollow(false);
  }
};
  
  
  
 const fetchAndShowFriends = async () => {
  const list = await getFriendsList(userProfile.id);
  setFriendsList(list);
  setShowFriendsModal(true);
};

const fetchAndShowFollowers = async () => {
  const list = await getFollowersList(userProfile.id);
  setFollowersList(list);
  setFollowStats(prev => ({ ...prev, followers: list.length }));
  setShowFollowersModal(true);
};
const fetchAndShowFollowing = async () => {
  const list = await getFollowingList(userProfile.id);
  setFollowingList(list);
  setFollowStats(prev => ({ ...prev, following: list.length }));
  setShowFollowingModal(true);
}; 


// Apre il profilo di un utente — il tab cambia immediatamente (non dopo l'await)
// per evitare che setActiveTab('profile') sovrascriva una navigazione successiva dell'utente
  const openUserProfile = async (userId: string) => {
  setActiveTab('profile');
  setUserProfile(null);
  setViewedUserSounds([]);
  try {
    const profile = await getUserProfile(userId);
    setUserProfile(profile);
    getFollowStats(userId).then(setFollowStats);
    if (userId !== auth.currentUser?.uid) {
      getUserSounds(userId).then(setViewedUserSounds).catch(() => {});
    }
  } catch (error) {
    console.error('Error opening user profile:', error);
    Alert.alert(t('common.error'), t('profile.errors.cannotOpen'));
  }
};

// Gestisce la navigazione da tap notifica (system tray o modal)
const openSoundById = async (soundId: string, action: 'play' | 'comment') => {
  if (!soundId) return;
  // Cerca prima nel feed già caricato
  let sound = sounds.find((s: any) => s.id === soundId);
  // Se non trovato, scarica da Firestore
  if (!sound) {
    try {
      const snap = await getDoc(firestoreDoc(firestoreDb, 'sounds', soundId));
      if (snap.exists()) sound = { id: snap.id, ...snap.data() };
    } catch {}
  }
  if (!sound) return;
  if (action === 'comment') {
    openCommentsModal(sound.id);
  } else {
    handlePlay(sound);
  }
};

const handleNotificationNavigation = async (data: any) => {
  if (!data?.type) return;
  switch (data.type) {
    case 'like':
      setActiveTab('home');
      if (data.soundId) setTimeout(() => openSoundById(data.soundId, 'play'), 400);
      break;
    case 'comment':
      setActiveTab('home');
      if (data.soundId) setTimeout(() => openSoundById(data.soundId, 'comment'), 400);
      break;
    case 'remix':
      // Il remix è nella collection remixes — apri home (il suono originale potrebbe essere in feed)
      setActiveTab('home');
      break;
    case 'podcast_like':
    case 'podcast_comment':
    case 'radio_live':
    case 'radio_scheduled':
      setActiveTab('explore');
      break;
    case 'streak_reminder':
      setActiveTab('home');
      break;
    case 'message': {
      const senderId = data.senderId;
      if (!senderId) { setActiveTab('messages'); break; }
      try {
        const senderDoc: any = await getUserProfile(senderId);
        setPendingChat({
          userId: senderId,
          userName: senderDoc?.username || senderDoc?.displayName || 'Utente',
          userAvatar: senderDoc?.avatar || '🎵',
        });
      } catch { /* fallback: apri lista messaggi senza chat specifica */ }
      setActiveTab('messages');
      break;
    }
    case 'follow':
    case 'friend_request': {
      const uid = data.userId || data.senderId;
      if (uid) await openUserProfile(uid);
      break;
    }
    case 'friend_accepted': {
      const uid = data.userId || data.senderId;
      if (uid) await openUserProfile(uid);
      break;
    }
    default:
      setActiveTab('home');
  }
};


if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#0A0A0A', '#111111', '#0A0A0A']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#00FF9C" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  const isFullScreen = ['map', 'communities', 'challenges', 'explore', 'timemachine', 'messages'].includes(activeTab);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient colors={['#0A0A0A', '#161616', '#0A0A0A']} style={StyleSheet.absoluteFill} />
      <Modal visible={showOnboarding} animationType="fade" statusBarTranslucent>
        <OnboardingScreen onComplete={() => setShowOnboarding(false)} />
      </Modal>

      {/* Header */}
      {!isFullScreen && <View style={styles.header}>
        <View>
          <View style={styles.headerTitle}>
            {/* Waveform logo bars */}
            <View style={styles.logoBars}>
              {[5, 10, 7, 14, 9, 12, 6].map((h, i) => (
                <View key={i} style={[styles.logoBar, { height: h }]} />
              ))}
            </View>
            <Text style={styles.title}>SoundScape</Text>
          </View>
          <View style={styles.headerSubtitle}>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={styles.subtitleText}>{t('home.soundsInWorld', { count: totalSoundsCount ?? sounds.length })}</Text>
            <Text style={styles.streakText}>🔥 {myStreakCount}</Text>
          </View>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => { setShowNotificationsModal(true); loadNotifications(); }}
          >
            <Feather name="bell" size={18} color="#fff" />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettings(true)}>
            <View style={styles.headerAvatarRing}>
              <AppAvatar avatar={userProfile?.avatar} username={userProfile?.username} size={32} />
            </View>
          </TouchableOpacity>
        </View>
      </View>}

      {/* Main Content — nascosto sui tab full-screen */}
      {!isFullScreen && <ScrollView ref={mainScrollViewRef} style={styles.scrollView} contentContainerStyle={{ paddingBottom: navBarHeight + (miniPlayerData ? 76 : 16) }} showsVerticalScrollIndicator={false}>
        {activeTab === 'home' && (
          <View style={styles.content}>
            {/* Hero card — Share a sound */}
            <LinearGradient colors={['#0A1F12', '#0C1320', '#080A10']} style={styles.heroCard}>
              {/* Decorative background bars */}
              <View style={styles.heroBgBars}>
                {[10, 18, 26, 14, 34, 22, 16, 30, 20, 12, 36, 24, 18, 28, 16, 22, 10, 20].map((h, i) => (
                  <View key={i} style={[styles.heroBgBar, { height: h }]} />
                ))}
              </View>
              <View style={styles.heroGlowOrb} />
              {/* Content */}
              <View style={styles.heroMicCircle}>
                <Feather name="mic" size={22} color="#00FF9C" />
              </View>
              <Text style={styles.heroTitle}>Share a sound</Text>
              <Text style={styles.heroSubtitle}>Let the world hear you</Text>
              <TouchableOpacity
                style={[styles.heroBtn, isRecording && styles.heroBtnRecording]}
                onPress={isRecording ? handleRecord : () => setShowPublishTypeModal(true)}
              >
                <Feather name="radio" size={14} color="#001A0D" style={{ marginRight: 6 }} />
                <Text style={styles.heroBtnText}>
                  {isRecording ? t('home.recording', { time: recordingTime }) : 'Go Live'}
                </Text>
              </TouchableOpacity>
              {isRecording && recordingTime >= 3 && (
                <Text style={styles.recordHint}>{t('home.recordHint')}</Text>
              )}
            </LinearGradient>

            {/* Search */}
            <View style={styles.searchContainer}>
              <Feather name="search" size={15} color="rgba(255,255,255,0.3)" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('home.searchPlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.28)"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Filter Moods */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={{ paddingRight: 8 }}
            >
              {[{ id: 'all', label: t('moods.all') }, { id: 'Energico', label: 'Energetic' }, { id: 'Rilassante', label: 'Relaxing' }, { id: 'Gioioso', label: 'Happy' }, { id: 'Nostalgico', label: 'Chill' }].map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.filterChip, filterMood === m.id && styles.filterChipActive]}
                  onPress={() => setFilterMood(m.id)}
                >
                  <Text style={[styles.filterChipText, filterMood === m.id && styles.filterChipTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Stories row */}
            <StoriesRow userProfile={userProfile} />

            {/* Quick actions */}
            <Text style={styles.sectionLabel}>Quick actions</Text>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity style={styles.quickActionCard}>
                <View style={styles.quickActionIconWrap}>
                  <Feather name="help-circle" size={20} color="rgba(255,255,255,0.5)" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickActionTitle}>How it works</Text>
                  <Text style={styles.quickActionSub}>Learn the basics</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionCard} onPress={() => setShowPublishTypeModal(true)}>
                <View style={[styles.quickActionIconWrap, styles.quickActionIconDashed]}>
                  <Feather name="plus" size={20} color="rgba(255,255,255,0.5)" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickActionTitle}>New state</Text>
                  <Text style={styles.quickActionSub}>Share what's happening</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Live now header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Live now</Text>
              <TouchableOpacity><Text style={styles.seeAllText}>See all</Text></TouchableOpacity>
            </View>

            {/* Sound Feed */}
            {filteredPosts.map(post => {
              const WF_COUNT = 30;
              const wfHeights = Array.from({ length: WF_COUNT }, (_, i) => {
                let h = 0;
                const s = post.id || 'x';
                for (let j = 0; j < s.length; j++) h += s.charCodeAt(j) * (i + 1);
                return 4 + (h % 26);
              });
              return (
              <View key={post.id} style={styles.soundCard}>
                {/* User Header */}
                <View style={styles.soundHeader}>
                  <View style={styles.soundUserInfo}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                      onPress={() => openUserProfile(post.userId)}
                    >
                      <View style={styles.avatarRing}>
                        <AppAvatar avatar={post.userAvatar} username={post.username} size={38} />
                      </View>
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Text style={styles.userName}>{post.username}</Text>
                          <View style={styles.verifiedBadge}>
                            <Feather name="check" size={8} color="#001A0D" />
                          </View>
                        </View>
                        <Text style={styles.soundLocation}>
                          {timeAgo(post.createdAt)}{post.location ? ' • 📍' : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.moodBadge, { borderColor: getMoodColor(post.mood) + '55' }]}>
                      <Text style={[styles.moodText, { color: getMoodColor(post.mood) }]}>{post.mood}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.optionsBtn}
                      onPress={() => Alert.alert(t('home.options'), '', [
                        { text: t('home.reportContent'), onPress: () => openReport(post.id) },
                        { text: t('home.copyLink'), onPress: () => {} },
                        { text: t('common.cancel'), style: 'cancel' },
                      ])}
                    >
                      <Feather name="more-horizontal" size={16} color="rgba(255,255,255,0.35)" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sound Content */}
                <View style={styles.soundContent}>
                  {post.isCollab && post.collaboratorName && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <View style={{ backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(168,85,247,0.35)', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name="mic" size={10} color="#a855f7" />
                        <Text style={{ color: '#a855f7', fontSize: 11, fontWeight: '700' }}>Collab ft. {post.collaboratorName}</Text>
                      </View>
                    </View>
                  )}
                  <Text style={styles.soundTitle}>{post.title}</Text>
                  {post.description && <Text style={styles.soundDescription}>{post.description}</Text>}

                  {/* Player with waveform */}
                  <View style={styles.player}>
                    <TouchableOpacity style={styles.playButton} onPress={() => handlePlay(post)}>
                      <Feather name={playingId === post.id ? 'pause' : 'play'} size={22} color="#001A0D" />
                    </TouchableOpacity>
                    <View style={styles.waveformWrap}>
                      {wfHeights.map((h, i) => {
                        const isPast = playingId === post.id && (i / WF_COUNT) < (playProgress / 100);
                        return (
                          <View
                            key={i}
                            style={[styles.waveBar, {
                              height: h,
                              backgroundColor: isPast ? '#00FF9C' : 'rgba(255,255,255,0.14)',
                            }]}
                          />
                        );
                      })}
                    </View>
                    <Text style={styles.duration}>
                      {playingId === post.id ? `${playPosition}s` : (post.duration > 0 ? `${post.duration}s` : '?s')}
                    </Text>
                  </View>

                  {/* Backstage button */}
                  {post.backstageUrl && (
                    <TouchableOpacity
                      style={styles.backstageBtn}
                      onPress={() => {
                        setBackstageViewerUrl(post.backstageUrl);
                        setBackstageViewerTipo(post.backstageTipo || 'foto');
                        setBackstageViewerTitle(post.title);
                        setShowBackstageViewer(true);
                      }}
                    >
                      <Feather name="video" size={12} color="#00FF9C" />
                      <Text style={styles.backstageBtnText}>backstage</Text>
                    </TouchableOpacity>
                  )}

                  {/* Actions */}
                  <View style={styles.actions}>
                    <View style={styles.actionsLeft}>
                      <TouchableOpacity style={styles.actionButton} onPress={() => handleLike(post.id)}>
                        <Ionicons
                          name={likedSounds.has(post.id) ? 'heart' : 'heart-outline'}
                          size={16}
                          color={likedSounds.has(post.id) ? '#ef4444' : 'rgba(255,255,255,0.4)'}
                        />
                        <Text style={styles.actionText}>{post.likes}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionButton} onPress={() => openCommentsModal(post.id)}>
                        <Feather name="message-circle" size={15} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.actionText}>{post.comments}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionButton}>
                        <Feather name="repeat" size={15} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.actionText}>0</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={styles.actionButton}>
                        <Feather name="headphones" size={14} color="rgba(255,255,255,0.35)" />
                        <Text style={styles.actionText}>{post.listens}</Text>
                      </View>
                      {post.userId === auth.currentUser?.uid && (
                        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(post.id)}>
                          <Feather name="trash-2" size={14} color="rgba(255,255,255,0.3)" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              </View>
              );
            })}

            {filteredPosts.length === 0 && (
              <View style={styles.emptyState}>
                <Feather name="mic-off" size={40} color="rgba(255,255,255,0.1)" />
                <Text style={styles.emptyText}>{t('home.noSoundsFound')}</Text>
              </View>
            )}
          </View>
        )}

    {activeTab === 'profile' && !userProfile && (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80 }}>
        <ActivityIndicator size="large" color="#00FF9C" />
      </View>
    )}

    {activeTab === 'profile' && userProfile && (() => {
  const isOwnProfile = userProfile.id === auth.currentUser?.uid;
  const profileSounds = isOwnProfile ? mySounds : viewedUserSounds;
  return (
  <View style={styles.content}>
    {/* Profile Card */}
    <LinearGradient
      colors={getProfileThemeColors(userProfile?.profileTheme)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.profileCard}
    >
      <View style={styles.profileCardGlass} />
      {/* Change background button — own profile only */}
      {userProfile?.id === auth.currentUser?.uid && (
        <TouchableOpacity
          style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}
          onPress={() => setShowThemeModal(true)}
        >
          <Feather name="image" size={13} color="rgba(255,255,255,0.7)" />
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' }}>Sfondo</Text>
        </TouchableOpacity>
      )}
      <AppAvatar avatar={userProfile?.avatar} username={userProfile?.username} size={80} />
      <Text style={styles.profileName}>{userProfile?.username || t('profile.defaultName')}</Text>
      <Text style={styles.profileUsername}>@{userProfile?.username || 'user'}</Text>

      <View style={styles.profileStats}>
  <View style={styles.profileStat}>
    <Text style={styles.profileStatNumber}>{profileSounds.length}</Text>
    <Text style={styles.profileStatLabel}>{t('profile.sounds')}</Text>
  </View>
  {/* Followers cliccabile */}
  <TouchableOpacity style={styles.profileStat} onPress={fetchAndShowFollowers}>
    <Text style={styles.profileStatNumber}>{followStats.followers}</Text>
    <Text style={styles.profileStatLabel}>{t('profile.followers')}</Text>
  </TouchableOpacity>
  {/* Following cliccabile */}
  <TouchableOpacity style={styles.profileStat} onPress={fetchAndShowFollowing}>
    <Text style={styles.profileStatNumber}>{followStats.following}</Text>
    <Text style={styles.profileStatLabel}>{t('profile.following')}</Text>
  </TouchableOpacity>
  <View style={styles.profileStat}>
    <Text style={styles.profileStatNumber}>🔥 {userProfile?.streakCount || 0}</Text>
    <Text style={styles.profileStatLabel}>{t('profile.streak')}</Text>
  </View>
</View>

      
        {/* <<< AGGIUNGI QUI IL BOTTONE >>>
         Solo se NON è il tuo profilo! */}
      {userProfile && userProfile.id !== auth.currentUser?.uid && (
        <View style={{ width: '100%', marginBottom: 8 }}>
          {friendStatus === 'none' && (
            <TouchableOpacity
              style={[styles.profileButtonPrimary, loadingFriend && { opacity: 0.5 }]}
              onPress={() => handleFriendAction('send')}
              disabled={loadingFriend}
            >
              <Text style={styles.profileButtonPrimaryText}>{t('profile.addFriend')}</Text>
            </TouchableOpacity>
          )}
          {friendStatus === 'pending_sent' && (
            <TouchableOpacity
              style={[styles.profileButtonPrimary, { backgroundColor: 'rgba(255,255,255,0.08)' }, loadingFriend && { opacity: 0.5 }]}
              onPress={() => handleFriendAction('cancel')}
              disabled={loadingFriend}
            >
              <Text style={styles.profileButtonPrimaryText}>{t('profile.requestSent')}</Text>
            </TouchableOpacity>
          )}
          {friendStatus === 'pending_received' && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[styles.profileButtonPrimary, { flex: 1, backgroundColor: '#065f46' }, loadingFriend && { opacity: 0.5 }]}
                onPress={() => handleFriendAction('accept')}
                disabled={loadingFriend}
              >
                <Text style={styles.profileButtonPrimaryText}>{t('profile.accept')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.profileButtonPrimary, { flex: 1, backgroundColor: '#7f1d1d' }, loadingFriend && { opacity: 0.5 }]}
                onPress={() => handleFriendAction('reject')}
                disabled={loadingFriend}
              >
                <Text style={styles.profileButtonPrimaryText}>{t('profile.reject')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {friendStatus === 'friends' && (
            <TouchableOpacity
              style={[styles.profileButtonPrimary, { backgroundColor: '#1a2e1a', borderWidth: 1, borderColor: '#065f46' }, loadingFriend && { opacity: 0.5 }]}
              onPress={() => Alert.alert(t('profile.removeFriend'), t('common.areYouSure'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.remove'), style: 'destructive', onPress: () => handleFriendAction('remove') },
              ])}
              disabled={loadingFriend}
            >
              <Text style={[styles.profileButtonPrimaryText, { color: '#4ade80' }]}>{t('profile.friendsButton')}</Text>
            </TouchableOpacity>
          )}
          {/* Bottone Collab — sempre visibile su profili altrui */}
          <TouchableOpacity
            style={[styles.profileButtonPrimary, { backgroundColor: 'rgba(168,85,247,0.15)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)', marginTop: 8 }]}
            onPress={() => {
              Alert.alert('🎙 Collab Session', 'Scegli la modalità di registrazione', [
                { text: '🎙 Sync — insieme', onPress: async () => {
                  const id = await createCollabSession(userProfile.id, userProfile.username || userProfile.displayName, userProfile.photoURL || '🎵', 'sync').catch(() => null);
                  if (id) setActiveCollabSessionId(id);
                }},
                { text: '🔄 Turni — uno alla volta', onPress: async () => {
                  const id = await createCollabSession(userProfile.id, userProfile.username || userProfile.displayName, userProfile.photoURL || '🎵', 'turns').catch(() => null);
                  if (id) setActiveCollabSessionId(id);
                }},
                { text: 'Annulla', style: 'cancel' },
              ]);
            }}
          >
            <Text style={[styles.profileButtonPrimaryText, { color: '#a855f7' }]}>🎙 Collab Session</Text>
          </TouchableOpacity>

          {/* Bottone Battle */}
          <TouchableOpacity
            style={[styles.profileButtonPrimary, { backgroundColor: 'rgba(249,115,22,0.12)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.4)', marginTop: 8 }]}
            onPress={() => setShowBattleThemePicker(true)}
          >
            <Text style={[styles.profileButtonPrimaryText, { color: '#f97316' }]}>⚔️ Sound Battle</Text>
          </TouchableOpacity>
        </View>
      )}
      
      
      {/* Richieste amicizia in arrivo (solo sul proprio profilo) */}
      {userProfile?.id === auth.currentUser?.uid && pendingFriendRequests.length > 0 && (
        <TouchableOpacity
          style={[styles.profileButtonPrimary, { backgroundColor: '#0f2d1a', borderWidth: 1, borderColor: '#065f46', marginBottom: 8 }]}
          onPress={() => setShowFriendRequestsModal(true)}
        >
          <Text style={[styles.profileButtonPrimaryText, { color: '#4ade80' }]}>
            {t('profile.friendRequestsBtn', { count: pendingFriendRequests.length })}
          </Text>
        </TouchableOpacity>
      )}

      {userProfile?.id === auth.currentUser?.uid && (
        <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
          <TouchableOpacity
            style={[styles.profileButtonPrimary, { flex: 1 }]}
            onPress={handleEditProfile}
          >
            <Text style={styles.profileButtonPrimaryText}>{t('profile.edit')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.profileButtonPrimary, { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)' }]}
            onPress={() => Alert.alert(t('common.info'), t('profile.featureComingSoon'))}
          >
            <Text style={styles.profileButtonPrimaryText}>{t('profile.share')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </LinearGradient>

    {/* Recordings */}
    <View style={styles.recordingsSection}>
      <Text style={styles.sectionTitle}>{t('profile.mySounds', { count: profileSounds.length })}</Text>
      {profileSounds.length === 0 ? (
        <View style={styles.emptyRecordings}>
          <Text style={styles.emptyIcon}>🎤</Text>
          <Text style={styles.emptyText}>{t('profile.noRecordings')}</Text>
          <Text style={styles.emptySubtext}>{isOwnProfile ? t('profile.noRecordingsHint') : ''}</Text>
        </View>
      ) : (
        profileSounds.map(rec => (
          <View key={rec.id} style={styles.recordingItem}>
            <View style={styles.recordingInfo}>
              <Text style={styles.recordingTitle}>{rec.title}</Text>
              <Text style={styles.recordingMeta}>
                {rec.duration > 0 ? `${rec.duration}s` : '?s'} · {timeAgo(rec.createdAt)} · ❤️ {rec.likes}
              </Text>
            </View>
            <View style={styles.recordingActions}>
              <TouchableOpacity
                style={styles.recordingPlayButton}
                onPress={() => handlePlay(rec)}
              >
                <Text style={styles.recordingPlayIcon}>
                  {playingId === rec.id ? '⏸' : '▶️'}
                </Text>
              </TouchableOpacity>
              {isOwnProfile && (
                <TouchableOpacity
                  style={styles.recordingDeleteButton}
                  onPress={() => handleDelete(rec.id)}
                >
                  <Feather name="trash-2" size={14} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}
    </View>

    {/* 🎛️ SEZIONE REMIX - DEVE STARE QUI DENTRO! */}
    <RemixProfileSection
      userId={isOwnProfile ? null : userProfile.id}
      onOpenRemixStudio={isOwnProfile ? () => {
        setShowRemixStudio(true);
        setActiveTab('remix');
      } : null}
    />
  </View>
  );
})()}

{/* 🎛️ TAB REMIX - DEVE STARE QUI FUORI, ALLO STESSO LIVELLO! */}
{activeTab === 'remix' && (
  <View style={styles.content}>
    {loadingRemixSounds ? (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00FF9C" />
        <Text style={styles.loadingText}>{t('home.loadingSounds')}</Text>
      </View>
    ) : (
        <RemixScreen 
          availableSounds={remixSounds as any}
          onClose={() => setActiveTab('profile')}
        />
    )}
  </View>
)}

      </ScrollView>}

      {/* Schermate full-screen — occupano tutto lo spazio disponibile sopra il nav bar */}
      {isFullScreen && (
        <View style={[styles.fullScreenContainer, { paddingBottom: navBarHeight + (miniPlayerData ? 68 : 0) }]}>
          {activeTab === 'communities' && <CommunitiesScreen />}
          {activeTab === 'map' && <MapScreen />}
          {activeTab === 'timemachine' && <TimeMachineScreen />}
          {activeTab === 'challenges' && <ChallengesScreen />}
          {activeTab === 'explore' && <ExploreScreen onOpenUserProfile={openUserProfile} />}
          {activeTab === 'messages' && (
            <MessagesScreen
              initialChat={pendingChat}
              key={pendingChat?.userId ?? 'messages'}
              onViewProfile={openUserProfile}
            />
          )}
        </View>
      )}


      {/* Mini-player alla Spotify — visibile su tutti i tab incluso explore. */}
      {miniPlayerData && (
        <MiniPlayer
          title={miniPlayerData.title}
          artist={miniPlayerData.artist}
          artwork={miniPlayerData.artwork}
          isPlaying={miniPlayerData.isPlaying}
          bottomOffset={navBarHeight}
          onPress={() => setActiveTab('explore')}
          onPlayPause={async () => {
            try {
              const r = require('react-native-track-player');
              const TP = r.default; const S = r;
              const ps = await TP.getPlaybackState();
              const st = ps?.state ?? ps;
              if (st === S.State?.Playing) await TP.pause(); else await TP.play();
              setMiniPlayerData(prev => prev ? { ...prev, isPlaying: st !== S.State?.Playing } : null);
            } catch {}
          }}
          onClose={async () => {
            try {
              const TP = require('react-native-track-player').default;
              // reset() termina il ForegroundService Android e rimuove il widget iOS
              await TP.reset();
            } catch {}
            try { await AsyncStorage.removeItem('@soundscape/rntp_session'); } catch {}
            setMiniPlayerData(null);
          }}
        />
      )}

      {/* Bottom Navigation — componente professionale senza emoji */}
      <BottomNavBar
        activeTab={activeTab as any}
        onTabChange={async (tab) => {
          setActiveTab(tab);
          if (tab === 'profile') {
            const me = auth.currentUser;
            if (me) {
              const myProfile: any = await getUserProfile(me.uid);
              setUserProfile(myProfile);
              setMyStreakCount(myProfile?.streakCount || 0);
              // Resetta i follow stats col proprio UID — potrebbero essere dell'ultimo profilo visitato
              getFollowStats(me.uid).then(setFollowStats);
            }
          }
        }}
      />

      {/* Record Modal */}
      <Modal
        visible={showRecordModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowRecordModal(false);
          setRecordedSound(null);
        }}
      >
        <TouchableWithoutFeedback onPress={() => { setShowRecordModal(false); setRecordedSound(null); }}>
          <View style={styles.modalOverlay}>
            <View style={styles.recordModal} onStartShouldSetResponder={() => true}>
            <Text style={styles.recordModalTitle}>{t('upload.title')}</Text>
            
            <TextInput
              style={[styles.input, titleError ? { borderColor: '#ef4444', borderWidth: 1 } : {}]}
              placeholder={t('upload.titlePlaceholder')}
              placeholderTextColor="#4A4D56"
              value={newSoundTitle}
              onChangeText={(t) => { setNewSoundTitle(t); if (t.trim()) setTitleError(''); }}
              editable={!uploading}
            />
            {titleError ? <Text style={{ color: '#ef4444', fontSize: 12, marginTop: -8, marginBottom: 4 }}>{titleError}</Text> : null}
            
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('upload.descriptionPlaceholder')}
              placeholderTextColor="#94a3b8"
              multiline
              value={newSoundDescription}
              onChangeText={setNewSoundDescription}
              editable={!uploading}
            />

            <Text style={styles.moodLabel}>{t('upload.mood')}</Text>
            <View style={styles.moodSelector}>
              {['Energico', 'Rilassante', 'Gioioso', 'Nostalgico'].map(mood => (
                <TouchableOpacity
                  key={mood}
                  style={[
                    styles.moodOption,
                    { backgroundColor: newSoundMood === mood ? getMoodColor(mood) : 'rgba(255,255,255,0.08)' },
                  ]}
                  onPress={() => setNewSoundMood(mood)}
                  disabled={uploading}
                >
                  <Text style={styles.moodOptionText}>{mood}</Text>
                </TouchableOpacity>
              ))}
            </View>

            
            {/* Challenge Selector */}
{availableChallenges.length > 0 && (
  <>
    <Text style={styles.moodLabel}>{t('upload.challenge')}</Text>
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false} 
      style={{ marginBottom: 16 }}
    >
      <TouchableOpacity
        style={[
          styles.challengeChip, 
          !selectedChallengeForSubmit && { backgroundColor: 'rgba(255,255,255,0.08)' }
        ]}
        onPress={() => setSelectedChallengeForSubmit(null)}
        disabled={uploading}
      >
        <Text style={styles.challengeChipText}>{t('common.none')}</Text>
      </TouchableOpacity>
      {availableChallenges.map(ch => (
        <TouchableOpacity
          key={ch.id}
          style={[
            styles.challengeChip,
            selectedChallengeForSubmit?.id === ch.id && { 
              backgroundColor: '#00FF9C',
              borderWidth: 2,
              borderColor: '#00FF9C'
            }
          ]}
          onPress={() => setSelectedChallengeForSubmit(ch)}
          disabled={uploading}
        >
          <Text style={styles.challengeChipText}>
            {ch.emoji} {ch.title}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  </>
)}
            
            {/* Backstage opzionale */}
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.moodLabel}>{t('upload.backstage')}</Text>
              {backstageUri ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    flex: 1, padding: 10, borderRadius: 10,
                    backgroundColor: 'rgba(0,255,156,0.08)',
                    borderWidth: 1, borderColor: 'rgba(0,255,156,0.25)',
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                  }}>
                    {backstageTipo === 'foto' ? (
                      <Image source={{ uri: backstageUri! }} style={{ width: 44, height: 44, borderRadius: 6 }} />
                    ) : (
                      <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: 'rgba(0,255,156,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                        <Feather name="video" size={20} color="#00FF9C" />
                      </View>
                    )}
                    <Text style={{ color: '#00FF9C', fontSize: 12, fontFamily: 'monospace', flex: 1 }}>
                      {backstageTipo === 'video' ? t('upload.videoSelected') : t('upload.photoSelected')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { setBackstageUri(null); setBackstageTipo(null); }}
                    style={{ padding: 8 }}
                  >
                    <Feather name="x" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1, padding: 12, borderRadius: 10,
                      backgroundColor: '#161616',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                      alignItems: 'center', gap: 6,
                    }}
                    onPress={() => selectBackstage('foto')}
                    disabled={uploading}
                  >
                    <Feather name="camera" size={22} color="#94a3b8" />
                    <Text style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>{t('upload.photo')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1, padding: 12, borderRadius: 10,
                      backgroundColor: '#161616',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                      alignItems: 'center', gap: 6,
                    }}
                    onPress={() => selectBackstage('video')}
                    disabled={uploading}
                  >
                    <Feather name="video" size={22} color="#94a3b8" />
                    <Text style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>{t('upload.videoMax30')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.recordModalInfo}>
              <Text style={styles.recordModalInfoText}>
                {t('upload.duration', { seconds: recordedSound?.duration })}
              </Text>
              <Text style={styles.recordModalInfoText}>
                {t('upload.gps', { status: location ? t('upload.gpsOk') : t('upload.gpsNo') })}
              </Text>
            </View>

            <View style={styles.recordModalButtons}>
              <TouchableOpacity
                style={styles.recordModalButtonCancel}
                onPress={() => {
                  setShowRecordModal(false);
                  setRecordedSound(null);
                  setNewSoundTitle('');
                  setNewSoundDescription('');
                }}
                disabled={uploading}
              >
                <Text style={styles.recordModalButtonCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.recordModalButtonPublish}
                onPress={handlePublish}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.recordModalButtonPublishText}>{t('upload.publish')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Publish Type Choice Modal */}
      <Modal
        visible={showPublishTypeModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPublishTypeModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowPublishTypeModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: 32 }]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('upload.whatToPublish')}</Text>
              <TouchableOpacity onPress={() => setShowPublishTypeModal(false)}>
                <Feather name="x" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            {[
              { icon: '🎤', label: t('upload.typeSound'), sub: t('upload.typeSoundDesc'), action: () => { setShowPublishTypeModal(false); startRecording(); } },
              { icon: '🎙', label: t('upload.typePodcast'), sub: t('upload.typePodcastDesc'), action: () => { setShowPublishTypeModal(false); setActiveTab('explore'); } },
              { icon: '📻', label: t('upload.typeRadio'), sub: t('upload.typeRadioDesc'), action: () => { setShowPublishTypeModal(false); setActiveTab('explore'); } },
            ].map(({ icon, label, sub, action }) => (
              <TouchableOpacity
                key={label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, backgroundColor: '#161616', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 10 }}
                onPress={action}
              >
                <Text style={{ fontSize: 28 }}>{icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 16, fontStyle: 'italic', fontWeight: '600' }}>{label}</Text>
                  <Text style={{ color: '#64748b', fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>{sub}</Text>
                </View>
                <Text style={{ color: '#00FF9C', fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Backstage Viewer */}
      <BackstageViewer
        visible={showBackstageViewer}
        url={backstageViewerUrl}
        tipo={backstageViewerTipo}
        soundTitle={backstageViewerTitle}
        onClose={() => setShowBackstageViewer(false)}
      />

      {/* Friend Requests Modal */}
      <Modal
        visible={showFriendRequestsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFriendRequestsModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowFriendRequestsModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '70%' }]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.friendRequestsTitle')}</Text>
              <TouchableOpacity onPress={() => setShowFriendRequestsModal(false)}>
                <Feather name="x" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {pendingFriendRequests.length === 0 ? (
                <Text style={{ color: '#94a3b8', textAlign: 'center', padding: 24, fontFamily: 'monospace' }}>
                  {t('profile.noPendingRequests')}
                </Text>
              ) : (
                pendingFriendRequests.map((req) => (
                  <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: '#161616' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#00ff9c', fontSize: 18 }}>
                        {(req.initiatedBy || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ flex: 1, color: '#e2e8f0', fontSize: 13 }}>
                      {req.initiatedBy}
                    </Text>
                    <TouchableOpacity
                      style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#065f46', borderRadius: 8, marginRight: 6 }}
                      onPress={async () => {
                        await acceptFriendRequest(req.initiatedBy);
                        const updated = await getFriendStatus(req.initiatedBy);
                        if (userProfile?.id === req.initiatedBy) setFriendStatus(updated);
                      }}
                    >
                      <Text style={{ color: '#4ade80', fontSize: 12, fontWeight: '600' }}>{t('common.accept')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#7f1d1d', borderRadius: 8 }}
                      onPress={() => rejectFriendRequest(req.initiatedBy)}
                    >
                      <Text style={{ color: '#f87171', fontSize: 12, fontWeight: '600' }}>{t('common.reject')}</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowSettings(false)} activeOpacity={1} />
            <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('settings.title')}</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Feather name="x" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.settingsScroll}>
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('settings.account')}</Text>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsItemText}>
                    {t('settings.email', { email: auth.currentUser?.email || t('settings.anonymous') })}
                  </Text>
                </View>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsItemText}>
                    {t('settings.soundsPublished', { count: mySounds.length })}
                  </Text>
                </View>
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('settings.language')}</Text>
                <LanguageSwitcher />
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('settings.legal')}</Text>
                <TouchableOpacity
                  style={styles.settingsItem}
                  onPress={() => { /* open webview or link */ }}
                >
                  <Text style={styles.settingsItemText}>{t('settings.privacyPolicy')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.settingsItem}
                  onPress={() => { /* open webview or link */ }}
                >
                  <Text style={styles.settingsItemText}>{t('settings.termsOfService')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('settings.actions')}</Text>
                <TouchableOpacity
                  style={[styles.settingsItem, { marginBottom: 8 }]}
                  onPress={handleCheckUpdates}
                >
                  <Text style={[styles.settingsItemText, { color: '#00FF9C' }]}>
                    ✅ OTA v6 confermato!
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.settingsItem}
                  onPress={handleLogout}
                >
                  <Text style={[styles.settingsItemText, { color: '#ef4444' }]}>
                    {t('settings.logout')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.settingsItem, { marginTop: 8, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' }]}
                  onPress={() => { setShowSettings(false); setShowDeleteConfirm(true); }}
                >
                  <Text style={[styles.settingsItemText, { color: '#ef4444' }]}>
                    {t('settings.deleteAccount')}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
          </View>
      </Modal>

      {/* Report Modal */}
      <Modal
        visible={showReportModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { Keyboard.dismiss(); setShowReportModal(false); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setShowReportModal(false); }}>
          <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}>
            <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
              <View style={[styles.modalContent, { borderRadius: 24, padding: 24 }]}>
                {reportSent ? (
                  <View style={{ alignItems: 'center', padding: 20, gap: 12 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="check" size={22} color="#10b981" />
                    </View>
                    <Text style={{ color: '#F8F4EF', fontSize: 15, fontWeight: '600' }}>{t('report.sent')}</Text>
                    <TouchableOpacity
                      style={{ marginTop: 8, paddingVertical: 11, paddingHorizontal: 24, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10 }}
                      onPress={() => setShowReportModal(false)}
                    >
                      <Text style={{ color: '#F8F4EF' }}>{t('common.close')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>{t('report.title')}</Text>
                      <TouchableOpacity onPress={() => setShowReportModal(false)}>
                        <Feather name="x" size={22} color="#94a3b8" />
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: '#8A8D96', fontSize: 12, marginBottom: 14 }}>{t('report.selectReason')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                      {[
                        { key: 'Inappropriato', label: t('report.inappropriate') },
                        { key: 'Spam', label: t('report.spam') },
                        { key: 'Violenza', label: t('report.violence') },
                        { key: 'Altro', label: t('report.other') },
                      ].map(({ key, label }) => (
                        <TouchableOpacity
                          key={key}
                          style={{
                            paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8,
                            borderWidth: 1,
                            borderColor: reportReason === key ? '#00FF9C' : 'rgba(255,255,255,0.1)',
                            backgroundColor: reportReason === key ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)',
                          }}
                          onPress={() => setReportReason(key)}
                        >
                          <Text style={{ color: reportReason === key ? '#00FF9C' : '#8A8D96', fontSize: 13 }}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, color: '#F8F4EF', fontSize: 13, marginBottom: 16, minHeight: 72 }}
                      placeholder={t('report.notesPlaceholder')}
                      placeholderTextColor="#4A4D56"
                      multiline
                      value={reportNote}
                      onChangeText={setReportNote}
                    />
                    <TouchableOpacity
                      style={{ backgroundColor: reportReason ? '#00FF9C' : 'rgba(6,182,212,0.3)', padding: 13, borderRadius: 10, alignItems: 'center' }}
                      onPress={handleSendReport}
                      disabled={!reportReason || reportLoading}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600' }}>{reportLoading ? t('report.sending') : t('report.submit')}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Account Confirm Modal */}
      <Modal
        visible={showDeleteConfirm}
        animationType="fade"
        transparent={true}
        onRequestClose={() => !deletingAccount && setShowDeleteConfirm(false)}
      >
        <TouchableWithoutFeedback onPress={() => !deletingAccount && setShowDeleteConfirm(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalContent, { padding: 28, alignItems: 'center' }]}>
                <Feather name="trash-2" size={36} color="#ef4444" style={{ marginBottom: 12 }} />
                <Text style={[styles.modalTitle, { marginBottom: 8 }]}>{t('settings.deleteConfirmTitle')}</Text>
                <Text style={{ color: '#8A8D96', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
                  {t('settings.deleteConfirmMsg')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  <TouchableOpacity
                    style={{ flex: 1, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' }}
                    onPress={() => setShowDeleteConfirm(false)}
                    disabled={deletingAccount}
                  >
                    <Text style={{ color: '#F8F4EF', fontWeight: '500' }}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, padding: 13, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center' }}
                    onPress={handleDeleteAccount}
                    disabled={deletingAccount}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600' }}>
                      {deletingAccount ? t('settings.deletingAccount') : t('settings.deleteForever')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    
    

      {/* Comments Modal */}
      <Modal
        visible={showCommentsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowCommentsModal(false);
          setSelectedSoundForComments(null);
          setComments([]);
          setNewComment('');
        }}
      >
        <TouchableWithoutFeedback onPress={() => { setShowCommentsModal(false); setSelectedSoundForComments(null); setComments([]); setNewComment(''); }}>
          <View style={[styles.modalOverlay, { justifyContent: 'flex-end' }]}>
            <View style={[styles.modalContent, { height: '80%', borderRadius: 24 }]} onStartShouldSetResponder={() => true}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('comments.title')}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowCommentsModal(false);
                  setSelectedSoundForComments(null);
                  setComments([]);
                  setNewComment('');
                }}
              >
                <Feather name="x" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Comments List */}
            {loadingComments ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#00FF9C" />
              </View>
            ) : (
              <ScrollView style={{ flex: 1, padding: 16 }}>
               {(!comments || comments.length === 0) ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>💬</Text>
                    <Text style={styles.emptyText}>{t('comments.noComments')}</Text>
                    <Text style={styles.emptySubtext}>{t('comments.noCommentsHint')}</Text>
                  </View>
                ) : (
                  comments.map((comment, idx) => {
                    if (!comment || !comment.id) return null;
                    return (
                      <View key={comment.id || `comment-${idx}`} style={styles.commentItem}>
                        <View style={styles.commentHeader}>
                          <TouchableOpacity
                            onPress={() => comment.userId && openUserProfile(comment.userId)}
                            style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                          >
                            <AppAvatar avatar={comment.userAvatar} username={comment.username} size={36} />
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={styles.userName}>{comment.username || 'Anonimo'}</Text>
                              <Text style={styles.soundLocation}>{timeAgo(comment.createdAt)}</Text>
                            </View>
                          </TouchableOpacity>
                          {comment.userId === auth.currentUser?.uid && (
                            <TouchableOpacity onPress={() => handleDeleteComment(comment)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Feather name="x" size={14} color="rgba(255,255,255,0.35)" style={{ paddingLeft: 8 }} />
                            </TouchableOpacity>
                          )}
                        </View>
                        <Text style={styles.commentText}>{comment.text}</Text>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}

            {/* Input Box */}
            <View style={styles.commentInputContainer}>
              <TextInput
                style={styles.commentInput}
                placeholder={t('comments.placeholder')}
                placeholderTextColor="#94a3b8"
                value={newComment}
                onChangeText={setNewComment}
                multiline
                maxLength={500}
                editable={!sendingComment}
              />
              <TouchableOpacity
                style={[
                  styles.commentSendButton,
                  (!newComment.trim() || sendingComment) && { opacity: 0.5 }
                ]}
                onPress={handleSendComment}
                disabled={!newComment.trim() || sendingComment}
              >
                {sendingComment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.commentSendIcon}>➤</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </TouchableWithoutFeedback>
      </Modal>

{/* Edit Profile Modal */}
<Modal
  visible={showEditProfileModal}
  animationType="slide"
  transparent={true}
  onRequestClose={() => setShowEditProfileModal(false)}
>
  <KeyboardAvoidingView
    style={styles.modalOverlay}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  >
    {/* Backdrop separato — non interferisce con lo scroll */}
    <TouchableOpacity
      style={StyleSheet.absoluteFillObject}
      activeOpacity={1}
      onPress={() => { Keyboard.dismiss(); setShowEditProfileModal(false); }}
    />
    <View style={[styles.modalContent, { maxHeight: '92%' }]}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{t('profile.editProfile')}</Text>
        <TouchableOpacity onPress={() => setShowEditProfileModal(false)}>
          <Feather name="x" size={22} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar Selector */}
        <Text style={styles.editLabel}>{t('profile.chooseAvatar')}</Text>
        {/* Anteprima avatar corrente */}
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <AppAvatar avatar={editAvatar} username={editUsername} size={64} />
        </View>
        {/* Icone vettoriali */}
        <Text style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>ICONE</Text>
        <View style={styles.avatarGrid}>
          {FEATHER_ICON_OPTIONS.map(icon => (
            <TouchableOpacity
              key={icon}
              style={[styles.avatarOption, editAvatar === icon && styles.avatarOptionSelected]}
              onPress={() => setEditAvatar(icon)}
            >
              <Feather name={icon as any} size={20} color={editAvatar === icon ? '#00FF9C' : '#94a3b8'} />
            </TouchableOpacity>
          ))}
        </View>
        {/* Emoji personalità */}
        <Text style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace', marginBottom: 6, marginTop: 8 }}>EMOJI</Text>
        <View style={styles.avatarGrid}>
          {['🔥', '💎', '👑', '⚡', '🌟', '🎭', '😎', '🦋', '🐺', '🎯'].map(emoji => (
            <TouchableOpacity
              key={emoji}
              style={[styles.avatarOption, editAvatar === emoji && styles.avatarOptionSelected]}
              onPress={() => setEditAvatar(emoji)}
            >
              <Text style={styles.avatarOptionText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Username */}
        <Text style={styles.editLabel}>{t('profile.username')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('profile.usernamePlaceholder')}
          placeholderTextColor="#94a3b8"
          value={editUsername}
          onChangeText={setEditUsername}
          maxLength={20}
          editable={!savingProfile}
        />
        <Text style={styles.charCount}>{editUsername.length}/20</Text>

        {/* Bio */}
        <Text style={styles.editLabel}>{t('profile.bio')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder={t('profile.bioPlaceholder')}
          placeholderTextColor="#94a3b8"
          value={editBio}
          onChangeText={setEditBio}
          multiline
          maxLength={150}
          editable={!savingProfile}
        />
        <Text style={styles.charCount}>{editBio.length}/150</Text>

        {/* Save Button */}
        <TouchableOpacity
          style={[
            styles.profileButtonPrimary,
            { marginTop: 24, marginBottom: 16 },
            savingProfile && { opacity: 0.5 }
          ]}
          onPress={handleSaveProfile}
          disabled={savingProfile}
        >
          {savingProfile ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.profileButtonPrimaryText}>{t('profile.saveChanges')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  </KeyboardAvoidingView>
</Modal>

      {/* Notifications Modal */}
      <Modal
        visible={showNotificationsModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowNotificationsModal(false)}
        statusBarTranslucent={true}
      >
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.75)' }]}
            onPress={() => setShowNotificationsModal(false)}
            activeOpacity={1}
          />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, pointerEvents: 'box-none' }}>
            {/* Pannello Notifiche */}
            <View
              style={{
                width: '100%',
                height: '75%',
                backgroundColor: '#0A0A0A',
                borderRadius: 24,
                borderWidth: 1,
                borderColor: 'rgba(0,255,156,0.3)',
                overflow: 'hidden',
                elevation: 25,
              }}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('notifications.title')}</Text>
                <TouchableOpacity onPress={() => setShowNotificationsModal(false)} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
                  <Feather name="x" size={22} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              {unreadCount > 0 && (
                <TouchableOpacity
                  style={{ marginHorizontal: 16, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,255,156,0.4)', backgroundColor: 'rgba(0,255,156,0.1)', alignItems: 'center' }}
                  onPress={async () => {
                    const user = auth.currentUser;
                    if (!user) return;
                    await markAllNotificationsAsRead(user.uid);
                    loadNotifications();
                  }}
                >
                  <Text style={{ color: '#00FF9C', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 }}>{t('notifications.markAllRead')}</Text>
                </TouchableOpacity>
              )}

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
              >
                {notifications.length === 0 ? (
                  <View style={[styles.emptyState, { marginTop: 60 }]}>
                    <Text style={{ fontSize: 40, marginBottom: 16 }}>🔔</Text>
                    <Text style={styles.emptyText}>{t('notifications.noNotifications')}</Text>
                    <Text style={styles.emptySubtext}>{t('notifications.noNotificationsHint')}</Text>
                  </View>
                ) : (
                  notifications.map((notif) => (
                    <TouchableOpacity
                      key={notif.id}
                      style={[
                        styles.notificationItem,
                        !notif.read && { backgroundColor: '#161616', borderColor: '#00FF9C', borderLeftWidth: 4 }
                      ]}
                      onPress={async () => {
                        await markNotificationAsRead(notif.id);
                        loadNotifications();
                        setShowNotificationsModal(false);
                        await handleNotificationNavigation(notif.data);
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={[styles.notificationTitle, !notif.read && { color: '#00FF9C' }]}>{notif.title}</Text>
                        {!notif.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#00FF9C', marginTop: 4 }} />}
                      </View>
                      <Text style={styles.notificationBody}>{notif.body}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, opacity: 0.6 }}>
                        <Feather name="clock" size={10} color="#94a3b8" />
                        <Text style={[styles.notificationTime, { marginLeft: 4 }]}>
                          {timeAgo(notif.createdAt)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>


    {/* Followers Modal */}
<Modal
  visible={showFollowersModal} 
  animationType="slide"
  transparent={true}
  onRequestClose={() => setShowFollowersModal(false)}
>
  <TouchableWithoutFeedback onPress={() => setShowFollowersModal(false)}>
    <View style={styles.modalOverlay}>
      <View style={[styles.modalContent, { maxHeight: '80%' }]} onStartShouldSetResponder={() => true}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{t('profile.followers')}</Text>
        <TouchableOpacity onPress={() => setShowFollowersModal(false)}>
          <Feather name="x" size={22} color="#94a3b8" />
        </TouchableOpacity>
      </View>
      
      <ScrollView style={{ padding: 16 }}>
        {followersList.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>{t('profile.noFollowers')}</Text>
          </View>
        ) : (
          followersList.map(user => (
            <TouchableOpacity 
              key={user.id} 
              onPress={() => {
                setShowFollowersModal(false);
                openUserProfile(user.id);
              }}
              style={styles.userListItem}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.avatar}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{user.username}</Text>
                <Text style={styles.soundLocation}>@{user.username}</Text>
              </View>
              <Text style={styles.navIcon}>→</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
    </View>
  </TouchableWithoutFeedback>
</Modal>

{/* Following Modal */}
<Modal 
  visible={showFollowingModal} 
  animationType="slide"
  transparent={true}
  onRequestClose={() => setShowFollowingModal(false)}
>
  <TouchableWithoutFeedback onPress={() => setShowFollowingModal(false)}>
    <View style={styles.modalOverlay}>
      <View style={[styles.modalContent, { maxHeight: '80%' }]} onStartShouldSetResponder={() => true}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{t('profile.following')}</Text>
        <TouchableOpacity onPress={() => setShowFollowingModal(false)}>
          <Feather name="x" size={22} color="#94a3b8" />
        </TouchableOpacity>
      </View>
      
      <ScrollView style={{ padding: 16 }}>
        {followingList.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⭐</Text>
            <Text style={styles.emptyText}>{t('profile.notFollowing')}</Text>
          </View>
        ) : (
          followingList.map(user => (
            <TouchableOpacity 
              key={user.id} 
              onPress={() => {
                setShowFollowingModal(false);
                openUserProfile(user.id);
              }}
              style={styles.userListItem}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.avatar}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{user.username}</Text>
                <Text style={styles.soundLocation}>@{user.username}</Text>
              </View>
              <Text style={styles.navIcon}>→</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
    </View>
  </TouchableWithoutFeedback>
</Modal>


      {/* Collab Session Screen */}
      {activeCollabSessionId && (
        <Modal visible animationType="slide" onRequestClose={() => setActiveCollabSessionId(null)}>
          <CollabSessionScreen
            sessionId={activeCollabSessionId}
            onClose={() => setActiveCollabSessionId(null)}
          />
        </Modal>
      )}

      {/* Battle Theme Picker */}
      <Modal visible={showBattleThemePicker} transparent animationType="slide" onRequestClose={() => setShowBattleThemePicker(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={{ backgroundColor: '#161616', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(249,115,22,0.3)' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' }}>⚔️ Scegli il tema</Text>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', marginBottom: 4 }}>30 secondi a testa — poi il pubblico vota</Text>
            {['🌧️ Suono della pioggia', '🌆 Rumore della città', '🌊 Onde del mare', '🎵 Improvvisazione musicale', '🌙 Suono della notte', '🌿 Natura selvaggia'].map(theme => (
              <TouchableOpacity
                key={theme}
                style={{ backgroundColor: 'rgba(249,115,22,0.1)', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(249,115,22,0.25)' }}
                onPress={async () => {
                  setShowBattleThemePicker(false);
                  const id = await createBattle(
                    userProfile.id,
                    userProfile.username || userProfile.displayName,
                    userProfile.photoURL || '🎙',
                    theme,
                  ).catch(() => null);
                  if (id) setActiveBattleId(id);
                }}
              >
                <Text style={{ color: '#f97316', fontWeight: '600', fontSize: 15 }}>{theme}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={{ paddingVertical: 14, alignItems: 'center' }}
              onPress={() => setShowBattleThemePicker(false)}
            >
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontWeight: '600' }}>Annulla</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Profile theme picker */}
      <Modal visible={showThemeModal} transparent animationType="slide" onRequestClose={() => setShowThemeModal(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <View style={{ backgroundColor: '#0A0A0A', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 4 }}>Scegli sfondo profilo</Text>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', marginBottom: 20 }}>Tema salvato automaticamente</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
              {PROFILE_THEMES.map(theme => {
                const isActive = (userProfile?.profileTheme ?? 'default') === theme.id;
                return (
                  <TouchableOpacity
                    key={theme.id}
                    onPress={async () => {
                      setShowThemeModal(false);
                      const uid = auth.currentUser?.uid;
                      if (!uid) return;
                      try {
                        await updateUserProfile(uid, { profileTheme: theme.id });
                        setUserProfile((p: any) => ({ ...p, profileTheme: theme.id }));
                      } catch {}
                    }}
                    style={{ alignItems: 'center', gap: 5 }}
                  >
                    <LinearGradient
                      colors={theme.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ width: 60, height: 60, borderRadius: 16, borderWidth: isActive ? 2.5 : 1, borderColor: isActive ? '#00FF9C' : 'rgba(255,255,255,0.15)' }}
                    />
                    <Text style={{ color: isActive ? '#00FF9C' : 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: isActive ? '700' : '400' }}>
                      {theme.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={{ paddingVertical: 14, alignItems: 'center' }}
              onPress={() => setShowThemeModal(false)}
            >
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontWeight: '600' }}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Battle Screen */}
      {activeBattleId && (
        <Modal visible animationType="slide" onRequestClose={() => setActiveBattleId(null)}>
          <BattleScreen battleId={activeBattleId} onClose={() => setActiveBattleId(null)} />
        </Modal>
      )}

      {/* Banner invito collab in arrivo */}
      {incomingCollab && !activeCollabSessionId && (
        <Modal visible transparent animationType="fade">
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <View style={{ backgroundColor: '#161616', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(168,85,247,0.4)' }}>
              <Text style={{ fontSize: 36 }}>{incomingCollab.hostAvatar}</Text>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>🎙 Invito Collab!</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' }}>
                {incomingCollab.hostName} ti invita a una {incomingCollab.mode === 'sync' ? 'sessione sync' : 'sessione a turni'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: 'rgba(255,59,48,0.15)', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)' }}
                  onPress={() => { setIncomingCollab(null); }}
                >
                  <Text style={{ color: '#FF3B30', fontWeight: '700' }}>Dopo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 2, backgroundColor: '#a855f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                  onPress={() => { setActiveCollabSessionId(incomingCollab.id); setIncomingCollab(null); }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>🎙 Entra</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Banner sfida battle in arrivo */}
      {incomingBattle && !activeBattleId && (
        <Modal visible transparent animationType="fade">
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <View style={{ backgroundColor: '#161616', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(249,115,22,0.4)' }}>
              <Text style={{ fontSize: 40 }}>⚔️</Text>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Sei stato sfidato!</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' }}>
                {incomingBattle.challengerName} ti ha lanciato una Sound Battle
              </Text>
              <View style={{ backgroundColor: 'rgba(249,115,22,0.12)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(249,115,22,0.3)' }}>
                <Text style={{ color: '#f97316', fontWeight: '700' }}>🎯 {incomingBattle.theme}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: 'rgba(255,59,48,0.12)', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)' }}
                  onPress={() => setIncomingBattle(null)}
                >
                  <Text style={{ color: '#FF3B30', fontWeight: '700' }}>Dopo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 2, backgroundColor: '#f97316', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                  onPress={() => { setActiveBattleId(incomingBattle.id); setIncomingBattle(null); }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>⚔️ Accetta sfida</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 16,
    marginTop: 16,
  },
  scrollView: {
    flex: 1,
  },
  fullScreenContainer: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 6,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2.5,
  },
  logoBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#00FF9C',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,255,156,0.12)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#00FF9C',
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#00FF9C',
    letterSpacing: 1,
  },
  subtitleText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  streakText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerAvatarRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#00FF9C',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  // ── Hero card ────────────────────────────────────────────────────────────────
  heroCard: {
    overflow: 'hidden',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.15)',
    minHeight: 180,
    justifyContent: 'flex-end',
  },
  heroBgBars: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    opacity: 0.18,
  },
  heroBgBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: '#00FF9C',
  },
  heroGlowOrb: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(0,255,156,0.07)',
    top: -60,
    right: -40,
  },
  heroMicCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,255,156,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 18,
  },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#00FF9C',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: '#00FF9C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  heroBtnRecording: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
  },
  heroBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#001A0D',
    letterSpacing: 0.2,
  },
  recordHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
  },
  // ── Search ───────────────────────────────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    gap: 10,
  },
  searchIcon: {},
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 0,
  },
  // ── Filter chips ─────────────────────────────────────────────────────────────
  filterScroll: {
    marginBottom: 18,
  },
  filterChip: {
    backgroundColor: '#161616',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  filterChipActive: {
    backgroundColor: '#00FF9C',
    borderColor: '#00FF9C',
  },
  filterChipText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#001A0D',
    fontWeight: '700',
  },
  // ── Quick actions ─────────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.3,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  quickActionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#161616',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  quickActionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionIconDashed: {
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  quickActionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F5F5F5',
    marginBottom: 2,
  },
  quickActionSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  // ── Section header ────────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00FF9C',
  },
  // ── Sound cards ───────────────────────────────────────────────────────────────
  soundCard: {
    backgroundColor: '#161616',
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  soundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  soundUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarRing: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#00FF9C',
    padding: 1.5,
  },
  verifiedBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00FF9C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsBtn: {
    padding: 6,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F5F5F5',
    letterSpacing: -0.1,
  },
  soundLocation: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 1,
  },
  moodBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  moodText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  soundContent: {
    padding: 14,
  },
  soundTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F5F5F5',
    marginBottom: 4,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  soundDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.38)',
    marginBottom: 14,
    lineHeight: 19,
  },
  // ── Player ────────────────────────────────────────────────────────────────────
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00FF9C',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00FF9C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  waveformWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 36,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  progressBar: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00FF9C',
    borderRadius: 2,
  },
  duration: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    fontVariant: ['tabular-nums'] as any,
    minWidth: 28,
  },
  backstageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 2,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.25)',
    backgroundColor: 'rgba(0,255,156,0.06)',
  },
  backstageBtnText: {
    color: '#00FF9C',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  // ── Actions ───────────────────────────────────────────────────────────────────
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  actionsLeft: {
    flexDirection: 'row',
    gap: 18,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontVariant: ['tabular-nums'] as any,
  },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.25)',
    fontWeight: '500',
  },
  profileCard: {
    overflow: 'hidden',
    backgroundColor: '#161616',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  profileCardGlass: {
    position: 'absolute',
    top: -20,
    right: -10,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#00FF9C',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileAvatarText: {
    fontSize: 32,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  profileUsername: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 16,
  },
  profileStats: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 16,
  },
  profileStat: {
    alignItems: 'center',
  },
  profileStatNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#D7FF64',
  },
  profileStatLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  profileButtonPrimary: {
    width: '100%',
    backgroundColor: '#D7FF64',
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
  },
  profileButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#07110B',
  },
  recordingsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  emptyRecordings: {
    backgroundColor: 'rgba(8,12,18,0.82)',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(125,255,208,0.14)',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  recordingItem: {
    backgroundColor: 'rgba(8,12,18,0.82)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(125,255,208,0.14)',
  },
  recordingInfo: {
    flex: 1,
  },
  recordingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  recordingMeta: {
    fontSize: 12,
    color: '#94a3b8',
  },
  recordingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  recordingPlayButton: {
    backgroundColor: '#D7FF64',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingPlayIcon: {
    fontSize: 14,
  },
  recordingDeleteButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingDeleteIcon: {
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00FF9C',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabRecording: {
    backgroundColor: '#ef4444',
  },
  fabIcon: {
    fontSize: 28,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#161616',
    borderRadius: 24,
    width: '100%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modalClose: {
    fontSize: 24,
    color: '#94a3b8',
  },
  settingsScroll: {
    maxHeight: 400,
  },
  settingsSection: {
    padding: 16,
  },
  settingsSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  settingsItem: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingsItemText: {
    fontSize: 14,
    color: '#fff',
  },
  recordModal: {
    backgroundColor: '#161616',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  recordModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#475569',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  moodLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
  },
  moodSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  moodOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  moodOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  recordModalInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#0A0A0A',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  recordModalInfoText: {
    fontSize: 13,
    color: '#00FF9C',
    fontWeight: '600',
  },
  recordModalButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  recordModalButtonCancel: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  recordModalButtonCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  recordModalButtonPublish: {
    flex: 1,
    backgroundColor: '#00FF9C',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
recordModalButtonPublishText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  commentItem: {
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentText: {
    fontSize: 14,
    color: '#cbd5e1',
    lineHeight: 20,
    marginLeft: 44,
  },
  commentInputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 12,
    backgroundColor: '#161616',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  commentSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00FF9C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSendIcon: {
    fontSize: 20,
    color: '#fff',
  },

editLabel: {
  fontSize: 14,
  fontWeight: '600',
  color: '#94a3b8',
  marginBottom: 8,
  marginTop: 16,
},
avatarGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
  marginBottom: 8,
},
avatarOption: {
  width: 50,
  height: 50,
  borderRadius: 25,
  backgroundColor: '#0A0A0A',
  justifyContent: 'center',
  alignItems: 'center',
  borderWidth: 2,
  borderColor: 'rgba(255,255,255,0.08)',
},
avatarOptionSelected: {
  borderColor: '#00FF9C',
  backgroundColor: '#161616',
  transform: [{ scale: 1.1 }],
},
avatarOptionText: {
  fontSize: 24,
},
charCount: {
  fontSize: 12,
  color: '#64748b',
  textAlign: 'right',
  marginTop: 4,
  marginBottom: 8,
},


notificationBadge: {
  position: 'absolute',
  top: -4,
  right: -4,
  backgroundColor: '#ef4444',
  borderRadius: 10,
  minWidth: 18,
  height: 18,
  justifyContent: 'center',
  alignItems: 'center',
  borderWidth: 2,
  borderColor: '#0A0A0A',
},
notificationBadgeText: {
  color: '#fff',
  fontSize: 10,
  fontWeight: '700',
},
notificationItem: {
  backgroundColor: '#0A0A0A',
  borderRadius: 12,
  padding: 14,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
},
notificationItemUnread: {
  backgroundColor: '#161616',
  borderColor: '#00FF9C',
  borderLeftWidth: 4,
},
notificationTitle: {
  fontSize: 15,
  fontWeight: '600',
  color: '#fff',
  marginBottom: 4,
},
notificationBody: {
  fontSize: 13,
  color: '#cbd5e1',
  marginBottom: 6,
},
notificationTime: {
  fontSize: 11,
  color: '#64748b',
},


challengeChip: {
  backgroundColor: 'rgba(255,255,255,0.08)',
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 20,
  marginRight: 8,
},
challengeChipText: {
  color: '#fff',
  fontSize: 13,
  fontWeight: '600',
},

userListItem: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: 12,
  backgroundColor: '#0A0A0A',
  borderRadius: 12,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
},
navIcon: {
  fontSize: 18,
  color: '#64748b',
  fontWeight: '700',
},


});  // ⬅️ CHIUDI QUI
