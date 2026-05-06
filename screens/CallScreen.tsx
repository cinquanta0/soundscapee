import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Modal, StatusBar, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useCall } from '../context/CallContext';
import { auth } from '../firebaseConfig';

const FEATHER_TO_EMOJI: Record<string, string> = {
  music: '🎵', headphones: '🎧', radio: '📻', mic: '🎤', speaker: '🔊',
  disc: '💿', 'volume-2': '🔊', 'play-circle': '▶️', star: '⭐', zap: '⚡',
  heart: '❤️', sun: '☀️', moon: '🌙', cloud: '☁️', wind: '💨', droplet: '💧',
};

function isFeatherIcon(avatar: string | undefined): boolean {
  return !!avatar && avatar in FEATHER_TO_EMOJI;
}

function fmtDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function PulseRing({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.4, duration: 900, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 900, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity]);

  return (
    <Animated.View
      style={[
        s.pulseRing,
        { borderColor: color, transform: [{ scale }], opacity },
      ]}
    />
  );
}

function AvatarBubble({ avatar, size = 90, pulse = false, color = '#67E8F9' }: {
  avatar: string;
  size?: number;
  pulse?: boolean;
  color?: string;
}) {
  const iconSize = size * 0.38;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size + 40, height: size + 40 }}>
      {pulse && <PulseRing color={color} />}
      <View style={[s.avatarBubble, { width: size, height: size, borderRadius: size / 2, borderColor: color + '50' }]}>
        {isFeatherIcon(avatar) ? (
          <Feather name={avatar as any} size={iconSize} color="#F7F8FF" />
        ) : (
          <Text style={{ fontSize: size * 0.5 }}>{avatar}</Text>
        )}
      </View>
    </View>
  );
}

function GroupAvatars({ profiles }: { profiles: Record<string, { name: string; avatar: string }> }) {
  const entries = Object.values(profiles).slice(0, 4);
  return (
    <View style={s.groupAvatarRow}>
      {entries.map((p, i) => (
        <View
          key={i}
          style={[s.groupAvatarBubble, { marginLeft: i > 0 ? -16 : 0, zIndex: entries.length - i }]}
        >
          {isFeatherIcon(p.avatar) ? (
            <Feather name={p.avatar as any} size={22} color="#F7F8FF" />
          ) : (
            <Text style={{ fontSize: 26 }}>{p.avatar}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

export default function CallScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    call, phase, isMuted, isSpeaker, isRecording, duration, endReason,
    acceptCall, declineCall, endCall, toggleMute, toggleSpeaker, toggleRecording,
  } = useCall();

  const visible = phase !== null;

  if (!visible || !call) return null;

  const myUid = auth.currentUser?.uid;
  const isGroup = call.type === 'group';
  const amCaller = call.callerId === myUid;
  const remoteName = amCaller ? call.calleeName : call.callerName;
  const remoteAvatar = amCaller ? call.calleeAvatar : call.callerAvatar;
  const displayName = isGroup
    ? (phase === 'incoming' ? call.callerName : call.calleeName)
    : remoteName;
  const displayAvatar = isGroup
    ? (phase === 'incoming' ? call.callerAvatar : call.calleeAvatar)
    : remoteAvatar;

  const statusText = () => {
    switch (phase) {
      case 'ringing': return t('call.calling');
      case 'incoming': return isGroup ? '👥 Chiamata di gruppo' : t('call.incoming');
      case 'connecting': return t('call.connecting');
      case 'active': return fmtDuration(duration);
      case 'ended': {
        if (endReason === 'declined') return t('call.declined');
        if (endReason === 'missed') return t('call.missed');
        return t('call.ended');
      }
      default: return '';
    }
  };

  const statusColor = () => {
    if (phase === 'incoming') return '#00FF9C';
    if (phase === 'active') return '#67E8F9';
    if (phase === 'ended') return '#FF5C79';
    return '#97A4C7';
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={['#050508', '#0A0A18', '#05050C']}
        style={[StyleSheet.absoluteFill]}
      />

      <View style={[s.glow, { backgroundColor: phase === 'incoming' ? 'rgba(0,255,156,0.06)' : 'rgba(103,232,249,0.06)' }]} />

      <View style={[s.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>

        <View style={s.topSection}>
          <Text style={s.typeLabel}>
            {isGroup ? '👥 SoundScape Group' : 'SoundScape'}
          </Text>
        </View>

        <View style={s.center}>
          {isGroup && call.participantProfiles && phase === 'active' ? (
            <GroupAvatars profiles={call.participantProfiles} />
          ) : (
            <AvatarBubble
              avatar={displayAvatar}
              size={100}
              pulse={phase === 'incoming' || phase === 'ringing'}
              color={phase === 'incoming' ? '#00FF9C' : '#67E8F9'}
            />
          )}
          <Text style={s.name}>{displayName}</Text>
          <Text style={[s.status, { color: statusColor() }]}>{statusText()}</Text>
          {isRecording && phase === 'active' && (
            <View style={s.recBadge}>
              <View style={s.recDot} />
              <Text style={s.recLabel}>REC</Text>
            </View>
          )}
        </View>

        <View style={s.actions}>

          {phase === 'incoming' && (
            <View style={s.incomingRow}>
              <TouchableOpacity style={s.declineBtn} onPress={() => declineCall(call)}>
                <Text style={s.btnIcon}>✕</Text>
              </TouchableOpacity>
              <View style={{ width: 48 }} />
              <TouchableOpacity style={s.acceptBtn} onPress={() => acceptCall(call)}>
                <Text style={s.btnIcon}>📞</Text>
              </TouchableOpacity>
            </View>
          )}

          {(phase === 'ringing' || phase === 'connecting') && (
            <View style={s.singleBtnRow}>
              <TouchableOpacity style={s.endBtn} onPress={endCall}>
                <Text style={s.btnIcon}>✕</Text>
              </TouchableOpacity>
              <Text style={s.singleBtnLabel}>{t('call.cancel')}</Text>
            </View>
          )}

          {phase === 'active' && (
            <>
              <View style={s.activeRow}>
                <View style={s.actionItem}>
                  <TouchableOpacity
                    style={[s.actionBtn, isMuted && s.actionBtnActive]}
                    onPress={toggleMute}
                  >
                    <Text style={s.actionIcon}>{isMuted ? '🔇' : '🎤'}</Text>
                  </TouchableOpacity>
                  <Text style={s.actionLabel}>{isMuted ? t('call.unmute') : t('call.mute')}</Text>
                </View>

                <View style={s.actionItem}>
                  <TouchableOpacity style={s.endBtn} onPress={endCall}>
                    <Text style={s.btnIcon}>✕</Text>
                  </TouchableOpacity>
                  <Text style={s.actionLabel}>{t('call.end')}</Text>
                </View>

                <View style={s.actionItem}>
                  <TouchableOpacity
                    style={[s.actionBtn, isSpeaker && s.actionBtnActive]}
                    onPress={toggleSpeaker}
                  >
                    <Text style={s.actionIcon}>{isSpeaker ? '🔊' : '📢'}</Text>
                  </TouchableOpacity>
                  <Text style={s.actionLabel}>{isSpeaker ? t('call.earpiece') : t('call.speaker')}</Text>
                </View>
              </View>

              <View style={s.recRow}>
                <TouchableOpacity
                  style={[s.recBtn, isRecording && s.recBtnActive]}
                  onPress={toggleRecording}
                >
                  <Text style={s.recBtnIcon}>{isRecording ? '⏹' : '⏺'}</Text>
                  <Text style={s.recBtnLabel}>{isRecording ? 'Ferma' : 'Registra'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {phase === 'ended' && (
            <View style={s.endedNote}>
              <Text style={s.endedTxt}>{statusText()}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  glow: {
    position: 'absolute',
    top: -100,
    left: -100,
    right: -100,
    height: 400,
    borderRadius: 400,
  },
  topSection: {
    alignItems: 'center',
  },
  typeLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.28)',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 0.12,
    textTransform: 'uppercase',
  },
  center: {
    alignItems: 'center',
    gap: 14,
    flex: 1,
    justifyContent: 'center',
  },
  avatarBubble: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
  },
  groupAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupAvatarBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 2,
    borderColor: 'rgba(103,232,249,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F7F8FF',
    letterSpacing: -0.5,
  },
  status: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 0.06,
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,92,121,0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,92,121,0.4)',
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF5C79',
  },
  recLabel: {
    color: '#FF5C79',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '700',
    letterSpacing: 1,
  },
  actions: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 16,
  },
  incomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 16,
  },
  declineBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF5C79',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5C79',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  acceptBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#00FF9C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00FF9C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  btnIcon: {
    fontSize: 22,
  },
  singleBtnRow: {
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF5C79',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5C79',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 6,
  },
  singleBtnLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 16,
  },
  actionItem: {
    alignItems: 'center',
    gap: 10,
    width: 80,
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: 'rgba(103,232,249,0.15)',
    borderColor: 'rgba(103,232,249,0.4)',
  },
  actionIcon: {
    fontSize: 22,
  },
  actionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    textAlign: 'center',
  },
  recRow: {
    marginTop: 20,
    alignItems: 'center',
  },
  recBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  recBtnActive: {
    backgroundColor: 'rgba(255,92,121,0.12)',
    borderColor: 'rgba(255,92,121,0.4)',
  },
  recBtnIcon: {
    fontSize: 16,
  },
  recBtnLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  endedNote: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  endedTxt: {
    color: '#FF5C79',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    textAlign: 'center',
  },
});
