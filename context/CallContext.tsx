import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback,
} from 'react';
import { Alert, AppState, Linking, NativeEventEmitter, NativeModules, Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import {
  IRtcEngine, IRtcEngineEventHandler, ClientRoleType,
} from 'react-native-agora';
import { auth, db } from '../firebaseConfig';
import { getCallEngine, destroyAgoraEngine, fetchAgoraToken } from '../services/agoraService';
import {
  Call, CallPhase, ParticipantProfile,
  createCall, createGroupCall, updateCallStatus,
  updateParticipantCallStatus,
  leaveGroupCall, inviteParticipantsToCall, upgradeCallToGroup,
  rejoinGroupCall as rejoinGroupCallService,
  listenForIncomingCall, listenForCallUpdates,
  updateCallDuration, publishCallRecording,
} from '../services/callService';
import { startOutgoingRingback, stopOutgoingRingback } from '../services/outgoingRingbackService';
import { showIncomingCall, dismissIncomingCall, notifyCallEnded, getPendingAcceptCallId, getPendingDeclineCallId, setAuthToken, addIncomingCallListener } from '../services/incomingCallService';
import { pausePlayerForCall, resumePlayerAfterCall } from '../services/audioPlayer';
import { listenBlockedUsers } from '../services/blockService';

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
const RING_TIMEOUT_MS = 30_000;

function alertMicPermission(canAskAgain: boolean) {
  if (canAskAgain) {
    Alert.alert('Microfono', 'Per usare le chiamate devi abilitare il microfono.');
  } else {
    Alert.alert(
      'Microfono richiesto',
      'Il permesso del microfono è stato negato in modo permanente. Abilitalo nelle impostazioni dell\'app.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Impostazioni', onPress: () => Linking.openSettings() },
      ],
    );
  }
}
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
  isPipMode: boolean;
  duration: number;
  endReason: string | null;
  canRejoin: boolean;
  initiateCall: (calleeId: string, calleeName: string, calleeAvatar: string) => Promise<void>;
  initiateGroupCall: (inviteeIds: string[], inviteeProfiles: Record<string, ParticipantProfile>) => Promise<void>;
  acceptCall: (call: Call) => Promise<void>;
  declineCall: (call: Call) => Promise<void>;
  endCall: () => Promise<void>;
  rejoinGroupCall: () => Promise<void>;
  dismissEndedCall: () => void;
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
  const [isPipMode, setIsPipMode] = useState(false);
  const [duration, setDuration] = useState(0);
  const [endReason, setEndReason] = useState<string | null>(null);
  const isMutedRef = useRef(false);

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
  const pendingNativeAcceptIdRef = useRef<string | null>(null);
  const pendingAcceptCallRef = useRef<Call | null>(null);
  const rejoinableCallRef = useRef<Call | null>(null);
  const [canRejoin, setCanRejoin] = useState(false);
  const blockedUsersRef = useRef<Set<string>>(new Set());
  const wasPlayingBeforeCallRef = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { incomingCallRef.current = call; }, [call]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // If the app was killed when the user declined, the broadcast was missed.
  // Accept is handled inside listenForIncomingCall to avoid a Firestore cache race.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    getPendingDeclineCallId().then(async (callId) => {
      if (!callId) return;
      // For group calls the native IncomingCallService already wrote the correct
      // per-participant status via REST (patchCallStatus). Calling updateCallStatus
      // here would set the *overall* status to 'declined' and terminate an ongoing
      // group call for everyone — exactly the recall bug. Only fall back to the JS
      // path for 1:1 calls where the native code sets the overall status itself too.
      const snap = await getDoc(doc(db, 'calls', callId)).catch(() => null);
      if (snap?.data()?.type === 'group') return;
      await updateCallStatus(callId, 'declined').catch(() => {});
    }).catch(() => {});
  }, []);

  // Keep Firebase ID token fresh in SharedPreferences so IncomingCallService
  // can call the Firestore REST API to decline a call even when the bridge is dead.
  // onIdTokenChanged fires on sign-in and whenever Firebase refreshes the token (~1h).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const unsub = onIdTokenChanged(auth, async (user) => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        setAuthToken(user.uid, token, user.refreshToken ?? '');
      } catch {}
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        // Deferred accept: app was in background when user accepted from lock screen (PIN).
        // Now that we're in foreground, microphone access is allowed — run _doAccept.
        if (pendingAcceptCallRef.current && !acceptingCallRef.current) {
          const callToAccept = pendingAcceptCallRef.current;
          pendingAcceptCallRef.current = null;
          _doAccept(callToAccept);
          return;
        }
        if (phaseRef.current === 'incoming') {
          // Android: IncomingCallService already runs in background — no need
          // to stop/restart; it keeps ringing via STREAM_RING on its own.
          // iOS: restart expo-av ringtone after returning to foreground.
          if (Platform.OS !== 'android') {
            _stopRinging();
            _startRinging(incomingCallRef.current ?? undefined);
          }
          callkeepIncomingVisibleRef.current = false;
          setUseSystemIncomingUI(false);
        } else if (phaseRef.current === 'ringing' && Platform.OS === 'android') {
          stopOutgoingRingback().catch(() => {});
          startOutgoingRingback().catch(() => {});
        } else {
          // Not in a call — nothing to do
          if (Platform.OS !== 'android') _stopRinging();
          stopOutgoingRingback().catch(() => {});
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
        appName: 'MIUSLYK',
        ringtoneSound: 'soundscape_call.wav',
        supportsVideo: false,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
      },
      android: {
        alertTitle: 'Autorizzazione chiamate',
        alertDescription: 'MIUSLYK ha bisogno di gestire le chiamate audio',
        cancelButton: 'Annulla',
        okButton: 'OK',
        additionalPermissions: [],
        selfManaged: true,
      },
    }).catch(() => {});
    ck.setForegroundServiceSettings({
      channelId: 'calls',
      channelName: 'Chiamate MIUSLYK',
      notificationTitle: 'MIUSLYK gestisce una chiamata in background',
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
    let unsubBlocked: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubCall?.();
      unsubCall = null;
      unsubBlocked?.();
      unsubBlocked = null;
      if (!user) { blockedUsersRef.current = new Set(); return; }

      unsubBlocked = listenBlockedUsers(user.uid, (ids) => {
        blockedUsersRef.current = new Set(ids);
      });

      unsubCall = listenForIncomingCall(user.uid, (incoming) => {
        if (!incoming) {
          dismissedIncomingIdsRef.current.clear();
          // Caller cancelled while we were waiting for PIN — drop the deferred accept
          if (pendingAcceptCallRef.current) {
            pendingAcceptCallRef.current = null;
            setPhase(null);
            setCall(null);
          }
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
        // Already deferred for this call — ignore re-fires from Firestore updates
        if (pendingAcceptCallRef.current?.id === incoming.id) return;
        // Silently reject calls from blocked users
        if (blockedUsersRef.current.has(incoming.callerId)) {
          dismissedIncomingIdsRef.current.add(incoming.id);
          dismissIncomingCall().catch(() => {});
          updateCallStatus(incoming.id, 'declined').catch(() => {});
          return;
        }
        setCall(incoming);

        // Fast path: pending accept already known (CallKeep or acceptSub already set the ref)
        if (
          pendingAcceptUUIDRef.current === incoming.id
          || pendingNativeAcceptIdRef.current === incoming.id
        ) {
          pendingAcceptUUIDRef.current = null;
          pendingNativeAcceptIdRef.current = null;
          if (appStateRef.current === 'active') {
            _doAccept(incoming);
          } else {
            pendingAcceptCallRef.current = incoming;
          }
          return;
        }

        if (Platform.OS === 'android') {
          callkeepIncomingVisibleRef.current = false;
          setUseSystemIncomingUI(false);
          // Slow path: Firestore local cache can fire before getPendingAcceptCallId()
          // resolves in the mount effect — check SharedPreferences directly here.
          getPendingAcceptCallId().then((nativeId) => {
            if (phaseRef.current !== null) return;
            if (pendingAcceptCallRef.current?.id === incoming.id) return;
            // nativeId match: bridge was killed when user accepted
            if (nativeId === incoming.id) {
              if (appStateRef.current === 'active') {
                _doAccept(incoming);
              } else {
                pendingAcceptCallRef.current = incoming;
              }
              return;
            }
            // pendingNativeAcceptIdRef match: acceptSub fired before us
            // (broadcastReceiver already cleared SharedPreferences)
            if (pendingNativeAcceptIdRef.current === incoming.id) {
              pendingNativeAcceptIdRef.current = null;
              if (appStateRef.current === 'active') {
                _doAccept(incoming);
              } else {
                pendingAcceptCallRef.current = incoming;
              }
              return;
            }
            pausePlayerForCall().then((was) => { if (was) wasPlayingBeforeCallRef.current = true; }).catch(() => {});
            setPhase('incoming');
            if (appStateRef.current === 'active') _startRinging(incoming);
          }).catch(() => {
            if (phaseRef.current === null && !pendingAcceptCallRef.current) {
              pausePlayerForCall().then((was) => { if (was) wasPlayingBeforeCallRef.current = true; }).catch(() => {});
              setPhase('incoming');
              if (appStateRef.current === 'active') _startRinging(incoming);
            }
          });
          return;
        }
        // iOS — original path
        callkeepIncomingVisibleRef.current = false;
        setUseSystemIncomingUI(false);
        pausePlayerForCall().then((was) => { if (was) wasPlayingBeforeCallRef.current = true; }).catch(() => {});
        setPhase('incoming');
        _startRinging(incoming);
      });
    });

    return () => { unsubCall?.(); unsubBlocked?.(); unsubAuth(); };
  }, []);

  // ─── Handle accept / decline from Android notification buttons ───────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const acceptSub = addIncomingCallListener('IncomingCallAccepted', ({ callId }) => {
      const incoming = incomingCallRef.current;
      if (incoming && incoming.id === callId && phaseRef.current === 'incoming' && !acceptingCallRef.current) {
        if (appStateRef.current === 'active') {
          _doAccept(incoming);
        } else {
          // App is behind lock screen (PIN) — defer until foreground
          pendingAcceptCallRef.current = incoming;
        }
      } else {
        // Race condition: il broadcast è arrivato prima che il listener Firestore
        // caricasse la call. Lo salviamo e lo processiamo appena arriva.
        pendingNativeAcceptIdRef.current = callId;
      }
    });

    const declineSub = addIncomingCallListener('IncomingCallDeclined', async ({ callId }) => {
      dismissedIncomingIdsRef.current.add(callId);
      const incoming = incomingCallRef.current;
      if (incoming?.id === callId) {
        setPhase(null);
        setCall(null);
      }
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      // Fetch call type from Firestore — incomingCallRef.current may be null if the
      // JS bridge was not yet running when the native notification appeared.
      const snap = await getDoc(doc(db, 'calls', callId)).catch(() => null);
      const data = snap?.data();
      const isGroup = (data?.type ?? incoming?.type) === 'group';
      if (isGroup) {
        await updateParticipantCallStatus(callId, uid, 'declined').catch(() => {});
        // Re-read after update so we see the freshly written status for this participant
        const fresh = await getDoc(doc(db, 'calls', callId)).catch(() => null);
        const freshData = fresh?.data();
        const invitees: string[] = Array.isArray(freshData?.invitees) ? freshData.invitees : [];
        const someoneStillActive = invitees.some((id: string) => {
          const st = freshData?.participantStatuses?.[id];
          return st === 'ringing' || st === 'active';
        });
        if (!someoneStillActive) {
          updateCallStatus(callId, 'declined').catch(() => {});
        }
      } else {
        updateCallStatus(callId, 'declined').catch(() => {});
      }
    });

    const hangupSub = addIncomingCallListener('CallHangUpFromLockScreen', ({ callId }) => {
      // User tapped Riattacca before the call fully connected (still entering PIN)
      if (pendingAcceptCallRef.current?.id === callId) {
        updateCallStatus(callId, 'ended').catch(() => {});
        pendingAcceptCallRef.current = null;
        setPhase(null);
        setCall(null);
        return;
      }
      if (callIdRef.current === callId && !cleaningUpRef.current) {
        updateCallStatus(callId, 'ended').catch(() => {});
        _finalize('ended');
      }
    });

    return () => {
      acceptSub?.remove();
      declineSub?.remove();
      hangupSub?.remove();
    };
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
        stopOutgoingRingback().catch(() => {});
        if (missedTimerRef.current) { clearTimeout(missedTimerRef.current); missedTimerRef.current = null; }
        if (dropTimerRef.current) { clearTimeout(dropTimerRef.current); dropTimerRef.current = null; }
        if (callIdRef.current) ck.setCurrentCallActive(callIdRef.current);
        if (becameActive) {
          // Set audio session for call (earpiece default; user can toggle to speaker).
          // Android only: on iOS Agora already owns the AVAudioSession at this point;
          // calling setAudioModeAsync here would conflict with Agora and drop the call.
          // Spotify interruption on iOS is handled in _doAccept (before joinChannel).
          if (Platform.OS === 'android') {
            Audio.setAudioModeAsync({
              allowsRecordingIOS: true,
              playsInSilentModeIOS: true,
              staysActiveInBackground: true,
              shouldDuckAndroid: false,
              playThroughEarpieceAndroid: true,
            }).catch(() => {});
          }
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
            // PiP replaces the sticky "return to call" notification.
            // setCallActive tells MainActivity.onUserLeaveHint() to enter PiP.
            const currentCall = incomingCallRef.current;
            const myUid = auth.currentUser?.uid;
            const remoteName = currentCall
              ? (currentCall.callerId === myUid ? currentCall.calleeName : currentCall.callerName)
              : 'Chiamata';
            NativeModules.CallPip?.setCallActive?.(true, remoteName, false);
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

  // ─── Ringtone ──────────────────────────────────────────────────────────────
  // Android: IncomingCallService handles ringtone (STREAM_RING = ring volume)
  //          + vibration + full-screen intent + notification action buttons.
  // iOS:     expo-av Audio.Sound (playsInSilentModeIOS) — kept unchanged.
  const _startRinging = async (incomingCall?: Call) => {
    if (Platform.OS === 'android') {
      // Delegate entirely to the native service — it loops on STREAM_RING.
      const id   = incomingCall?.id   ?? incomingCallRef.current?.id   ?? '';
      const type = incomingCall?.type ?? incomingCallRef.current?.type ?? 'audio';
      let name = incomingCall?.callerName ?? incomingCallRef.current?.callerName ?? 'Chiamata in arrivo';
      if (type === 'group') {
        const profiles = incomingCall?.participantProfiles ?? incomingCallRef.current?.participantProfiles ?? {};
        const myUid = auth.currentUser?.uid ?? '';
        const names = Object.entries(profiles)
          .filter(([uid]) => uid !== myUid)
          .map(([, p]) => (p as ParticipantProfile).name)
          .filter(Boolean);
        if (names.length > 0) {
          name = names.length > 3
            ? `${names.slice(0, 2).join(', ')} e altri ${names.length - 2}`
            : names.join(', ');
        }
      }
      showIncomingCall(id, name, type).catch(() => {});
      return;
    }
    // ── iOS path ──
    if (ringtoneRef.current || ringtoneStartingRef.current) return;
    ringtoneStartingRef.current = true;
    // Attiva PlayAndRecord per interrompere Spotify/app esterne, poi torna a
    // Playback per far uscire la suoneria dal speaker (non dall'auricolare).
    // iOS non invia interruption-ended a Spotify tra le due chiamate sincrone.
    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true }); } catch {}
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
    }).catch(() => {});
    Audio.Sound.createAsync(CALL_SOUND, {
      isLooping: true,
      shouldPlay: true,
      volume: 1,
    }).then(({ sound }) => {
      if (!ringtoneStartingRef.current) {
        // _stopRinging was called while the sound was loading — discard immediately
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
        return;
      }
      ringtoneStartingRef.current = false;
      ringtoneRef.current = sound;
    }).catch(() => {
      ringtoneStartingRef.current = false;
    });
    Vibration.vibrate();
  };

  const _stopRinging = () => {
    if (Platform.OS === 'android') {
      dismissIncomingCall().catch(() => {});
      return;
    }
    // ── iOS path ──
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
    stopOutgoingRingback().catch(() => {});
    callkeepIncomingVisibleRef.current = false;
    setUseSystemIncomingUI(false);
    if (missedTimerRef.current) { clearTimeout(missedTimerRef.current); missedTimerRef.current = null; }
    if (dropTimerRef.current) { clearTimeout(dropTimerRef.current); dropTimerRef.current = null; }
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    unsubCallRef.current?.();
    unsubCallRef.current = null;
    if (Platform.OS === 'android') {
      NativeModules.CallPip?.setCallActive?.(false, '', false);
      NativeModules.CallPip?.abandonCallAudioFocus?.();
      NativeModules.CallPip?.stopCallForegroundService?.();
      Notifications.dismissAllNotificationsAsync().catch(() => {});
      notifyCallEnded().catch(() => {});
    }

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

    if (Platform.OS === 'ios') {
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});
    }

    if (wasPlayingBeforeCallRef.current) {
      wasPlayingBeforeCallRef.current = false;
      resumePlayerAfterCall().catch(() => {});
    }

    setEndReason(reason);
    setPhase('ended');
    setIsMuted(false);
    setIsSpeaker(false);
    setDuration(0);
    durationRef.current = 0;

    if (reason === 'left') {
      callIdRef.current = null;
      cleaningUpRef.current = false;
      setCanRejoin(rejoinableCallRef.current !== null);
      setTimeout(() => {
        // Se l'utente ha già fatto rejoin, engineRef è tornato attivo — non toccare l'UI.
        if (engineRef.current) return;
        setPhase(null);
        setCall(null);
        setEndReason(null);
        setCanRejoin(false);
        rejoinableCallRef.current = null;
      }, 15_000);
      return;
    }

    setTimeout(() => {
      setPhase(null);
      setCall(null);
      setEndReason(null);
      callIdRef.current = null;
      cleaningUpRef.current = false;
      setCanRejoin(false);
      rejoinableCallRef.current = null;

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

    const { status, canAskAgain } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      alertMicPermission(canAskAgain);
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

    wasPlayingBeforeCallRef.current = wasPlayingBeforeCallRef.current || (await pausePlayerForCall().catch(() => false));
    if (Platform.OS === 'android') {
      NativeModules.CallPip?.requestCallAudioFocus?.();
      NativeModules.CallPip?.startCallForegroundService?.();
    } else if (Platform.OS === 'ios') {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});
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
      stopOutgoingRingback().catch(() => {});
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
      if (cleaningUpRef.current) return;
      if (updated.status === 'ended') _finalize('ended');
      else if (updated.status === 'missed') _finalize('missed');
      else if (updated.status === 'declined') _finalize('declined');
      else if (updated.type === 'group' && updated.participantStatuses?.[myUid] === 'left') _finalize('left');
    });
  }, [_initEngine, _finalize]);

  // ─── Public: 1:1 call ─────────────────────────────────────────────────────
  const initiateCall = useCallback(async (
    calleeId: string, calleeName: string, calleeAvatar: string,
  ) => {
    const user = auth.currentUser;
    if (!user) return;

    const { status, canAskAgain } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      alertMicPermission(canAskAgain);
      return;
    }

    wasPlayingBeforeCallRef.current = await pausePlayerForCall().catch(() => false);
    if (Platform.OS === 'android') {
      NativeModules.CallPip?.requestCallAudioFocus?.();
      NativeModules.CallPip?.startCallForegroundService?.();
    } else if (Platform.OS === 'ios') {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});
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
    if (Platform.OS === 'android') startOutgoingRingback().catch(() => {});

    // On Android, VoiceConnectionService.makeOutgoingCall() calls TelecomManager.getPhoneAccount()
    // which requires READ_PHONE_NUMBERS on API 32+ — skip on Android since we have our own system.
    if (Platform.OS !== 'android') ck.startCall(callId, calleeName, calleeName, 'generic', false);
    ck.backToForeground();

    let engine: ReturnType<typeof _initEngine>;
    try { engine = _initEngine(); } catch (e) {
      console.error('[CALL] Engine init failed:', e);
      await updateCallStatus(callId, 'ended').catch(() => {});
      stopOutgoingRingback().catch(() => {});
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

    const { status, canAskAgain } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      alertMicPermission(canAskAgain);
      return;
    }

    wasPlayingBeforeCallRef.current = await pausePlayerForCall().catch(() => false);
    if (Platform.OS === 'android') {
      NativeModules.CallPip?.requestCallAudioFocus?.();
      NativeModules.CallPip?.startCallForegroundService?.();
    } else if (Platform.OS === 'ios') {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});
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
    if (Platform.OS === 'android') startOutgoingRingback().catch(() => {});

    if (Platform.OS !== 'android') ck.startCall(callId, groupName, groupName, 'generic', false);
    ck.backToForeground();

    let engine: ReturnType<typeof _initEngine>;
    try { engine = _initEngine(); } catch (e) {
      console.error('[CALL] Engine init failed:', e);
      await updateCallStatus(callId, 'ended').catch(() => {});
      stopOutgoingRingback().catch(() => {});
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
      if (updated.status === 'declined') _finalize('declined');
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
      // Salva la call per eventuale rejoin prima che _finalize azzeri tutto
      rejoinableCallRef.current = incomingCallRef.current;
      await leaveGroupCall(callIdRef.current, uid).catch(() => {});
      _finalize('left');
      return;
    }
    await updateCallStatus(callIdRef.current, 'ended').catch(() => {});
    _finalize('ended');
  }, [_finalize]);

  const rejoinGroupCall = useCallback(async () => {
    const callToRejoin = rejoinableCallRef.current;
    if (!callToRejoin) return;
    rejoinableCallRef.current = null;
    setCanRejoin(false);

    const { status: micStatus, canAskAgain: micCanAskAgain } = await Audio.requestPermissionsAsync();
    if (micStatus !== 'granted') {
      alertMicPermission(micCanAskAgain);
      return;
    }

    const uid = auth.currentUser?.uid ?? '';
    const freshCall = await rejoinGroupCallService(callToRejoin.id, uid).catch(() => null);
    if (!freshCall) {
      Alert.alert('Chiamata terminata', 'La chiamata di gruppo è già terminata.');
      setPhase(null); setCall(null); setEndReason(null);
      return;
    }

    callIdRef.current = freshCall.id;
    cleaningUpRef.current = false;
    setCall(freshCall);
    setPhase('connecting');
    setEndReason(null);

    let engine: ReturnType<typeof _initEngine>;
    try { engine = _initEngine(); } catch (e) {
      setPhase(null); setCall(null); callIdRef.current = null;
      return;
    }
    const token = await fetchAgoraToken(freshCall.channelName).catch(() => null);
    engine.joinChannel(token ?? '', freshCall.channelName, 0, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      publishMicrophoneTrack: true,
      autoSubscribeAudio: true,
    });

    unsubCallRef.current = listenForCallUpdates(freshCall.id, (updated) => {
      if (updated) setCall(updated);
      const myUid = auth.currentUser?.uid ?? '';
      if (!updated) return;
      if (updated.status === 'ended' && !cleaningUpRef.current) _finalize('ended');
      if (updated.type === 'group' && updated.participantStatuses?.[myUid] === 'left' && !cleaningUpRef.current) {
        rejoinableCallRef.current = updated;
        _finalize('left');
      }
    });
  }, [_initEngine, _finalize]);

  const dismissEndedCall = useCallback(() => {
    setPhase(null);
    setCall(null);
    setEndReason(null);
    setCanRejoin(false);
    rejoinableCallRef.current = null;
  }, []);

  const inviteParticipantsToCurrentCall = useCallback(async (
    inviteeIds: string[],
    inviteeProfiles: Record<string, ParticipantProfile>,
  ) => {
    const callId = callIdRef.current;
    const currentCall = incomingCallRef.current;
    if (!callId || !currentCall) return;

    if (currentCall.type !== 'group') {
      // Upgrade 1:1 → group: costruiamo i profili dei partecipanti originali
      const existingProfiles: Record<string, ParticipantProfile> = {
        [currentCall.callerId]: { name: currentCall.callerName, avatar: currentCall.callerAvatar },
        [currentCall.calleeId]: { name: currentCall.calleeName, avatar: currentCall.calleeAvatar },
      };
      await upgradeCallToGroup(callId, inviteeIds, { ...existingProfiles, ...inviteeProfiles });
    } else {
      await inviteParticipantsToCall(callId, inviteeIds, inviteeProfiles);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => {
      const newMuted = !m;
      engineRef.current?.muteLocalAudioStream(newMuted);
      if (callIdRef.current) ck.setMutedCall(callIdRef.current, newMuted);
      isMutedRef.current = newMuted;
      if (Platform.OS === 'android') {
        NativeModules.CallPip?.updatePipActions?.(newMuted);
      }
      return newMuted;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeaker((s) => {
      const next = !s;
      if (Platform.OS === 'android') {
        // Use native AudioManager.setCommunicationDevice() (API 31+) — the only reliable
        // way to route audio on HyperOS 2 / MIUI, where setSpeakerphoneOn() is ignored.
        NativeModules.CallPip?.setSpeakerOn?.(next);
        // Apply expo-av mode change first, then re-apply Agora after it settles.
        Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: !next,
        }).then(() => {
          engineRef.current?.setEnableSpeakerphone(next);
        }).catch(() => {
          engineRef.current?.setEnableSpeakerphone(next);
        });
      } else {
        engineRef.current?.setEnableSpeakerphone(next);
      }
      return next;
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

  // PiP event listeners (Android only)
  useEffect(() => {
    if (Platform.OS !== 'android' || !NativeModules.CallPip) return;
    const emitter = new NativeEventEmitter(NativeModules.CallPip);
    const hangupSub = emitter.addListener('PipHangUp', () => {
      endCall().catch(() => {});
    });
    const muteSub = emitter.addListener('PipMuteToggle', () => {
      toggleMute();
    });
    const modeSub = emitter.addListener('PipModeChanged', ({ isActive }: { isActive: boolean }) => {
      setIsPipMode(isActive);
    });
    return () => {
      hangupSub.remove();
      muteSub.remove();
      modeSub.remove();
    };
  }, [endCall, toggleMute]);

  return (
    <CallContext.Provider value={{
      call, phase, useSystemIncomingUI, isMuted, isSpeaker, isRecording, isPipMode, duration, endReason, canRejoin,
      initiateCall, initiateGroupCall, acceptCall, declineCall, endCall,
      rejoinGroupCall, dismissEndedCall, inviteParticipantsToCurrentCall,
      toggleMute, toggleSpeaker, toggleRecording,
    }}>
      {children}
    </CallContext.Provider>
  );
}
