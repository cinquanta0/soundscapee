import React, { useEffect, useRef } from 'react';
import {
  Animated, Image, StyleSheet, Text, TouchableOpacity, View, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { C, T, S, R, Spring } from '../constants/design';

interface Props {
  title: string;
  artist: string;
  artwork?: string;
  isPlaying: boolean;
  progress?: number; // 0–1
  bottomOffset: number;
  onPlayPause: () => void;
  onClose: () => void;
  onPress: () => void;
}

export default function MiniPlayer({
  title, artist, artwork, isPlaying, progress = 0,
  bottomOffset, onPlayPause, onClose, onPress,
}: Props) {
  const slideAnim    = useRef(new Animated.Value(100)).current;
  const playScale    = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      ...Spring.bouncy,
    }).start();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const onPlayPressIn  = () => Animated.spring(playScale, { toValue: 0.88, useNativeDriver: true, ...Spring.snappy }).start();
  const onPlayPressOut = () => Animated.spring(playScale, { toValue: 1,    useNativeDriver: true, ...Spring.snappy }).start();

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { bottom: bottomOffset + 10, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.92}>

        {/* Artwork */}
        {artwork ? (
          <Image source={{ uri: artwork }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <Feather name="music" size={18} color={C.accent} />
          </View>
        )}

        {/* Text */}
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{artist}</Text>
        </View>

        {/* Play/Pause */}
        <TouchableOpacity
          onPress={onPlayPause}
          onPressIn={onPlayPressIn}
          onPressOut={onPlayPressOut}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={1}
        >
          <Animated.View style={[styles.playBtn, { transform: [{ scale: playScale }] }]}>
            <Feather name={isPlaying ? 'pause' : 'play'} size={16} color={C.textOnAccent} />
          </Animated.View>
        </TouchableOpacity>

        {/* Close */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="x" size={16} color={C.textMuted} />
        </TouchableOpacity>

      </TouchableOpacity>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: S.md,
    right: S.md,
    borderRadius: R.lg,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        // Accent-tinted shadow for premium feel
        shadowColor: '#00FF9C',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      android: { elevation: 14 },
    }),
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bgCard,
    paddingVertical: S.sm + 2,
    paddingHorizontal: S.md,
    gap: S.md,
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderBottomWidth: 0,
    borderRadius: R.lg,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: R.sm,
  },
  artworkFallback: {
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.borderAccent,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...T.labelL,
    color: C.textPrimary,
  },
  artist: {
    ...T.label,
    color: C.textSecondary,
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: R.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // Optical correction: play icon needs +1px right shift
    paddingLeft: Platform.OS === 'ios' ? 2 : 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 2,
    backgroundColor: C.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: 1,
  },
});
