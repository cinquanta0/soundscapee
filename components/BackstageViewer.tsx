import React, { useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Dimensions, StatusBar, ActivityIndicator, Image,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { C } from '../constants/design';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  url: string;
  tipo: 'foto' | 'video';
  soundTitle?: string;
  onClose: () => void;
}

export default function BackstageViewer({ visible, url, tipo, soundTitle, onClose }: Props) {
  const videoRef = useRef<Video>(null);
  const [videoLoading, setVideoLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(true);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <View style={s.container}>
        <LinearGradient colors={['#050508', '#0D0D12']} style={StyleSheet.absoluteFill} />

        {/* Orb */}
        <View style={s.orb} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.typePill}>
              <Feather name={tipo === 'video' ? 'film' : 'image'} size={11} color={C.accent} />
              <Text style={s.typeLabel}>BACKSTAGE</Text>
            </View>
            {soundTitle && (
              <Text style={s.soundTitle} numberOfLines={1}>{soundTitle}</Text>
            )}
          </View>
          <TouchableOpacity
            style={s.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Feather name="x" size={16} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>

        {/* Media */}
        <View style={s.mediaWrap}>
          {tipo === 'foto' ? (
            <>
              {imageLoading && (
                <ActivityIndicator color={C.accent} size="large" style={StyleSheet.absoluteFill} />
              )}
              <Image
                source={{ uri: url }}
                style={s.media}
                resizeMode="contain"
                onLoad={() => setImageLoading(false)}
              />
            </>
          ) : (
            <>
              {videoLoading && (
                <ActivityIndicator color={C.accent} size="large" style={StyleSheet.absoluteFill} />
              )}
              <Video
                ref={videoRef}
                source={{ uri: url }}
                style={s.media}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isLooping
                useNativeControls
                onLoad={() => setVideoLoading(false)}
              />
            </>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Feather name={tipo === 'video' ? 'play-circle' : 'camera'} size={12} color="rgba(255,255,255,0.25)" />
          <Text style={s.footerText}>
            {tipo === 'video' ? 'video dietro le quinte' : 'foto dietro le quinte'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050508',
  },
  orb: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(0,255,156,0.04)',
    bottom: -80,
    left: -60,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    zIndex: 10,
  },
  headerLeft: { gap: 4 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: C.accentDim,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderAccent,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeLabel: {
    fontSize: 10,
    color: C.accent,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  soundTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    maxWidth: SW * 0.68,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  mediaWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: {
    width: SW,
    height: SH * 0.72,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 44,
  },
  footerText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 0.5,
  },
});
