import { NativeModules, Platform } from 'react-native';

type OutgoingRingbackNativeModule = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

const nativeModule: OutgoingRingbackNativeModule | null = Platform.OS === 'android'
  ? (NativeModules.OutgoingRingback as OutgoingRingbackNativeModule | undefined) ?? null
  : null;

export async function startOutgoingRingback(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.start().catch(() => {});
}

export async function stopOutgoingRingback(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.stop().catch(() => {});
}
