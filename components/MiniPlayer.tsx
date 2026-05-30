import React, { useEffect, useRef, useMemo } from 'react';
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../constants/themes';

interface Props {
  title: string;
  artist: string;
  artwork?: string;
  isPlaying: boolean;
  progress?: number;
  bottomOffset: number;
  onPlayPause: () => void;
  onClose: () => void;
  onPress: () => void;
}

export default function MiniPlayer({
  title,
  artist,
  artwork,
  isPlaying,
  progress = 0,
  bottomOffset,
  onPlayPause,
  onClose,
  onPress,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const slideAnim = useRef(new Animated.Value(120)).current;
  const playScale = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(progress)).current;
  const pulseAnim = useRef(new Animated.Value(isPlaying ? 1 : 0.6)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 7,
    }).start();
  }, [slideAnim]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 420,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: isPlaying ? 1 : 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: isPlaying ? 0.7 : 0.6, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [isPlaying, pulseAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const onPlayPressIn = () => {
    Animated.spring(playScale, { toValue: 0.9, useNativeDriver: true, speed: 24, bounciness: 6 }).start();
  };
  const onPlayPressOut = () => {
    Animated.spring(playScale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 6 }).start();
  };

  return (
    <Animated.View
      style={[
        s.wrapper,
        {
          bottom: bottomOffset + 10,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={s.outerGlow} />
      <TouchableOpacity style={s.container} onPress={onPress} activeOpacity={0.92}>
        <Animated.View style={[s.liveOrb, { transform: [{ scale: pulseAnim }] }]} />

        {artwork ? (
          <Image source={{ uri: artwork }} style={s.artwork} />
        ) : (
          <View style={[s.artwork, s.artworkFallback]}>
            <Feather name="music" size={18} color="#67E8F9" />
          </View>
        )}

        <View style={s.textWrap}>
          <View style={s.statusRow}>
            <View style={s.statusPill}>
              <View style={[s.statusDot, { backgroundColor: isPlaying ? '#67E8F9' : colors.textMuted }]} />
              <Text style={s.statusText}>{isPlaying ? t('player.nowPlaying') : t('player.ready')}</Text>
            </View>
          </View>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <Text style={s.artist} numberOfLines={1}>{artist}</Text>
        </View>

        <View style={s.controls}>
          <TouchableOpacity
            onPress={onPlayPause}
            onPressIn={onPlayPressIn}
            onPressOut={onPlayPressOut}
            activeOpacity={1}
          >
            <Animated.View style={[s.playBtn, { transform: [{ scale: playScale }] }]}>
              <View style={s.playBtnInner}>
                <Feather
                  name={isPlaying ? 'pause' : 'play'}
                  size={17}
                  color="#060913"
                  style={!isPlaying ? { marginLeft: 2 } : undefined}
                />
              </View>
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Feather name="x" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <View style={s.progressTrack}>
        <Animated.View style={[s.progressFill, { width: progressWidth }]} />
      </View>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrapper: {
      position: 'absolute',
      left: 14,
      right: 14,
      borderRadius: 26,
      overflow: 'hidden',
      zIndex: 40,
      ...Platform.select({
        ios: {
          shadowColor: '#67E8F9',
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 0.12,
          shadowRadius: 24,
        },
        android: { elevation: 24 },
      }),
    },
    outerGlow: {
      position: 'absolute',
      top: -10,
      left: 24,
      width: 120,
      height: 90,
      borderRadius: 999,
      backgroundColor: 'rgba(103,232,249,0.08)',
    },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomWidth: 0,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      zIndex: 2,
    },
    liveOrb: {
      position: 'absolute',
      right: 64,
      top: 10,
      width: 80,
      height: 80,
      borderRadius: 999,
      backgroundColor: 'rgba(139,92,255,0.08)',
    },
    artwork: {
      width: 52,
      height: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    artworkFallback: {
      backgroundColor: colors.bgCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textWrap: {
      flex: 1,
      gap: 3,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 2,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      color: colors.textSecondary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    title: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    artist: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    playBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      overflow: 'hidden',
    },
    playBtnInner: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 21,
      backgroundColor: '#67E8F9',
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    progressTrack: {
      height: 4,
      backgroundColor: colors.borderSubtle,
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: '#67E8F9',
    },
  });
}
