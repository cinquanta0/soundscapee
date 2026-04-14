/**
 * PodcastPlayer — componente riutilizzabile standalone
 *
 * Usa expo-av (react-native-track-player incompatibile con New Architecture).
 * Robusto contro: memory leak, doppio caricamento, timer in pausa,
 * sovrapposizione tra episodi, crash su unmount asincrono.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PodcastPlayerItem {
  id: string;
  title: string;
  coverUrl?: string | null;
  audioUrl: string;
  duration?: number; // secondi
}

interface Props {
  podcast: PodcastPlayerItem;
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

export default function PodcastPlayer({ podcast }: Props) {
  const [isPlaying, setIsPlaying]   = useState(false);
  const [position, setPosition]     = useState(0);     // secondi
  const [duration, setDuration]     = useState(podcast.duration ?? 0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [imgError, setImgError]     = useState(false);
  const [barWidth, setBarWidth]     = useState(1);     // larghezza reale della seek bar in px

  const soundRef      = useRef<Audio.Sound | null>(null);
  const isMountedRef  = useRef(true);
  const isLoadingRef  = useRef(false); // guard: impedisce caricamenti concorrenti

  // ── Smonta il suono corrente in modo sicuro ──────────────────────────────
  const stopAndUnload = useCallback(async () => {
    const s = soundRef.current;
    if (!s) return;
    soundRef.current = null;
    s.setOnPlaybackStatusUpdate(null); // rimuove callback prima di stop/unload
    try { await s.stopAsync(); }   catch {}
    try { await s.unloadAsync(); } catch {}
  }, []);

  // ── Carica e avvia l'audio ───────────────────────────────────────────────
  const loadAudio = useCallback(async (pod: PodcastPlayerItem) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    // Smonta il suono precedente prima di tutto
    await stopAndUnload();

    if (!isMountedRef.current) { isLoadingRef.current = false; return; }

    setLoading(true);
    setError(null);
    setIsPlaying(false);
    setPosition(0);
    setDuration(pod.duration ?? 0);

    try {
      // Prende il controllo della sessione audio — interrompe qualsiasi
      // altro suono expo-av attivo (es. tracce radio) in modo nativo
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      // Scarica in cache locale per affidabilità su Android
      // (ExoPlayer su Android gestisce male le range requests di Firebase)
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
        // fallback: streaming diretto se il download fallisce
        sourceUri = pod.audioUrl;
      }

      if (!isMountedRef.current) { isLoadingRef.current = false; return; }

      const { sound } = await Audio.Sound.createAsync(
        { uri: sourceUri },
        { shouldPlay: false, volume: 1.0 },
      );

      // Controllo post-await: component potrebbe essere già smontato
      if (!isMountedRef.current) {
        sound.setOnPlaybackStatusUpdate(null);
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
        isLoadingRef.current = false;
        return;
      }

      // Callback di stato — unica fonte di verità per posizione e play/pause
      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (!isMountedRef.current || !status.isLoaded) return;

        // Timer: guidato da positionMillis reale → non avanza mai se in pausa
        setPosition(status.positionMillis / 1000);
        if (status.durationMillis) setDuration(status.durationMillis / 1000);
        setIsPlaying(status.isPlaying);

        if (status.didJustFinish) {
          // Fine traccia: porta il timer esattamente alla durata, non ricominciare
          setIsPlaying(false);
          if (status.durationMillis) setPosition(status.durationMillis / 1000);
          sound.stopAsync().catch(() => {});
        }
      });

      soundRef.current = sound;

    } catch {
      if (isMountedRef.current) {
        setError('Impossibile caricare l\'audio. Controlla la connessione e riprova.');
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
      isLoadingRef.current = false;
    }
  }, [stopAndUnload]);

  // ── Monta / cambia episodio ──────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    setImgError(false);
    loadAudio(podcast);

    return () => {
      isMountedRef.current = false;
      stopAndUnload();
    };
  }, [podcast.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controlli ────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  const progress    = duration > 0 ? Math.min(position / duration, 1) : 0;
  const progressPct = `${(progress * 100).toFixed(2)}%`;
  const showCover   = !!podcast.coverUrl && !imgError;

  return (
    <View style={s.root}>

      {/* Copertina */}
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
            <Text style={s.coverIcon}>🎙</Text>
          </View>
        )}
      </View>

      {/* Titolo */}
      <Text style={s.title} numberOfLines={2} ellipsizeMode="tail">
        {podcast.title}
      </Text>

      {/* ── Errore ─────────────────────────────────────────────────────── */}
      {error ? (
        <View style={s.errorWrap}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => loadAudio(podcast)}>
            <Text style={s.retryTxt}>Riprova</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* ── Seek bar ─────────────────────────────────────────────────── */}
          <TouchableOpacity
            activeOpacity={1}
            style={s.seekTrack}
            onLayout={(e) => setBarWidth(e.nativeEvent.layout.width || 1)}
            onPress={(e) => seekToRatio(e.nativeEvent.locationX / barWidth)}
          >
            {/* Riempimento */}
            <View style={[s.seekFill, { width: progressPct }]} />
            {/* Thumb */}
            <View style={[s.seekThumb, { left: progressPct }]} />
          </TouchableOpacity>

          {/* ── Timer ────────────────────────────────────────────────────── */}
          <View style={s.timerRow}>
            <Text style={s.timerTxt}>{fmtTime(position)}</Text>
            <Text style={s.timerTxt}>{fmtTime(duration)}</Text>
          </View>

          {/* ── Controlli ────────────────────────────────────────────────── */}
          <View style={s.controls}>

            {/* -15s */}
            <TouchableOpacity
              style={s.skipBtn}
              onPress={() => skip(-15)}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={s.skipArrow}>↺</Text>
              <Text style={s.skipLbl}>15</Text>
            </TouchableOpacity>

            {/* Play / Pausa */}
            <TouchableOpacity
              style={[s.playBtn, loading && s.playBtnLoading]}
              onPress={togglePlay}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#050508" size="small" />
              ) : (
                <Text style={s.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
              )}
            </TouchableOpacity>

            {/* +15s */}
            <TouchableOpacity
              style={s.skipBtn}
              onPress={() => skip(15)}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={s.skipArrow}>↻</Text>
              <Text style={s.skipLbl}>15</Text>
            </TouchableOpacity>

          </View>
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const COVER = 200;

const s = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 16,
  },

  // ── Cover ──
  coverWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  cover: {
    width: COVER,
    height: COVER,
    borderRadius: 16,
  },
  coverFallback: {
    backgroundColor: '#1A0A2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.2)',
  },
  coverIcon: { fontSize: 64 },

  // ── Titolo ──
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 23,
    fontStyle: 'italic',
  },

  // ── Seek bar ──
  seekTrack: {
    width: '100%',
    height: 28,               // area di tap generosa
    justifyContent: 'center',
  },
  seekFill: {
    position: 'absolute',
    left: 0,
    top: 11,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#00FF9C',
  },
  seekThumb: {
    position: 'absolute',
    top: 5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00FF9C',
    marginLeft: -7,            // centra il thumb sul punto di progresso
    shadowColor: '#00FF9C',
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },

  // ── Timer ──
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: -8,
  },
  timerTxt: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'monospace',
  },

  // ── Controlli ──
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
    marginTop: 4,
  },
  skipBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  skipArrow: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
  skipLbl: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'monospace',
    lineHeight: 12,
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#00FF9C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00FF9C',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  },
  playBtnLoading: {
    opacity: 0.7,
  },
  playIcon: {
    fontSize: 24,
    color: '#050508',
    marginLeft: 3, // compensa ottica del ▶
  },

  // ── Errore ──
  errorWrap: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  errorIcon: { fontSize: 36 },
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
    borderColor: 'rgba(0,255,156,0.4)',
    backgroundColor: 'rgba(0,255,156,0.1)',
  },
  retryTxt: {
    color: '#00FF9C',
    fontSize: 13,
    fontWeight: '600',
  },
});
