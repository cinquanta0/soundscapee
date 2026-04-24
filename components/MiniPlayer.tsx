import React, { useEffect, useRef } from 'react';
import {
  Animated, Image, StyleSheet, Text, TouchableOpacity, View, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

interface Props {
  title: string;
  artist: string;
  artwork?: string;
  isPlaying: boolean;
  bottomOffset: number;
  onPlayPause: () => void;
  onClose: () => void;
  onPress: () => void;
}

export default function MiniPlayer({
  title, artist, artwork, isPlaying, bottomOffset, onPlayPause, onClose, onPress,
}: Props) {
  const slideAnim = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { bottom: bottomOffset + 8, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.85}>
        {/* Artwork */}
        {artwork ? (
          <Image source={{ uri: artwork }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <Text style={styles.artworkEmoji}>🎵</Text>
          </View>
        )}

        {/* Testo */}
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{artist}</Text>
        </View>

        {/* Play/Pause */}
        <TouchableOpacity style={styles.btn} onPress={onPlayPause} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name={isPlaying ? 'pause' : 'play'} size={22} color="#fff" />
        </TouchableOpacity>

        {/* Chiudi/Stop */}
        <TouchableOpacity style={styles.btn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={20} color="#6b7280" />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Barra di progresso decorativa (sempre piena per live, statica) */}
      <View style={styles.progressBar}>
        <Animated.View style={[styles.progressFill, { opacity: isPlaying ? 1 : 0.4 }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
    }),
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  artworkFallback: {
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkEmoji: { fontSize: 22 },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  artist: {
    color: '#64748b',
    fontSize: 11,
  },
  btn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBar: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#00ff9c',
  },
});
