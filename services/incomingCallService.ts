/**
 * services/incomingCallService.ts
 *
 * Thin bridge to the Android-native IncomingCallService.
 * On iOS this is a no-op (iOS uses CallKit / native VoIP push instead).
 *
 * Usage:
 *   import { showIncomingCall, dismissIncomingCall, addIncomingCallListener } from './incomingCallService';
 *
 *   // Show the full-screen incoming call notification (rings on STREAM_RING):
 *   await showIncomingCall(callId, callerName);
 *
 *   // Dismiss it when the call ends / times out:
 *   await dismissIncomingCall();
 *
 *   // Listen for accept/decline tapped from the notification:
 *   const sub = addIncomingCallListener('IncomingCallAccepted', ({ callId }) => { ... });
 *   sub.remove();
 */
import { NativeModules, NativeEventEmitter, Platform, EmitterSubscription } from 'react-native';

type IncomingCallNativeModule = {
  showIncomingCall: (callId: string, callerName: string) => Promise<void>;
  dismissIncomingCall: () => Promise<void>;
  notifyCallEnded: () => Promise<void>;
  getPendingAcceptCallId: () => Promise<string | null>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

const nativeModule: IncomingCallNativeModule | null =
  Platform.OS === 'android'
    ? (NativeModules.IncomingCall as IncomingCallNativeModule | undefined) ?? null
    : null;

const emitter = nativeModule ? new NativeEventEmitter(nativeModule as any) : null;

export type IncomingCallEvent = 'IncomingCallAccepted' | 'IncomingCallDeclined' | 'CallHangUpFromLockScreen';

export async function showIncomingCall(callId: string, callerName: string): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.showIncomingCall(callId, callerName).catch(() => {});
}

export async function dismissIncomingCall(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.dismissIncomingCall().catch(() => {});
}

export async function notifyCallEnded(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.notifyCallEnded().catch(() => {});
}

export async function getPendingAcceptCallId(): Promise<string | null> {
  if (!nativeModule) return null;
  return nativeModule.getPendingAcceptCallId().catch(() => null);
}

/**
 * Subscribe to accept/decline events emitted from the notification action buttons.
 * Returns an EmitterSubscription — call .remove() to unsubscribe.
 */
export function addIncomingCallListener(
  event: IncomingCallEvent,
  cb: (params: { callId: string }) => void,
): EmitterSubscription | null {
  if (!emitter) return null;
  return emitter.addListener(event, cb);
}
