import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback,
} from 'react';
import { Alert, AppState, Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  IRtcEngine, IRtcEngineEventHandler, ClientRoleType,
} from 'react-native-agora';
import { auth, db } from '../firebaseConfig';
import { getCallEngine, destroyAgoraEngine, fetchAgoraToken } from '../services/agoraService';
import {
  Call, CallPhase, ParticipantProfile,
  createCall, createGroupCall, updateCallStatus,
  updateParticipantCallStatus,
  leaveGroupCall, inviteParticipantsToCall,
  listenForIncomingCall, listenForCallUpdates,
  updateCallDuration, publishCallRecording,
} from '../services/callService';

let RNCallKeep: any = null;
if (Platform.OS === 'android') {
  RNCallKeep = require('react-native-callkeep').default;
}
const ck = {
  setup: (cfg: any) => RNCallKeep ? RNCallKeep.setup(cfg) : Promise.resolve(),
  addEventListener: (evt: string, cb: any) => RNCallKeep?.addEventListener(evt, cb),
  removeEventListener: (evt: string) => RNCallKeep?.removeEventListener(evt),
  displayIncomingCall: (...a: any[]) => { try { RNCallKeep?.displayIncomingCall(...a); } catch {} },
  startCall: (...a: any[]) => { try { RNCallKeep?.startCall(...a); } catch {} },
  setCurrentCallActive: (id: string) => { try { RNCallKeep?.setCurrentCallActive(id); } catch {} },
  endCall: (id: string) => { try { RNCallKeep?.endCall(id); } catch {} },
  acceptIncomingCallAnswer: (id: string) => { try { RNCallKeep?.acceptIncomingCallAnswer(id); } catch {} },
  rejectCall: (id: string) => { try { RNCallKeep?.rejectCall(id); } catch {} },
  setMutedCall: (id: string, m: boolean) => { try { RNCallKeep?.setMutedCall(id, m); } catch {} },
  getInitialEvents: (): Promise<any[]> => { try { return RNCallKeep?.getInitialEvents?.() ?? Promise.resolve([]); } catch { return Promise.resolve([]); } },
  clearInitialEvents: () => { try { RNCallKeep?.clearInitialEvents?.(); } catch {} },
  setAvailable: (available: boolean) => { try { RNCallKeep?.setAvailable?.(available); } catch {} },
  backToForeground: () => { try { RNCallKeep?.backToForeground?.(); } catch {} },
  setForegroundServiceSettings: (cfg: any) => { try { RNCallKeep?.setForegroundServiceSettings?.(cfg); } catch {} },
};
const RING_TIMEOUT_MS = 45_000;
const CALL_SOUND = require('../assets/sounds/soundscape_call.wav');

function hasActiveOrRingingParticipants(participantStatuses?: Record<string, string>) {
  return Object.values(participantStatuses ?? {}).some((status) => ['calling', 'ringing', 'active'].includes(status));
}

interface CallContextValue {
  call: Call | null;
  phase: CallPhase;
  useSystemIncomingUI: boolean;
  isMuted: boolean;
  isSpeaker: boolean;
  isRecording: boolean;
  duration: number;
  endReason: string | null;
  initiateCall: (calleeId: string, calleeName: string, calleeAvatar: string) => Promise<void>;
  initiateGroupCall: (inviteeIds: string[], inviteeProfiles: Record<string, ParticipantProfile>) => Promise<void>;
  acceptCall: (call: Call) => Promise<void>;
  declineCall: (call: Call) => Promise<void>;
  endCall: () => Promise<void>;
  inviteParticipantsToCurrentCall: (
    inviteeIds: string[],
    inviteeProfiles: Record<string, ParticipantProfile>,
  ) => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleRecording: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside CallProvider');
  return ctx;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [call, setCall] = useState<Call | null>(null);
  const [phase, setPhase] = useState<CallPhase>(null);
  const [useSystemIncomingUI, setUseSystemIncomingUI] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [endReason, setEndReason] = useState<string | null>(null);

  const engineRef = useRef<IRtcEngine | null>(null);
  const callIdRef = useRef<string | null>(null);
  const missedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubCallRef = useRef<(() => void) | null>(null);
  const phaseRef = useRef<CallPhase>(null);
  const incomingCallRef = useRef<Call | null>(null);
  const cleaningUpRef = useRef(false);
  const pendingAcceptUUIDRef = useRef<string | null>(null);
  const durationRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  const recordingPathRef = useRef<string | null>(null);
  const dropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteUsersRef = useRef<Set<number>>(new Set());
  const acceptingCallRef = useRef(false);
  const ringtoneRef = useRef<Audio.Sound | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const callkeepIncomingVisibleRef = useRef(false);
  const ringtoneStartingRef = useRef(false);
  const dismissedIncomingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { incomingCallRef.current = call; }, [call]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        _stopRinging();
        if (phaseRef.current === 'incoming' || phaseRef.current === 'ringing') {
          callkeepIncomingVisibleRef.current = false;
          if (phaseRef.current === 'incoming') setUseSystemIncomingUI(false);
          _startRinging();
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    Notifications.setNotificationChannelAsync('calls', {
      name: 'calls',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'soundscape_call.wav',
      enableVibrate: true,
      vibrationPattern: [0, 800, 500, 800],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      lightColor: '#00FF9C',
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    }).catch(() => {});
  }, []);

  // ─── CallKeep setup (Android only) ───────────────────────────────────────
  useEffect(() => {
    ck.setup({
      ios: {
        appName: 'SoundScape',
        ringtoneSound: 'soundscape_call.wav',
        supportsVideo: false,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
      },
      android: {
        alertTitle: 'Autorizzazione chiamate',
        alertDescription: 'SoundScape ha bisogno di gestire le chiamate audio',
        cancelButton: 'Annulla',
        okButton: 'OK',
        additionalPermissions: [],
        selfManaged: false,
      },
    }).catch(() => {});
    ck.setForegroundServiceSettings({
      channelId: 'calls',
      channelName: 'Chiamate SoundScape',
      notificationTitle: 'SoundScape gestisce una chiamata in background',
    });
    ck.setAvailable(true);

    const onAnswerCall = ({ callUUID }: { callUUID: string }) => {
      callkeepIncomingVisibleRef.current = false;
      setUseSystemIncomingUI(false);
      const incoming = incomingCallRef.current;
      if (incoming && incoming.id === callUUID && phaseRef.current === 'incoming' && !acceptingCallRef.current) {
        _doAccept(incoming);
      }
    };

    const onEndCall = ({ callUUID }: { callUUID: string }) => {
      callkeepIncomingVisibleRef.current = false;
      setUseSystemIncomingUI(false);
      if (callIdRef.current === callUUID && phaseRef.current !== null) {
        updateCallStatus(callUUID, 'ended').catch(() => {});
        _finalize('ended');
      }
    };

    const onMuteCall = ({ muted }: { muted: boolean }) => {
      setIsMuted(muted);
      engineRef.current?.muteLocalAudioStream(muted);
    };

    ck.addEventListener('answerCall', onAnswerCall);
    ck.addEventListener('endCall', onEndCall);
    ck.addEventListener('didPerformSetMutedCallAction', onMuteCall);

    ck.getInitialEvents().then((initials: any[]) => {
      for (const evt of initials) {
        if (evt.name === 'RNCallKeepAnswerCall') {
          pendingAcceptUUIDRef.current = evt.data?.callUUID ?? null;
        } else if (evt.name === 'RNCallKeepEndCall') {
          updateCallStatus(evt.data?.callUUID, 'declined').catch(() => {});
        }
      }
      ck.clearInitialEvents();
    }).catch(() => {});

    return () => {
      ck.removeEventListener('answerCall');
      ck.removeEventListener('endCall');
      ck.removeEventListener('didPerformSetMutedCallAction');
    };
  }, []);

  // ─── Listen for incoming calls ─────────────────────────────────────────────
  useEffect(() => {
    let unsubCall: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubCall?.();
      unsubCall = null;
      if (!user) return;

      unsubCall = listenForIncomingCall(user.uid, (incoming) => {
        if (!incoming) {
          dismissedIncomingIdsRef.current.clear();
          // Caller cancelled/missed before we answered — dismiss incoming screen
          if (phaseRef.current === 'incoming') {
            _stopRinging();
            if (callkeepIncomingVisibleRef.current) {
              ck.rejectCall(incomingCallRef.current?.id ?? '');
              callkeepIncomingVisibleRef.current = false;
              setUseSystemIncomingUI(false);
            }
            setPhase(null);
            setCall(null);
          }
          return;
        }
        if (dismissedIncomingIdsRef.current.has(incoming.id)) return;
        if (phaseRef.current !== null) return;
        setCall(incoming);

        if (pendingAcceptUUIDRef.current === incoming.id) {
          pendingAcceptUUIDRef.current = null;
          _doAccept(incoming);
          return;
        }

        setPhase('incoming');
        const isForeground = appStateRef.current === 'active';
        if (Platform.OS === 'android' && !isForeground) {
          callkeepIncomingVisibleRef.current = true;
          setUseSystemIncomingUI(true);
          ck.displayIncomingCall(incoming.id, incoming.callerName, incoming.callerName, 'generic', false);
          return;
        }
        callkeepIncomingVisibleRef.current = false;
        setUseSystemIncomingUI(false);
        _startRinging();
      });
    });

    return () => { unsubCall?.(); unsubAuth(); };
  }, []);

  // ─── Agora engine ──────────────────────────────────────────────────────────
  const _initEngine = useCallback((): IRtcEngine => {
    const engine = getCallEngine();
    remoteUsersRef.current.clear();

    const handler: IRtcEngineEventHandler = {
      onJoinChannelSuccess: () => {},
      onUserJoined: (_conn: any, remoteUid: number) => {
        remoteUsersRef.current.add(remoteUid);
        const becameActive = phaseRef.current !== 'active';
        _stopRinging();
        // Cancel the missed-call timer — the other party has joined
        if (missedTimerRef.current) { clearTimeout(missedTimerRef.current); missedTimerRef.current = null; }
        // Cancel the drop timer if reconnect succeeded
        if (dropTimerRef.current) { clearTimeout(dropTimerRef.current); dropTimerRef.current = null; }
        if (callIdRef.current) ck.setCurrentCallActive(callIdRef.current);
        if (becameActive) {
          setDuration(0);
          durationRef.current = 0;
          if (durationTimerRef.current) clearInterval(durationTimerRef.current);
          durationTimerRef.current = setInterval(() => {
            setDuration((d) => {
              const next = d + 1;
              durationRef.current = next;
              return next;
            });
          }, 1000);
          const uid = auth.currentUser?.uid;
          if (uid) updateDoc(doc(db, 'users', uid), { inCall: true }).catch(() => {});
          if (Platform.OS === 'android') {
            Notifications.scheduleNotificationAsync({
              content: {
                title: 'Chiamata in corso',
                body: 'Tocca per tornare alla chiamata',
                sticky: true,
                autoDismiss: false,
                data: { callActive: true },
              },
              trigger: null,
            }).catch(() => {});
          }
        }
        setPhase('active');
      },
      onUserOffline: (_conn: any, remoteUid: number, reason: number) => {
        remoteUsersRef.current.delete(remoteUid);
        if (remoteUsersRef.current.size > 0) return;
        const currentCall = incomingCallRef.current;
        if (
          currentCall?.type === 'group'
          && (currentCall.invitees ?? []).some((uid) => currentCall.participantStatuses?.[uid] === 'ringing')
        ) {
          return;
        }
        // reason 1 = UserOfflineDropped (connection lost/timeout)
        // Give 30s for Agora to reconnect before ending the call.
        // If onUserJoined fires again (reconnect succeeded), the timer is cancelled.
        // reason 0 = UserOfflineQuit (intentional leave) → end immediately
        if (reason === 1) {
          if (!dropTimerRef.current) {
            dropTimerRef.current = setTimeout(() => {
              dropTimerRef.current = null;
              if (!cleaningUpRef.current) {
                updateCallStatus(callIdRef.current!, 'ended').catch(() => {});
                _finalize('ended');
              }
            }, 30_000);
          }
          return;
        }
        if (!cleaningUpRef.current) {
          updateCallStatus(callIdRef.current!, 'ended').catch(() => {});
          _finalize('ended');
        }
      },
      onError: (err) => console.error('[CALL] Agora error:', err),
    };
    engine.registerEventHandler(handler);
    engineRef.current = engine;
    return engine;
  }, []);

  // ─── Vibration ─────────────────────────────────────────────────────────────
  const _startRinging = () => {
    if (ringtoneRef.current || ringtoneStartingRef.current) return;
    ringtoneStartingRef.current = true;
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
    }).catch(() => {});
    Audio.Sound.createAsync(CALL_SOUND, {
      isLooping: true,
      shouldPlay: true,
      volume: 1,
    }).then(({ sound }) => {
      ringtoneStartingRef.current = false;
      ringtoneRef.current = sound;
    }).catch(() => {
      ringtoneStartingRef.current = false;
    });
    if (Platform.OS === 'android') Vibration.vibrate([0, 600, 400, 600, 400, 600], true);
    else Vibration.vibrate();
  };
  const _stopRinging = () => {
    ringtoneStartingRef.current = false;
    Vibration.cancel();
    const ringtone = ringtoneRef.current;
    ringtoneRef.current = null;
    if (ringtone) {
      ringtone.stopAsync().catch(() => {});
      ringtone.unloadAsync().catch(() => {});
    }
  };

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  const _finalize = useCallback((reason: string) => {
    if (cleaningUpRef.current) return;
    cleaningUpRef.current = true;
    acceptingCallRef.current = false;

    _stopRinging();
    callkeepIncomingVisibleRef.current = false;
    setUseSystemIncomingUI(false);
    if (missedTimerRef.current) { clearTimeout(missedTimerRef.current); missedTimerRef.current = null; }
    if (dropTimerRef.current) { clearTimeout(dropTimerRef.current); dropTimerRef.current = null; }
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    unsubCallRef.current?.();
    unsubCallRef.current = null;
    if (Platform.OS === 'android') Notifications.dismissAllNotificationsAsync().catch(() => {});

    if (callIdRef.current) ck.endCall(callIdRef.current);

    // Persist call duration
    if (callIdRef.current && durationRef.current > 0) {
      updateCallDuration(callIdRef.current, durationRef.current).catch(() => {});
    }

    // Clear inCall flag
    const uid = auth.currentUser?.uid;
    if (uid) updateDoc(doc(db, 'users', uid), { inCall: false }).catch(() => {});

    // Handle recording — stop engine, then prompt publish after engine is destroyed
    const wasRecording = isRecordingRef.current;
    const recPath = recordingPathRef.current;
    const otherName = incomingCallRef.current?.callerName || incomingCallRef.current?.calleeName || 'Utente';
    const callIdSnap = callIdRef.current;
    const durSnap = durationRef.current;

    if (wasRecording) {
      engineRef.current?.stopAudioRecording();
      isRecordingRef.current = false;
      recordingPathRef.current = null;
      setIsRecording(false);
    }

    destroyAgoraEngine();
    engineRef.current = null;
    remoteUsersRef.current.clear();

    setEndReason(reason);
    setPhase('ended');
    setIsMuted(false);
    setIsSpeaker(false);
    setDuration(0);
    durationRef.current = 0;

    setTimeout(() => {
      setPhase(null);
      setCall(null);
      setEndReason(null);
      callIdRef.current = null;
      cleaningUpRef.current = false;

      // Offer to publish recording after UI is clear
      if (wasRecording && recPath) {
        FileSystem.getInfoAsync(recPath).then((info) => {
          if (!info.exists) return;
          Alert.alert(
            '🎙 Registrazione',
            `Pubblica la registrazione della chiamata con ${otherName}?`,
            [
              { text: 'No', style: 'cancel' },
              {
                text: 'Pubblica',
                onPress: () => publishCallRecording(recPath, callIdSnap ?? '', otherName, durSnap).catch(() => {}),
              },
            ],
          );
        }).catch(() => {});
      }
    }, 2000);
  }, []);

  // ─── Internal accept ───────────────────────────────────────────────────────
  const _doAccept = useCallback(async (incoming: Call) => {
    if (acceptingCallRef.current) return;
    acceptingCallRef.current = true;
    callkeepIncomingVisibleRef.current = false;
    setUseSystemIncomingUI(false);
    dismissedIncomingIdsRef.current.delete(incoming.id);
    _stopRinging();

    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Microfono', 'Per rispondere devi abilitare il microfono.');
      if (incoming.type === 'group') {
        await updateParticipantCallStatus(incoming.id, auth.currentUser?.uid ?? '', 'declined').catch(() => {});
      } else {
        await updateCallStatus(incoming.id, 'declined');
      }
      ck.rejectCall(incoming.id);
      acceptingCallRef.current = false;
      setPhase(null); setCall(null);
      return;
    }

    callIdRef.current = incoming.id;
    setCall(incoming);
    setPhase('connecting');
    await updateParticipantCallStatus(
      incoming.id,
      auth.currentUser?.uid ?? '',
      'active',
      'active',
    ).catch(() => updateCallStatus(incoming.id, 'active'));
    ck.backToForeground();

    let engine: ReturnType<typeof _initEngine>;
    try { engine = _initEngine(); } catch (e) {
      console.error('[CALL] Engine init failed:', e);
      await updateCallStatus(incoming.id, 'ended').catch(() => {});
      acceptingCallRef.current = false;
      setPhase(null); setCall(null); callIdRef.current = null;
      return;
    }
    const token = await fetchAgoraToken(incoming.channelName).catch(() => null);
    engine.joinChannel(token ?? '', incoming.channelName, 0, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      publishMicrophoneTrack: true,
      autoSubscribeAudio: true,
    });

    unsubCallRef.current = listenForCallUpdates(incoming.id, (updated) => {
      if (updated) setCall(updated);
      const myUid = auth.currentUser?.uid ?? '';
      if (!updated) return;
      if (updated.status === 'ended' && !cleaningUpRef.current) _finalize('ended');
      if (updated.type === 'group' && updated.participantStatuses?.[myUid] === 'left' && !cleaningUpRef.current) _finalize('left');
    });
  }, [_initEngine, _finalize]);

  // ─── Public: 1:1 call ─────────────────────────────────────────────────────
  const initiateCall = useCallback(async (
    calleeId: string, calleeName: string, calleeAvatar: string,
  ) => {
    const user = auth.currentUser;
    if (!user) return;

    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Microfono', 'Per chiamare devi abilitare il microfono.');
      return;
    }

    const snap = await getDoc(doc(db, 'users', user.uid));
    const callerName: string = snap.data()?.username || snap.data()?.displayName || 'Utente';
    const callerAvatar: string = snap.data()?.avatar || '🎵';

    const callId = await createCall({ calleeId, calleeName, calleeAvatar, callerName, callerAvatar });
    callIdRef.current = callId;

    const callDoc: Call = {
      id: callId, callerId: user.uid, calleeId,
      callerName, callerAvatar, calleeName, calleeAvatar,
      status: 'ringing', type: 'audio', channelName: callId, createdAt: new Date(),
    };
    setCall(callDoc);
    setPhase('ringing');
    _startRinging();

    ck.startCall(callId, calleeName, calleeName, 'generic', false);
    ck.backToForeground();

    let engine: ReturnType<typeof _initEngine>;
    try { engine = _initEngine(); } catch (e) {
      console.error('[CALL] Engine init failed:', e);
      await updateCallStatus(callId, 'ended').catch(() => {});
      setPhase(null); setCall(null); callIdRef.current = null;
      Alert.alert('Errore', 'Impossibile avviare la chiamata.');
      return;
    }
    const token = await fetchAgoraToken(callId).catch(() => null);
    engine.joinChannel(token ?? '', callId, 0, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      publishMicrophoneTrack: true,
      autoSubscribeAudio: true,
    });

    unsubCallRef.current = listenForCallUpdates(callId, (updated) => {
      if (!updated) return;
      setCall(updated);
      if (updated.status === 'declined' && updated.type !== 'group') _finalize('declined');
      else if (
        updated.type === 'group'
        && updated.status === 'declined'
        && !hasActiveOrRingingParticipants(updated.participantStatuses)
      ) _finalize('declined');
      else if (updated.status === 'missed') _finalize('missed');
      else if (updated.status === 'ended' && !cleaningUpRef.current) _finalize('ended');
    });

    missedTimerRef.current = setTimeout(() => {
      updateCallStatus(callId, 'missed').catch(() => {});
      _finalize('missed');
    }, RING_TIMEOUT_MS);
  }, [_initEngine, _finalize]);

  // ─── Public: group call ───────────────────────────────────────────────────
  const initiateGroupCall = useCallback(async (
    inviteeIds: string[],
    inviteeProfiles: Record<string, ParticipantProfile>,
  ) => {
    const user = auth.currentUser;
    if (!user) return;

    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Microfono', 'Per chiamare devi abilitare il microfono.');
      return;
    }

    const snap = await getDoc(doc(db, 'users', user.uid));
    const callerName: string = snap.data()?.username || snap.data()?.displayName || 'Utente';
    const callerAvatar: string = snap.data()?.avatar || '🎵';

    const callId = await createGroupCall({ inviteeIds, inviteeProfiles, callerName, callerAvatar });
    callIdRef.current = callId;

    const firstId = inviteeIds[0] ?? '';
    const firstProfile = inviteeProfiles[firstId] ?? { name: 'Gruppo', avatar: '👥' };
    const groupName = inviteeIds.length > 1
      ? `${firstProfile.name} +${inviteeIds.length - 1}`
      : firstProfile.name;

    const callDoc: Call = {
      id: callId,
      callerId: user.uid,
      calleeId: firstId,
      callerName,
      callerAvatar,
      calleeName: groupName,
      calleeAvatar: firstProfile.avatar,
      status: 'ringing',
      type: 'group',
      channelName: callId,
      createdAt: new Date(),
      invitees: inviteeIds,
      participantProfiles: { [user.uid]: { name: callerName, avatar: callerAvatar }, ...inviteeProfiles },
      participantStatuses: { [user.uid]: 'calling', ...Object.fromEntries(inviteeIds.map((id) => [id, 'ringing'])) },
    };
    setCall(callDoc);
    setPhase('ringing');
    _startRinging();

    ck.startCall(callId, groupName, groupName, 'generic', false);
    ck.backToForeground();

    let engine: ReturnType<typeof _initEngine>;
    try { engine = _initEngine(); } catch (e) {
      console.error('[CALL] Engine init failed:', e);
      await updateCallStatus(callId, 'ended').catch(() => {});
      setPhase(null); setCall(null); callIdRef.current = null;
      Alert.alert('Errore', 'Impossibile avviare la chiamata di gruppo.');
      return;
    }
    const token = await fetchAgoraToken(callId).catch(() => null);
    engine.joinChannel(token ?? '', callId, 0, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      publishMicrophoneTrack: true,
      autoSubscribeAudio: true,
    });

    unsubCallRef.current = listenForCallUpdates(callId, (updated) => {
      if (!updated) return;
      setCall(updated);
      if (updated.status === 'declined' && updated.type !== 'group') _finalize('declined');
      else if (
        updated.type === 'group'
        && updated.status === 'declined'
        && !hasActiveOrRingingParticipants(updated.participantStatuses)
      ) _finalize('declined');
      else if (updated.status === 'missed') _finalize('missed');
      else if (updated.type === 'group' && updated.participantStatuses?.[user.uid] === 'left' && !cleaningUpRef.current) _finalize('left');
      else if (updated.status === 'ended' && !cleaningUpRef.current) _finalize('ended');
    });

    missedTimerRef.current = setTimeout(() => {
      updateCallStatus(callId, 'missed').catch(() => {});
      _finalize('missed');
    }, RING_TIMEOUT_MS);
  }, [_initEngine, _finalize]);

  const acceptCall = useCallback(async (incoming: Call) => {
    await _doAccept(incoming);
  }, [_doAccept]);

  const declineCall = useCallback(async (incoming: Call) => {
    dismissedIncomingIdsRef.current.add(incoming.id);
    _stopRinging();
    if (callkeepIncomingVisibleRef.current) {
      ck.rejectCall(incoming.id);
      callkeepIncomingVisibleRef.current = false;
      setUseSystemIncomingUI(false);
    }
    setPhase(null);
    setCall(null);
    if (incoming.type === 'group') {
      const uid = auth.currentUser?.uid ?? '';
      await updateParticipantCallStatus(incoming.id, uid, 'declined').catch(() => {});
      const snap = await getDoc(doc(db, 'calls', incoming.id)).catch(() => null);
      const data = snap?.data();
      if (data) {
        const invitees = Array.isArray(data.invitees) ? data.invitees : [];
        const someoneStillPendingOrActive = invitees.some((id: string) => {
          const state = data.participantStatuses?.[id];
          return state === 'ringing' || state === 'active';
        });
        if (!someoneStillPendingOrActive) {
          await updateCallStatus(incoming.id, 'declined').catch(() => {});
        }
      }
      return;
    }
    await updateCallStatus(incoming.id, 'declined').catch(() => {});
  }, []);

  const endCall = useCallback(async () => {
    if (!callIdRef.current) return;
    if (incomingCallRef.current?.type === 'group') {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      await leaveGroupCall(callIdRef.current, uid).catch(() => {});
      _finalize('left');
      return;
    }
    await updateCallStatus(callIdRef.current, 'ended').catch(() => {});
    _finalize('ended');
  }, [_finalize]);

  const inviteParticipantsToCurrentCall = useCallback(async (
    inviteeIds: string[],
    inviteeProfiles: Record<string, ParticipantProfile>,
  ) => {
    if (!callIdRef.current || incomingCallRef.current?.type !== 'group') return;
    await inviteParticipantsToCall(callIdRef.current, inviteeIds, inviteeProfiles);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => {
      engineRef.current?.muteLocalAudioStream(!m);
      if (callIdRef.current) ck.setMutedCall(callIdRef.current, !m);
      return !m;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeaker((s) => {
      engineRef.current?.setEnableSpeakerphone(!s);
      return !s;
    });
  }, []);

  const toggleRecording = useCallback(() => {
    if (!engineRef.current || phaseRef.current !== 'active') return;

    if (isRecordingRef.current) {
      engineRef.current.stopAudioRecording();
      isRecordingRef.current = false;
      recordingPathRef.current = null;
      setIsRecording(false);
    } else {
      const docDir = (FileSystem.documentDirectory ?? '').replace(/^file:\/\//, '');
      const path = `${docDir}call_${callIdRef.current ?? Date.now()}.aac`;
      engineRef.current.startAudioRecording({
        filePath: path,
        quality: 2,
        fileRecordingType: 3,
      });
      recordingPathRef.current = path;
      isRecordingRef.current = true;
      setIsRecording(true);
    }
  }, []);

  return (
    <CallContext.Provider value={{
      call, phase, useSystemIncomingUI, isMuted, isSpeaker, isRecording, duration, endReason,
      initiateCall, initiateGroupCall, acceptCall, declineCall, endCall, inviteParticipantsToCurrentCall,
      toggleMute, toggleSpeaker, toggleRecording,
    }}>
      {children}
    </CallContext.Provider>
  );
}
