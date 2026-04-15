import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PodcastCardItem {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string | null;
  duration?: number; // secondi
  isITS?: boolean;
}

interface Props {
  podcast: PodcastCardItem;
  onPress: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PodcastCard({ podcast, onPress }: Props) {
  const [imgError, setImgError] = useState(false);

  const mins = podcast.duration ? Math.floor(podcast.duration / 60) : null;
  const durationLabel = mins != null
    ? (mins > 0 ? `${mins} min` : `${podcast.duration}s`)
    : null;

  const showImage = !!podcast.coverUrl && !imgError;

  return (
    <TouchableOpacity
      style={s.card}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {/* Copertina */}
      {showImage ? (
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

      {/* Testo */}
      <View style={s.info}>
        {/* Riga titolo + badge Scuola */}
        <View style={s.titleRow}>
          <Text style={s.title} numberOfLines={2} ellipsizeMode="tail">
            {podcast.title}
          </Text>
          {podcast.isITS && (
            <View style={s.itsBadge}>
              <Text style={s.itsBadgeTxt}>SCUOLA</Text>
            </View>
          )}
        </View>

        {/* Descrizione */}
        {!!podcast.description && (
          <Text style={s.desc} numberOfLines={2} ellipsizeMode="tail">
            {podcast.description}
          </Text>
        )}

        {/* Durata */}
        {durationLabel && (
          <Text style={s.duration}>⏱ {durationLabel}</Text>
        )}
      </View>

      {/* Play pill */}
      <View style={s.playPill}>
        <Text style={s.playPillTxt}>▶</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    gap: 12,
    alignItems: 'center',
    // Ombra iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    // Ombra Android
    elevation: 4,
  },

  // ── Cover ──
  cover: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  coverFallback: {
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  coverIcon: {
    fontSize: 26,
  },

  // ── Info ──
  info: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    flexWrap: 'nowrap',
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  desc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 17,
  },
  duration: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    fontFamily: 'monospace',
    marginTop: 2,
  },

  // ── Scuola badge ──
  itsBadge: {
    backgroundColor: 'rgba(0,255,156,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.4)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 1,
  },
  itsBadgeTxt: {
    fontSize: 9,
    fontWeight: '700',
    color: '#00FF9C',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },

  // ── Play pill ──
  playPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,255,156,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPillTxt: {
    color: '#00FF9C',
    fontSize: 12,
  },
});
