import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback,
} from 'react';
import { Alert, Platform, Vibration } from 'react-native';
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
};

const AGORA_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? '';
const RING_TIMEOUT_MS = 45_000;

interface CallContextValue {
  call: Call | null;
  phase: CallPhase;
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

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { incomingCallRef.current = call; }, [call]);

  // ─── CallKeep setup (Android only) ───────────────────────────────────────
  useEffect(() => {
    ck.setup({
      ios: {
        appName: 'SoundScape',
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

    const onAnswerCall = ({ callUUID }: { callUUID: string }) => {
      const incoming = incomingCallRef.current;
      if (incoming && incoming.id === callUUID) {
        _doAccept(incoming);
      }
    };

    const onEndCall = ({ callUUID }: { callUUID: string }) => {
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
        if (!incoming || phaseRef.current !== null) return;
        setCall(incoming);

        if (pendingAcceptUUIDRef.current === incoming.id) {
          pendingAcceptUUIDRef.current = null;
          _doAccept(incoming);
          return;
        }

        setPhase('incoming');
        _startRinging();
        ck.displayIncomingCall(incoming.id, incoming.callerName, incoming.callerName, 'generic', false);
      });
    });

    return () => { unsubCall?.(); unsubAuth(); };
  }, []);

  // ─── Agora engine ──────────────────────────────────────────────────────────
  const _initEngine = useCallback((): IRtcEngine => {
    const engine = getCallEngine();

    const handler: IRtcEngineEventHandler = {
      onJoinChannelSuccess: () => {},
      onUserJoined: () => {
        if (callIdRef.current) ck.setCurrentCallActive(callIdRef.current);
        setPhase('active');
        setDuration(0);
        durationRef.current = 0;
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
      },
      onUserOffline: () => {
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
    if (Platform.OS === 'android') Vibration.vibrate([0, 600, 400, 600, 400, 600], true);
    else Vibration.vibrate();
  };
  const _stopRinging = () => Vibration.cancel();

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  const _finalize = useCallback((reason: string) => {
    if (cleaningUpRef.current) return;
    cleaningUpRef.current = true;

    _stopRinging();
    if (missedTimerRef.current) { clearTimeout(missedTimerRef.current); missedTimerRef.current = null; }
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
    _stopRinging();

    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Microfono', 'Per rispondere devi abilitare il microfono.');
      await updateCallStatus(incoming.id, 'declined');
      ck.rejectCall(incoming.id);
      setPhase(null); setCall(null);
      return;
    }

    callIdRef.current = incoming.id;
    setCall(incoming);
    setPhase('connecting');
    await updateCallStatus(incoming.id, 'active');

    let engine: ReturnType<typeof _initEngine>;
    try { engine = _initEngine(); } catch (e) {
      console.error('[CALL] Engine init failed:', e);
      await updateCallStatus(incoming.id, 'ended').catch(() => {});
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
      if (updated?.status === 'ended' && !cleaningUpRef.current) _finalize('ended');
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

    ck.startCall(callId, calleeName, calleeName, 'generic', false);

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
      if (updated.status === 'declined') _finalize('declined');
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
    };
    setCall(callDoc);
    setPhase('ringing');

    ck.startCall(callId, groupName, groupName, 'generic', false);

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
      if (updated.status === 'declined') _finalize('declined');
      else if (updated.status === 'missed') _finalize('missed');
      else if (updated.status === 'ended' && !cleaningUpRef.current) _finalize('ended');
    });

    missedTimerRef.current = setTimeout(() => {
      updateCallStatus(callId, 'missed').catch(() => {});
      _finalize('missed');
    }, RING_TIMEOUT_MS);
  }, [_initEngine, _finalize]);

  const acceptCall = useCallback(async (incoming: Call) => {
    ck.acceptIncomingCallAnswer(incoming.id);
    await _doAccept(incoming);
  }, [_doAccept]);

  const declineCall = useCallback(async (incoming: Call) => {
    _stopRinging();
    ck.rejectCall(incoming.id);
    setPhase(null);
    setCall(null);
    await updateCallStatus(incoming.id, 'declined').catch(() => {});
  }, []);

  const endCall = useCallback(async () => {
    if (!callIdRef.current) return;
    await updateCallStatus(callIdRef.current, 'ended').catch(() => {});
    _finalize('ended');
  }, [_finalize]);

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
      call, phase, isMuted, isSpeaker, isRecording, duration, endReason,
      initiateCall, initiateGroupCall, acceptCall, declineCall, endCall,
      toggleMute, toggleSpeaker, toggleRecording,
    }}>
      {children}
    </CallContext.Provider>
  );
}
