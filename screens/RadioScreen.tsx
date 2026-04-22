import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text, TextInput,
    TouchableOpacity,
    View,
    AppState,
} from 'react-native';
// ── React Native Track Player — import robusto per Old Arch Android ────────────
// Il check manuale su NativeModules può fallire su Android Old Arch se il modulo
// non è ancora stato registrato al momento dell'esecuzione del modulo JS.
// Usiamo un try/catch diretto che è più affidabile.
let TrackPlayer: any = null;
let Event: any = {};
let State: any = {};
let Capability: any = {};
let AppKilledPlaybackBehavior: any = {};
try {
  const rntp = require('react-native-track-player');
  const rntpDefault = rntp.default;
  if (rntpDefault) {
    TrackPlayer = rntpDefault;
    ({ Event, State, Capability, AppKilledPlaybackBehavior } = rntp);
  }
} catch (_e) {
  // RNTP non disponibile (web o build senza native module)
}

import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidPriority } from 'expo-notifications';
import { auth, db } from '../firebaseConfig';

// Configura come gestire le notifiche quando l'app è aperta
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
import {
    destroyAgoraEngine,
    downgradeToAudience,
    fetchAgoraToken,
    joinAsAudience,
    joinAsHost,
    leaveAgoraChannel,
    refreshSpeakerphone,
    setMicActive, upgradeToSpeaker,
} from '../services/agoraService';
import {
    addCohost,
    approveSuggestion,
    ChatMessage,
    createRadioRoom,
    dismissPick,
    endRadioRoom,
    extendGap,
    fetchUserSoundsForSuggestion,
    grantSpeaker,
    HandRaise,
    hostHeartbeat,
    joinRadioRoom, leaveRadioRoom,
    listenToChat,
    listenToHandRaises,
    listenToLiveRooms,
    listenToMyHandRaise,
    listenToReactions,
    listenToRoom,
    listenToScheduledRooms,
    listenToSuggestions,
    lowerHand,
    pickListener,
    PlaylistTrack,
    RadioRoom,
    raiseHand,
    rejectSuggestion,
    removeCohost,
    reorderPlaylist,
    revokeSpeaker,
    scheduleRadioRoom,
    sendChatMessage, sendReaction,
    setHostMicLive,
    skipToNextTrack,
    startScheduledRoom,
    Suggestion,
    suggestTrack,
    uploadTrack,
    UserSound
} from '../services/radioService';
const M2O_CHART_URI: string = Image.resolveAssetSource(require('../assets/m2o-chart.jpg')).uri;

const SW = Dimensions.get('window').width;
const SH = Dimensions.get('window').height;
// scale: 1.0 on a 360px-wide screen, smaller on narrower, larger on wider (capped)
const scale = Math.min(Math.max(SW / 390, 0.78), 1.0);

// ─── Tipi locali ──────────────────────────────────────────────────────────────
interface LocalTrack {
  uri: string;       // locale, prima dell'upload
  url?: string;      // dopo upload
  name: string;
  duration?: number; // secondi, rilevata da expo-av
  gapAfter: number;  // secondi di pausa dopo questa traccia
  uploaded: boolean;
}

const GAP_OPTIONS = [0, 3, 5, 10, 15, 30, 60];
const REACTION_EMOJIS = ['❤️', '🔥', '🎵', '🎧'];

// ─── Stazioni radio offline ────────────────────────────────────────────────────
interface OfflineStation {
  id: string;
  name: string;
  genre: string;
  color: string;
  searchName: string; // nome usato per cercare su radio-browser.info
  logoUrl: string;   // logo stazione per le card preview
}

interface NowPlayingInfo {
  djName: string;
  showName?: string;
  djImageUrl?: string;
}

const OFFLINE_STATIONS: OfflineStation[] = [
  { id: 'rtl',        name: 'RTL 102.5',    genre: 'Pop · Hit',           color: '#E91E63', searchName: 'RTL 102.5',          logoUrl: 'https://www.google.com/s2/favicons?domain=rtl.it&sz=128' },
  { id: 'r105',       name: 'Radio 105',    genre: 'Rock · Pop',          color: '#FF5722', searchName: 'Radio 105',           logoUrl: 'https://www.google.com/s2/favicons?domain=105.net&sz=128' },
  { id: 'deejay',     name: 'Radio DeeJay', genre: 'Dance · Electronic',  color: '#FF9800', searchName: 'Radio DeeJay',        logoUrl: 'https://www.google.com/s2/favicons?domain=deejay.it&sz=128' },
  { id: 'radioitalia',name: 'Radio Italia', genre: 'Musica Italiana',     color: '#4CAF50', searchName: 'Radio Italia',        logoUrl: 'https://www.google.com/s2/favicons?domain=radioitalia.it&sz=128' },
  { id: 'rds',        name: 'RDS',          genre: 'Pop · News',          color: '#2196F3', searchName: 'RDS',                 logoUrl: 'https://www.google.com/s2/favicons?domain=rds.it&sz=128' },
  { id: 'virgin',     name: 'Virgin Radio', genre: 'Rock · Alternative',  color: '#9C27B0', searchName: 'Virgin Radio Italy',  logoUrl: 'https://www.google.com/s2/favicons?domain=virginradio.it&sz=128' },
  { id: 'm2o',        name: 'm2o',          genre: 'Dance · House',       color: '#00BCD4', searchName: 'm2o',                 logoUrl: 'https://www.google.com/s2/favicons?domain=m2o.it&sz=128' },
  { id: 'capital',    name: 'Radio Capital',genre: 'Pop · Hits',          color: '#F44336', searchName: 'Radio Capital',       logoUrl: 'https://www.google.com/s2/favicons?domain=capital.it&sz=128' },
];

// URL hardcoded di fallback (aggiornati aprile 2026) — usati quando radio-browser.info non è raggiungibile
const FALLBACK_STREAM_URLS: Record<string, string> = {
  'RTL 102.5':        'https://streamingv2.shoutcast.com/rtl-1025',
  'Radio 105':        'https://icecast.unitedradio.it/Radio105.mp3',
  'Radio DeeJay':     'https://icecast.unitedradio.it/Deejay.mp3',
  'Radio Italia':     'https://icecast.unitedradio.it/RadioItalia.mp3',
  'RDS':              'https://icecast.unitedradio.it/RDS.mp3',
  'Virgin Radio Italy': 'https://icecast.unitedradio.it/VirginRadio.mp3',
  'm2o':              'https://icecast.unitedradio.it/m2o.mp3',
  'Radio Capital':    'https://icecast.unitedradio.it/Capital.mp3',
};

// ─── Palinsesto static schedules ──────────────────────────────────────────────
interface ScheduleSlot {
  startHour: number;
  startMin?: number;   // minuti di inizio (default 0)
  endHour: number;
  endMin?: number;     // minuti di fine (default 0)
  djName: string;
  showName: string;
  djPhotoUrl?: string; // URL foto DJ — fallback alle iniziali se mancante/rotto
}

const STATION_SCHEDULES: Record<string, { weekday: ScheduleSlot[]; saturday: ScheduleSlot[]; sunday: ScheduleSlot[] }> = {
  rtl: {
    weekday: [
      { startHour: 0,  endHour: 6,  djName: 'RTL 102.5',           showName: 'Non Stop News' },
      { startHour: 6,  endHour: 9,  djName: 'Francesco Fredella',   showName: 'W l\'Italia' },
      { startHour: 9,  endHour: 12, djName: 'Fulvio Giuliani',      showName: 'Good Vibrations' },
      { startHour: 12, endHour: 15, djName: 'Cecilia Songini',      showName: 'Rock Morning' },
      { startHour: 15, endHour: 18, djName: 'Gianni Simioli',       showName: 'Electric Ladyland' },
      { startHour: 18, endHour: 21, djName: 'Antonio Sica',         showName: 'Destinazione Zeta' },
      { startHour: 21, endHour: 24, djName: 'Francesco Taranto',    showName: 'Molo 17' },
    ],
    saturday: [
      { startHour: 0,  endHour: 6,  djName: 'RTL 102.5',           showName: 'Non Stop News' },
      { startHour: 6,  endHour: 12, djName: 'Nicoletta Deponti',    showName: 'Good Vibrations Weekend' },
      { startHour: 12, endHour: 18, djName: 'RTL 102.5',            showName: 'RTL Weekend' },
      { startHour: 18, endHour: 24, djName: 'RTL 102.5',            showName: 'Non Stop News' },
    ],
    sunday: [
      { startHour: 0,  endHour: 6,  djName: 'RTL 102.5',           showName: 'Non Stop News' },
      { startHour: 6,  endHour: 12, djName: 'Nicoletta Deponti',    showName: 'Good Vibrations Weekend' },
      { startHour: 12, endHour: 18, djName: 'RTL 102.5',            showName: 'RTL Weekend' },
      { startHour: 18, endHour: 24, djName: 'RTL 102.5',            showName: 'Non Stop News' },
    ],
  },
  r105: {
    weekday: [
      { startHour: 0,  endHour: 6,  djName: 'Radio 105',           showName: '105 Night' },
      { startHour: 6,  endHour: 10, djName: 'Radio 105',            showName: '105 Morning Show' },
      { startHour: 10, endHour: 14, djName: 'Radio 105',            showName: '105 Midi' },
      { startHour: 14, endHour: 19, djName: 'Radio 105',            showName: '105 Drive' },
      { startHour: 19, endHour: 24, djName: 'Radio 105',            showName: '105 Night' },
    ],
    saturday: [
      { startHour: 0,  endHour: 6,  djName: 'Radio 105',           showName: '105 Night' },
      { startHour: 6,  endHour: 12, djName: 'Radio 105',            showName: '105 Weekend Morning' },
      { startHour: 12, endHour: 18, djName: 'Radio 105',            showName: '105 Weekend' },
      { startHour: 18, endHour: 24, djName: 'Radio 105',            showName: '105 Night' },
    ],
    sunday: [
      { startHour: 0,  endHour: 6,  djName: 'Radio 105',           showName: '105 Night' },
      { startHour: 6,  endHour: 12, djName: 'Radio 105',            showName: '105 Weekend Morning' },
      { startHour: 12, endHour: 18, djName: 'Radio 105',            showName: '105 Weekend' },
      { startHour: 18, endHour: 24, djName: 'Radio 105',            showName: '105 Night' },
    ],
  },
  deejay: {
    weekday: [
      { startHour: 0,  endHour: 1,                            djName: 'Fargetta, Molella e Prezioso',             showName: 'Deejay Time In The Mix' },
      { startHour: 1,  endHour: 6,                            djName: 'Radio DeeJay',                             showName: 'DeeJay Night' },
      { startHour: 6,  startMin: 0,  endHour: 7,  endMin: 30, djName: 'Umberto e Damiano',                        showName: '006' },
      { startHour: 7,  startMin: 30, endHour: 9,              djName: 'Trio Medusa',                              showName: 'Chiamate Roma Triuno Triuno' },
      { startHour: 9,  endHour: 10,                           djName: 'Fabio Volo',                               showName: 'Il Volo del Mattino' },
      { startHour: 10, endHour: 12,                           djName: 'Linus e Nicola Savino',                    showName: 'Deejay Chiama Italia' },
      { startHour: 12, endHour: 13,                           djName: 'Alessandro Cattelan',                      showName: 'Catteland' },
      { startHour: 13, endHour: 14,                           djName: 'Vic e Marisa',                             showName: 'Vic & Mari' },
      { startHour: 14, endHour: 15,                           djName: 'Digei Angelo e Roberto Ferrari',           showName: 'Ciao Belli' },
      { startHour: 15, endHour: 17,                           djName: 'Nikki, Federico Russo e Francesco Quarna', showName: 'Summer Camp' },
      { startHour: 17, endHour: 19,                           djName: 'La Pina, Diego e La Vale',                 showName: 'Pinocchio' },
      { startHour: 19, endHour: 20,                           djName: 'Chiara e Ciccio',                          showName: 'Chiacchiericcio' },
      { startHour: 20, endHour: 21,                           djName: 'Gianluca Gazzoli',                         showName: 'Gazzology' },
      { startHour: 21, startMin: 0,  endHour: 22, endMin: 30, djName: 'Wad',                                      showName: 'Say Waaad?' },
      { startHour: 22, startMin: 30, endHour: 24,             djName: 'Nicola e Gianluca Vitiello',               showName: 'DeeNotte' },
    ],
    friday: [
      { startHour: 0,  endHour: 1,                            djName: 'Fargetta, Molella e Prezioso',             showName: 'Deejay Time In The Mix' },
      { startHour: 1,  endHour: 6,                            djName: 'Radio DeeJay',                             showName: 'DeeJay Night' },
      { startHour: 6,  startMin: 0,  endHour: 7,  endMin: 30, djName: 'Umberto e Damiano',                        showName: '006' },
      { startHour: 7,  startMin: 30, endHour: 9,              djName: 'Trio Medusa',                              showName: 'Chiamate Roma Triuno Triuno' },
      { startHour: 9,  endHour: 10,                           djName: 'Fabio Volo',                               showName: 'Il Volo del Mattino' },
      { startHour: 10, endHour: 12,                           djName: 'Linus e Nicola Savino',                    showName: 'Deejay Chiama Italia' },
      { startHour: 12, endHour: 13,                           djName: 'Alessandro Cattelan',                      showName: 'Catteland' },
      { startHour: 13, endHour: 14,                           djName: 'Vic e Marisa',                             showName: 'Vic & Mari' },
      { startHour: 14, endHour: 15,                           djName: 'Digei Angelo e Roberto Ferrari',           showName: 'Ciao Belli' },
      { startHour: 15, endHour: 17,                           djName: 'Nikki, Federico Russo e Francesco Quarna', showName: 'Summer Camp' },
      { startHour: 17, endHour: 19,                           djName: 'La Pina, Diego e La Vale',                 showName: 'Pinocchio' },
      { startHour: 19, endHour: 20,                           djName: 'Chiara e Ciccio',                          showName: 'Chiacchiericcio' },
      { startHour: 20, endHour: 21,                           djName: 'Gianluca Gazzoli',                         showName: 'Gazzology' },
      { startHour: 21, startMin: 0,  endHour: 22, endMin: 30, djName: 'Wad',                                      showName: 'Say Waaad?' },
      { startHour: 22, startMin: 30, endHour: 24,             djName: 'Radio DeeJay',                             showName: 'Legend' },
    ],
    saturday: [
      { startHour: 0,  endHour: 6,                            djName: 'Radio DeeJay',                             showName: 'DeeJay Night' },
      { startHour: 6,  endHour: 8,                            djName: 'Florencia',                                showName: '¡Hola Deejay!' },
      { startHour: 8,  endHour: 10,                           djName: 'Laura Antonini e Rudy Zerbi',              showName: 'Laura e Rudy' },
      { startHour: 10, endHour: 12,                           djName: 'Vic e Luciana Littizzetto',                showName: 'La Bomba' },
      { startHour: 12, endHour: 13,                           djName: 'Ivan Zazzaroni e Fabio Caressa',           showName: 'Deejay Football Club' },
      { startHour: 13, endHour: 14,                           djName: 'Antonio Visca',                            showName: 'No Spoiler' },
      { startHour: 14, startMin: 0,  endHour: 16, endMin: 30, djName: 'Pecchia e Damiani',                        showName: 'Pecchia e Damiani' },
      { startHour: 16, startMin: 30, endHour: 19,             djName: 'Andy & Mike',                              showName: 'Andy & Mike' },
      { startHour: 19, endHour: 20,                           djName: 'Guido Bagatta',                            showName: 'GB Show' },
      { startHour: 20, endHour: 21,                           djName: 'Francesco Quarna e Carlotta Multari',      showName: 'Radar' },
      { startHour: 21, startMin: 0,  endHour: 21, endMin: 30, djName: 'Annie Mazzola',                            showName: 'Io e Annie' },
      { startHour: 21, startMin: 30, endHour: 23,             djName: 'Albertino',                                showName: 'Deejay Time Stories' },
      { startHour: 23, endHour: 24,                           djName: 'Albertino',                                showName: 'Deejay Parade' },
    ],
    sunday: [
      { startHour: 0,  endHour: 6,                            djName: 'Radio DeeJay',                             showName: 'DeeJay Night' },
      { startHour: 6,  endHour: 8,                            djName: 'Florencia',                                showName: '¡Hola Deejay!' },
      { startHour: 8,  endHour: 10,                           djName: 'Laura Antonini e Rudy Zerbi',              showName: 'Laura e Rudy' },
      { startHour: 10, endHour: 12,                           djName: 'Radio DeeJay',                             showName: 'Deejay Chiama Italia Best' },
      { startHour: 12, endHour: 13,                           djName: 'Linus',                                    showName: 'Deejay Training Center' },
      { startHour: 13, endHour: 14,                           djName: 'Paolo Menegatti e Dunia Rahwan',           showName: 'Animal House' },
      { startHour: 14, startMin: 0,  endHour: 16, endMin: 30, djName: 'Pecchia e Damiani',                        showName: 'Pecchia e Damiani' },
      { startHour: 16, startMin: 30, endHour: 19,             djName: 'Andy & Mike',                              showName: 'Andy & Mike' },
      { startHour: 19, endHour: 20,                           djName: 'Guido Bagatta',                            showName: 'GB Show' },
      { startHour: 20, endHour: 22,                           djName: 'Daniele Bossari',                          showName: 'Il Boss del Weekend' },
      { startHour: 22, endHour: 24,                           djName: 'Frank',                                    showName: 'Deejay On The Road' },
    ],
  },
  radioitalia: {
    weekday: [
      { startHour: 0,  endHour: 6,  djName: 'Radio Italia', showName: 'Musica Italiana Nonstop' },
      { startHour: 6,  endHour: 10, djName: 'Radio Italia', showName: 'Buongiorno Italia' },
      { startHour: 10, endHour: 13, djName: 'Radio Italia', showName: 'Radio Italia Live' },
      { startHour: 13, endHour: 17, djName: 'Radio Italia', showName: 'Pomeriggio Italiano' },
      { startHour: 17, endHour: 21, djName: 'Radio Italia', showName: 'Serata Italiana' },
      { startHour: 21, endHour: 24, djName: 'Radio Italia', showName: 'Musica Italiana Nonstop' },
    ],
    saturday: [
      { startHour: 0,  endHour: 6,  djName: 'Radio Italia', showName: 'Musica Italiana Nonstop' },
      { startHour: 6,  endHour: 14, djName: 'Radio Italia', showName: 'Weekend Italia' },
      { startHour: 14, endHour: 21, djName: 'Radio Italia', showName: 'Pomeriggio Weekend' },
      { startHour: 21, endHour: 24, djName: 'Radio Italia', showName: 'Musica Italiana Nonstop' },
    ],
    sunday: [
      { startHour: 0,  endHour: 6,  djName: 'Radio Italia', showName: 'Musica Italiana Nonstop' },
      { startHour: 6,  endHour: 14, djName: 'Radio Italia', showName: 'Weekend Italia' },
      { startHour: 14, endHour: 21, djName: 'Radio Italia', showName: 'Pomeriggio Weekend' },
      { startHour: 21, endHour: 24, djName: 'Radio Italia', showName: 'Musica Italiana Nonstop' },
    ],
  },
  rds: {
    weekday: [
      { startHour: 0,  endHour: 6,  djName: 'RDS', showName: 'RDS Night' },
      { startHour: 6,  endHour: 10, djName: 'RDS', showName: 'RDS Morning' },
      { startHour: 10, endHour: 14, djName: 'RDS', showName: 'RDS 100% Grandi Successi' },
      { startHour: 14, endHour: 18, djName: 'RDS', showName: 'RDS Drive' },
      { startHour: 18, endHour: 22, djName: 'RDS', showName: 'RDS Serata' },
      { startHour: 22, endHour: 24, djName: 'RDS', showName: 'RDS Night' },
    ],
    saturday: [
      { startHour: 0,  endHour: 6,  djName: 'RDS', showName: 'RDS Night' },
      { startHour: 6,  endHour: 14, djName: 'RDS', showName: 'RDS Weekend' },
      { startHour: 14, endHour: 22, djName: 'RDS', showName: 'RDS Weekend' },
      { startHour: 22, endHour: 24, djName: 'RDS', showName: 'RDS Night' },
    ],
    sunday: [
      { startHour: 0,  endHour: 6,  djName: 'RDS', showName: 'RDS Night' },
      { startHour: 6,  endHour: 14, djName: 'RDS', showName: 'RDS Weekend' },
      { startHour: 14, endHour: 22, djName: 'RDS', showName: 'RDS Weekend' },
      { startHour: 22, endHour: 24, djName: 'RDS', showName: 'RDS Night' },
    ],
  },
  virgin: {
    weekday: [
      { startHour: 0,  endHour: 6,  djName: 'Virgin Radio', showName: 'Virgin Night' },
      { startHour: 6,  endHour: 10, djName: 'Virgin Radio', showName: 'Virgin Morning Rock' },
      { startHour: 10, endHour: 14, djName: 'Virgin Radio', showName: 'Rock Midday' },
      { startHour: 14, endHour: 18, djName: 'Virgin Radio', showName: 'Rock Drive' },
      { startHour: 18, endHour: 22, djName: 'Virgin Radio', showName: 'Rock Evening' },
      { startHour: 22, endHour: 24, djName: 'Virgin Radio', showName: 'Virgin Night' },
    ],
    saturday: [
      { startHour: 0,  endHour: 6,  djName: 'Virgin Radio', showName: 'Virgin Night' },
      { startHour: 6,  endHour: 14, djName: 'Virgin Radio', showName: 'Virgin Weekend Rock' },
      { startHour: 14, endHour: 22, djName: 'Virgin Radio', showName: 'Rock Weekend' },
      { startHour: 22, endHour: 24, djName: 'Virgin Radio', showName: 'Virgin Night' },
    ],
    sunday: [
      { startHour: 0,  endHour: 6,  djName: 'Virgin Radio', showName: 'Virgin Night' },
      { startHour: 6,  endHour: 14, djName: 'Virgin Radio', showName: 'Virgin Weekend Rock' },
      { startHour: 14, endHour: 22, djName: 'Virgin Radio', showName: 'Rock Weekend' },
      { startHour: 22, endHour: 24, djName: 'Virgin Radio', showName: 'Virgin Night' },
    ],
  },
  m2o: {
    weekday: [
      { startHour: 0,  endHour: 1,  djName: 'Fargetta, Molella e Prezioso',           showName: 'Deejay Time in the Mix' },
      { startHour: 1,  endHour: 3,  djName: 'm2o',                                    showName: 'Dance With Us' },
      { startHour: 3,  endHour: 4,  djName: 'm2o',                                    showName: 'm2o Playlist' },
      { startHour: 4,  endHour: 6,  djName: 'Albertino',                              showName: 'Albertino Everyday',             djPhotoUrl: 'https://cdn.gelestatic.it/m2o/sites/2/2023/03/ALBERTINO-EVERYDAY-ON-AIR-1-1-e1677688343132-320x167.jpeg' },
      { startHour: 6,  endHour: 9,  djName: 'Walter Pizzulli',                        showName: 'Il Morning Show di m2o' },
      { startHour: 9,  endHour: 12, djName: 'Davide Rizzi',                           showName: 'Davide Rizzi' },
      { startHour: 12, endHour: 14, djName: 'Marlen',                                 showName: 'Marlen' },
      { startHour: 14, endHour: 17, djName: 'Ilario',                                 showName: 'Ilario' },
      { startHour: 17, endHour: 19, djName: 'Albertino',                              showName: 'Albertino Everyday',             djPhotoUrl: 'https://cdn.gelestatic.it/m2o/sites/2/2023/03/ALBERTINO-EVERYDAY-ON-AIR-1-1-e1677688343132-320x167.jpeg' },
      { startHour: 19, endHour: 21, djName: 'Andrea Mattei',                          showName: 'Andrea Mattei' },
      { startHour: 21, endHour: 23, djName: 'Vittoria Hyde',                          showName: 'Vittoria Hyde' },
      { startHour: 23, endHour: 24, djName: 'Val S',                                  showName: 'One Two One Two Selecta con Val S' },
    ],
    friday: [
      { startHour: 0,  endHour: 1,  djName: 'Fargetta, Molella e Prezioso',           showName: 'Deejay Time in the Mix' },
      { startHour: 1,  endHour: 3,  djName: 'm2o',                                    showName: 'Dance With Us' },
      { startHour: 3,  endHour: 4,  djName: 'm2o',                                    showName: 'm2o Playlist' },
      { startHour: 4,  endHour: 6,  djName: 'Albertino',                              showName: 'Albertino Everyday',             djPhotoUrl: 'https://cdn.gelestatic.it/m2o/sites/2/2023/03/ALBERTINO-EVERYDAY-ON-AIR-1-1-e1677688343132-320x167.jpeg' },
      { startHour: 6,  endHour: 9,  djName: 'Walter Pizzulli',                        showName: 'Il Morning Show di m2o' },
      { startHour: 9,  endHour: 12, djName: 'Davide Rizzi',                           showName: 'Davide Rizzi' },
      { startHour: 12, endHour: 14, djName: 'Marlen',                                 showName: 'Marlen' },
      { startHour: 14, endHour: 17, djName: 'Ilario',                                 showName: 'Ilario' },
      { startHour: 17, endHour: 19, djName: 'Albertino',                              showName: 'Albertino Everyday',             djPhotoUrl: 'https://cdn.gelestatic.it/m2o/sites/2/2023/03/ALBERTINO-EVERYDAY-ON-AIR-1-1-e1677688343132-320x167.jpeg' },
      { startHour: 19, endHour: 21, djName: 'Andrea Mattei',                          showName: 'Andrea Mattei' },
      { startHour: 21, endHour: 23, djName: 'Vittoria Hyde',                          showName: 'Vittoria Hyde' },
      { startHour: 23, endHour: 24, djName: 'Albertino',                              showName: 'Dance Revolution con Albertino' },
    ],
    saturday: [
      { startHour: 0,  endHour: 6,  djName: 'm2o',                                    showName: 'Dance With Us' },
      { startHour: 6,  endHour: 9,  djName: 'Isabella',                               showName: 'Isabella' },
      { startHour: 9,  endHour: 12, djName: 'Patrizia Prinzivalli',                   showName: 'Patrizia Prinzivalli' },
      { startHour: 12, endHour: 14, djName: 'Giorgio Dazzi',                          showName: 'Giorgio Dazzi' },
      { startHour: 14, endHour: 15, djName: 'Albertino, Fargetta, Molella e Prezioso', showName: 'Deejay Time' },
      { startHour: 15, endHour: 19, djName: 'Claves',                                 showName: 'Claves' },
      { startHour: 19, endHour: 21, djName: 'Wad',                                    showName: 'One Two One Two con Wad' },
      { startHour: 21, endHour: 22, djName: 'Ilario',                                 showName: 'm2o Chart con Ilario',          djPhotoUrl: M2O_CHART_URI },
      { startHour: 22, endHour: 23, djName: 'DJ Shorty',                              showName: 'La Mezcla con Shorty' },
      { startHour: 23, endHour: 24, djName: 'Albertino',                              showName: 'Deejay Parade',    djPhotoUrl: 'https://cdn.gelestatic.it/m2o/sites/2/2023/03/DEEJAY-PARADE-ON-AIR-1-e1684832568983-320x167.jpg' },
    ],
    sunday: [
      { startHour: 0,  endHour: 6,  djName: 'm2o',                                    showName: 'Dance With Us' },
      { startHour: 6,  endHour: 9,  djName: 'Isabella',                               showName: 'Isabella' },
      { startHour: 9,  endHour: 12, djName: 'Patrizia Prinzivalli',                   showName: 'Patrizia Prinzivalli' },
      { startHour: 12, endHour: 15, djName: 'Giorgio Dazzi',                          showName: 'Giorgio Dazzi' },
      { startHour: 15, endHour: 18, djName: 'Claves',                                 showName: 'Claves' },
      { startHour: 18, endHour: 19, djName: 'Albertino, Fargetta, Molella e Prezioso', showName: 'Deejay Time' },
      { startHour: 19, endHour: 21, djName: 'Wad',                                    showName: 'One Two One Two con Wad' },
      { startHour: 21, endHour: 22, djName: 'Vittoria Hyde',                          showName: 'Vittoria Hyde' },
      { startHour: 22, endHour: 24, djName: 'Ale Lippi',                              showName: 'Discoball con Ale Lippi' },
    ],
  },
  capital: {
    weekday: [
      { startHour: 0,  endHour: 6,  djName: 'Radio Capital',                                      showName: 'Capital Night' },
      { startHour: 6,  endHour: 7,  djName: 'Marco Maisano',                                      showName: 'Buongiorno Capital' },
      { startHour: 7,  endHour: 10, djName: 'Andrea Lucatello, Riccardo Quadrano e Imma Baccelliere', showName: 'The Breakfast Club' },
      { startHour: 10, endHour: 12, djName: 'Stefano Meloccaro e Benny',                          showName: 'Il Mezzogiornale' },
      { startHour: 12, endHour: 14, djName: 'Flavia Cercato',                                     showName: 'Fattore C' },
      { startHour: 14, endHour: 16, djName: 'Mixo e Luca De Gennaro',                             showName: 'Capital Records' },
      { startHour: 16, endHour: 18, djName: 'Marco Biondi',                                       showName: 'Marco Biondi' },
      { startHour: 18, endHour: 20, djName: 'Edoardo Buffoni e Doris Zaccone',                    showName: 'Tg Zero' },
      { startHour: 20, endHour: 22, djName: 'Massimo Oldani',                                     showName: 'Vibe' },
      { startHour: 22, endHour: 24, djName: 'Alessio Bertallot',                                  showName: 'B-Side' },
    ],
    saturday: [
      { startHour: 0,  endHour: 7,  djName: 'Radio Capital',                              showName: 'Capital Night' },
      { startHour: 7,  endHour: 10, djName: 'Camilla Fraschini e Francesco Martinelli',   showName: 'WEECAP' },
      { startHour: 10, endHour: 20, djName: 'Radio Capital',                              showName: 'Capital Weekend' },
      { startHour: 20, endHour: 22, djName: 'Irene Lamedica',                             showName: 'Soulsista' },
      { startHour: 22, endHour: 24, djName: 'Andrea Prezioso',                            showName: 'Capital Party' },
    ],
    sunday: [
      { startHour: 0,  endHour: 7,  djName: 'Radio Capital',                              showName: 'Capital Night' },
      { startHour: 7,  endHour: 10, djName: 'Camilla Fraschini e Francesco Martinelli',   showName: 'WEECAP' },
      { startHour: 10, endHour: 22, djName: 'Radio Capital',                              showName: 'Capital Weekend' },
      { startHour: 22, endHour: 24, djName: 'Gianluca Costella',                          showName: 'Funky Town' },
    ],
  },
};

function getScheduleSlots(stationId: string, day?: number): ScheduleSlot[] {
  const d = day ?? new Date().getDay(); // 0=Dom, 6=Sab, 5=Ven
  const s = STATION_SCHEDULES[stationId] as any;
  if (!s) return [];
  if (d === 6) return s.saturday ?? s.weekday;
  if (d === 0) return s.sunday ?? s.saturday ?? s.weekday;
  if (d === 5) return s.friday ?? s.weekday;
  return s.weekday;
}

// Foto DJ — URL reali dal CDN GEDI (cdn.gelestatic.it) e RTL (cloud.rtl.it)
const DJ_PHOTOS: Record<string, string> = {
  // ── m2o (cdn.gelestatic.it/m2o) ──────────────────────────────────────────────
  'Albertino':          'https://cdn.gelestatic.it/m2o/sites/2/2023/03/ALBERTINO-DANCE-REVOLUTION-1-e1677684956836-320x320.jpg',
  'Ilario':             'https://cdn.gelestatic.it/m2o/sites/2/2023/03/ILARIO-ON-AIR-e1677684200337-320x320.jpg',
  'Walter Pizzulli':    'https://cdn.gelestatic.it/m2o/sites/2/2025/03/Walter-1-dimensioni-grandi1-e1742915278305-320x320.jpeg',
  'Davide Rizzi':       'https://cdn.gelestatic.it/m2o/sites/2/2023/03/DAVIDE-RIZZI-ON-AIR-e1677685183782-320x320.jpg',
  'Marlen':             'https://cdn.gelestatic.it/m2o/sites/2/2023/03/MARLEN-PIZZO-ON-AIR-1-e1677692071673-320x320.jpg',
  'Andrea Mattei':      'https://cdn.gelestatic.it/m2o/sites/2/2023/03/ANDREA-MATTEI-ON-AIR-e1677684258905-320x320.jpg',
  'Vittoria Hyde':      'https://cdn.gelestatic.it/m2o/sites/2/2020/09/VITTORIA-ON-AIR-320x320.jpg',
  'Val S':              'https://cdn.gelestatic.it/m2o/sites/2/2023/03/VALS-ON-AIR-1-e1677691297367-320x167.jpg',
  'Isabella':           'https://cdn.gelestatic.it/m2o/sites/2/2023/10/24173658/ISABELLA-QUADRATO-320x320.jpg',
  'Patrizia Prinzivalli': 'https://cdn.gelestatic.it/m2o/sites/2/2023/09/27181135/PRINZIVALLI-QUADRATO-320x320.jpg',
  'Giorgio Dazzi':      'https://cdn.gelestatic.it/m2o/sites/2/2024/05/01163448/GIORGIO-DAZZI-QUADRATO-320x320.jpg',
  'Claves':             'https://cdn.gelestatic.it/m2o/sites/2/2023/09/27180746/CLAVES-QUADRATO-320x320.jpg',
  'DJ Shorty':          'https://cdn.gelestatic.it/m2o/sites/2/2023/03/SHORTY-LA-MEZCLA-2-320x167.jpg',
  'Wad':                'https://cdn.gelestatic.it/m2o/sites/2/2023/03/WAD-ONE-TWO-ONE-TWO-e1684832666822-320x167.jpg',
  'Ale Lippi':          'https://cdn.gelestatic.it/m2o/sites/2/2023/03/ALE-LIPPI-ON-AIR-1-e1677689592320-320x167.jpg',
  'Albertino, Fargetta, Molella e Prezioso': 'https://cdn.gelestatic.it/m2o/sites/2/2023/03/DEEJAY-TIME-1-320x167.jpg',
  'Fargetta, Molella e Prezioso':            'https://cdn.gelestatic.it/m2o/sites/2/2023/03/DEEJAY-TIME-1-320x167.jpg',
  // ── Radio DeeJay (cdn.gelestatic.it/deejay) ──────────────────────────────────
  'Linus e Nicola Savino':   'https://cdn.gelestatic.it/deejay/sites/2/2020/01/linus-320x320.jpg',
  'Linus':                   'https://cdn.gelestatic.it/deejay/sites/2/2020/01/linus-320x320.jpg',
  'Fabio Volo':               'https://cdn.gelestatic.it/deejay/sites/2/2020/07/il-volo-della-sera-COVER-1200x627-320x320.jpg',
  'Alessandro Cattelan':      'https://cdn.gelestatic.it/deejay/sites/2/2023/07/DEEJAY_CATTELAND-conduttore-320x320.jpg',
  'Trio Medusa':               'https://cdn.gelestatic.it/deejay/sites/2/2020/01/trio-medusa-320x320.jpg',
  'Wad':                       'https://cdn.gelestatic.it/deejay/sites/2/2020/01/wad-320x320.jpg',
  'Gianluca Gazzoli':          'https://cdn.gelestatic.it/deejay/sites/2/2020/01/gazzoli-320x320.jpg',
  'La Pina, Diego e La Vale':  'https://cdn.gelestatic.it/deejay/sites/2/2020/01/PINA-320x320.jpg',
  'Florencia':                  'https://cdn.gelestatic.it/deejay/sites/2/2023/08/thumbnail_florencia-destefano-abichain-320x320.jpg',
  'Laura Antonini e Rudy Zerbi': 'https://cdn.gelestatic.it/deejay/sites/2/2020/01/laura-320x320.jpg',
  'Vic e Luciana Littizzetto':   'https://cdn.gelestatic.it/deejay/sites/2/2020/01/laura-320x320.jpg',
  // ── Radio Capital (cdn.gelestatic.it/capital) ─────────────────────────────────
  'Marco Maisano':      'https://cdn.gelestatic.it/capital/sites/2/2024/09/marcomaisnao1-320x320.jpg',
  'Flavia Cercato':     'https://cdn.gelestatic.it/capital/sites/2/2025/06/flavia-cercato-radio-capital-320x320.jpg',
  'Massimo Oldani':     'https://cdn.gelestatic.it/capital/sites/2/2022/12/Massimo_Oldani-320x320.jpg',
  'Alessio Bertallot':  'https://cdn.gelestatic.it/capital/sites/2/2022/12/BERTALLOT_1-320x320.jpg',
  'Marco Biondi':       'https://cdn.gelestatic.it/capital/sites/2/2024/09/marcobiondi-320x320.jpg',
  // ── RTL 102.5 (cloud.rtl.it) ─────────────────────────────────────────────────
  'Francesco Fredella': 'https://cloud.rtl.it/RTLFM/speakers/400xH/francesco-fredella-wide-rtl-play-26zw9.jpg',
  'Fulvio Giuliani':    'https://cloud.rtl.it/RTLFM/speakers/400xH/fulvio-giuliani-wide-rtl-play-n25rd.jpg',
  'Gianni Simioli':     'https://cloud.rtl.it/RTLFM/speakers/400xH/gianni-simioli-wide-rtl-play-tzlip.jpg',
  'Francesco Taranto':  'https://cloud.rtl.it/RTLFM/speakers/400xH/francesco-taranto-wide-rtl-play-lypwy.jpg',
};
function getDjPhoto(djName: string): string | undefined {
  return DJ_PHOTOS[djName];
}

function getCurrentSlotIndex(slots: ScheduleSlot[]): number {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return slots.findIndex(s => {
    const start = s.startHour * 60 + (s.startMin ?? 0);
    const end   = s.endHour   * 60 + (s.endMin   ?? 0);
    return mins >= start && mins < end;
  });
}

const RADIO_URL_CACHE_PREFIX = 'radio_url_cache_';

// --- Funzioni Helper Notifica Radio (Direct Method) ---
async function showRadioNotification(station: OfflineStation, djName: string) {
  if (Platform.OS === 'ios') return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }

    await Notifications.setNotificationChannelAsync('radio-playback', {
      name: 'Radio Playback',
      importance: AndroidImportance?.MAX || 5,
      showBadge: false,
    });

    await Notifications.scheduleNotificationAsync({
      identifier: 'radio-status',
      content: {
        title: `📻 Soundscape - ${station.name}`,
        body: `In onda: ${djName}`,
        priority: AndroidPriority?.MAX || 2,
        sticky: true,
        color: station.color, 
        android: {
          channelId: 'radio-playback',
          largeIcon: station.logoUrl,
        }
      },
      trigger: null,
    });
  } catch (err: any) {
    console.error("Errore Notifica:", err);
  }
}

async function hideRadioNotification() {
  if (Platform.OS === 'ios') return;
  try {
    await Notifications.dismissNotificationAsync('radio-status');
  } catch (err) {}
}
// ------------------------------------------------------
const RADIO_URL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 giorni

async function getCachedUrl(searchName: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(RADIO_URL_CACHE_PREFIX + searchName);
    if (!raw) return null;
    const { url, ts } = JSON.parse(raw);
    if (Date.now() - ts > RADIO_URL_CACHE_TTL) return null;
    return url;
  } catch { return null; }
}

async function setCachedUrl(searchName: string, url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(RADIO_URL_CACHE_PREFIX + searchName, JSON.stringify({ url, ts: Date.now() }));
  } catch {}
}

// Fetch URL stream da radio-browser.info con cache AsyncStorage e fallback hardcoded
async function fetchRadioBrowserUrl(searchName: string): Promise<string | null> {
  // Domini che supportano HTTPS anche se radio-browser li indicizza come HTTP
  const HTTP_TO_HTTPS_DOMAINS = [
    'icecast.unitedradio.it',
    'icy.unitedradio.it',
    'shoutcast.unitedradio.it',
    'streaming.unitedradio.it',
  ];

  const upgradeToHttps = (url: string): string => {
    if (url.startsWith('http://')) {
      const domain = url.replace('http://', '').split('/')[0];
      if (HTTP_TO_HTTPS_DOMAINS.some(d => domain.includes(d))) {
        return url.replace('http://', 'https://');
      }
    }
    return url;
  };

  const pickBest = (data: { url_resolved?: string; url?: string }[]): string | null => {
    const candidates = data.map(s => upgradeToHttps(s.url_resolved || s.url || ''));
    const https = candidates.find(u => u.startsWith('https://'));
    return https || candidates[0] || null;
  };

  // 1. Prova dalla cache locale
  const cached = await getCachedUrl(searchName);
  if (cached) return cached;

  // 2. Prova a contattare radio-browser.info
  const queries = [
    `name=${encodeURIComponent(searchName)}&countrycode=IT&hidebroken=true&order=votes&reverse=true&limit=10`,
    `name=${encodeURIComponent(searchName)}&hidebroken=true&order=votes&reverse=true&limit=10`,
  ];

  for (const query of queries) {
    for (const mirror of ['all', 'de1', 'nl1']) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(
          `https://${mirror}.api.radio-browser.info/json/stations/search?${query}`,
          { headers: { 'User-Agent': 'Soundscape/1.0' }, signal: controller.signal },
        );
        clearTimeout(timer);
        if (!res.ok) continue;
        const data: { url_resolved?: string; url?: string }[] = await res.json();
        const url = pickBest(data);
        if (url) {
          await setCachedUrl(searchName, url);
          return url;
        }
      } catch (e) {
        console.warn('radio-browser fetch error:', mirror, e);
      }
    }
  }

  // 3. Fallback: URL hardcoded
  const fallback = FALLBACK_STREAM_URLS[searchName];
  if (fallback) {
    console.log('radio-browser irraggiungibile, uso fallback per', searchName);
    return fallback;
  }

  return null;
}

// ─── Now Playing (Ora in Onda) ────────────────────────────────────────────────
const NP_TTL = 1 * 60 * 1000; // 1 minuto (più reattivo)
const _npCache: Map<string, { data: NowPlayingInfo; ts: number }> = new Map();

async function _fetchJson(url: string, ms = 5000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Soundscape/1.0' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Estrae l'URL immagine cercando campi comuni in un oggetto JSON
function extractImageUrl(item: Record<string, unknown>): string | undefined {
  const FIELDS = [
    'image', 'thumbnail', 'img', 'foto', 'photo', 'cover', 'picture',
    'image_url', 'img_url', 'photo_url', 'cover_url', 'thumbnail_url',
    'djPhoto', 'dj_photo', 'dj_image', 'djImage', 'speaker_image', 'speaker_photo',
    'programma_immagine', 'conduttore_foto', 'avatar', 'avatar_url',
    'logo', 'logo_url', 'artwork', 'artwork_url', 'media', 'picture_url',
    'image_large', 'image_medium', 'img_large', 'img_medium',
  ];
  for (const field of FIELDS) {
    const val = item[field];
    if (typeof val === 'string' && val.startsWith('http')) return val;
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const url = obj.url || obj.src || obj.href || obj.large || obj.medium || obj.full || obj.original;
      if (typeof url === 'string' && url.startsWith('http')) return url;
      // nested sizes object (WordPress)
      const sizes = obj.sizes as Record<string, unknown> | undefined;
      if (sizes) {
        const sz = sizes.large || sizes.medium_large || sizes.medium || sizes.thumbnail;
        if (typeof sz === 'string' && sz.startsWith('http')) return sz;
        if (sz && typeof sz === 'object') {
          const su = (sz as Record<string, unknown>).url || (sz as Record<string, unknown>).source_url;
          if (typeof su === 'string' && su.startsWith('http')) return su;
        }
      }
    }
  }
  // fallback: cerca qualsiasi stringa che sembri un'immagine
  for (const val of Object.values(item)) {
    if (typeof val === 'string' && /^https?:\/\/.+\.(jpg|jpeg|png|webp)/i.test(val)) return val;
  }
  return undefined;
}

// GEDI group: Radio DeeJay (deejay.it), m2o (m2o.it), Radio Capital (capital.it)
async function fetchGediNowPlaying(domain: string): Promise<NowPlayingInfo | null> {
  try {
    const data = await _fetchJson(`https://www.${domain}/api/items/in-onda/`) as Record<string, unknown>;
    const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : Array.isArray(data?.items) ? data.items : null);
    const item = Array.isArray(list) && list.length > 0 ? list[0] as Record<string, unknown> : null;
    if (!item) return null;
    const djName = String(item.dj_name || item.dj || item.presenter || item.nome || item.speaker || item.title || '');
    const showName = String(item.show_title || item.programme || item.programma || item.title || '');
    // Cerca immagine: prima nel root, poi in eventuali oggetti nested (conduttore, speaker, dj_data…)
    let djImageUrl = extractImageUrl(item);
    if (!djImageUrl) {
      const nested = item.conduttore || item.speaker_data || item.dj_data || item.presenter_data || item.host;
      if (nested && typeof nested === 'object') djImageUrl = extractImageUrl(nested as Record<string, unknown>);
    }
    return { djName, showName: showName !== djName ? showName : undefined, djImageUrl };
  } catch { return null; }
}

// RTL 102.5
async function fetchRtlNowPlaying(): Promise<NowPlayingInfo | null> {
  try {
    const data = await _fetchJson('https://www.rtl.it/live/json/palinsesto.json') as Record<string, unknown>;
    const item = (data?.current || data?.on_air || (Array.isArray(data) ? data[0] : data)) as Record<string, unknown>;
    if (!item) return null;
    const djName = String(item.presenter || item.speaker || item.nome || item.dj || item.name || '');
    const showName = String(item.show || item.programma || item.title || '');
    return { djName, showName: showName !== djName ? showName : undefined, djImageUrl: extractImageUrl(item) };
  } catch { return null; }
}

// Radio 105 (Mediaset)
async function fetch105NowPlaying(): Promise<NowPlayingInfo | null> {
  try {
    const data = await _fetchJson('https://www.105.net/api/on-air') as Record<string, unknown>;
    const item = (data?.data || data?.current || data) as Record<string, unknown>;
    if (!item || typeof item !== 'object') return null;
    const djName = String(item.presenter || item.speaker || item.dj || item.nome || '');
    const showName = String(item.show || item.title || item.programma || '');
    return { djName, showName: showName !== djName ? showName : undefined, djImageUrl: extractImageUrl(item) };
  } catch { return null; }
}

// Radio Italia
async function fetchRadioItaliaNowPlaying(): Promise<NowPlayingInfo | null> {
  try {
    const data = await _fetchJson('https://www.radioitalia.it/palinsesto/palinsesto.php') as Record<string, unknown>;
    const item = (Array.isArray(data) ? data[0] : data?.current || data) as Record<string, unknown>;
    if (!item || typeof item !== 'object') return null;
    const djName = String(item.presenter || item.speaker || item.nome || item.dj || '');
    const showName = String(item.title || item.programma || item.show || '');
    return { djName, showName: showName !== djName ? showName : undefined, djImageUrl: extractImageUrl(item) };
  } catch { return null; }
}

// RDS
async function fetchRdsNowPlaying(): Promise<NowPlayingInfo | null> {
  try {
    const data = await _fetchJson('https://www.rds.it/api/on-air') as Record<string, unknown>;
    const item = (data?.current || data?.data || (Array.isArray(data) ? data[0] : data)) as Record<string, unknown>;
    if (!item || typeof item !== 'object') return null;
    const djName = String(item.presenter || item.speaker || item.nome || item.dj || '');
    const showName = String(item.title || item.show || item.programma || '');
    return { djName, showName: showName !== djName ? showName : undefined, djImageUrl: extractImageUrl(item) };
  } catch { return null; }
}

// Virgin Radio Italy (Discovery)
async function fetchVirginNowPlaying(): Promise<NowPlayingInfo | null> {
  try {
    const data = await _fetchJson('https://www.virginradio.it/api/on-air') as Record<string, unknown>;
    const item = (data?.current || data?.data || (Array.isArray(data) ? data[0] : data)) as Record<string, unknown>;
    if (!item || typeof item !== 'object') return null;
    const djName = String(item.presenter || item.speaker || item.nome || item.dj || '');
    const showName = String(item.title || item.show || item.programma || '');
    return { djName, showName: showName !== djName ? showName : undefined, djImageUrl: extractImageUrl(item) };
  } catch { return null; }
}

async function fetchNowPlaying(stationId: string): Promise<NowPlayingInfo | null> {
  const cached = _npCache.get(stationId);
  if (cached && Date.now() - cached.ts < NP_TTL) return cached.data;

  let info: NowPlayingInfo | null = null;
  switch (stationId) {
    case 'deejay':      info = await fetchGediNowPlaying('deejay.it'); break;
    case 'm2o':         info = await fetchGediNowPlaying('m2o.it'); break;
    case 'capital':     info = await fetchGediNowPlaying('capital.it'); break;
    case 'rtl':         info = await fetchRtlNowPlaying(); break;
    case 'r105':        info = await fetch105NowPlaying(); break;
    case 'radioitalia': info = await fetchRadioItaliaNowPlaying(); break;
    case 'rds':         info = await fetchRdsNowPlaying(); break;
    case 'virgin':      info = await fetchVirginNowPlaying(); break;
  }

  if (info?.djName) _npCache.set(stationId, { data: info, ts: Date.now() });
  return info?.djName ? info : null;
}

// ─── Crossfade utility ───────────────────────────────────────────────────────
/**
 * Fades out oldSound e fades in newSound in `ms` millisecondi.
 * Ritorna una funzione di cleanup (cancella il timer).
 */
function startCrossfade(
  oldSound: Audio.Sound,
  newSound: Audio.Sound,
  ms = 2500,
  targetVol = 1.0,
): () => void {
  const STEPS = 25;
  const stepMs = Math.max(50, ms / STEPS);
  let step = 0;
  const id = setInterval(() => {
    step++;
    const t = Math.min(1, step / STEPS);
    oldSound.setVolumeAsync(Math.max(0, (1 - t))).catch(() => {});
    newSound.setVolumeAsync(Math.min(targetVol, t * targetVol)).catch(() => {});
    if (step >= STEPS) {
      clearInterval(id);
      oldSound.stopAsync().catch(() => {}).finally(() => oldSound.unloadAsync().catch(() => {}));
    }
  }, stepMs);
  return () => clearInterval(id);
}

// ─── Floating Reaction ────────────────────────────────────────────────────────
interface FloatingItem { id: string; emoji: string; x: number; }

function FloatingReaction({ item, onDone }: { item: FloatingItem; onDone: () => void }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -220, duration: 2200, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(opacity, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, []);
  return (
    <Animated.Text
      style={{ position: 'absolute', bottom: 180, left: item.x, fontSize: 28, transform: [{ translateY }], opacity }}
      pointerEvents="none"
    >
      {item.emoji}
    </Animated.Text>
  );
}

// ─── Waveform ─────────────────────────────────────────────────────────────────
function WaveBar({ index, active, color = '#FF2D55' }: { index: number; active: boolean; color?: string }) {
  const anim = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    if (!active) {
      Animated.timing(anim, { toValue: 0.25, duration: 200, useNativeDriver: false }).start();
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 0.5 + (index % 4) * 0.15, duration: 280 + index * 55, useNativeDriver: false }),
      Animated.timing(anim, { toValue: 0.15 + (index % 3) * 0.08, duration: 260 + index * 45, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active]);
  return (
    <Animated.View style={[ws.bar, {
      height: anim.interpolate({ inputRange: [0, 1], outputRange: [4, 44] }),
      backgroundColor: color,
    }]} />
  );
}

function WaveformAnim({ active, color }: { active: boolean; color?: string }) {
  return (
    <View style={ws.row}>
      {Array.from({ length: 14 }).map((_, i) => (
        <WaveBar key={i} index={i} active={active} color={color} />
      ))}
    </View>
  );
}

const ws = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 52, marginVertical: 12 },
  bar: { width: 4, borderRadius: 2 },
});

// ─── Riga scaletta (con gap indicator) ───────────────────────────────────────
function QueueRow({
  track, index, current, isGap, gapCountdown,
}: {
  track: PlaylistTrack;
  index: number;
  current: boolean;
  isGap?: boolean;
  gapCountdown?: number;
}) {
  const { t } = useTranslation();
  const gap = track.gapAfter ?? 0;
  return (
    <View>
      <View style={[qt.row, current && qt.rowActive]}>
        <View style={[qt.numWrap, current && qt.numWrapActive]}>
          {current && !isGap
            ? <View style={qt.playingDot} />
            : <Text style={qt.num}>{index + 1}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[qt.name, current && qt.nameActive]} numberOfLines={1}>
            {track.name.replace(/\.[^.]+$/, '')}
          </Text>
          {track.duration !== undefined && (
            <Text style={qt.duration}>{fmtSec(track.duration)}</Text>
          )}
        </View>
        {current && isGap && gapCountdown !== undefined && (
          <View style={qt.gapBadge}>
            <Text style={qt.gapBadgeTxt}>⏸ {gapCountdown}s</Text>
          </View>
        )}
        {current && !isGap && <Text style={qt.onAir}>{t('radio.onAir')}</Text>}
      </View>
      {/* Gap separator */}
      {gap > 0 && (
        <View style={qt.gapRow}>
          <View style={qt.gapLine} />
          <Text style={qt.gapTxt}>⏸ {gap}s pausa</Text>
          <View style={qt.gapLine} />
        </View>
      )}
    </View>
  );
}

const qt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, marginBottom: 2, backgroundColor: 'rgba(255,255,255,0.03)' },
  rowActive: { backgroundColor: 'rgba(255,45,85,0.10)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.25)' },
  numWrap: { width: 26, height: 26, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  numWrapActive: { backgroundColor: 'rgba(255,45,85,0.2)' },
  num: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  playingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF2D55' },
  name: { fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 17 },
  nameActive: { color: '#fff', fontWeight: '600' },
  duration: { fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', marginTop: 1 },
  onAir: { fontSize: 8, color: '#FF2D55', fontFamily: 'monospace', letterSpacing: 1.5, fontWeight: '700' },
  gapBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  gapBadgeTxt: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 4, marginTop: 2 },
  gapLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  gapTxt: { fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', letterSpacing: 0.5 },
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function fmtSec(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
}

/** Volume musica durante voce attiva (ducking) — usato sia da host che da listener.
 *  Radio feel: voce domina, musica appena percepibile in sottofondo (~12%). */
const DUCK_VOL = 0.12;

function elapsedStr(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── HOST PANEL ───────────────────────────────────────────────────────────────
function HostRadioModal({ room: initialRoom, onClose }: { room: RadioRoom; onClose: () => void }) {
  const { t } = useTranslation();
  const [room, setRoom] = useState(initialRoom);
  const [ending, setEnding] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [trackElapsed, setTrackElapsed] = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<'playing' | 'chat' | 'hands' | 'suggestions'>('playing');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [handRaises, setHandRaises] = useState<HandRaise[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInGapAudio, setIsInGapAudio] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [micActive, setMicActive_] = useState(false);
  const [agoraJoined, setAgoraJoined] = useState(false);
  const [playlistEnded, setPlaylistEnded] = useState(false);
  const autoAdvancedRef = useRef(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const chatUnsubRef = useRef<(() => void) | null>(null);
  const handsUnsubRef = useRef<(() => void) | null>(null);
  const suggestionsUnsubRef = useRef<(() => void) | null>(null);
  const chatListRef = useRef<FlatList<ChatMessage>>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const currentIndexRef = useRef(initialRoom.currentTrackIndex);
  const playlistLengthRef = useRef(initialRoom.playlist.length);
  const trackStartedAtRef = useRef(initialRoom.trackStartedAt.getTime());
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crossfadeCleanupRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTrack = useCallback(async (r: RadioRoom, doFade = false) => {
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    if (crossfadeCleanupRef.current) { crossfadeCleanupRef.current(); crossfadeCleanupRef.current = null; }
    const track = r.playlist[r.currentTrackIndex];
    if (!track) { setAudioLoading(false); return; }

    const now = Date.now();
    const startAt = r.trackStartedAt.getTime();
    const waitMs = startAt - now;

    if (waitMs > 200) {
      setIsInGapAudio(true);
      // In gap: ferma subito il suono corrente (niente crossfade durante le pause intenzionali)
      if (soundRef.current) {
        const s = soundRef.current; soundRef.current = null;
        s.stopAsync().catch(() => {}).finally(() => s.unloadAsync().catch(() => {}));
      }
      gapTimerRef.current = setTimeout(() => {
        setIsInGapAudio(false);
        loadTrack({ ...r, trackStartedAt: new Date(startAt) }, false);
      }, waitMs + 100);
      setAudioLoading(false);
      return;
    }

    setIsInGapAudio(false);
    setAudioLoading(true);
    const oldSound = doFade ? soundRef.current : null;
    if (!doFade && soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
    }
    soundRef.current = null;

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: false });
      refreshSpeakerphone();
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay: false, volume: 0 },
      );
      // Ricalcola elapsed DOPO il caricamento per compensare la latenza di rete
      const durationMs = status.isLoaded && status.durationMillis ? status.durationMillis : Infinity;
      const elapsed = Math.max(0, Date.now() - startAt);
      const offset = Math.min(elapsed, isFinite(durationMs) && durationMs > 1000 ? durationMs - 1000 : elapsed);
      if (offset > 0) await sound.setPositionAsync(offset);
      const hostVol = doFade ? 0 : 1;
      await sound.setVolumeAsync(hostVol).catch(() => {});
      await sound.playAsync();
      if (doFade && oldSound) {
        crossfadeCleanupRef.current = startCrossfade(oldSound, sound, 2500);
      }
      sound.setOnPlaybackStatusUpdate((s) => {
        if (!s.isLoaded) return;
        setIsPlaying(s.isPlaying);
        if (s.didJustFinish && currentIndexRef.current >= playlistLengthRef.current - 1) {
          setIsPlaying(false);
          setPlaylistEnded(true);
          soundRef.current?.stopAsync().catch(() => {});
        }
      });
      soundRef.current = sound;
    } catch {}
    finally { setAudioLoading(false); }
  }, []);

  useEffect(() => {
    loadTrack(initialRoom);
    unsubRef.current = listenToRoom(room.id, (updated) => {
      setRoom(updated);
      const prevLength = playlistLengthRef.current;
      playlistLengthRef.current = updated.playlist.length;
      if (updated.currentTrackIndex !== currentIndexRef.current) {
        currentIndexRef.current = updated.currentTrackIndex;
        trackStartedAtRef.current = updated.trackStartedAt.getTime();
        autoAdvancedRef.current = false;
        setPlaylistEnded(false);
        // Crossfade solo se non c'è gap sulla traccia precedente
        const hadNoGap = updated.trackStartedAt.getTime() <= Date.now() + 200;
        loadTrack(updated, hadNoGap);
      } else if (updated.playlist.length > prevLength && currentIndexRef.current >= prevLength - 1) {
        // Nuove tracce aggiunte (suggerimento approvato) mentre eravamo all'ultima traccia
        setPlaylistEnded(false);
        autoAdvancedRef.current = false;
        skipToNextTrack(initialRoom.id, currentIndexRef.current + 1, 0).catch(() => {});
      } else if (updated.trackStartedAt.getTime() > trackStartedAtRef.current + 500) {
        trackStartedAtRef.current = updated.trackStartedAt.getTime();
        loadTrack(updated, false);
      }
    });
    // Heartbeat ogni 30s
    hostHeartbeat(initialRoom.id).catch(() => {});
    heartbeatRef.current = setInterval(() => hostHeartbeat(initialRoom.id).catch(() => {}), 30000);
    chatUnsubRef.current = listenToChat(room.id, (msgs) => {
      setChatMessages(msgs);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 80);
    });
    handsUnsubRef.current = listenToHandRaises(room.id, setHandRaises);
    suggestionsUnsubRef.current = listenToSuggestions(room.id, setSuggestions);
    // Agora: join as host (mic off by default)
    fetchAgoraToken(initialRoom.id).then(async (token) => {
      try {
        await joinAsHost(initialRoom.id, token);
        setAgoraJoined(true);
      } catch {}
    });

    return () => {
      if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (crossfadeCleanupRef.current) { crossfadeCleanupRef.current(); crossfadeCleanupRef.current = null; }
      if (soundRef.current) {
        const s = soundRef.current;
        soundRef.current = null;
        s.stopAsync().catch(() => {}).finally(() => s.unloadAsync().catch(() => {}));
      }
      unsubRef.current?.();
      chatUnsubRef.current?.();
      handsUnsubRef.current?.();
      suggestionsUnsubRef.current?.();
      setHostMicLive(initialRoom.id, false).catch(() => {});
      leaveAgoraChannel().catch(() => {});
      destroyAgoraEngine();
    };
  }, []);

  // Timer generale
  useEffect(() => {
    const t = setInterval(() => {
      setTrackElapsed(Math.max(0, Date.now() - room.trackStartedAt.getTime()));
      setTotalElapsed(Date.now() - room.startedAt.getTime());
    }, 1000);
    return () => clearInterval(t);
  }, [room.trackStartedAt, room.startedAt]);

  // Auto-advance quando la traccia finisce (se ha durata)
  useEffect(() => {
    const track = room.playlist[room.currentTrackIndex];
    if (!track?.duration) return;
    const isLast = room.currentTrackIndex >= room.playlist.length - 1;
    const elapsed = Date.now() - room.trackStartedAt.getTime();
    const remaining = track.duration * 1000 - elapsed;

    const handleEnd = async () => {
      if (autoAdvancedRef.current) return;
      autoAdvancedRef.current = true;
      if (!isLast) {
        const gap = track.gapAfter ?? 0;
        await skipToNextTrack(room.id, room.currentTrackIndex + 1, gap).catch(() => {});
      } else {
        // Ultima traccia: ferma l'audio (backup — didJustFinish lo fa prima)
        setPlaylistEnded(true);
        soundRef.current?.stopAsync().catch(() => {});
      }
    };

    // Con gap=0 anticipa di 1800ms per compensare latenza Firestore + caricamento audio (crossfade seamless)
    // Con gap>0 triggera al momento esatto: il gap è già il buffer naturale
    const buffer = (track.gapAfter ?? 0) === 0 ? 1800 : 0;
    const triggerMs = Math.max(0, remaining - buffer);
    if (remaining <= 0) { handleEnd(); return; }
    const t = setTimeout(handleEnd, triggerMs);
    return () => clearTimeout(t);
  }, [room.currentTrackIndex, room.trackStartedAt]);

  const handleSkip = async () => {
    if (room.currentTrackIndex >= room.playlist.length - 1) return;
    setSkipping(true);
    try {
      const currentGap = room.playlist[room.currentTrackIndex]?.gapAfter ?? 0;
      await skipToNextTrack(room.id, room.currentTrackIndex + 1, currentGap);
    } catch { Alert.alert(t('common.error'), t('radio.errors.cannotSkip')); }
    finally { setSkipping(false); }
  };

  const handleEnd = () => {
    Alert.alert(t('radio.endConfirmTitle'), t('radio.endConfirmMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('radio.endBtn'), style: 'destructive', onPress: async () => {
        setEnding(true);
        try { await endRadioRoom(room.id); } finally { onClose(); }
      }},
    ]);
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || sendingMsg) return;
    setSendingMsg(true);
    setChatInput('');
    try {
      const name = (auth.currentUser?.displayName ?? room.hostName) + ' (host)';
      await sendChatMessage(room.id, text, name);
    } catch {}
    finally { setSendingMsg(false); }
  };

  const handleMicToggle = async () => {
    if (!agoraJoined) return;
    const next = !micActive;
    setMicActive_(next);
    setMicActive(next);
    // Host: muto sul proprio device quando mic attivo (evita che il mic riprenda la musica)
    // I listener sentono comunque la musica al volume ducking
    if (soundRef.current) {
      soundRef.current.setVolumeAsync(next ? 0 : 1.0).catch(() => {});
    }
    try { await setHostMicLive(room.id, next); } catch {}
  };

  const handlePickListener = async (h: HandRaise) => {
    try {
      await pickListener(room.id, h.userId, h.userName);
      await grantSpeaker(room.id, h.userId);
    } catch { Alert.alert(t('common.error'), t('radio.errors.cannotPick')); }
  };

  const handleDismiss = async (h: HandRaise) => {
    try {
      await dismissPick(room.id, h.userId);
      await revokeSpeaker(room.id, h.userId);
    } catch {}
  };

  const handleAddCohost = async (h: HandRaise) => {
    try {
      await addCohost(room.id, h.userId);
      await dismissPick(room.id, h.userId).catch(() => {});
    } catch { Alert.alert(t('common.error'), 'Impossibile promuovere a cohost.'); }
  };

  const handleRemoveCohost = async (userId: string) => {
    try { await removeCohost(room.id, userId); } catch {}
  };

  const handleMoveTrack = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex <= room.currentTrackIndex || toIndex >= room.playlist.length) return;
    const newPlaylist = [...room.playlist];
    [newPlaylist[fromIndex], newPlaylist[toIndex]] = [newPlaylist[toIndex], newPlaylist[fromIndex]];
    reorderPlaylist(room.id, newPlaylist).catch(() => {});
  };

  const handleApproveSuggestion = async (s: Suggestion) => {
    try { await approveSuggestion(room.id, s.id, s.soundUrl, s.soundName); }
    catch { Alert.alert(t('common.error'), 'Impossibile approvare il suggerimento.'); }
  };

  const handleRejectSuggestion = async (s: Suggestion) => {
    try { await rejectSuggestion(room.id, s.id); } catch {}
  };

  const currentTrack = room.playlist[room.currentTrackIndex];
  const hasNext = room.currentTrackIndex < room.playlist.length - 1;
  const isInGap = room.trackStartedAt.getTime() > Date.now();
  const gapRemaining = isInGap ? Math.ceil((room.trackStartedAt.getTime() - Date.now()) / 1000) : 0;
  const pendingHands = handRaises.filter(h => h.status === 'pending');
  const pickedHands = handRaises.filter(h => h.status === 'picked');
  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
  const cohosts = room.cohosts ?? [];
  const activeSpeakers = room.activeSpeakers ?? [];

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
      <View style={hm.orbA} />

      {/* Header */}
      <View style={hm.header}>
        <TouchableOpacity onPress={onClose} style={hm.closeBtn} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
          <Text style={hm.closeTxt}>✕</Text>
        </TouchableOpacity>
        <View style={hm.livePill}>
          <View style={hm.liveDot} />
          <Text style={hm.liveTxt}>{t('radio.onAir')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab bar */}
      <View style={hm.tabBar}>
        {(['playing', 'chat', 'hands', 'suggestions'] as const).map((tab) => {
          const label = tab === 'playing' ? '♪' : tab === 'chat' ? t('radio.chatTab') : tab === 'hands' ? t('radio.handsTab') : '🎵';
          const badge = tab === 'chat' ? chatMessages.length : tab === 'hands' ? pendingHands.length : tab === 'suggestions' ? pendingSuggestions.length : 0;
          return (
            <TouchableOpacity key={tab} style={[hm.tab, activeTab === tab && hm.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[hm.tabTxt, activeTab === tab && hm.tabTxtActive]}>{label}</Text>
              {badge > 0 && (
                <View style={[hm.tabBadge, (tab === 'hands' || tab === 'suggestions') && { backgroundColor: '#FF2D55' }]}>
                  <Text style={hm.tabBadgeTxt}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab: NOW PLAYING */}
      {activeTab === 'playing' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={hm.content} showsVerticalScrollIndicator={false}>
          <Text style={hm.stationTitle}>{room.title}</Text>
          {room.description ? <Text style={hm.desc}>{room.description}</Text> : null}
          <View style={hm.statsRow}>
            <View style={hm.statBox}>
              <Text style={hm.statNum}>{room.listenerCount}</Text>
              <Text style={hm.statLabel}>{t('radio.listeners')}</Text>
            </View>
            <View style={hm.statBox}>
              <Text style={hm.statNum}>{elapsedStr(totalElapsed)}</Text>
              <Text style={hm.statLabel}>{t('radio.onAirStat')}</Text>
            </View>
            <View style={hm.statBox}>
              <Text style={hm.statNum}>{room.playlist.length}</Text>
              <Text style={hm.statLabel}>{t('radio.tracks')}</Text>
            </View>
          </View>
          <View style={hm.nowCard}>
            <Text style={hm.nowLabel}>
              {playlistEnded ? '✓ PLAYLIST TERMINATA' : isInGap ? t('radio.pause') : t('radio.nowOnAir')}
            </Text>
            {playlistEnded ? (
              <Text style={hm.playlistEndedTxt}>Tutte le tracce sono state riprodotte.</Text>
            ) : isInGap ? (
              <View>
                <Text style={hm.gapCountdown}>⏸  {gapRemaining}s</Text>
                {hasNext && <Text style={hm.gapNext}>{t('radio.nowPlaying').toLowerCase()}: {room.playlist[room.currentTrackIndex + 1]?.name.replace(/\.[^.]+$/, '')}</Text>}
                {/* Bottoni estendi pausa */}
                <View style={hm.extendGapRow}>
                  <Text style={hm.extendGapLabel}>Aggiungi pausa:</Text>
                  {[5, 15, 30].map(sec => (
                    <TouchableOpacity
                      key={sec}
                      style={hm.extendGapBtn}
                      onPress={() => extendGap(room.id, room.trackStartedAt, sec).catch(() => {})}
                    >
                      <Text style={hm.extendGapBtnTxt}>+{sec}s</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <>
                <Text style={hm.nowTrackName} numberOfLines={2}>{currentTrack?.name.replace(/\.[^.]+$/, '') ?? '—'}</Text>
                <Text style={hm.trackMeta}>
                  {room.currentTrackIndex + 1} / {room.playlist.length}
                  {currentTrack?.duration ? `  ·  ${fmtSec(Math.min(trackElapsed / 1000, currentTrack.duration))} / ${fmtSec(currentTrack.duration)}` : `  ·  ${fmtSec(trackElapsed / 1000)}`}
                </Text>
                <WaveformAnim active={isPlaying && !isInGapAudio} color="#FF2D55" />
              </>
            )}
            {/* Mic sempre visibile — anche dopo fine playlist o durante gap */}
            <View style={{ alignItems: 'center', marginTop: 8 }}>
              <TouchableOpacity
                style={[hm.micBtn, micActive && hm.micBtnActive]}
                onPress={handleMicToggle}
                disabled={!agoraJoined}
              >
                <Text style={hm.micIcon}>{micActive ? '🎙' : '🔇'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={hm.controls}>
            <TouchableOpacity style={[hm.skipBtn, (!hasNext || skipping) && hm.skipBtnDisabled]} onPress={handleSkip} disabled={!hasNext || skipping}>
              {skipping ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={hm.skipTxt}>{hasNext ? `⏭  Prossima${(currentTrack?.gapAfter ?? 0) > 0 ? ` (pausa ${currentTrack?.gapAfter}s)` : ''}` : '✓  Ultima traccia'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={hm.stopBtn} onPress={handleEnd} disabled={ending}>
              {ending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={hm.stopTxt}>⬛  Termina</Text>}
            </TouchableOpacity>
          </View>
          <Text style={hm.queueTitle}>{t('radio.queue')}</Text>
          {room.playlist.map((track, i) => {
            const canMove = i > room.currentTrackIndex;
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ flex: 1 }}>
                  <QueueRow track={track} index={i} current={i === room.currentTrackIndex}
                    isGap={isInGap && i === room.currentTrackIndex}
                    gapCountdown={isInGap && i === room.currentTrackIndex ? gapRemaining : undefined} />
                </View>
                {canMove && (
                  <View style={hm.reorderBtns}>
                    <TouchableOpacity
                      onPress={() => handleMoveTrack(i, 'up')}
                      disabled={i === room.currentTrackIndex + 1}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={[hm.reorderArrow, i === room.currentTrackIndex + 1 && { opacity: 0.2 }]}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleMoveTrack(i, 'down')}
                      disabled={i === room.playlist.length - 1}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={[hm.reorderArrow, i === room.playlist.length - 1 && { opacity: 0.2 }]}>▼</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Tab: CHAT */}
      {activeTab === 'chat' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
          <FlatList
            ref={chatListRef}
            data={chatMessages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <View style={[hm.chatMsg, item.isPicked && hm.chatMsgPicked]}>
                <Text style={[hm.chatUser, item.userId === 'system' && hm.chatSystem]}>{item.userName}</Text>
                <Text style={hm.chatText}>{item.text}</Text>
              </View>
            )}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>💬</Text>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: 'monospace' }}>nessun messaggio ancora</Text>
              </View>
            }
          />
          <View style={hm.chatInputRow}>
            <TextInput style={hm.chatInput} placeholder={t('radio.chatPlaceholderHost')}
              placeholderTextColor="rgba(255,255,255,0.25)" value={chatInput}
              onChangeText={setChatInput} onSubmitEditing={handleSendChat} returnKeyType="send" />
            <TouchableOpacity style={[hm.chatSendBtn, (!chatInput.trim() || sendingMsg) && { opacity: 0.4 }]}
              onPress={handleSendChat} disabled={!chatInput.trim() || sendingMsg}>
              <Text style={hm.chatSendTxt}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Tab: MANI ALZATE */}
      {activeTab === 'hands' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Cohost permanenti */}
          {cohosts.length > 0 && (
            <>
              <Text style={hm.handsSection}>COHOST</Text>
              {cohosts.map(uid => (
                <View key={uid} style={[hm.handCardPicked, { borderColor: 'rgba(0,255,156,0.3)', backgroundColor: 'rgba(0,255,156,0.06)' }]}>
                  <Text style={{ fontSize: 18 }}>🎙</Text>
                  <Text style={hm.handName}>{handRaises.find(h => h.userId === uid)?.userName ?? uid.slice(0, 8)}</Text>
                  <TouchableOpacity style={hm.dismissBtn} onPress={() => handleRemoveCohost(uid)}>
                    <Text style={hm.dismissTxt}>Rimuovi</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {/* In evidenza (speaker temporanei) */}
          {pickedHands.filter(h => !cohosts.includes(h.userId)).length > 0 && (
            <>
              <Text style={[hm.handsSection, cohosts.length > 0 && { marginTop: 20 }]}>{t('radio.featured')}</Text>
              {pickedHands.filter(h => !cohosts.includes(h.userId)).map(h => (
                <View key={h.id} style={hm.handCardPicked}>
                  <Text style={hm.pickedStar}>{activeSpeakers.includes(h.userId) ? '🎙' : '⭐'}</Text>
                  <Text style={hm.handName}>{h.userName}</Text>
                  <View style={hm.handBtns}>
                    <TouchableOpacity style={[hm.pickBtn, { borderColor: 'rgba(0,255,156,0.4)', backgroundColor: 'rgba(0,255,156,0.12)' }]} onPress={() => handleAddCohost(h)}>
                      <Text style={[hm.pickBtnTxt, { color: '#00FF9C' }]}>Cohost</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={hm.dismissBtn} onPress={() => handleDismiss(h)}>
                      <Text style={hm.dismissTxt}>{t('common.remove')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          {pendingHands.length > 0 ? (
            <>
              <Text style={[hm.handsSection, (pickedHands.length > 0 || cohosts.length > 0) && { marginTop: 20 }]}>{t('radio.raisedHands')}</Text>
              {pendingHands.map(h => (
                <View key={h.id} style={hm.handCard}>
                  <View style={hm.handAvatar}><Text style={hm.handAvatarTxt}>{h.userName[0]?.toUpperCase()}</Text></View>
                  <Text style={hm.handName}>{h.userName}</Text>
                  <View style={hm.handBtns}>
                    <TouchableOpacity style={hm.pickBtn} onPress={() => handlePickListener(h)}>
                      <Text style={hm.pickBtnTxt}>{t('radio.pick')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={hm.ignoreBtn} onPress={() => handleDismiss(h)}>
                      <Text style={hm.ignoreBtnTxt}>{t('radio.ignore')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          ) : (
            pickedHands.length === 0 && cohosts.length === 0 && (
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>🙋</Text>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: 'monospace', textAlign: 'center' }}>
                  nessuno ha alzato la mano ancora
                </Text>
              </View>
            )
          )}
        </ScrollView>
      )}

      {/* Tab: SUGGERIMENTI */}
      {activeTab === 'suggestions' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {pendingSuggestions.length > 0 && (
            <>
              <Text style={hm.handsSection}>IN ATTESA</Text>
              {pendingSuggestions.map(s => (
                <View key={s.id} style={hm.handCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{s.soundName}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>da {s.userName}</Text>
                  </View>
                  <View style={hm.handBtns}>
                    <TouchableOpacity style={hm.pickBtn} onPress={() => handleApproveSuggestion(s)}>
                      <Text style={hm.pickBtnTxt}>✓ Aggiungi</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={hm.ignoreBtn} onPress={() => handleRejectSuggestion(s)}>
                      <Text style={hm.ignoreBtnTxt}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}
          {suggestions.filter(s => s.status === 'approved').length > 0 && (
            <>
              <Text style={[hm.handsSection, { marginTop: pendingSuggestions.length > 0 ? 20 : 0 }]}>APPROVATI</Text>
              {suggestions.filter(s => s.status === 'approved').map(s => (
                <View key={s.id} style={[hm.handCard, { borderColor: 'rgba(0,255,156,0.2)', backgroundColor: 'rgba(0,255,156,0.04)' }]}>
                  <Text style={{ fontSize: 16 }}>✅</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 13 }} numberOfLines={1}>{s.soundName}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontFamily: 'monospace', marginTop: 1 }}>da {s.userName}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
          {suggestions.filter(s => s.status === 'rejected').length > 0 && (
            <>
              <Text style={[hm.handsSection, { marginTop: 20 }]}>RIFIUTATI</Text>
              {suggestions.filter(s => s.status === 'rejected').map(s => (
                <View key={s.id} style={[hm.handCard, { opacity: 0.45 }]}>
                  <Text style={{ fontSize: 16 }}>✕</Text>
                  <Text style={{ flex: 1, color: 'rgba(255,255,255,0.5)', fontSize: 13 }} numberOfLines={1}>{s.soundName}</Text>
                </View>
              ))}
            </>
          )}
          {suggestions.length === 0 && (
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🎵</Text>
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: 'monospace', textAlign: 'center' }}>
                nessun suggerimento ancora{'\n'}gli ascoltatori possono suggerire suoni
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </Modal>
  );
}

const hm = StyleSheet.create({
  orbA: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(255,45,85,0.06)', top: -80, right: -80 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,45,85,0.18)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.35)' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF2D55' },
  liveTxt: { color: '#FF2D55', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  content: { padding: 20, paddingBottom: 48 },
  stationTitle: { fontSize: 26, fontWeight: '700', fontStyle: 'italic', color: '#fff', marginBottom: 4 },
  desc: { fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 17, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  statNum: { fontSize: 18, fontWeight: '700', color: '#FF2D55', marginBottom: 2 },
  statLabel: { fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  nowCard: { backgroundColor: 'rgba(255,45,85,0.08)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,45,85,0.18)', marginBottom: 12 },
  nowLabel: { fontSize: 9, color: '#FF2D55', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 8 },
  nowTrackName: { fontSize: 18, fontWeight: '700', color: '#fff', lineHeight: 24, marginBottom: 4 },
  trackMeta: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  gapCountdown: { fontSize: 36, fontWeight: '700', color: '#fff', textAlign: 'center', marginVertical: 8 },
  gapNext: { fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontFamily: 'monospace' },
  controls: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  skipBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  skipBtnDisabled: { opacity: 0.3 },
  skipTxt: { color: '#fff', fontSize: 14, fontWeight: '600' },
  stopBtn: { paddingHorizontal: 20, paddingVertical: 13, borderRadius: 12, backgroundColor: 'rgba(255,45,85,0.25)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.4)', alignItems: 'center' },
  stopTxt: { color: '#FF2D55', fontSize: 14, fontWeight: '700' },
  queueTitle: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 10 },
  playlistEndedTxt: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
  reorderBtns: { flexDirection: 'column', gap: 2, paddingRight: 4 },
  reorderArrow: { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: '700', textAlign: 'center' },
  extendGapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' },
  extendGapLabel: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', width: '100%', textAlign: 'center', marginBottom: 4 },
  extendGapBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  extendGapBtnTxt: { fontSize: 13, color: '#fff', fontWeight: '600', fontFamily: 'monospace' },
  micBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  micBtnActive: { backgroundColor: 'rgba(255,45,85,0.25)', borderColor: '#FF2D55', shadowColor: '#FF2D55', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  micIcon: { fontSize: 22 },
  // Tab bar
  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  tabActive: { backgroundColor: 'rgba(255,45,85,0.2)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  tabTxt: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: 1 },
  tabTxtActive: { color: '#FF2D55', fontWeight: '700' },
  tabBadge: { minWidth: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeTxt: { fontSize: 9, color: '#fff', fontWeight: '700' },
  // Chat
  chatMsg: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, marginBottom: 6 },
  chatMsgPicked: { backgroundColor: 'rgba(255,215,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)' },
  chatUser: { fontSize: 11, color: '#FF2D55', fontWeight: '700', marginBottom: 3, fontFamily: 'monospace' },
  chatSystem: { color: '#FFD700' },
  chatText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 19 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', paddingBottom: 28 },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chatSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FF2D55', alignItems: 'center', justifyContent: 'center' },
  chatSendTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  // Hand raises
  handsSection: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 12 },
  handCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  handCardPicked: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,215,0,0.07)', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)' },
  handAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,45,85,0.15)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)', alignItems: 'center', justifyContent: 'center' },
  handAvatarTxt: { color: '#FF2D55', fontSize: 16, fontWeight: '700' },
  handName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  pickedStar: { fontSize: 20 },
  handBtns: { flexDirection: 'row', gap: 6 },
  pickBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,45,85,0.2)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.4)' },
  pickBtnTxt: { color: '#FF2D55', fontSize: 12, fontWeight: '700' },
  ignoreBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  ignoreBtnTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  dismissBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)' },
  dismissTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' },
});

// ─── LISTENER SCREEN ──────────────────────────────────────────────────────────
function RadioListenerModal({ room: initialRoom, onClose }: { room: RadioRoom; onClose: () => void }) {
  const { t } = useTranslation();
  const [room, setRoom] = useState(initialRoom);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInGap, setIsInGap] = useState(false);
  const [gapCountdown, setGapCountdown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'playing' | 'chat'>('playing');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [myHandRaise, setMyHandRaise] = useState<HandRaise | null>(null);
  const [floaters, setFloaters] = useState<FloatingItem[]>([]);
  const [speakerMicActive, setSpeakerMicActive] = useState(false);
  const [agoraJoined, setAgoraJoined] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [userSounds, setUserSounds] = useState<UserSound[]>([]);
  const [loadingSounds, setLoadingSounds] = useState(false);
  const [hostDisconnected, setHostDisconnected] = useState(false);
  const seenReactionsRef = useRef<Set<string>>(new Set());
  const soundRef = useRef<Audio.Sound | null>(null);
  const currentIndexRef = useRef(initialRoom.currentTrackIndex);
  const listenerTrackStartedAtRef = useRef(initialRoom.trackStartedAt.getTime());
  const crossfadeCleanupRef = useRef<(() => void) | null>(null);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gapTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const chatUnsubRef = useRef<(() => void) | null>(null);
  const reactionsUnsubRef = useRef<(() => void) | null>(null);
  const handRaiseUnsubRef = useRef<(() => void) | null>(null);
  const chatListRef = useRef<FlatList<ChatMessage>>(null);
  const hostMicLiveRef = useRef(initialRoom.hostMicLive ?? false);
  const wasSpeakerRef = useRef(false);
  const roomRef = useRef(initialRoom);          // sempre aggiornato per sync asincrono
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Aggiorna roomRef ad ogni render così le callback asincrone vedono sempre lo stato attuale
  roomRef.current = room;

  const clearGapTimers = () => {
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    if (gapTickRef.current) clearInterval(gapTickRef.current);
  };

  const loadTrack = useCallback(async (r: RadioRoom, doFade = false) => {
    clearGapTimers();
    if (crossfadeCleanupRef.current) { crossfadeCleanupRef.current(); crossfadeCleanupRef.current = null; }
    const track = r.playlist[r.currentTrackIndex];
    if (!track) { setLoading(false); return; }

    const now = Date.now();
    const startAt = r.trackStartedAt.getTime();
    const waitMs = startAt - now;

    if (waitMs > 200) {
      setIsInGap(true);
      setGapCountdown(Math.ceil(waitMs / 1000));
      if (soundRef.current) {
        const s = soundRef.current; soundRef.current = null;
        s.stopAsync().catch(() => {}).finally(() => s.unloadAsync().catch(() => {}));
      }
      gapTickRef.current = setInterval(() => {
        setGapCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
      gapTimerRef.current = setTimeout(() => {
        setIsInGap(false);
        setGapCountdown(0);
        loadTrack({ ...r, trackStartedAt: new Date(startAt) }, false);
      }, waitMs + 100);
      setLoading(false);
      return;
    }

    setIsInGap(false);
    setGapCountdown(0);
    setLoading(true);
    const oldSound = doFade ? soundRef.current : null;
    if (!doFade && soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
    }
    soundRef.current = null;

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: false });
      refreshSpeakerphone();
      const targetVol = hostMicLiveRef.current ? DUCK_VOL : 1.0;
      // Carica silenziosamente prima, poi seek preciso DOPO il caricamento
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay: false, volume: 0 },
      );
      // Ricalcola elapsed DOPO il caricamento — compensa la latenza di rete
      const freshElapsed = Math.max(0, Date.now() - startAt);
      if (freshElapsed > 200) {
        await sound.setPositionAsync(freshElapsed).catch(() => {});
      }
      await sound.playAsync();
      if (doFade && oldSound) {
        crossfadeCleanupRef.current = startCrossfade(oldSound, sound, 2500, targetVol);
      } else {
        await sound.setVolumeAsync(targetVol).catch(() => {});
      }
      sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded) setIsPlaying(s.isPlaying); });
      soundRef.current = sound;
    } catch {
      Alert.alert(t('common.error'), t('radio.errors.cannotLoad'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    joinRadioRoom(initialRoom.id).catch(() => {});
    loadTrack(initialRoom);
    unsubRef.current = listenToRoom(initialRoom.id, (updated) => {
      setRoom(updated);
      // Heartbeat check: se hostLastSeen è > 2 min fa, avvisa
      if (updated.hostLastSeen) {
        const staleSec = (Date.now() - updated.hostLastSeen.getTime()) / 1000;
        setHostDisconnected(staleSec > 120);
      }
      if (updated.currentTrackIndex !== currentIndexRef.current) {
        currentIndexRef.current = updated.currentTrackIndex;
        listenerTrackStartedAtRef.current = updated.trackStartedAt.getTime();
        const hadNoGap = updated.trackStartedAt.getTime() <= Date.now() + 200;
        loadTrack(updated, hadNoGap);
      } else if (updated.trackStartedAt.getTime() > listenerTrackStartedAtRef.current + 500) {
        listenerTrackStartedAtRef.current = updated.trackStartedAt.getTime();
        loadTrack(updated, false);
      }
    });
    chatUnsubRef.current = listenToChat(initialRoom.id, (msgs) => {
      setChatMessages(msgs);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 80);
    });
    reactionsUnsubRef.current = listenToReactions(initialRoom.id, (reactions) => {
      const newOnes = reactions.filter(r => !seenReactionsRef.current.has(r.id));
      if (newOnes.length > 0) {
        newOnes.forEach(r => seenReactionsRef.current.add(r.id));
        const items: FloatingItem[] = newOnes.map(r => ({
          id: r.id + Date.now(),
          emoji: r.emoji,
          x: Math.floor(Math.random() * (SW - 80)) + 20,
        }));
        setFloaters(prev => [...prev, ...items]);
      }
    });
    handRaiseUnsubRef.current = listenToMyHandRaise(initialRoom.id, setMyHandRaise);

    // Agora: join as audience
    fetchAgoraToken(initialRoom.id).then(async (token) => {
      try {
        const uid = auth.currentUser?.uid ?? '';
        const isCohost = initialRoom.cohosts?.includes(uid) ?? false;
        if (isCohost) {
          await joinAsHost(initialRoom.id, token);
        } else {
          await joinAsAudience(initialRoom.id, token);
        }
        setAgoraJoined(true);
      } catch {}
    });

    // Drift correction: ogni 30s controlla se il listener è fuori sync di più di 1.5s
    syncIntervalRef.current = setInterval(async () => {
      if (!soundRef.current || !roomRef.current) return;
      const expected = Math.max(0, Date.now() - roomRef.current.trackStartedAt.getTime());
      const status = await soundRef.current.getStatusAsync().catch(() => null);
      if (!status?.isLoaded || !status.isPlaying) return;
      const drift = Math.abs(status.positionMillis - expected);
      if (drift > 1500) {
        soundRef.current.setPositionAsync(Math.max(0, expected)).catch(() => {});
      }
    }, 30_000);

    return () => {
      clearGapTimers();
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (crossfadeCleanupRef.current) { crossfadeCleanupRef.current(); crossfadeCleanupRef.current = null; }
      leaveRadioRoom(initialRoom.id).catch(() => {});
      if (soundRef.current) {
        const s = soundRef.current;
        soundRef.current = null;
        s.stopAsync().catch(() => {}).finally(() => s.unloadAsync().catch(() => {}));
      }
      unsubRef.current?.();
      chatUnsubRef.current?.();
      reactionsUnsubRef.current?.();
      handRaiseUnsubRef.current?.();
      leaveAgoraChannel().catch(() => {});
      destroyAgoraEngine();
    };
  }, []);

  // Ducking lato listener: abbassa la musica quando l'host attiva il microfono
  useEffect(() => {
    hostMicLiveRef.current = room.hostMicLive ?? false;
    soundRef.current?.setVolumeAsync(room.hostMicLive ? DUCK_VOL : 1.0).catch(() => {});
  }, [room.hostMicLive]);

  // Promozione/revoca speaker — reagisce ai cambiamenti di activeSpeakers e cohosts
  const myUid = auth.currentUser?.uid ?? '';
  const isSpeaker = (room.activeSpeakers?.includes(myUid) ?? false) || (room.cohosts?.includes(myUid) ?? false);
  useEffect(() => {
    if (!agoraJoined) return;
    if (isSpeaker && !wasSpeakerRef.current) {
      wasSpeakerRef.current = true;
      upgradeToSpeaker().catch(() => {});
    } else if (!isSpeaker && wasSpeakerRef.current) {
      wasSpeakerRef.current = false;
      setSpeakerMicActive(false);
      downgradeToAudience().catch(() => {});
    }
  }, [isSpeaker, agoraJoined]);

  const togglePlay = async () => {
    if (!soundRef.current) return;
    if (isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      // Re-sync alla posizione attesa prima di riprendere
      if (roomRef.current) {
        const expected = Math.max(0, Date.now() - roomRef.current.trackStartedAt.getTime());
        await soundRef.current.setPositionAsync(expected).catch(() => {});
      }
      await soundRef.current.playAsync();
    }
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || sendingMsg) return;
    setSendingMsg(true);
    setChatInput('');
    try {
      const name = auth.currentUser?.displayName ?? 'Ascoltatore';
      await sendChatMessage(room.id, text, name);
    } catch {}
    finally { setSendingMsg(false); }
  };

  const handleReaction = async (emoji: string) => {
    try { await sendReaction(room.id, emoji); } catch {}
  };

  const handleHandRaise = async () => {
    if (myHandRaise) {
      try { await lowerHand(room.id); } catch {}
    } else {
      const name = auth.currentUser?.displayName ?? 'Ascoltatore';
      try { await raiseHand(room.id, name); } catch {}
    }
  };

  const handleSpeakerMicToggle = () => {
    if (!agoraJoined || !isSpeaker) return;
    const next = !speakerMicActive;
    setSpeakerMicActive(next);
    setMicActive(next);
    // Speaker: muto sul proprio device quando mic attivo (evita che il mic riprenda la musica)
    soundRef.current?.setVolumeAsync(next ? 0 : 1.0).catch(() => {});
  };

  const openSuggest = async () => {
    setShowSuggest(true);
    if (userSounds.length > 0 || loadingSounds) return;
    setLoadingSounds(true);
    try {
      const sounds = await fetchUserSoundsForSuggestion();
      setUserSounds(sounds);
    } catch {} finally { setLoadingSounds(false); }
  };

  const handleSuggest = async (sound: UserSound) => {
    const name = auth.currentUser?.displayName ?? 'Ascoltatore';
    try {
      await suggestTrack(room.id, { soundId: sound.id, soundName: sound.title, soundUrl: sound.audioUrl, userName: name });
      setShowSuggest(false);
      Alert.alert('Suggerimento inviato! 🎵', 'L\'host può approvare il tuo suono.');
    } catch { Alert.alert(t('common.error'), 'Impossibile inviare il suggerimento.'); }
  };

  const currentTrack = room.playlist[room.currentTrackIndex];
  const isPicked = myHandRaise?.status === 'picked';
  const isCohost = room.cohosts?.includes(myUid) ?? false;

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />
      <View style={lm.orb} />

      {/* Floating reactions overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {floaters.map(item => (
          <FloatingReaction key={item.id} item={item} onDone={() =>
            setFloaters(prev => prev.filter(f => f.id !== item.id))
          } />
        ))}
      </View>

      {/* Header */}
      <View style={lm.header}>
        <TouchableOpacity onPress={onClose} style={lm.closeBtn} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
          <Text style={lm.closeTxt}>✕</Text>
        </TouchableOpacity>
        <View style={lm.liveBadge}>
          <View style={lm.liveDot} />
          <Text style={lm.liveTxt}>{isInGap ? t('radio.pause') : t('radio.live')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab bar */}
      <View style={lm.tabBar}>
        <TouchableOpacity style={[lm.tab, activeTab === 'playing' && lm.tabActive]} onPress={() => setActiveTab('playing')}>
          <Text style={[lm.tabTxt, activeTab === 'playing' && lm.tabTxtActive]}>{t('radio.playing')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[lm.tab, activeTab === 'chat' && lm.tabActive]} onPress={() => setActiveTab('chat')}>
          <Text style={[lm.tabTxt, activeTab === 'chat' && lm.tabTxtActive]}>{t('radio.chatTab')}</Text>
          {chatMessages.length > 0 && <View style={lm.tabBadge}><Text style={lm.tabBadgeTxt}>{chatMessages.length > 99 ? '99+' : chatMessages.length}</Text></View>}
        </TouchableOpacity>
      </View>

      {/* Tab: IN ONDA */}
      {activeTab === 'playing' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={lm.content} showsVerticalScrollIndicator={false}>
          {hostDisconnected && (
            <View style={lm.disconnectedBanner}>
              <Text style={lm.disconnectedTxt}>⚠️ L'host potrebbe essersi disconnesso</Text>
            </View>
          )}
          <Text style={lm.stationName}>{room.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Text style={lm.hostLine}>condotta da @{room.hostName}</Text>
            {room.hostMicLive && (
              <View style={lm.micLiveBadge}>
                <Text style={lm.micLiveTxt}>🎙 in diretta</Text>
              </View>
            )}
          </View>

          {/* Cohost banner */}
          {isCohost && (
            <View style={[lm.pickedBanner, { borderColor: 'rgba(0,255,156,0.3)', backgroundColor: 'rgba(0,255,156,0.1)' }]}>
              <Text style={[lm.pickedBannerTxt, { color: '#00FF9C' }]}>🎙 Sei cohost!</Text>
            </View>
          )}
          {/* Scelto banner */}
          {isPicked && !isCohost && (
            <View style={lm.pickedBanner}>
              <Text style={lm.pickedBannerTxt}>⭐ Sei stato scelto dall'host!</Text>
            </View>
          )}
          {/* Mic button for speaker/cohost */}
          {isSpeaker && (
            <TouchableOpacity
              style={[lm.speakerMicBtn, speakerMicActive && lm.speakerMicBtnActive]}
              onPress={handleSpeakerMicToggle}
              disabled={!agoraJoined}
            >
              <Text style={lm.speakerMicIcon}>{speakerMicActive ? '🎙 Microfono on' : '🔇 Microfono off'}</Text>
            </TouchableOpacity>
          )}

          <View style={lm.nowCard}>
            <Text style={lm.nowLabel}>{isInGap ? t('radio.pause') : t('radio.nowOnAir')}</Text>
            {isInGap ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={lm.gapNum}>{gapCountdown}s</Text>
                {currentTrack && <Text style={lm.gapInfo}>{t('radio.nowPlaying').toLowerCase()}: {currentTrack.name.replace(/\.[^.]+$/, '')}</Text>}
              </View>
            ) : (
              <>
                <Text style={lm.nowTrack} numberOfLines={2}>{currentTrack?.name.replace(/\.[^.]+$/, '') ?? '—'}</Text>
                <Text style={lm.trackPos}>{room.currentTrackIndex + 1} / {room.playlist.length} {t('radio.tracks')}</Text>
                <WaveformAnim active={isPlaying && !isInGap} color="#FF2D55" />
              </>
            )}
            {/* Nessun play/pause manuale — la riproduzione è controllata dal server */}
          </View>

          {/* Reaction buttons */}
          <View style={lm.reactionsRow}>
            {REACTION_EMOJIS.map(emoji => (
              <TouchableOpacity key={emoji} style={lm.reactionBtn} onPress={() => handleReaction(emoji)}>
                <Text style={lm.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={lm.listenerTxt}>🎧 {room.listenerCount} {t('radio.listeners')}</Text>
            <TouchableOpacity style={lm.suggestBtn} onPress={openSuggest}>
              <Text style={lm.suggestBtnTxt}>🎵 Suggerisci</Text>
            </TouchableOpacity>
          </View>

          <Text style={lm.queueTitle}>{t('radio.queue')}</Text>
          {room.playlist.map((track, i) => (
            <QueueRow key={i} track={track} index={i} current={i === room.currentTrackIndex}
              isGap={isInGap && i === room.currentTrackIndex}
              gapCountdown={isInGap && i === room.currentTrackIndex ? gapCountdown : undefined} />
          ))}
          {!room.isLive && <Text style={lm.offAir}>{t('radio.ended')}</Text>}
        </ScrollView>
      )}

      {/* Suggest modal */}
      {showSuggest && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setShowSuggest(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
            <View style={{ backgroundColor: '#0D0D1A', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, maxHeight: '70%' }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 }} />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 }}>🎵 Suggerisci un suono</Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'monospace', marginBottom: 16 }}>scegli uno dei tuoi suoni caricati</Text>
              {loadingSounds ? (
                <ActivityIndicator color="#FF2D55" style={{ marginTop: 20 }} />
              ) : userSounds.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                  <Text style={{ fontSize: 32, marginBottom: 10 }}>🎵</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: 'monospace', textAlign: 'center' }}>
                    nessun suono caricato{'\n'}registra un suono nella Home!
                  </Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {userSounds.map(s => (
                    <TouchableOpacity
                      key={s.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
                      onPress={() => handleSuggest(s)}
                    >
                      <Text style={{ fontSize: 22 }}>🎧</Text>
                      <Text style={{ flex: 1, color: '#fff', fontSize: 13, fontWeight: '500' }} numberOfLines={2}>{s.title}</Text>
                      <Text style={{ color: '#FF2D55', fontSize: 12, fontWeight: '700' }}>Suggerisci →</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity style={{ marginTop: 12, padding: 12, alignItems: 'center' }} onPress={() => setShowSuggest(false)}>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Annulla</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Tab: CHAT */}
      {activeTab === 'chat' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
          {(isPicked || isCohost) && (
            <View style={[lm.pickedBannerSmall, isCohost && { backgroundColor: 'rgba(0,255,156,0.1)', borderBottomColor: 'rgba(0,255,156,0.2)' }]}>
              <Text style={[lm.pickedBannerTxt, isCohost && { color: '#00FF9C' }]}>{isCohost ? '🎙 Sei cohost!' : '⭐ Sei in evidenza!'}</Text>
            </View>
          )}
          <FlatList
            ref={chatListRef}
            data={chatMessages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <View style={[lm.chatMsg, item.isPicked && lm.chatMsgPicked]}>
                <Text style={[lm.chatUser, item.userId === 'system' && lm.chatSystem]}>{item.userName}</Text>
                <Text style={lm.chatText}>{item.text}</Text>
              </View>
            )}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>💬</Text>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: 'monospace' }}>nessun messaggio ancora</Text>
              </View>
            }
          />
          {/* Reaction buttons */}
          <View style={lm.reactionsRow}>
            {REACTION_EMOJIS.map(emoji => (
              <TouchableOpacity key={emoji} style={lm.reactionBtn} onPress={() => handleReaction(emoji)}>
                <Text style={lm.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Input row */}
          <View style={lm.chatInputRow}>
            <TouchableOpacity
              style={[lm.handBtn, myHandRaise && (isPicked ? lm.handBtnPicked : lm.handBtnRaised)]}
              onPress={handleHandRaise}
            >
              <Text style={lm.handBtnTxt}>{myHandRaise ? (isPicked ? '⭐' : '✋') : '🙋'}</Text>
            </TouchableOpacity>
            <TextInput style={lm.chatInput} placeholder={t('radio.chatPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.25)" value={chatInput}
              onChangeText={setChatInput} onSubmitEditing={handleSendChat} returnKeyType="send" />
            <TouchableOpacity style={[lm.chatSendBtn, (!chatInput.trim() || sendingMsg) && { opacity: 0.4 }]}
              onPress={handleSendChat} disabled={!chatInput.trim() || sendingMsg}>
              <Text style={lm.chatSendTxt}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}

const lm = StyleSheet.create({
  orb: { position: 'absolute', width: 350, height: 350, borderRadius: 175, backgroundColor: 'rgba(255,45,85,0.06)', top: -80, right: -100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,45,85,0.18)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.35)' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF2D55' },
  liveTxt: { color: '#FF2D55', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  content: { padding: 20, paddingBottom: 48 },
  stationName: { fontSize: 26, fontWeight: '700', fontStyle: 'italic', color: '#fff', marginBottom: 4 },
  hostLine: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  micLiveBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(255,45,85,0.15)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  micLiveTxt: { fontSize: 10, color: '#FF2D55', fontWeight: '700', fontFamily: 'monospace' },
  nowCard: { backgroundColor: 'rgba(255,45,85,0.08)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,45,85,0.18)', alignItems: 'center', marginBottom: 12 },
  nowLabel: { fontSize: 9, color: '#FF2D55', fontFamily: 'monospace', letterSpacing: 2.5, marginBottom: 10, alignSelf: 'flex-start' },
  nowTrack: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 26, marginBottom: 4 },
  trackPos: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  gapNum: { fontSize: 48, fontWeight: '700', color: '#fff', lineHeight: 54 },
  gapInfo: { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', marginTop: 6, textAlign: 'center' },
  playBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FF2D55', alignItems: 'center', justifyContent: 'center', shadowColor: '#FF2D55', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, marginTop: 4 },
  playIcon: { fontSize: 24, color: '#fff' },
  listenerTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', marginBottom: 24 },
  queueTitle: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 10 },
  offAir: { textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: 'monospace', marginTop: 20 },
  disconnectedBanner: { backgroundColor: 'rgba(255,165,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,165,0,0.3)', borderRadius: 10, padding: 10, marginBottom: 12 },
  disconnectedTxt: { color: '#FFA500', fontSize: 12, fontFamily: 'monospace', textAlign: 'center' },
  // Tab bar
  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  tabActive: { backgroundColor: 'rgba(255,45,85,0.2)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  tabTxt: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: 1 },
  tabTxtActive: { color: '#FF2D55', fontWeight: '700' },
  tabBadge: { minWidth: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeTxt: { fontSize: 9, color: '#fff', fontWeight: '700' },
  // Picked banner
  pickedBanner: { backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)', alignItems: 'center', marginBottom: 12 },
  pickedBannerSmall: { backgroundColor: 'rgba(255,215,0,0.1)', paddingVertical: 8, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,215,0,0.2)' },
  pickedBannerTxt: { color: '#FFD700', fontSize: 13, fontWeight: '700' },
  // Reactions
  reactionsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  reactionBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  reactionEmoji: { fontSize: 22 },
  // Chat
  chatMsg: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, marginBottom: 6 },
  chatMsgPicked: { backgroundColor: 'rgba(255,215,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)' },
  chatUser: { fontSize: 11, color: '#FF2D55', fontWeight: '700', marginBottom: 3, fontFamily: 'monospace' },
  chatSystem: { color: '#FFD700' },
  chatText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 19 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', paddingBottom: 28 },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chatSendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FF2D55', alignItems: 'center', justifyContent: 'center' },
  chatSendTxt: { color: '#fff', fontSize: 17, fontWeight: '700' },
  // Hand raise button
  handBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  handBtnRaised: { backgroundColor: 'rgba(255,165,0,0.2)', borderColor: 'rgba(255,165,0,0.5)' },
  handBtnPicked: { backgroundColor: 'rgba(255,215,0,0.2)', borderColor: 'rgba(255,215,0,0.5)' },
  handBtnTxt: { fontSize: 18 },
  // Speaker mic
  speakerMicBtn: { alignSelf: 'center', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', marginBottom: 14 },
  speakerMicBtnActive: { backgroundColor: 'rgba(255,45,85,0.2)', borderColor: '#FF2D55', shadowColor: '#FF2D55', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  speakerMicIcon: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
  // Suggest
  suggestBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,45,85,0.1)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.25)' },
  suggestBtnTxt: { color: '#FF2D55', fontSize: 11, fontWeight: '600', fontFamily: 'monospace' },
});

// ─── CREA STANZA ──────────────────────────────────────────────────────────────
const SCHEDULE_PRESETS = [
  { label: '30 min', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
  { label: 'Domani', minutes: 24 * 60 },
];

function CreateRoomModal({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadIdx, setUploadIdx] = useState(0);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleMinutes, setScheduleMinutes] = useState(60);

  const addTrack = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/flac', 'audio/aac'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      // Rileva durata
      let duration: number | undefined;
      try {
        const { sound, status } = await Audio.Sound.createAsync({ uri: asset.uri }, { shouldPlay: false });
        if (status.isLoaded && status.durationMillis) duration = Math.floor(status.durationMillis / 1000);
        await sound.unloadAsync();
      } catch {}

      setTracks(prev => [...prev, {
        uri: asset.uri,
        name: asset.name ?? `Traccia ${prev.length + 1}`,
        duration,
        gapAfter: 0,
        uploaded: false,
      }]);
    } catch { Alert.alert(t('common.error'), t('radio.errors.cannotOpen')); }
  };

  const removeTrack = (i: number) => setTracks(prev => prev.filter((_, idx) => idx !== i));

  const moveTrack = (i: number, dir: 'up' | 'down') => {
    setTracks(prev => {
      const arr = [...prev];
      const swap = dir === 'up' ? i - 1 : i + 1;
      if (swap < 0 || swap >= arr.length) return arr;
      [arr[i], arr[swap]] = [arr[swap], arr[i]];
      return arr;
    });
  };

  const setGap = (i: number, gap: number) => {
    setTracks(prev => prev.map((t, idx) => idx === i ? { ...t, gapAfter: gap } : t));
  };

  const startEditName = (i: number) => {
    setEditingName(i);
    setEditingNameValue(tracks[i].name.replace(/\.[^.]+$/, ''));
  };

  const confirmEditName = (i: number) => {
    if (editingNameValue.trim()) {
      const ext = tracks[i].name.includes('.') ? tracks[i].name.split('.').pop() : '';
      setTracks(prev => prev.map((t, idx) => idx === i
        ? { ...t, name: editingNameValue.trim() + (ext ? `.${ext}` : '') }
        : t));
    }
    setEditingName(null);
  };

  const handleCreate = async () => {
    if (!title.trim()) { Alert.alert(t('radio.titleRequired')); return; }
    if (tracks.length === 0) { Alert.alert(t('radio.tracksRequired')); return; }
    const hostName = auth.currentUser?.displayName ?? auth.currentUser?.email ?? 'utente';
    setUploading(true);
    try {
      const uploaded: PlaylistTrack[] = [];
      for (let i = 0; i < tracks.length; i++) {
        setUploadIdx(i);
        const tr = tracks[i];
        const pt = await uploadTrack({ uri: tr.uri, name: tr.name, duration: tr.duration, gapAfter: tr.gapAfter });
        uploaded.push(pt);
      }
      if (isScheduled) {
        const scheduledFor = new Date(Date.now() + scheduleMinutes * 60 * 1000);
        await scheduleRadioRoom({ title: title.trim(), description: description.trim(), playlist: uploaded, hostName, scheduledFor });
      } else {
        await createRadioRoom({ title: title.trim(), description: description.trim(), playlist: uploaded, hostName });
      }
      onCreated();
    } catch { Alert.alert(t('common.error'), t('radio.errors.cannotStart')); }
    finally { setUploading(false); }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={cm.overlay}>
        <View style={cm.sheet}>
          <LinearGradient colors={['#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} borderRadius={20} />
          <View style={cm.handle} />
          <Text style={cm.sheetTitle}>🎙  Vai in Radio</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TextInput
              style={cm.input}
              placeholder={t('radio.stationNamePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[cm.input, { height: 64, textAlignVertical: 'top' }]}
              placeholder={t('radio.descriptionPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={description}
              onChangeText={setDescription}
              multiline
            />

            {/* Playlist builder */}
            <View style={cm.section}>
              <Text style={cm.sectionLabel}>SCALETTA · {tracks.length} {tracks.length === 1 ? 'traccia' : 'tracce'}</Text>

              {tracks.map((t, i) => (
                <View key={i} style={cm.trackCard}>
                  {/* Riga principale */}
                  <View style={cm.trackTop}>
                    {/* Riordina */}
                    <View style={cm.reorderBtns}>
                      <TouchableOpacity onPress={() => moveTrack(i, 'up')} disabled={i === 0} style={[cm.reorderBtn, i === 0 && { opacity: 0.2 }]}>
                        <Text style={cm.reorderTxt}>↑</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => moveTrack(i, 'down')} disabled={i === tracks.length - 1} style={[cm.reorderBtn, i === tracks.length - 1 && { opacity: 0.2 }]}>
                        <Text style={cm.reorderTxt}>↓</Text>
                      </TouchableOpacity>
                    </View>
                    {/* Numero */}
                    <Text style={cm.trackNum}>{i + 1}</Text>
                    {/* Nome (toccabile per modificare) */}
                    <View style={{ flex: 1 }}>
                      {editingName === i ? (
                        <TextInput
                          style={cm.trackNameInput}
                          value={editingNameValue}
                          onChangeText={setEditingNameValue}
                          onBlur={() => confirmEditName(i)}
                          onSubmitEditing={() => confirmEditName(i)}
                          autoFocus
                        />
                      ) : (
                        <TouchableOpacity onPress={() => startEditName(i)}>
                          <Text style={cm.trackName} numberOfLines={1}>{t.name.replace(/\.[^.]+$/, '')}</Text>
                          {t.duration !== undefined && (
                            <Text style={cm.trackDuration}>{fmtSec(t.duration)}</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                    {/* Elimina */}
                    <TouchableOpacity onPress={() => removeTrack(i)} style={cm.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={cm.removeTxt}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Gap setting (non sull'ultima traccia) */}
                  {i < tracks.length - 1 && (
                    <View style={cm.gapRow}>
                      <Text style={cm.gapLabel}>⏸ pausa dopo:</Text>
                      {GAP_OPTIONS.map(g => (
                        <TouchableOpacity
                          key={g}
                          style={[cm.gapChip, t.gapAfter === g && cm.gapChipActive]}
                          onPress={() => setGap(i, g)}
                        >
                          <Text style={[cm.gapChipTxt, t.gapAfter === g && cm.gapChipTxtActive]}>
                            {g === 0 ? 'no' : `${g}s`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ))}

              <TouchableOpacity style={cm.addBtn} onPress={addTrack} disabled={uploading}>
                <Text style={cm.addBtnTxt}>+ Aggiungi traccia</Text>
              </TouchableOpacity>
            </View>

            {/* Programma per dopo */}
            <View style={cm.scheduleSection}>
              <TouchableOpacity style={cm.scheduleToggle} onPress={() => setIsScheduled(!isScheduled)}>
                <View style={[cm.scheduleCheck, isScheduled && cm.scheduleCheckOn]}>
                  {isScheduled && <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✓</Text>}
                </View>
                <Text style={cm.scheduleLbl}>Programma per dopo</Text>
              </TouchableOpacity>
              {isScheduled && (
                <View style={cm.presetRow}>
                  {SCHEDULE_PRESETS.map(p => (
                    <TouchableOpacity
                      key={p.minutes}
                      style={[cm.presetChip, scheduleMinutes === p.minutes && cm.presetChipActive]}
                      onPress={() => setScheduleMinutes(p.minutes)}
                    >
                      <Text style={[cm.presetChipTxt, scheduleMinutes === p.minutes && cm.presetChipTxtActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Upload progress */}
            {uploading && (
              <View style={cm.progressWrap}>
                <View style={cm.progressBar}>
                  <View style={[cm.progressFill, { width: `${((uploadIdx + 1) / tracks.length) * 100}%` as any }]} />
                </View>
                <Text style={cm.progressTxt}>Caricando traccia {uploadIdx + 1} di {tracks.length}...</Text>
              </View>
            )}

            <View style={cm.actions}>
              <TouchableOpacity style={cm.cancelBtn} onPress={onClose} disabled={uploading}>
                <Text style={cm.cancelTxt}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={cm.createBtn} onPress={handleCreate} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={cm.createTxt}>{isScheduled ? '📅 Programma' : t('radio.goLive')}</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const cm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, overflow: 'hidden', maxHeight: '92%' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontWeight: '700', fontStyle: 'italic', color: '#fff', marginBottom: 16 },
  input: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  section: { marginBottom: 14 },
  sectionLabel: { fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 10 },
  trackCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  trackTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reorderBtns: { gap: 2 },
  reorderBtn: { width: 22, height: 22, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  reorderTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 16 },
  trackNum: { width: 16, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', textAlign: 'center' },
  trackName: { fontSize: 13, color: '#fff', lineHeight: 17 },
  trackDuration: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginTop: 1 },
  trackNameInput: { fontSize: 13, color: '#fff', borderBottomWidth: 1, borderBottomColor: '#FF2D55', paddingVertical: 2 },
  removeBtn: { padding: 3 },
  removeTxt: { fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: '700' },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, flexWrap: 'wrap' },
  gapLabel: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginRight: 2 },
  gapChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  gapChipActive: { backgroundColor: 'rgba(255,45,85,0.2)', borderColor: 'rgba(255,45,85,0.4)' },
  gapChipTxt: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  gapChipTxtActive: { color: '#FF2D55', fontWeight: '700' },
  addBtn: { paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,255,156,0.25)', alignItems: 'center', marginTop: 4 },
  addBtnTxt: { color: '#00FF9C', fontSize: 13, fontFamily: 'monospace' },
  progressWrap: { marginBottom: 12 },
  progressBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#00FF9C', borderRadius: 2 },
  progressTxt: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  cancelTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  createBtn: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: '#FF2D55', alignItems: 'center' },
  createTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  scheduleSection: { marginBottom: 14 },
  scheduleToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  scheduleCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  scheduleCheckOn: { backgroundColor: '#FF2D55', borderColor: '#FF2D55' },
  scheduleLbl: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 },
  presetChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  presetChipActive: { backgroundColor: 'rgba(255,45,85,0.2)', borderColor: 'rgba(255,45,85,0.4)' },
  presetChipTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace' },
  presetChipTxtActive: { color: '#FF2D55', fontWeight: '700' },
});

// ─── Offline Station Player ───────────────────────────────────────────────────
// Avatar foto DJ con fallback automatico alle iniziali se l'immagine non carica
function SlotPhoto({ uri, color, isCurrent, initials }: { uri: string; color: string; isCurrent: boolean; initials: string }) {
  const [err, setErr] = useState(false);
  const size = isCurrent ? 54 : 44;
  const radius = size / 2;
  if (err) {
    return (
      <View style={[isCurrent ? palSt.avatarBgLg : palSt.avatarBg, { backgroundColor: color + (isCurrent ? '2E' : '12') }]}>
        <Text style={[palSt.avatarTxt, { color: isCurrent ? color : 'rgba(255,255,255,0.3)', fontSize: isCurrent ? 18 : 14 }]}>{initials}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: radius, borderWidth: isCurrent ? 2 : 1, borderColor: color, opacity: isCurrent ? 1 : 0.75 }}
      resizeMode="cover"
      onError={() => setErr(true)}
    />
  );
}

function OfflineStationPlayer({ station, onClose }: { station: OfflineStation; onClose: () => void }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBufferingStream, setIsBufferingStream] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusLabel, setStatusLabel] = useState('Ricerca stream...');
  const [error, setError] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingInfo | null>(null);
  const [djImgError, setDjImgError] = useState(false);
  const [showPalinsesto, setShowPalinsesto] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
  const scheduleScrollRef = useRef<any>(null);
  const livePulse = useRef(new Animated.Value(1)).current;
  const [timeUpdate, setTimeUpdate] = useState(0);

  useEffect(() => {
    if (!TrackPlayer) return;
    const sub = TrackPlayer.addEventListener(Event.PlaybackState, async () => {
      const state = await TrackPlayer.getState();
      setIsPlaying(state === State.Playing);
      setIsBufferingStream(state === State.Buffering || state === State.Connecting);
    });
    return () => sub.remove();
  }, []);

  // Fetch audio stream
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (mounted) setStatusLabel(
          FALLBACK_STREAM_URLS[station.searchName] ? 'Connessione...' : 'Ricerca stream...'
        );
        const streamUrl = await fetchRadioBrowserUrl(station.searchName);
        if (!streamUrl) throw new Error('Nessun stream trovato');
        if (!mounted) return;

        if (!TrackPlayer) throw new Error('TrackPlayer non disponibile su questo dispositivo');

        // setupPlayer: ignora player_already_initialized (normale se già in uso)
        // ma rilancia android_cannot_setup_player_in_background (app in background)
        try {
          await TrackPlayer.setupPlayer({
            autoHandleInterruptions: true,
            // Buffer ottimizzato per streaming radio live
            minBuffer: 15,
            maxBuffer: 50,
            playBuffer: 2,
            backBuffer: 0,
          });
        } catch (e: any) {
          if (e?.code !== 'player_already_initialized') {
            // Errore reale (es. android_cannot_setup_player_in_background)
            throw e;
          }
          // player_already_initialized è normale: il player era già pronto
        }

        await TrackPlayer.updateOptions({
          android: {
            // La notifica rimane anche quando l'app viene swipata dai recenti
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior?.ContinuePlayback ?? 1,
          },
          capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
          compactCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
        });

        await TrackPlayer.reset();
        await TrackPlayer.add({
          id: station.id,
          url: streamUrl,
          title: station.name,
          artist: nowPlaying?.djName || 'Radio in diretta',
          artwork: nowPlaying?.djImageUrl || station.logoUrl,
        });
        await TrackPlayer.play();
        if (mounted) setLoading(false);
      } catch (e) {
        console.warn('RadioPlayer error:', e);
        if (mounted) { setLoading(false); setError(true); }
      }
    })();
    return () => {
      mounted = false;
      TrackPlayer?.reset().catch(() => {});
    };
  }, []);

  // Fetch "Ora in onda" — al mount e ogni 15 min
  useEffect(() => {
    let cancelled = false;
    let interval: NodeJS.Timeout;

    const load = async () => {
      const info = await fetchNowPlaying(station.id);
      if (!cancelled) { setNowPlaying(info); setDjImgError(false); }
    };

    const startInterval = () => {
      load();
      interval = setInterval(() => {
        _npCache.delete(station.id);
        load();
      }, NP_TTL);
    };

    startInterval();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        clearInterval(interval);
      } else if (state === 'active') {
        startInterval();
      }
    });

    return () => { 
      cancelled = true; 
      clearInterval(interval); 
      sub.remove();
    };
  }, [station.id]);

  // Update time exactly at slot changes and every minute for precision
  useEffect(() => {
    let timerId: NodeJS.Timeout;

    const scheduleNextUpdate = () => {
      const now = new Date();
      // Calcoliamo quanti ms mancano allo scoccare del prossimo minuto
      const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      
      // Troviamo anche se c'è un cambio slot imminente (opzionale ma utile)
      // Per semplicità, aggiornare ogni minuto è lo standard d'oro.
      
      timerId = setTimeout(() => {
        setTimeUpdate(t => t + 1);
        scheduleNextUpdate(); // Programma il prossimo minuto
      }, msUntilNextMinute + 100); // +100ms di margine per sicurezza
    };

    scheduleNextUpdate();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        clearTimeout(timerId);
      } else if (state === 'active') {
        setTimeUpdate(t => t + 1);
        scheduleNextUpdate();
      }
    });

    return () => {
      clearTimeout(timerId);
      sub.remove();
    };
  }, []);

  const togglePlay = async () => {
    if (!TrackPlayer) return;
    if (isPlaying) await TrackPlayer.pause();
    else await TrackPlayer.play();
  };

  const statusText = loading ? statusLabel : error ? 'Stream non disponibile' : isBufferingStream ? 'Connessione...' : isPlaying ? 'IN ONDA' : 'IN PAUSA';
  const today = new Date().getDay();
  const scheduleSlotsForLive = getScheduleSlots(station.id, today);
  const currentSlotIdx = getCurrentSlotIndex(scheduleSlotsForLive);
  const currentSlot = currentSlotIdx >= 0 ? scheduleSlotsForLive[currentSlotIdx] : null;
  const scheduleSlots = getScheduleSlots(station.id, selectedDay);
  const isToday = selectedDay === today;
  // Per "ORA IN ONDA": priorità API live → palinsesto statico → iniziali
  const staticSlotPhoto = currentSlot
    ? (currentSlot.djPhotoUrl ?? getDjPhoto(currentSlot.djName ?? ''))
    : undefined;
  const liveApiPhoto = nowPlaying?.djImageUrl && !djImgError ? nowPlaying.djImageUrl : undefined;
  // Foto DJ vera (non logo stazione generico)
  const resolvedDjPhoto = liveApiPhoto ?? staticSlotPhoto;
  // Nome e show: API live ha priorità, poi palinsesto statico
  const effectiveDjName = nowPlaying?.djName || currentSlot?.djName || station.name;
  const effectiveShowName = nowPlaying?.showName || currentSlot?.showName || station.genre;
  const hasDjPhoto = !!resolvedDjPhoto;

  // Animazione pulse per badge LIVE ORA
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    const startAnim = () => {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(livePulse, { toValue: 0.2, duration: 700, useNativeDriver: true }),
          Animated.timing(livePulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      anim.start();
    };

    startAnim();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        anim?.stop();
      } else if (state === 'active') {
        startAnim();
      }
    });

    return () => {
      sub.remove();
      anim?.stop();
    };
  }, [livePulse]);

  // Auto-scroll allo slot corrente quando si apre il palinsesto
  useEffect(() => {
    if (!showPalinsesto || currentSlotIdx < 0 || !scheduleScrollRef.current) return;
    setTimeout(() => {
      scheduleScrollRef.current?.scrollTo({ y: Math.max(0, currentSlotIdx * 80 - 40), animated: true });
    }, 300);
  }, [showPalinsesto, currentSlotIdx]);



  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <LinearGradient colors={['#050508', '#0D0D1A', '#1A0A2E']} style={StyleSheet.absoluteFill} />

      {/* Orb decorativa colorata */}
      <View style={[osp.orb, { backgroundColor: station.color + '18' }]} />

      {/* Header */}
      <View style={osp.header}>
        <TouchableOpacity onPress={onClose} style={osp.closeBtn} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
          <Text style={osp.closeTxt}>✕</Text>
        </TouchableOpacity>
        <Text style={osp.headerLabel}>📻 RADIO</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={osp.tabBar}>
        <TouchableOpacity
          style={[osp.tab, !showPalinsesto && { borderBottomColor: station.color }]}
          onPress={() => setShowPalinsesto(false)}
        >
          <Text style={[osp.tabTxt, !showPalinsesto && { color: station.color }]}>▶ ORA IN ONDA</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[osp.tab, showPalinsesto && { borderBottomColor: station.color }]}
          onPress={() => setShowPalinsesto(true)}
        >
          <Text style={[osp.tabTxt, showPalinsesto && { color: station.color }]}>📋 PALINSESTO</Text>
        </TouchableOpacity>
      </View>

      {!showPalinsesto ? (
      <View style={osp.body}>

        <>
          {hasDjPhoto ? (
            /* ── Foto DJ vera disponibile ── */
            <View style={[osp.djPhotoWrap, { borderColor: station.color, shadowColor: station.color }]}>
              <Image
                source={{ uri: resolvedDjPhoto! }}
                style={osp.djPhoto}
                onError={() => setDjImgError(true)}
              />
            </View>
          ) : (
            /* ── Nessuna foto DJ: cerchio con logo stazione + waveform ── */
            <View style={[osp.circle, { borderColor: station.color + '55', shadowColor: station.color }]}>
              <LinearGradient
                colors={[station.color + '30', station.color + '10']}
                style={StyleSheet.absoluteFill}
                borderRadius={80}
              />
              <Image
                source={{ uri: station.logoUrl }}
                style={{ width: 52, height: 52, opacity: 0.85 }}
                resizeMode="contain"
              />
            </View>
          )}

          {/* ORA IN ONDA label */}
          <Text style={osp.oraInOnda}>ORA IN ONDA</Text>
          <Text style={osp.djName} numberOfLines={2}>{effectiveDjName}</Text>
          {effectiveShowName && effectiveShowName !== effectiveDjName ? (
            <Text style={osp.showName} numberOfLines={1}>{effectiveShowName}</Text>
          ) : null}

          {/* Nome stazione + waveform */}
          <View style={osp.stationRowNp}>
            <Text style={[osp.stationDot, { color: station.color }]}>●</Text>
            <Text style={osp.stationNameNp}>{station.name}</Text>
            <Text style={osp.genreNp}> · {station.genre}</Text>
          </View>
          <WaveformAnim active={isPlaying && !loading} color={station.color} />
        </>

        {/* Badge stato */}
        <View style={[osp.statusBadge, { backgroundColor: station.color + '20', borderColor: station.color + '50' }]}>
          <View style={[osp.statusDot, { backgroundColor: (isPlaying && !loading) ? station.color : 'rgba(255,255,255,0.25)' }]} />
          <Text style={[osp.statusTxt, { color: (isPlaying && !loading) ? station.color : 'rgba(255,255,255,0.4)' }]}>
            {statusText}
          </Text>
        </View>

        {/* Play/Pause */}
        <TouchableOpacity
          style={[osp.playBtn, { backgroundColor: station.color, shadowColor: station.color, opacity: error ? 0.4 : 1 }]}
          onPress={togglePlay}
          disabled={loading || error}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={osp.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>}
        </TouchableOpacity>

        {error && (
          <Text style={osp.errorTxt}>Stream temporaneamente non disponibile</Text>
        )}

        {/* Android battery tip for Xiaomi/Huawei */}
        {Platform.OS !== 'ios' && isPlaying && (
          <View style={osp.androidTip}>
            <Text style={osp.androidTipIcon}>💡</Text>
            <Text style={osp.androidTipTxt}>
              Su Xiaomi/Huawei: vai in{' '}
              <Text style={{ fontWeight: '700' }}>Impostazioni → App → Soundscape → Batteria</Text>
              {' '}e scegli{' '}
              <Text style={{ fontWeight: '700' }}>"Nessuna restrizione"</Text>
              {' '}per ascoltare in background.
            </Text>
          </View>
        )}
      </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Navigazione giorno */}
          <View style={palSt.dayNav}>
            <TouchableOpacity
              onPress={() => setSelectedDay(d => (d + 6) % 7)}
              style={palSt.dayArrowBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[palSt.dayArrowTxt, { color: station.color }]}>←</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={[palSt.dayLabelMain, { color: station.color }]}>
                {['DOMENICA', 'LUNEDÌ', 'MARTEDÌ', 'MERCOLEDÌ', 'GIOVEDÌ', 'VENERDÌ', 'SABATO'][selectedDay]}
              </Text>
              {isToday && <Text style={palSt.dayLabelSub}>OGGI</Text>}
            </View>
            <TouchableOpacity
              onPress={() => setSelectedDay(d => (d + 1) % 7)}
              style={palSt.dayArrowBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[palSt.dayArrowTxt, { color: station.color }]}>→</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scheduleScrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={palSt.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {scheduleSlots.map((slot, i) => {
              // "LIVE ORA" è valido solo se l'utente sta guardando il giorno di oggi
              const isCurrent = isToday && i === currentSlotIdx;
              const isPast = isToday && i < currentSlotIdx;
              const isLast = i === scheduleSlots.length - 1;
              const photoUrl = (isCurrent && nowPlaying?.djImageUrl && !djImgError)
                ? nowPlaying!.djImageUrl
                : (slot.djPhotoUrl ?? getDjPhoto(slot.djName));
              const initials = slot.djName.split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
              const pad = (h: number, m?: number) =>
                `${(h % 24).toString().padStart(2, '0')}:${(m ?? 0).toString().padStart(2, '0')}`;
              const totalMins = (slot.endHour * 60 + (slot.endMin ?? 0)) - (slot.startHour * 60 + (slot.startMin ?? 0));
              const durLabel = totalMins >= 60
                ? `${Math.floor(totalMins / 60)}h${totalMins % 60 ? ` ${totalMins % 60}m` : ''}`
                : `${totalMins}m`;
              return (
                <View key={i} style={[palSt.slotRow, isPast && { opacity: 0.4 }]}>
                  {/* Colonna timeline */}
                  <View style={palSt.timelineCol}>
                    <View style={[
                      palSt.timelineDot,
                      isCurrent
                        ? { backgroundColor: station.color, width: 10, height: 10, borderRadius: 5, marginTop: 2 }
                        : { backgroundColor: 'rgba(255,255,255,0.15)', width: 6, height: 6, borderRadius: 3, marginTop: 4 },
                    ]} />
                    {!isLast && <View style={[palSt.timelineLine, isCurrent && { backgroundColor: station.color + '40' }]} />}
                  </View>

                  {/* Card slot */}
                  <View style={[
                    palSt.slot,
                    isCurrent && { backgroundColor: station.color + '18', borderColor: station.color + '60' },
                  ]}>
                    {/* Ora inizio */}
                    <Text style={[palSt.time, isCurrent && { color: station.color, fontWeight: '700' }]}>
                      {pad(slot.startHour, slot.startMin)}
                    </Text>

                    {/* Foto DJ */}
                    <View style={isCurrent ? palSt.avatarWrapLg : palSt.avatarWrap}>
                      {photoUrl ? (
                        <SlotPhoto
                          uri={photoUrl}
                          color={station.color}
                          isCurrent={isCurrent}
                          initials={initials}
                        />
                      ) : (
                        <View style={[
                          isCurrent ? palSt.avatarBgLg : palSt.avatarBg,
                          { backgroundColor: station.color + (isCurrent ? '2E' : '12') },
                        ]}>
                          <Text style={[palSt.avatarTxt, { color: isCurrent ? station.color : 'rgba(255,255,255,0.3)', fontSize: isCurrent ? 18 : 14 }]}>
                            {initials}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Info testo */}
                    <View style={palSt.info}>
                      <Text style={[palSt.showNameBold, isCurrent && { color: '#fff' }]} numberOfLines={1}>
                        {slot.showName}
                      </Text>
                      <Text style={palSt.djNameSmall} numberOfLines={1}>{slot.djName}</Text>
                      <Text style={palSt.durTxt}>{durLabel}</Text>
                    </View>

                    {/* Badge LIVE ORA animato */}
                    {isCurrent && (
                      <View style={palSt.liveBadge}>
                        <Animated.View style={[palSt.liveDot, { backgroundColor: station.color, opacity: livePulse }]} />
                        <Text style={[palSt.liveTxt, { color: station.color }]}>LIVE ORA</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

const palSt = StyleSheet.create({
  // Navigazione giorno
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  dayArrowBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayArrowTxt: { fontSize: 20, fontWeight: '700' },
  dayLabelMain: { fontSize: 13, fontWeight: '800', letterSpacing: 2, fontFamily: 'monospace' },
  dayLabelSub: { fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, fontFamily: 'monospace', marginTop: 2 },
  // Lista slot
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  slotRow: { flexDirection: 'row', marginBottom: 4 },
  // Timeline
  timelineCol: { width: 20, alignItems: 'center', paddingTop: 18 },
  timelineDot: { marginBottom: 0 },
  timelineLine: { flex: 1, width: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 4, minHeight: 32 },
  // Card slot
  slot: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, marginLeft: 6, marginBottom: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.02)', gap: 10 },
  time: { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', width: 42 },
  // Foto avatar
  avatarWrap: { width: 44, height: 44 },
  avatarWrapLg: { width: 54, height: 54 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5 },
  avatarBg: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarBgLg: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontWeight: '800' },
  // Testi
  info: { flex: 1, minWidth: 0 },
  showNameBold: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  djNameSmall: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 2 },
  durTxt: { fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' },
  // Badge LIVE ORA
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveTxt: { fontSize: 8, fontWeight: '800', letterSpacing: 1.5, fontFamily: 'monospace' },
});

const osp = StyleSheet.create({
  orb: { position: 'absolute', width: 300 * scale, height: 300 * scale, borderRadius: 150 * scale, top: -80, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 36 : 56, paddingBottom: 12 },
  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabTxt: { fontSize: Math.round(10 * scale), fontFamily: 'monospace', letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', fontWeight: '700' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerLabel: { fontSize: Math.round(11 * scale), color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', letterSpacing: 2 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Math.round(32 * scale), paddingBottom: Math.round(40 * scale) },
  // Fallback: cerchio waveform (quando non ci sono info DJ)
  circle: { width: 192, height: 192, borderRadius: 96, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: Math.round(24 * scale), overflow: 'hidden', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } },
  stationName: { fontSize: Math.round(24 * scale), fontWeight: '700', fontStyle: 'italic', color: '#fff', marginBottom: 6, textAlign: 'center' },
  genre: { fontSize: Math.round(11 * scale), color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', marginBottom: Math.round(18 * scale), textAlign: 'center' },
  // Stili "Ora in onda"
  djPhotoWrap: { width: 192, height: 192, borderRadius: 96, borderWidth: 2.5, marginBottom: Math.round(18 * scale), overflow: 'hidden', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  djPhoto: { width: '100%', height: '100%', resizeMode: 'cover' } as any,
  djInitialsWrap: { width: 192, height: 192, borderRadius: 96, borderWidth: 2, marginBottom: Math.round(18 * scale), alignItems: 'center', justifyContent: 'center' },
  djInitialsTxt: { fontSize: 52, fontWeight: '800', fontStyle: 'italic' },
  oraInOnda: { fontSize: Math.round(10 * scale), color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', letterSpacing: 2.5, marginBottom: 4, textTransform: 'uppercase' },
  djName: { fontSize: Math.round(26 * scale), fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 4, letterSpacing: -0.5 },
  showName: { fontSize: Math.round(12 * scale), color: 'rgba(255,255,255,0.45)', marginBottom: Math.round(16 * scale), textAlign: 'center', fontStyle: 'italic' },
  stationRowNp: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  stationDot: { fontSize: 8, marginRight: 6 },
  stationNameNp: { fontSize: Math.round(12 * scale), color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontFamily: 'monospace' },
  genreNp: { fontSize: Math.round(11 * scale), color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  // Comuni
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginBottom: Math.round(28 * scale), marginTop: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusTxt: { fontSize: Math.round(11 * scale), fontFamily: 'monospace', fontWeight: '700', letterSpacing: 1.5 },
  playBtn: { width: Math.round(64 * scale), height: Math.round(64 * scale), borderRadius: Math.round(32 * scale), alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  playIcon: { fontSize: Math.round(26 * scale), color: '#fff' },
  errorTxt: { marginTop: 16, fontSize: Math.round(12 * scale), color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', textAlign: 'center' },
  androidTip: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, marginHorizontal: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,200,50,0.08)', borderWidth: 1, borderColor: 'rgba(255,200,50,0.2)' },
  androidTipIcon: { fontSize: Math.round(14 * scale), marginTop: 1 },
  androidTipTxt: { flex: 1, fontSize: Math.round(11 * scale), color: 'rgba(255,255,255,0.5)', lineHeight: Math.round(16 * scale) },
});


// ─── Station card (card orizzontale) ─────────────────────────────────────────
function OfflineStationCard({ station, onPress }: { station: OfflineStation; onPress: () => void }) {
  const [logoErr, setLogoErr] = useState(false);
  return (
    <TouchableOpacity style={[osc.card, { borderColor: station.color + '50' }]} onPress={onPress} activeOpacity={0.8}>
      {/* Sfondo con gradiente colorato */}
      <LinearGradient
        colors={[station.color + '55', station.color + '15', '#0D0D1A']}
        style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
      />
      {/* Logo stazione */}
      <View style={[osc.logoWrap, { borderColor: station.color + '60', backgroundColor: station.color + '20' }]}>
        {!logoErr ? (
          <Image
            source={{ uri: station.logoUrl }}
            style={osc.logo}
            resizeMode="contain"
            onError={() => setLogoErr(true)}
          />
        ) : (
          <Text style={[osc.initial, { color: station.color }]}>{station.name.charAt(0)}</Text>
        )}
      </View>
      <Text style={osc.name} numberOfLines={1}>{station.name}</Text>
      <Text style={osc.genre} numberOfLines={1}>{station.genre}</Text>
      <View style={[osc.playPill, { backgroundColor: station.color + '30', borderColor: station.color + '70' }]}>
        <Text style={[osc.playPillTxt, { color: station.color }]}>▶ Live</Text>
      </View>
    </TouchableOpacity>
  );
}

const osc = StyleSheet.create({
  card: { width: 120, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 12, paddingBottom: 14, paddingTop: 14, marginRight: 10, overflow: 'hidden', backgroundColor: '#0D0D1A', alignItems: 'center' },
  logoWrap: { width: 62, height: 62, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden' },
  logo: { width: 46, height: 46 },
  initial: { fontSize: 26, fontWeight: '800', fontStyle: 'italic' },
  name: { fontSize: 11, fontWeight: '700', color: '#fff', marginBottom: 3, textAlign: 'center' },
  genre: { fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', marginBottom: 10, lineHeight: 12, textAlign: 'center' },
  playPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, alignSelf: 'center' },
  playPillTxt: { fontSize: 9, fontWeight: '700', fontFamily: 'monospace' },
});

// ─── Room card ────────────────────────────────────────────────────────────────
function RoomCard({ room, onPress }: { room: RadioRoom; onPress: () => void }) {
  const { t } = useTranslation();
  const isOwn = auth.currentUser?.uid === room.hostId;
  const currentTrack = room.playlist[room.currentTrackIndex];
  return (
    <TouchableOpacity style={rc.card} onPress={onPress} activeOpacity={0.82}>
      <LinearGradient
        colors={isOwn ? ['rgba(255,45,85,0.12)', 'rgba(255,45,85,0.03)'] : ['rgba(255,255,255,0.04)', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      />
      <View style={rc.top}>
        <View style={rc.liveWrap}>
          <View style={rc.liveDot} />
          <Text style={rc.liveTxt}>{t('radio.live')}</Text>
        </View>
        <Text style={rc.trackBadge}>{room.playlist.length} tracce</Text>
      </View>
      <Text style={rc.title} numberOfLines={2}>{room.title}</Text>
      {currentTrack && (
        <View style={rc.nowWrap}>
          <Text style={rc.nowIcon}>♪</Text>
          <Text style={rc.nowName} numberOfLines={1}>{currentTrack.name.replace(/\.[^.]+$/, '')}</Text>
          <Text style={rc.trackIdx}>{room.currentTrackIndex + 1}/{room.playlist.length}</Text>
        </View>
      )}
      <View style={rc.bottom}>
        <Text style={rc.host}>@{room.hostName}{isOwn ? ' (tu)' : ''}</Text>
        <View style={rc.rightRow}>
          <Text style={rc.listeners}>🎧 {room.listenerCount}</Text>
          <View style={[rc.btn, isOwn && rc.btnOwn]}>
            <Text style={rc.btnTxt}>{isOwn ? '⬛ Gestisci' : '▶ Entra'}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const rc = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,45,85,0.18)', padding: 16, marginBottom: 10, overflow: 'hidden', backgroundColor: '#0D0D1A' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  liveWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,45,85,0.15)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF2D55' },
  liveTxt: { fontSize: 9, color: '#FF2D55', fontWeight: '700', letterSpacing: 1.5, fontFamily: 'monospace' },
  trackBadge: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  title: { fontSize: 18, fontWeight: '700', fontStyle: 'italic', color: '#fff', marginBottom: 8, lineHeight: 22 },
  nowWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
  nowIcon: { fontSize: 11, color: '#FF2D55' },
  nowName: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  trackIdx: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  host: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listeners: { fontSize: 11, color: 'rgba(255,45,85,0.7)', fontFamily: 'monospace' },
  btn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,45,85,0.15)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  btnOwn: { backgroundColor: 'rgba(255,45,85,0.25)', borderColor: 'rgba(255,45,85,0.5)' },
  btnTxt: { color: '#FF2D55', fontSize: 12, fontWeight: '600' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function RadioScreen() {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState<RadioRoom[]>([]);
  const [scheduledRooms, setScheduledRooms] = useState<RadioRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<RadioRoom | null>(null);
  const [hostRoom, setHostRoom] = useState<RadioRoom | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [startingRoom, setStartingRoom] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<OfflineStation | null>(null);

  useEffect(() => {
    const unsub = listenToLiveRooms((liveRooms) => {
      setRooms(liveRooms);
      setLoading(false);
    });
    const uid = auth.currentUser?.uid;
    let unsubScheduled: (() => void) | undefined;
    if (uid) {
      unsubScheduled = listenToScheduledRooms(uid, setScheduledRooms);
    }
    return () => { unsub(); unsubScheduled?.(); };
  }, []);

  const handleRoomPress = (room: RadioRoom) => {
    if (auth.currentUser?.uid === room.hostId) setHostRoom(room);
    else setSelectedRoom(room);
  };

  const handleStartScheduled = async (room: RadioRoom) => {
    setStartingRoom(room.id);
    try {
      await startScheduledRoom(room.id);
      // The room will now appear in live rooms via listenToLiveRooms
    } catch { Alert.alert(t('common.error'), 'Impossibile avviare la trasmissione.'); }
    finally { setStartingRoom(null); }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={ms.topBar}>
        <View>
          <Text style={ms.topTitle}>{t('radio.title')}</Text>
          {rooms.length > 0 && (
            <Text style={ms.topSub}>{rooms.length} {rooms.length === 1 ? 'stazione attiva' : 'stazioni attive'}</Text>
          )}
        </View>
        <TouchableOpacity style={ms.liveBtn} onPress={() => setShowCreate(true)}>
          <View style={ms.liveDot} />
          <Text style={ms.liveBtnTxt}>{t('radio.liveBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* Stazioni radio offline */}
      <View style={ms.stationsSection}>
        <Text style={ms.stationsTitle}>📻 STAZIONI RADIO</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
          {OFFLINE_STATIONS.map(s => (
            <OfflineStationCard key={s.id} station={s} onPress={() => setSelectedStation(s)} />
          ))}
        </ScrollView>
      </View>

      {/* Programmate (solo tue) */}
      {scheduledRooms.length > 0 && (
        <View style={ms.scheduledSection}>
          <Text style={ms.scheduledTitle}>📅 PROGRAMMATE</Text>
          {scheduledRooms.map(r => {
            const eta = r.scheduledFor ? Math.max(0, Math.floor((r.scheduledFor.getTime() - Date.now()) / 60000)) : 0;
            const etaStr = eta >= 60 ? `${Math.floor(eta / 60)}h ${eta % 60}m` : `${eta}m`;
            return (
              <View key={r.id} style={ms.scheduledCard}>
                <View style={{ flex: 1 }}>
                  <Text style={ms.scheduledName} numberOfLines={1}>{r.title}</Text>
                  <Text style={ms.scheduledEta}>tra {etaStr}</Text>
                </View>
                <TouchableOpacity
                  style={ms.startNowBtn}
                  onPress={() => handleStartScheduled(r)}
                  disabled={startingRoom === r.id}
                >
                  {startingRoom === r.id
                    ? <ActivityIndicator color="#FF2D55" size="small" />
                    : <Text style={ms.startNowTxt}>🔴 Vai live ora</Text>}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Stanze live utenti */}
      {!loading && rooms.length > 0 && (
        <Text style={ms.liveSection}>🔴 IN DIRETTA</Text>
      )}
      {loading ? (
        <View style={ms.center}><ActivityIndicator color="#FF2D55" /></View>
      ) : rooms.length === 0 ? (
        <View style={ms.emptyLive}>
          <Text style={ms.emptyDesc}>{t('radio.emptyDesc')}</Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={rooms}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <RoomCard room={item} onPress={() => handleRoomPress(item)} />}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {selectedRoom && <RadioListenerModal room={selectedRoom} onClose={() => setSelectedRoom(null)} />}
      {hostRoom && <HostRadioModal room={hostRoom} onClose={() => setHostRoom(null)} />}
      {showCreate && <CreateRoomModal onCreated={() => setShowCreate(false)} onClose={() => setShowCreate(false)} />}
      {selectedStation && <OfflineStationPlayer station={selectedStation} onClose={() => setSelectedStation(null)} />}
    </View>
  );
}

const ms = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  topTitle: { fontSize: 16, fontWeight: '700', fontStyle: 'italic', color: '#fff' },
  topSub: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', marginTop: 1 },
  liveBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,45,85,0.15)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.3)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF2D55' },
  liveBtnTxt: { color: '#FF2D55', fontSize: 13, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 20, color: '#fff', fontStyle: 'italic', marginBottom: 8, fontWeight: '700' },
  emptyDesc: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', marginBottom: 24, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { paddingHorizontal: 28, paddingVertical: 13, borderRadius: 24, backgroundColor: 'rgba(255,45,85,0.18)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.4)' },
  emptyBtnTxt: { color: '#FF2D55', fontSize: 15, fontWeight: '700' },
  scheduledSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  scheduledTitle: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 8 },
  scheduledCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,45,85,0.15)' },
  scheduledName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  scheduledEta: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', marginTop: 2 },
  startNowBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,45,85,0.2)', borderWidth: 1, borderColor: 'rgba(255,45,85,0.4)' },
  startNowTxt: { color: '#FF2D55', fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
  stationsSection: { marginBottom: 8 },
  stationsTitle: { fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: 2, paddingHorizontal: 16, marginBottom: 10 },
  liveSection: { fontSize: 9, color: 'rgba(255,45,85,0.6)', fontFamily: 'monospace', letterSpacing: 2, paddingHorizontal: 16, marginBottom: 4, marginTop: 8 },
  emptyLive: { paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center' },
});
