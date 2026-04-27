import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet, Dimensions,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C } from '../constants/design';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PodcastPlayerItem {
  id: string;
  title: string;
  coverUrl?: string | null;
  audioUrl: string;
  duration?: number;
}

interface Props {
  podcast: PodcastPlayerItem;
  onFinish?: () => void;
  autoPlay?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function extFromUrl(url: string): string {
  const clean = decodeURIComponent(url.split('?')[0]);
  const ext = clean.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
  const allowed = ['mp3', 'm4a', 'mp4', 'aac', 'wav'];
  return allowed.includes(ext) ? ext : 'mp3';
}

// ─── Component ────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');
const COVER = SW - 48;

export default function PodcastPlayer({ podcast, onFinish, autoPlay = false }: Props) {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying]   = useState(false);
  const [position, setPosition]     = useState(0);
  const [duration, setDuration]     = useState(podcast.duration ?? 0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [imgError, setImgError]     = useState(false);
  const [barWidth, setBarWidth]     = useState(1);

  const soundRef      = useRef<Audio.Sound | null>(null);
  const isMountedRef  = useRef(true);
  const isLoadingRef  = useRef(false);
  const onFinishRef   = useRef(onFinish);
  const autoPlayRef   = useRef(autoPlay);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);
  useEffect(() => { autoPlayRef.current = autoPlay; }, [autoPlay]);

  const stopAndUnload = useCallback(async () => {
    const s = soundRef.current;
    if (!s) return;
    soundRef.current = null;
    s.setOnPlaybackStatusUpdate(null);
    try { await s.stopAsync(); }   catch {}
    try { await s.unloadAsync(); } catch {}
  }, []);

  const loadAudio = useCallback(async (pod: PodcastPlayerItem) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    await stopAndUnload();
    if (!isMountedRef.current) { isLoadingRef.current = false; return; }

    setLoading(true);
    setError(null);
    setIsPlaying(false);
    setPosition(0);
    setDuration(pod.duration ?? 0);

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      const ext      = extFromUrl(pod.audioUrl);
      const localUri = `${FileSystem.cacheDirectory}pod_${pod.id}.${ext}`;
      let sourceUri  = pod.audioUrl;

      try {
        const info = await FileSystem.getInfoAsync(localUri);
        const stale = !info.exists || (info.size !== undefined && info.size < 100);
        if (stale) {
          if (info.exists) await FileSystem.deleteAsync(localUri, { idempotent: true });
          await FileSystem.downloadAsync(pod.audioUrl, localUri);
        }
        sourceUri = localUri;
      } catch {
        sourceUri = pod.audioUrl;
      }

      if (!isMountedRef.current) { isLoadingRef.current = false; return; }

      const { sound } = await Audio.Sound.createAsync(
        { uri: sourceUri },
        { shouldPlay: false, volume: 1.0 },
      );

      if (!isMountedRef.current) {
        sound.setOnPlaybackStatusUpdate(null);
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
        isLoadingRef.current = false;
        return;
      }

      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (!isMountedRef.current || !status.isLoaded) return;
        setPosition(status.positionMillis / 1000);
        if (status.durationMillis) setDuration(status.durationMillis / 1000);
        setIsPlaying(status.isPlaying);
        if (status.didJustFinish) {
          setIsPlaying(false);
          if (status.durationMillis) setPosition(status.durationMillis / 1000);
          sound.stopAsync().catch(() => {});
          onFinishRef.current?.();
        }
      });

      soundRef.current = sound;
      if (autoPlayRef.current) {
        await sound.playAsync().catch(() => {});
      }

    } catch {
      if (isMountedRef.current) setError(t('podcast.cannotLoad'));
    } finally {
      if (isMountedRef.current) setLoading(false);
      isLoadingRef.current = false;
    }
  }, [stopAndUnload]);

  useEffect(() => {
    isMountedRef.current = true;
    setImgError(false);
    loadAudio(podcast);
    return () => {
      isMountedRef.current = false;
      stopAndUnload();
    };
  }, [podcast.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = useCallback(async () => {
    if (!soundRef.current || loading) return;
    if (isPlaying) {
      await soundRef.current.pauseAsync().catch(() => {});
    } else {
      await soundRef.current.playAsync().catch(() => {});
    }
  }, [isPlaying, loading]);

  const skip = useCallback(async (secs: number) => {
    if (!soundRef.current || !duration) return;
    const ms = Math.max(0, Math.min((position + secs) * 1000, duration * 1000));
    await soundRef.current.setPositionAsync(ms).catch(() => {});
  }, [position, duration]);

  const seekToRatio = useCallback(async (ratio: number) => {
    if (!soundRef.current || !duration) return;
    const ms = Math.max(0, Math.min(ratio * duration * 1000, duration * 1000));
    await soundRef.current.setPositionAsync(ms).catch(() => {});
  }, [duration]);

  const progress    = duration > 0 ? Math.min(position / duration, 1) : 0;
  const progressPct = `${(progress * 100).toFixed(2)}%`;
  const showCover   = !!podcast.coverUrl && !imgError;

  return (
    <View style={s.root}>

      {/* ── Album art ─────────────────────────────────────────────────── */}
      <View style={s.coverWrap}>
        {showCover ? (
          <Image
            source={{ uri: podcast.coverUrl! }}
            style={s.cover}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={[s.cover, s.coverFallback]}>
            <Feather name="mic" size={64} color={C.accent} />
          </View>
        )}
      </View>

      {/* ── Track title ───────────────────────────────────────────────── */}
      <View style={s.trackInfo}>
        <Text style={s.title} numberOfLines={2} ellipsizeMode="tail">
          {podcast.title}
        </Text>
      </View>

      {/* ── Error state ───────────────────────────────────────────────── */}
      {error ? (
        <View style={s.errorWrap}>
          <Feather name="alert-circle" size={28} color="rgba(255,100,100,0.8)" />
          <Text style={s.errorTxt}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => loadAudio(podcast)}>
            <Text style={s.retryTxt}>{t('common.ok')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* ── Seek bar ──────────────────────────────────────────────── */}
          <View style={s.seekContainer}>
            <TouchableOpacity
              activeOpacity={1}
              style={s.seekTrack}
              onLayout={(e) => setBarWidth(e.nativeEvent.layout.width || 1)}
              onPress={(e) => seekToRatio(e.nativeEvent.locationX / barWidth)}
            >
              <View style={s.seekRail} />
              <View style={[s.seekFill, { width: progressPct as any }]} />
              <View style={[s.seekThumb, { left: progressPct as any }]} />
            </TouchableOpacity>
            <View style={s.timeRow}>
              <Text style={s.timeTxt}>{fmtTime(position)}</Text>
              <Text style={s.timeTxt}>{fmtTime(duration)}</Text>
            </View>
          </View>

          {/* ── Controls ──────────────────────────────────────────────── */}
          <View style={s.controls}>
            <TouchableOpacity
              style={s.skipBtn}
              onPress={() => skip(-15)}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Feather
                name="rotate-ccw"
                size={26}
                color={loading ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)'}
              />
              <Text style={s.skipLbl}>15</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.playBtn, loading && s.playBtnDisabled]}
              onPress={togglePlay}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={C.textOnAccent} size="small" />
              ) : (
                <Feather
                  name={isPlaying ? 'pause' : 'play'}
                  size={30}
                  color={C.textOnAccent}
                  style={isPlaying ? undefined : { marginLeft: 3 }}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.skipBtn}
              onPress={() => skip(15)}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Feather
                name="rotate-cw"
                size={26}
                color={loading ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)'}
              />
              <Text style={s.skipLbl}>15</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingBottom: 8,
  },

  // ── Cover ──
  coverWrap: {
    width: COVER,
    height: COVER,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.65,
    shadowRadius: 24,
    elevation: 16,
  },
  cover: {
    width: COVER,
    height: COVER,
    borderRadius: 12,
  },
  coverFallback: {
    backgroundColor: C.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.borderAccent,
  },

  // ── Track info ──
  trackInfo: {
    width: '100%',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 26,
    letterSpacing: -0.3,
  },

  // ── Seek bar ──
  seekContainer: {
    width: '100%',
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  seekTrack: {
    height: 40,
    justifyContent: 'center',
  },
  seekRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 18,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
  },
  seekFill: {
    position: 'absolute',
    left: 0,
    top: 18,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  seekThumb: {
    position: 'absolute',
    top: 12,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginLeft: -8,
    shadowColor: C.accent,
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeTxt: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    fontVariant: ['tabular-nums'],
  },

  // ── Controls ──
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 36,
    marginBottom: 8,
  },
  skipBtn: {
    alignItems: 'center',
    gap: 4,
    minWidth: 48,
  },
  skipLbl: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.accent,
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 10,
  },
  playBtnDisabled: {
    opacity: 0.7,
  },

  // ── Error ──
  errorWrap: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  errorTxt: {
    fontSize: 13,
    color: 'rgba(255,100,100,0.9)',
    textAlign: 'center',
    lineHeight: 19,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.borderAccent,
    backgroundColor: C.accentDim,
  },
  retryTxt: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '600',
  },
});
