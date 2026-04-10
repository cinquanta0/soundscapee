import React, { useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Dimensions, StatusBar, ActivityIndicator, Image,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';

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
      <View style={styles.container}>
        <LinearGradient
          colors={['#050508', '#0D0D1A']}
          style={StyleSheet.absoluteFill}
        />

        {/* Glow orb */}
        <View style={styles.orb} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.label}>🎬 backstage</Text>
            {soundTitle && <Text style={styles.soundTitle} numberOfLines={1}>{soundTitle}</Text>}
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Media */}
        <View style={styles.mediaWrap}>
          {tipo === 'foto' ? (
            <>
              {imageLoading && (
                <ActivityIndicator color="#00FF9C" size="large" style={StyleSheet.absoluteFill} />
              )}
              <Image
                source={{ uri: url }}
                style={styles.media}
                resizeMode="contain"
                onLoad={() => setImageLoading(false)}
              />
            </>
          ) : (
            <>
              {videoLoading && (
                <ActivityIndicator color="#00FF9C" size="large" style={StyleSheet.absoluteFill} />
              )}
              <Video
                ref={videoRef}
                source={{ uri: url }}
                style={styles.media}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isLooping
                useNativeControls
                onLoad={() => setVideoLoading(false)}
              />
            </>
          )}
        </View>

        {/* Footer hint */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {tipo === 'video' ? '▶ video dietro le quinte' : '📷 foto dietro le quinte'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050508',
  },
  orb: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(0,255,156,0.05)',
    bottom: -60,
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
  label: {
    fontSize: 13,
    color: '#00FF9C',
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'lowercase',
  },
  soundTitle: {
    fontSize: 16,
    color: '#fff',
    fontStyle: 'italic',
    fontWeight: '600',
    marginTop: 2,
    maxWidth: SW * 0.7,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  mediaWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  media: {
    width: SW,
    height: SH * 0.72,
  },
  footer: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
});
