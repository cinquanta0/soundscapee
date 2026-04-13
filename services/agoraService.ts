import {
  createAgoraRtcEngine,
  IRtcEngine,
  IRtcEngineEventHandler,
  ChannelProfileType,
  ClientRoleType,
  AudioProfileType,
  AudioScenarioType,
} from 'react-native-agora';
import { getFunctions, httpsCallable } from 'firebase/functions';

const AGORA_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? '';

let _engine: IRtcEngine | null = null;

// ─── Engine lifecycle ─────────────────────────────────────────────────────────

function getEngine(): IRtcEngine {
  if (!_engine) {
    _engine = createAgoraRtcEngine();
    _engine.initialize({
      appId: AGORA_APP_ID,
      channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
    });
    _engine.enableAudio();
    _engine.setEnableSpeakerphone(true);
    _engine.setAudioProfile(
      AudioProfileType.AudioProfileMusicHighQuality,
      AudioScenarioType.AudioScenarioGameStreaming,
    );
  }
  return _engine;
}

export function destroyAgoraEngine(): void {
  _engine?.leaveChannel();
  _engine?.release();
  _engine = null;
}

// ─── Token ────────────────────────────────────────────────────────────────────

export async function fetchAgoraToken(channelName: string): Promise<string | null> {
  try {
    const fns = getFunctions(undefined, 'europe-west1');
    const getToken = httpsCallable<{ channelName: string }, { token: string | null }>(fns, 'getAgoraToken');
    const result = await getToken({ channelName });
    return result.data.token;
  } catch {
    return null; // sviluppo senza certificato
  }
}

// ─── Join / leave ─────────────────────────────────────────────────────────────

export async function joinAsHost(channelName: string, token: string | null): Promise<void> {
  const engine = getEngine();
  await engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
  await engine.joinChannel(token ?? '', channelName, 0, {
    clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    publishMicrophoneTrack: false, // parte mutato
    autoSubscribeAudio: true,
  });
  // Boost voce remota: 200% del default così si sente chiaramente sopra la musica
  engine.adjustPlaybackSignalVolume(200);
}

export async function joinAsAudience(channelName: string, token: string | null): Promise<void> {
  const engine = getEngine();
  await engine.setClientRole(ClientRoleType.ClientRoleAudience);
  await engine.joinChannel(token ?? '', channelName, 0, {
    clientRoleType: ClientRoleType.ClientRoleAudience,
    publishMicrophoneTrack: false,
    autoSubscribeAudio: true,
  });
  // Boost voce remota: 200% del default così si sente chiaramente sopra la musica
  engine.adjustPlaybackSignalVolume(200);
}

export async function leaveAgoraChannel(): Promise<void> {
  await _engine?.leaveChannel();
}

// ─── Microphone ───────────────────────────────────────────────────────────────

export function refreshSpeakerphone(): void {
  _engine?.setEnableSpeakerphone(true);
}

export function setMicActive(active: boolean): void {
  const engine = getEngine();
  engine.enableLocalAudio(active);
  engine.muteLocalAudioStream(!active);
  engine.updateChannelMediaOptions({
    publishMicrophoneTrack: active,
    clientRoleType: ClientRoleType.ClientRoleBroadcaster,
  });
}

/** Promuove un ascoltatore a broadcaster (per speaker/cohost) — mic parte mutato */
export async function upgradeToSpeaker(): Promise<void> {
  const engine = getEngine();
  await engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
  engine.updateChannelMediaOptions({
    clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    publishMicrophoneTrack: false,
    autoSubscribeAudio: true,
  });
}

/** Riporta un broadcaster ad audience (revoca speaker) */
export async function downgradeToAudience(): Promise<void> {
  const engine = getEngine();
  engine.enableLocalAudio(false);
  engine.muteLocalAudioStream(true);
  engine.updateChannelMediaOptions({
    clientRoleType: ClientRoleType.ClientRoleAudience,
    publishMicrophoneTrack: false,
    autoSubscribeAudio: true,
  });
  await engine.setClientRole(ClientRoleType.ClientRoleAudience);
}

// ─── Event handler ────────────────────────────────────────────────────────────

export function registerEventHandler(handler: IRtcEngineEventHandler): void {
  getEngine().registerEventHandler(handler);
}

export function unregisterEventHandler(handler: IRtcEngineEventHandler): void {
  _engine?.unregisterEventHandler(handler);
}
