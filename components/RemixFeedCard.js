// components/RemixFeedCard.js
import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import {
  toggleRemixLike,
  incrementRemixPlays
} from '../services/remixService';
import { useTheme } from '../context/ThemeContext';

/**
 * Card per mostrare i remix nel feed principale
 * Usa questo componente nel tuo home feed insieme ai normali sound cards
 */
export default function RemixFeedCard({ remix, onPlay }) {
  const { colors } = useTheme();
  const dynStyles = useMemo(() => createStyles(colors), [colors]);
  const [isLiked, setIsLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(remix.likes || 0);
  const [isPlaying, setIsPlaying] = useState(false);

  // 🔧 FIX: calcolati una volta sola con useMemo.
  //         Prima erano dentro il render con Math.random() → la waveform
  //         cambiava valori ad ogni re-render (es. dopo un like) causando flickering.
  const waveHeights = useMemo(
    () => Array.from({ length: 20 }, () => Math.random() * 30 + 10),
    []
  );

  const handleLike = async () => {
    try {
      const liked = await toggleRemixLike(remix.id);
      setIsLiked(liked);
      setLocalLikes(prev => liked ? prev + 1 : prev - 1);
    } catch (error) {
      console.error('Error liking remix:', error);
      Alert.alert('Errore', 'Impossibile mettere like');
    }
  };

  const handlePlay = async () => {
    if (!remix.isProcessed) {
      Alert.alert(
        '⏳ In elaborazione',
        'Questo remix sta ancora venendo processato. Riprova tra qualche minuto!'
      );
      return;
    }

    if (!remix.audioUrl) {
      Alert.alert(
        '❌ Non disponibile',
        'Audio non ancora disponibile per questo remix.'
      );
      return;
    }

    try {
      setIsPlaying(true);
      await incrementRemixPlays(remix.id);
      
      if (onPlay) {
        await onPlay(remix);
      }
      
      setIsPlaying(false);
    } catch (error) {
      console.error('Error playing remix:', error);
      Alert.alert('Errore', 'Impossibile riprodurre il remix');
      setIsPlaying(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'ora';
    if (diff < 3600) return `${Math.floor(diff / 60)}m fa`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}g fa`;
    return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  };

  return (
    <View style={dynStyles.card}>
      {/* Gradient Badge */}
      <LinearGradient
        colors={['#8b5cf6', '#a855f7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={dynStyles.remixBadge}
      >
        <Text style={dynStyles.remixBadgeText}>REMIX</Text>
      </LinearGradient>

      {/* Header */}
      <View style={dynStyles.header}>
        <View style={dynStyles.userInfo}>
          <View style={dynStyles.avatar}>
            <Text style={dynStyles.avatarText}>{remix.userAvatar || '🎵'}</Text>
          </View>
          <View style={dynStyles.userDetails}>
            <Text style={dynStyles.username}>{remix.username || 'Artista'}</Text>
            <Text style={dynStyles.timestamp}>
              {formatDate(remix.createdAt)}
            </Text>
          </View>
        </View>
        
        {/* Status */}
        {remix.isProcessed ? (
          <View style={dynStyles.statusBadge}>
            <View style={dynStyles.statusDot} />
            <Text style={dynStyles.statusText}>Pronto</Text>
          </View>
        ) : (
          <View style={[dynStyles.statusBadge, { backgroundColor: 'rgba(234,179,8,0.12)', borderColor: 'rgba(234,179,8,0.3)' }]}>
            <View style={[dynStyles.statusDot, { backgroundColor: '#eab308' }]} />
            <Text style={[dynStyles.statusText, { color: '#eab308' }]}>Processing</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={dynStyles.content}>
        <Text style={dynStyles.title}>{remix.title}</Text>
        {remix.description && (
          <Text style={dynStyles.description} numberOfLines={2}>
            {remix.description}
          </Text>
        )}

        {/* Tracks Info */}
        <View style={dynStyles.tracksInfo}>
          <View style={dynStyles.trackBubble}>
            <Text style={dynStyles.trackBubbleText}>
              {remix.tracksCount} {remix.tracksCount === 1 ? 'traccia' : 'tracce'}
            </Text>
          </View>
          <View style={dynStyles.trackBubble}>
            <Text style={dynStyles.trackBubbleText}>
              ⏱️ {remix.totalDuration?.toFixed(0)}s
            </Text>
          </View>
        </View>

        {/* Player */}
        <View style={dynStyles.player}>
          <TouchableOpacity
            style={[
              dynStyles.playButton,
              !remix.isProcessed && dynStyles.playButtonDisabled
            ]}
            onPress={handlePlay}
            disabled={!remix.isProcessed || isPlaying}
          >
            <LinearGradient
              colors={['#8b5cf6', '#a855f7']}
              style={dynStyles.playButtonGradient}
            >
              <Feather name={isPlaying ? 'pause' : 'play'} size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          <View style={dynStyles.waveform}>
            {waveHeights.map((h, i) => (
              <View
                key={i}
                style={[
                  dynStyles.waveBar,
                  {
                    height: h,
                    backgroundColor: remix.isProcessed ? '#a855f7' : (colors.textSecondary + '30'),
                  },
                ]}
              />
            ))}
          </View>

          <Text style={dynStyles.duration}>
            {remix.totalDuration?.toFixed(0) || 0}s
          </Text>
        </View>

        {/* Actions */}
        <View style={dynStyles.actions}>
          <View style={dynStyles.actionsLeft}>
            <TouchableOpacity
              style={dynStyles.actionButton}
              onPress={handleLike}
            >
              <Feather name="heart" size={14} color={isLiked ? '#ef4444' : colors.textSecondary} />
              <Text style={dynStyles.actionText}>{localLikes}</Text>
            </TouchableOpacity>

            <View style={dynStyles.actionButton}>
              <Feather name="play" size={14} color={colors.textSecondary} />
              <Text style={dynStyles.actionText}>{remix.plays || 0}</Text>
            </View>

            <View style={dynStyles.actionButton}>
              <Feather name="share-2" size={14} color={colors.textSecondary} />
              <Text style={dynStyles.actionText}>{remix.shares || 0}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={dynStyles.moreButton}
            onPress={() => Alert.alert('Info', 'Dettagli remix')}
          >
            <Text style={dynStyles.moreButtonText}>•••</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  remixBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 12,
    marginLeft: 12,
    borderRadius: 12,
  },
  remixBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 255, 156, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
  },
  userDetails: {
    flex: 1,
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  timestamp: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(168,85,247,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#a855f7',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#a855f7',
  },
  content: {
    padding: 12,
    paddingTop: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  tracksInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  trackBubble: {
    backgroundColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trackBubbleText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  playButtonDisabled: {
    opacity: 0.5,
  },
  playButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonIcon: {
    fontSize: 18,
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 40,
  },
  waveBar: {
    flex: 1,
    borderRadius: 2,
    maxHeight: 40,
  },
  duration: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionsLeft: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: {
    fontSize: 14,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreButtonText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '700',
  },
});