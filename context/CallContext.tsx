import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback,
} from 'react';
import { Alert, Vibration, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { doc, getDoc } from 'firebase/firestore';
import {
  createAgoraRtcEngine, IRtcEngine, IRtcEngineEventHandler,
  ChannelProfileType, ClientRoleType,
  AudioProfileType, AudioScenarioType,
} from 'react-native-agora';
import { auth, db } from '../firebaseConfig';
import { destroyAgoraEngine, fetchAgoraToken } from '../services/agoraService';
import {
  Call, CallPhase,
  createCall, updateCallStatus,
  listenForIncomingCall, listenForCallUpdates,
} from '../services/callService';
import { notifyIncomingCall } from '../services/notificationService';

const AGORA_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? '';
const RING_TIMEOUT_MS = 45_000;

interface CallContextValue {
  call: Call | null;
  phase: CallPhase;
  isMuted: boolean;
  isSpeaker: boolean;
  duration: number;
  endReason: string | null;
  initiateCall: (calleeId: string, calleeName: string, calleeAvatar: string) => Promise<void>;
  acceptCall: (call: Call) => Promise<void>;
  declineCall: (call: Call) => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
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
  const [duration, setDuration] = useState(0);
  const [endReason, setEndReason] = useState<string | null>(null);

  const engineRef = useRef<IRtcEngine | null>(null);
  const callIdRef = useRef<string | null>(null);
  const missedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubCallRef = useRef<(() => void) | null>(null);
  const unsubIncomingRef = useRef<(() => void) | null>(null);
  const phaseRef = useRef<CallPhase>(null);

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ─── Listen for incoming calls ─────────────────────────────────────────────
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsub = listenForIncomingCall(uid, (incomingCall) => {
      // Only show if we're idle
      if (!incomingCall || phaseRef.current !== null) return;
      setCall(incomingCall);
      setPhase('incoming');
      _startRinging();
    });
    unsubIncomingRef.current = unsub;
    return () => unsub();
  }, []);

  // ─── Agora engine ──────────────────────────────────────────────────────────

  const _initEngine = useCallback((): IRtcEngine => {
    const engine = createAgoraRtcEngine();
    engine.initialize({
      appId: AGORA_APP_ID,
      channelProfile: ChannelProfileType.ChannelProfileCommunication,
    });
    engine.enableAudio();
    engine.setEnableSpeakerphone(false);
    engine.setAudioProfile(
      AudioProfileType.AudioProfileDefault,
      AudioScenarioType.AudioScenarioChatRoom,
    );

    const handler: IRtcEngineEventHandler = {
      onJoinChannelSuccess: () => {
        // My side joined; wait for remote to join
      },
      onUserJoined: () => {
        // Remote party connected → go active
        setPhase('active');
        setDuration(0);
        durationTimerRef.current = setInterval(() => {
          setDuration((d) => d + 1);
        }, 1000);
      },
      onUserOffline: () => {
        // Remote party hung up
        _finalize('ended');
        updateCallStatus(callIdRef.current!, 'ended').catch(() => {});
      },
      onError: (err) => {
        console.error('[CALL] Agora error:', err);
      },
    };
    engine.registerEventHandler(handler);
    engineRef.current = engine;
    return engine;
  }, []);

  // ─── Vibration ─────────────────────────────────────────────────────────────

  const _startRinging = () => {
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 600, 400, 600, 400, 600], true);
    } else {
      Vibration.vibrate();
    }
  };

  const _stopRinging = () => Vibration.cancel();

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  const _finalize = useCallback((reason: string) => {
    _stopRinging();

    if (missedTimerRef.current) {
      clearTimeout(missedTimerRef.current);
      missedTimerRef.current = null;
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    unsubCallRef.current?.();
    unsubCallRef.current = null;

    engineRef.current?.leaveChannel();
    engineRef.current?.release();
    engineRef.current = null;
    callIdRef.current = null;

    setEndReason(reason);
    setPhase('ended');
    setIsMuted(false);
    setIsSpeaker(false);
    setDuration(0);

    setTimeout(() => {
      setPhase(null);
      setCall(null);
      setEndReason(null);
    }, 2000);
  }, []);

  // ─── Public actions ────────────────────────────────────────────────────────

  const initiateCall = useCallback(async (
    calleeId: string,
    calleeName: string,
    calleeAvatar: string,
  ) => {
    const user = auth.currentUser;
    if (!user) return;

    // Mic permission
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Microfono', 'Per chiamare hai bisogno di abilitare il microfono.');
      return;
    }

    // Fetch caller profile
    const snap = await getDoc(doc(db, 'users', user.uid));
    const callerName: string = snap.data()?.username || snap.data()?.displayName || 'Utente';
    const callerAvatar: string = snap.data()?.avatar || '🎵';

    // Stop radio / any active Agora session
    try { destroyAgoraEngine(); } catch {}

    // Create Firestore call doc
    const callId = await createCall({ calleeId, calleeName, calleeAvatar, callerName, callerAvatar });
    callIdRef.current = callId;

    const callDoc: Call = {
      id: callId,
      callerId: user.uid,
      calleeId,
      callerName,
      callerAvatar,
      calleeName,
      calleeAvatar,
      status: 'ringing',
      type: 'audio',
      channelName: callId,
      createdAt: new Date(),
    };
    setCall(callDoc);
    setPhase('ringing');

    // Join Agora channel (caller side)
    const engine = _initEngine();
    const token = await fetchAgoraToken(callId).catch(() => null);
    engine.joinChannel(token ?? '', callId, 0, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      publishMicrophoneTrack: true,
      autoSubscribeAudio: true,
    });

    // Send push notification to callee
    notifyIncomingCall(calleeId, callerName, callerAvatar, callId).catch(() => {});

    // Listen for callee's response
    unsubCallRef.current = listenForCallUpdates(callId, (updated) => {
      if (!updated) return;
      if (updated.status === 'declined') _finalize('declined');
      else if (updated.status === 'missed') _finalize('missed');
      else if (updated.status === 'ended' && phaseRef.current !== null) _finalize('ended');
    });

    // Timeout → missed
    missedTimerRef.current = setTimeout(() => {
      updateCallStatus(callId, 'missed').catch(() => {});
      _finalize('missed');
    }, RING_TIMEOUT_MS);
  }, [_initEngine, _finalize]);

  const acceptCall = useCallback(async (incoming: Call) => {
    _stopRinging();

    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Microfono', 'Per rispondere hai bisogno di abilitare il microfono.');
      await updateCallStatus(incoming.id, 'declined');
      setPhase(null);
      setCall(null);
      return;
    }

    callIdRef.current = incoming.id;
    setCall(incoming);
    setPhase('connecting');

    await updateCallStatus(incoming.id, 'active');

    try { destroyAgoraEngine(); } catch {}
    const engine = _initEngine();
    const token = await fetchAgoraToken(incoming.channelName).catch(() => null);
    engine.joinChannel(token ?? '', incoming.channelName, 0, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      publishMicrophoneTrack: true,
      autoSubscribeAudio: true,
    });

    unsubCallRef.current = listenForCallUpdates(incoming.id, (updated) => {
      if (!updated) return;
      if (updated.status === 'ended' && phaseRef.current !== null) _finalize('ended');
    });
  }, [_initEngine, _finalize]);

  const declineCall = useCallback(async (incoming: Call) => {
    _stopRinging();
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
      return !m;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeaker((s) => {
      engineRef.current?.setEnableSpeakerphone(!s);
      return !s;
    });
  }, []);

  return (
    <CallContext.Provider value={{
      call, phase, isMuted, isSpeaker, duration, endReason,
      initiateCall, acceptCall, declineCall, endCall,
      toggleMute, toggleSpeaker,
    }}>
      {children}
    </CallContext.Provider>
  );
}
