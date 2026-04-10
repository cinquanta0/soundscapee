// components/RemixFeedCard.js
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  toggleRemixLike, 
  incrementRemixPlays 
} from '../services/remixService';

/**
 * Card per mostrare i remix nel feed principale
 * Usa questo componente nel tuo home feed insieme ai normali sound cards
 */
export default function RemixFeedCard({ remix, onPlay }) {
  const [isLiked, setIsLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(remix.likes || 0);
  const [isPlaying, setIsPlaying] = useState(false);

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
    <View style={styles.card}>
      {/* Gradient Badge */}
      <LinearGradient
        colors={['#8b5cf6', '#3b82f6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.remixBadge}
      >
        <Text style={styles.remixBadgeText}>🎛️ REMIX</Text>
      </LinearGradient>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{remix.userAvatar || '🎵'}</Text>
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.username}>{remix.username || 'Artista'}</Text>
            <Text style={styles.timestamp}>
              {formatDate(remix.createdAt)}
            </Text>
          </View>
        </View>
        
        {/* Status */}
        {remix.isProcessed ? (
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Pronto</Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, { backgroundColor: '#eab30820' }]}>
            <View style={[styles.statusDot, { backgroundColor: '#eab308' }]} />
            <Text style={styles.statusText}>Processing</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title}>{remix.title}</Text>
        {remix.description && (
          <Text style={styles.description} numberOfLines={2}>
            {remix.description}
          </Text>
        )}

        {/* Tracks Info */}
        <View style={styles.tracksInfo}>
          <View style={styles.trackBubble}>
            <Text style={styles.trackBubbleText}>
              {remix.tracksCount} {remix.tracksCount === 1 ? 'traccia' : 'tracce'}
            </Text>
          </View>
          <View style={styles.trackBubble}>
            <Text style={styles.trackBubbleText}>
              ⏱️ {remix.totalDuration?.toFixed(0)}s
            </Text>
          </View>
        </View>

        {/* Player */}
        <View style={styles.player}>
          <TouchableOpacity
            style={[
              styles.playButton,
              !remix.isProcessed && styles.playButtonDisabled
            ]}
            onPress={handlePlay}
            disabled={!remix.isProcessed || isPlaying}
          >
            <LinearGradient
              colors={['#8b5cf6', '#3b82f6']}
              style={styles.playButtonGradient}
            >
              <Text style={styles.playButtonIcon}>
                {isPlaying ? '⏸' : '▶️'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.waveform}>
            {Array.from({ length: 20 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.waveBar,
                  {
                    height: Math.random() * 100 + 20,
                    backgroundColor: remix.isProcessed ? '#8b5cf6' : '#334155',
                  },
                ]}
              />
            ))}
          </View>

          <Text style={styles.duration}>
            {remix.totalDuration?.toFixed(0) || 0}s
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <View style={styles.actionsLeft}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleLike}
            >
              <Text style={styles.actionIcon}>
                {isLiked ? '❤️' : '🤍'}
              </Text>
              <Text style={styles.actionText}>{localLikes}</Text>
            </TouchableOpacity>

            <View style={styles.actionButton}>
              <Text style={styles.actionIcon}>▶️</Text>
              <Text style={styles.actionText}>{remix.plays || 0}</Text>
            </View>

            <View style={styles.actionButton}>
              <Text style={styles.actionIcon}>🔗</Text>
              <Text style={styles.actionText}>{remix.shares || 0}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.moreButton}
            onPress={() => Alert.alert('Info', 'Dettagli remix')}
          >
            <Text style={styles.moreButtonText}>•••</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#8b5cf6',
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
    color: '#fff',
  },
  timestamp: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10b98120',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10b981',
  },
  content: {
    padding: 12,
    paddingTop: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: '#cbd5e1',
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
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trackBubbleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#cbd5e1',
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
    color: '#94a3b8',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
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
    color: '#94a3b8',
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreButtonText: {
    fontSize: 16,
    color: '#94a3b8',
    fontWeight: '700',
  },
});