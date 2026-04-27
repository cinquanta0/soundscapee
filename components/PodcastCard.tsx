import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { C, T, S, R } from '../constants/design';

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
          <Feather name="mic" size={26} color={C.accent} />
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
        <Feather name="play" size={13} color={C.accent} style={{ marginLeft: 1 }} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: C.bgCard,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.md,
    gap: S.md,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },

  // ── Cover ──
  cover: {
    width: 72,
    height: 72,
    borderRadius: R.sm,
  },
  coverFallback: {
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.borderAccent,
  },

  // ── Info ──
  info: {
    flex: 1,
    gap: S.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: S.sm - 2,
    flexWrap: 'nowrap',
  },
  title: {
    flex: 1,
    ...T.h4,
    color: C.textPrimary,
    fontStyle: 'italic',
  },
  desc: {
    ...T.bodyS,
    color: C.textSecondary,
  },
  duration: {
    ...T.mono,
    color: C.textMuted,
    marginTop: 2,
  },

  // ── Scuola badge ──
  itsBadge: {
    backgroundColor: C.accentDim,
    borderWidth: 1,
    borderColor: C.borderAccent,
    borderRadius: R.xs - 1,
    paddingHorizontal: S.sm - 2,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 1,
  },
  itsBadgeTxt: {
    fontSize: 9,
    fontWeight: '700',
    color: C.accent,
    letterSpacing: 1,
  },

  // ── Play pill ──
  playPill: {
    width: 32,
    height: 32,
    borderRadius: R.full,
    backgroundColor: C.accentDim,
    borderWidth: 1,
    borderColor: C.borderAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
