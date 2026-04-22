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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
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
import { collection, query, where, getDocs, getDoc, writeBatch, doc as firestoreDoc, addDoc, serverTimestamp, getCountFromServer } from 'firebase/firestore';
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
import LanguageSwitcher from '../../components/LanguageSwitcher';
import StoriesRow from '../../components/StoriesRow';
import BackstageViewer from '../../components/BackstageViewer';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';

// ─── Avatar helpers ──────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#06b6d4','#8b5cf6','#f59e0b','#ef4444','#10b981','#f97316','#ec4899','#3b82f6'];

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

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { t } = useTranslation();
  const { currentlyRunning, initializationError } = useUpdates();
  const insets = useSafeAreaInsets();
  // Altezza reale della BottomNavBar: parte fissa ~58px + bottom inset del dispositivo
  const navBarHeight = 58 + Math.max(insets.bottom, 8);
  const [activeTab, setActiveTab] = useState('home');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recording, setRecording] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [sound, setSound] = useState(null);
  const soundObjRef = useRef<any>(null); // ref per evitare closure stale
  const isLoadingSound = useRef(false);  // guard contro tap multipli
  const [playPosition, setPlayPosition] = useState(0); // secondi correnti
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordedSound, setRecordedSound] = useState(null);
  const [location, setLocation] = useState(null);
  
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
  const [selectedChallengeForSubmit, setSelectedChallengeForSubmit] = useState(null);
  const [availableChallenges, setAvailableChallenges] = useState([]);
  
  
  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('soundscape_onboarding_done').then((val) => {
      if (!val) setShowOnboarding(true);
    });
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
  const [reportTargetId, setReportTargetId] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  // Firebase data
  const [sounds, setSounds] = useState([]);
  const [totalSoundsCount, setTotalSoundsCount] = useState<number | null>(null);
  const [userProfile, setUserProfile] = useState(null);
  const [activeCollabSessionId, setActiveCollabSessionId] = useState<string | null>(null);
  const [incomingCollab, setIncomingCollab] = useState<CollabSession | null>(null);
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [incomingBattle, setIncomingBattle] = useState<Battle | null>(null);
  const [showBattleThemePicker, setShowBattleThemePicker] = useState(false);
  const [mySounds, setMySounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [likedSounds, setLikedSounds] = useState(new Set());
  // Stati per commenti
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [selectedSoundForComments, setSelectedSoundForComments] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [pendingChat, setPendingChat] = useState<{ userId: string; userName: string; userAvatar: string } | null>(null);
  
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  
  // 🎛️ STATI PER REMIX
  const [showRemixStudio, setShowRemixStudio] = useState(false);
  const [remixSounds, setRemixSounds] = useState([]);
  const [loadingRemixSounds, setLoadingRemixSounds] = useState(false);
  
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [followersList, setFollowersList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
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

  // Setup notifiche push
useEffect(() => {
  const setupNotifications = async () => {
    const user = auth.currentUser;
    if (!user) return;

    // Registra dispositivo
    await registerForPushNotifications(user.uid);

    // Carica notifiche esistenti
    const userNotifications = await getUserNotifications(user.uid);
    setNotifications(userNotifications);
    setUnreadCount(userNotifications.filter(n => !n.read).length);

    // Listener per notifiche in tempo reale
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Notifica ricevuta:', notification);
      loadNotifications();
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      handleNotificationNavigation(data);
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
  const unsub = listenPendingFriendRequests((reqs) => setPendingFriendRequests(reqs));
  return unsub;
}, []);


// Timer per registrazione
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 30) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
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
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);
      getFollowStats(user.uid).then(setFollowStats);

      // Garantisce il salvataggio del push token anche per nuovi utenti
      // (il doc è ora certamente creato dal createOrUpdateUserProfile sopra)
      registerForPushNotifications(user.uid).catch(() => {});

      // Conta il totale reale dei suoni (non limitato a 20)
      getCountFromServer(collection(firestoreDb, 'sounds'))
        .then((snap) => setTotalSoundsCount(snap.data().count))
        .catch(() => {});

      // Subscribe to feed
      const unsubscribe = subscribeToSoundsFeed((newSounds) => {
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
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = recording.getURI();
      const status = await recording.getStatusAsync();
      
      setRecordedSound({
        uri,
        duration: Math.floor(status.durationMillis / 1000),
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

const onPlaybackStatusUpdate = (status) => {
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

const handlePlay = async (item) => {
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

    await incrementListens(item.id);
  } catch (err) {
    console.error('❌ [PLAY] Error playing sound:', err.message);
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
  const handleDelete = async (id) => {
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
  const handleLike = async (soundId) => {
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
  const loadComments = async (soundId) => {
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
  const handleDeleteComment = (comment) => {
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
  const openCommentsModal = (soundId) => {
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
  
  const userNotifications = await getUserNotifications(user.uid);
  setNotifications(userNotifications);
  setUnreadCount(userNotifications.filter(n => !n.read).length);
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

  const openReport = (soundId) => {
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
    await updateUserProfile(user.uid, {
      username: editUsername.trim(),
      bio: editBio.trim(),
      avatar: editAvatar,
    });

    // Ricarica profilo
    const newProfile = await getUserProfile(user.uid);
    setUserProfile(newProfile);
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
  
  const getMoodColor = (mood) => {
    const colors = {
      Energico: '#f97316',
      Rilassante: '#3b82f6',
      Gioioso: '#eab308',
      Nostalgico: '#a855f7',
    };
    return colors[mood] || '#6b7280';
  };

  // Filter sounds
  const filteredPosts = sounds.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMood = filterMood === 'all' || post.mood === filterMood;
    return matchesSearch && matchesMood;
  });

  // Format time ago — gestisce Firestore Timestamp, Date JS e numeri
  const timeAgo = (date) => {
    if (!date) return '';
    const d = date?.toDate ? date.toDate() : (date instanceof Date ? date : new Date(date));
    const seconds = Math.floor((new Date() - d) / 1000);
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


// Aggiungi questa funzione PRIMA del return
const openUserProfile = async (userId) => {
  try {
    const profile = await getUserProfile(userId);
    setUserProfile(profile);
    getFollowStats(userId).then(setFollowStats);
    setActiveTab('profile');
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
        const senderDoc = await getUserProfile(senderId);
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
        <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#06b6d4" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  const isFullScreen = ['map', 'communities', 'challenges', 'explore', 'timemachine', 'messages'].includes(activeTab);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />
      {showOnboarding && <OnboardingScreen onComplete={() => setShowOnboarding(false)} />}

      {/* Header — nascosto sui tab full-screen che hanno il proprio layout */}
      {!isFullScreen && <View style={styles.header}>
        <View>
          <View style={styles.headerTitle}>
            <Text style={styles.logo}>🎧</Text>
            <Text style={styles.title}>SoundScape</Text>
            {userProfile?.isPremium && <Text style={styles.premiumBadge}>👑</Text>}
          </View>
          <View style={styles.headerSubtitle}>
            <Text style={styles.liveIndicator}>{t('home.live')} ✦</Text>
            <Text style={styles.subtitleText}>{t('home.soundsInWorld', { count: totalSoundsCount ?? sounds.length })}</Text>
            <Text style={styles.streakText}>🔥 {userProfile?.streakCount || 0}</Text>
          </View>
        </View>
        <View style={styles.headerButtons}>
  {/* Bottone notifiche */}
  <TouchableOpacity
    style={styles.headerButton}
    onPress={() => {
      setShowNotificationsModal(true);
      loadNotifications();
    }}
  >
    <Text style={styles.headerButtonText}>🔔</Text>
    {unreadCount > 0 && (
      <View style={styles.notificationBadge}>
        <Text style={styles.notificationBadgeText}>{unreadCount}</Text>
      </View>
    )}
  </TouchableOpacity>
  
  <TouchableOpacity
    style={styles.headerButton}
    onPress={() => setShowSettings(true)}
  >
    <Text style={styles.headerButtonText}>⚙️</Text>
  </TouchableOpacity>
</View>
      </View>}

      {/* Main Content — nascosto sui tab full-screen */}
      {!isFullScreen && <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: navBarHeight + 16 }} showsVerticalScrollIndicator={false}>
        {activeTab === 'home' && (
          <View style={styles.content}>
            {/* Quick Record */}
            <LinearGradient
              colors={['#0891b2', '#3b82f6']}
              style={styles.recordCard}
            >
              <Text style={styles.recordIcon}>🎤</Text>
              <TouchableOpacity
                style={[
                  styles.recordButton,
                  isRecording && styles.recordButtonActive,
                ]}
                onPress={isRecording ? handleRecord : () => setShowPublishTypeModal(true)}
              >
                <Text style={styles.recordButtonText}>
                  {isRecording ? t('home.recording', { time: recordingTime }) : t('home.publish')}
                </Text>
              </TouchableOpacity>
              {isRecording && recordingTime >= 3 && (
                <Text style={styles.recordHint}>{t('home.recordHint')}</Text>
              )}
            </LinearGradient>

            {/* Search */}
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder={t('home.searchPlaceholder')}
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Filter Moods */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
            >
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  filterMood === 'all' && styles.filterChipActive,
                ]}
                onPress={() => setFilterMood('all')}
              >
                <Text style={styles.filterChipText}>{t('moods.all')}</Text>
              </TouchableOpacity>
              {['Energico', 'Rilassante', 'Gioioso', 'Nostalgico'].map(mood => (
                <TouchableOpacity
                  key={mood}
                  style={[
                    styles.filterChip,
                    { backgroundColor: filterMood === mood ? getMoodColor(mood) : '#334155' },
                  ]}
                  onPress={() => setFilterMood(mood)}
                >
                  <Text style={styles.filterChipText}>{mood}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            
          
            
            
            {/* Stories row */}
            <StoriesRow userProfile={userProfile} />

            {/* Sound Feed */}
            {filteredPosts.map(post => (
              <View key={post.id} style={styles.soundCard}>
                {/* User Header */}
                <View style={styles.soundHeader}>
                  <View style={styles.soundUserInfo}>
  <TouchableOpacity 
    style={{ flexDirection: 'row', alignItems: 'center' }}
    onPress={() => openUserProfile(post.userId)}
  >
    <AppAvatar avatar={post.userAvatar} username={post.username} size={36} />
    <View>
      <Text style={styles.userName}>{post.username}</Text>
      <Text style={styles.soundLocation}>
        {timeAgo(post.createdAt)}
        {post.location ? ' • 📍' : ''}
      </Text>
    </View>
  </TouchableOpacity>
</View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={[styles.moodBadge, { backgroundColor: getMoodColor(post.mood) }]}
                    >
                      <Text style={styles.moodText}>{post.mood}</Text>
                    </View>
                    <TouchableOpacity
                      style={{ padding: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' }}
                      onPress={() => Alert.alert(
                        t('home.options'),
                        '',
                        [
                          { text: t('home.reportContent'), onPress: () => openReport(post.id) },
                          { text: t('home.copyLink'), onPress: () => {} },
                          { text: t('common.cancel'), style: 'cancel' },
                        ]
                      )}
                    >
                      <Text style={{ color: '#8A8D96', fontSize: 16 }}>⋯</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sound Content */}
                <View style={styles.soundContent}>
                  {post.isCollab && post.collaboratorName && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View style={{ backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(168,85,247,0.35)', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 11 }}>🎙</Text>
                        <Text style={{ color: '#a855f7', fontSize: 11, fontWeight: '700' }}>Collab ft. {post.collaboratorName}</Text>
                      </View>
                    </View>
                  )}
                  <Text style={styles.soundTitle}>{post.title}</Text>
                  {post.description && (
                    <Text style={styles.soundDescription}>{post.description}</Text>
                  )}

                  {/* Player */}
                  <View style={styles.player}>
                    <TouchableOpacity
                      style={styles.playButton}
                      onPress={() => handlePlay(post)}
                    >
                      <Text style={styles.playButtonIcon}>
                        {playingId === post.id ? '⏸' : '▶️'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.progressBar}>
                      <View 
  style={[
    styles.progressFill, 
    { width: playingId === post.id ? `${playProgress}%` : '0%' }  // ✅ NUOVO
  ]} 
/>
                    </View>
                    <Text style={styles.duration}>
                      {playingId === post.id ? `${playPosition}s / ` : ''}{post.duration}s
                    </Text>
                  </View>

                  {/* Backstage button */}
                  {post.backstageUrl && (
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        alignSelf: 'flex-start', marginTop: 8, marginBottom: 4,
                        paddingHorizontal: 12, paddingVertical: 6,
                        borderRadius: 20, borderWidth: 1,
                        borderColor: 'rgba(0,255,156,0.3)',
                        backgroundColor: 'rgba(0,255,156,0.07)',
                      }}
                      onPress={() => {
                        setBackstageViewerUrl(post.backstageUrl);
                        setBackstageViewerTipo(post.backstageTipo || 'foto');
                        setBackstageViewerTitle(post.title);
                        setShowBackstageViewer(true);
                      }}
                    >
                      <Feather name="video" size={13} color="#00FF9C" />
                      <Text style={{ color: '#00FF9C', fontSize: 11, fontFamily: 'monospace', letterSpacing: 0.5 }}>
                        backstage
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Actions */}
                  <View style={styles.actions}>
                    <View style={styles.actionsLeft}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleLike(post.id)}
                      >
                        <Text style={styles.actionIcon}>
                          {likedSounds.has(post.id) ? '❤️' : '🤍'}
                        </Text>
                        <Text style={styles.actionText}>{post.likes}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => openCommentsModal(post.id)}
                      >
                        <Text style={styles.actionIcon}>💬</Text>
                        <Text style={styles.actionText}>{post.comments}</Text>
                      </TouchableOpacity>
                      <View style={styles.actionButton}>
                        <Text style={styles.actionIcon}>🎧</Text>
                        <Text style={styles.actionText}>{post.listens}</Text>
                      </View>
                    </View>
                    {post.userId === auth.currentUser?.uid && (
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDelete(post.id)}
                      >
                        <Text style={styles.deleteButtonText}>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            ))}

            {filteredPosts.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyText}>{t('home.noSoundsFound')}</Text>
              </View>
            )}
          </View>
        )}

    {activeTab === 'profile' && (
  <View style={styles.content}>
    {/* Profile Card */}
    <View style={styles.profileCard}>
      <AppAvatar avatar={userProfile?.avatar} username={userProfile?.username} size={80} />
      <Text style={styles.profileName}>{userProfile?.username || t('profile.defaultName')}</Text>
      <Text style={styles.profileUsername}>@{userProfile?.username || 'user'}</Text>

      <View style={styles.profileStats}>
  <View style={styles.profileStat}>
    <Text style={styles.profileStatNumber}>{mySounds.length}</Text>
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
              style={[styles.profileButtonPrimary, { backgroundColor: '#334155' }, loadingFriend && { opacity: 0.5 }]}
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
            style={[styles.profileButtonPrimary, { flex: 1, backgroundColor: '#334155' }]}
            onPress={() => Alert.alert(t('common.info'), t('profile.featureComingSoon'))}
          >
            <Text style={styles.profileButtonPrimaryText}>{t('profile.share')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>

    {/* My Recordings */}
    <View style={styles.recordingsSection}>
      <Text style={styles.sectionTitle}>{t('profile.mySounds', { count: mySounds.length })}</Text>
      {mySounds.length === 0 ? (
        <View style={styles.emptyRecordings}>
          <Text style={styles.emptyIcon}>🎤</Text>
          <Text style={styles.emptyText}>{t('profile.noRecordings')}</Text>
          <Text style={styles.emptySubtext}>{t('profile.noRecordingsHint')}</Text>
        </View>
      ) : (
        mySounds.map(rec => (
          <View key={rec.id} style={styles.recordingItem}>
            <View style={styles.recordingInfo}>
              <Text style={styles.recordingTitle}>{rec.title}</Text>
              <Text style={styles.recordingMeta}>
                {rec.duration}s · {timeAgo(rec.createdAt)} · ❤️ {rec.likes}
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
              <TouchableOpacity
                style={styles.recordingDeleteButton}
                onPress={() => handleDelete(rec.id)}
              >
                <Text style={styles.recordingDeleteIcon}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>

    {/* 🎛️ SEZIONE REMIX - DEVE STARE QUI DENTRO! */}
    <RemixProfileSection 
      onOpenRemixStudio={() => {
        setShowRemixStudio(true);
        setActiveTab('remix');
      }}
    />
  </View>
)}

{/* 🎛️ TAB REMIX - DEVE STARE QUI FUORI, ALLO STESSO LIVELLO! */}
{activeTab === 'remix' && (
  <View style={styles.content}>
    {loadingRemixSounds ? (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#06b6d4" />
        <Text style={styles.loadingText}>{t('home.loadingSounds')}</Text>
      </View>
    ) : (
      <RemixScreen 
        availableSounds={remixSounds}
        onClose={() => setActiveTab('profile')}
      />
    )}
  </View>
)}

      </ScrollView>}

      {/* Schermate full-screen — occupano tutto lo spazio disponibile sopra il nav bar */}
      {isFullScreen && (
        <View style={[styles.fullScreenContainer, { paddingBottom: navBarHeight }]}>
          {activeTab === 'communities' && <CommunitiesScreen />}
          {activeTab === 'map' && <MapScreen />}
          {activeTab === 'timemachine' && <TimeMachineScreen />}
          {activeTab === 'challenges' && <ChallengesScreen />}
          {activeTab === 'explore' && <ExploreScreen />}
          {activeTab === 'messages' && (
            <MessagesScreen
              initialChat={pendingChat}
              key={pendingChat?.userId ?? 'messages'}
              onViewProfile={openUserProfile}
            />
          )}
        </View>
      )}


      {/* Bottom Navigation — componente professionale senza emoji */}
      <BottomNavBar
        activeTab={activeTab as any}
        onTabChange={async (tab) => {
          setActiveTab(tab);
          if (tab === 'profile') {
            const me = auth.currentUser;
            if (me) {
              const myProfile = await getUserProfile(me.uid);
              setUserProfile(myProfile);
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
                    { backgroundColor: newSoundMood === mood ? getMoodColor(mood) : '#334155' },
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
          !selectedChallengeForSubmit && { backgroundColor: '#334155' }
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
              backgroundColor: '#0891b2',
              borderWidth: 2,
              borderColor: '#06b6d4'
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
                    <Text style={{ color: '#ef4444', fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1, padding: 12, borderRadius: 10,
                      backgroundColor: '#1e293b',
                      borderWidth: 1, borderColor: '#334155',
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
                      backgroundColor: '#1e293b',
                      borderWidth: 1, borderColor: '#334155',
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
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {[
              { icon: '🎤', label: t('upload.typeSound'), sub: t('upload.typeSoundDesc'), action: () => { setShowPublishTypeModal(false); startRecording(); } },
              { icon: '🎙', label: t('upload.typePodcast'), sub: t('upload.typePodcastDesc'), action: () => { setShowPublishTypeModal(false); setActiveTab('explore'); } },
              { icon: '📻', label: t('upload.typeRadio'), sub: t('upload.typeRadioDesc'), action: () => { setShowPublishTypeModal(false); setActiveTab('explore'); } },
            ].map(({ icon, label, sub, action }) => (
              <TouchableOpacity
                key={label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', marginBottom: 10 }}
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
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {pendingFriendRequests.length === 0 ? (
                <Text style={{ color: '#94a3b8', textAlign: 'center', padding: 24, fontFamily: 'monospace' }}>
                  {t('profile.noPendingRequests')}
                </Text>
              ) : (
                pendingFriendRequests.map((req) => (
                  <View key={req.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' }}>
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
                <Text style={styles.modalClose}>✕</Text>
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
                  <Text style={[styles.settingsItemText, { color: '#06b6d4' }]}>
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
                      <Text style={{ fontSize: 22, color: '#10b981' }}>✓</Text>
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
                        <Text style={styles.modalClose}>✕</Text>
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
                            borderColor: reportReason === key ? '#06b6d4' : 'rgba(255,255,255,0.1)',
                            backgroundColor: reportReason === key ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.05)',
                          }}
                          onPress={() => setReportReason(key)}
                        >
                          <Text style={{ color: reportReason === key ? '#06b6d4' : '#8A8D96', fontSize: 13 }}>{label}</Text>
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
                      style={{ backgroundColor: reportReason ? '#06b6d4' : 'rgba(6,182,212,0.3)', padding: 13, borderRadius: 10, alignItems: 'center' }}
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
                <Text style={{ fontSize: 32, marginBottom: 12 }}>🗑️</Text>
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
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Comments List */}
            {loadingComments ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#06b6d4" />
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
                              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 16, paddingLeft: 8 }}>✕</Text>
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
          <Text style={styles.modalClose}>✕</Text>
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
              <Feather name={icon as any} size={20} color={editAvatar === icon ? '#06b6d4' : '#94a3b8'} />
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
                backgroundColor: '#0f172a',
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
                  <Text style={styles.modalClose}>✕</Text>
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
                        !notif.read && { backgroundColor: '#1e293b', borderColor: '#00FF9C', borderLeftWidth: 4 }
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
          <Text style={styles.modalClose}>✕</Text>
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
          <Text style={styles.modalClose}>✕</Text>
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
          <View style={{ backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(249,115,22,0.3)' }}>
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
            <View style={{ backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(168,85,247,0.4)' }}>
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
            <View style={{ backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(249,115,22,0.4)' }}>
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
    backgroundColor: '#0f172a',
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
    padding: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    fontSize: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  premiumBadge: {
    fontSize: 14,
  },
  headerSubtitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  liveIndicator: {
    fontSize: 8,
    color: '#ef4444',
  },
  subtitleText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  streakText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 16,
  },
  recordCard: {
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  recordIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  recordButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  recordButtonActive: {
    backgroundColor: '#ef4444',
  },
  recordButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0891b2',
  },
  recordHint: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.7,
    marginTop: 8,
  },
  searchContainer: {
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterScroll: {
    marginBottom: 16,
  },
  filterChip: {
    backgroundColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#0891b2',
  },
  filterChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  soundCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  soundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  soundUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0891b2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  soundLocation: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  moodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  moodText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  soundContent: {
    padding: 12,
  },
  soundTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  soundDescription: {
    fontSize: 13,
    color: '#cbd5e1',
    marginBottom: 12,
  },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0891b2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonIcon: {
    fontSize: 16,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#06b6d4',
  },
  duration: {
    fontSize: 12,
    color: '#94a3b8',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  actionsLeft: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIcon: {
    fontSize: 14,
  },
  actionText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  deleteButton: {
    backgroundColor: '#334155',
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
  },
  profileCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0891b2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileAvatarText: {
    fontSize: 32,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
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
    fontWeight: '700',
    color: '#06b6d4',
  },
  profileStatLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  profileButtonPrimary: {
    width: '100%',
    backgroundColor: '#0891b2',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  profileButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
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
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  recordingItem: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#0891b2',
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
    backgroundColor: '#334155',
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
    backgroundColor: '#0891b2',
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
    backgroundColor: '#1e293b',
    borderRadius: 24,
    width: '100%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
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
    backgroundColor: '#334155',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingsItemText: {
    fontSize: 14,
    color: '#fff',
  },
  recordModal: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#334155',
  },
  recordModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#334155',
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
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  recordModalInfoText: {
    fontSize: 13,
    color: '#06b6d4',
    fontWeight: '600',
  },
  recordModalButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  recordModalButtonCancel: {
    flex: 1,
    backgroundColor: '#334155',
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
    backgroundColor: '#0891b2',
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
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
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
    borderTopColor: '#334155',
    gap: 12,
    backgroundColor: '#1e293b',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#334155',
  },
  commentSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#06b6d4',
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
  backgroundColor: '#0f172a',
  justifyContent: 'center',
  alignItems: 'center',
  borderWidth: 2,
  borderColor: '#334155',
},
avatarOptionSelected: {
  borderColor: '#06b6d4',
  backgroundColor: '#1e293b',
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
  borderColor: '#0f172a',
},
notificationBadgeText: {
  color: '#fff',
  fontSize: 10,
  fontWeight: '700',
},
notificationItem: {
  backgroundColor: '#0f172a',
  borderRadius: 12,
  padding: 14,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: '#334155',
},
notificationItemUnread: {
  backgroundColor: '#1e293b',
  borderColor: '#06b6d4',
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
  backgroundColor: '#334155',
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
  backgroundColor: '#0f172a',
  borderRadius: 12,
  marginBottom: 8,
  borderWidth: 1,
  borderColor: '#334155',
},


});  // ⬅️ CHIUDI QUI
