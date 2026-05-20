import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Modal, StatusBar, Platform, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useCall } from '../context/CallContext';
import { auth } from '../firebaseConfig';
import { listenForCallUpdates } from '../services/callService';
import GroupCallSetupModal from './GroupCallSetupModal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MUSIC_EMOJIS = new Set(['🎵', '🎧', '📻', '🎤', '🔊', '💿', '▶️', '🎼', '🎹', '🎸', '🥁', '🎺', '🎻', '🪗']);

function isMusicEmoji(avatar: string | undefined): boolean {
  return !!avatar && MUSIC_EMOJIS.has(avatar);
}

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

/**
 * Returns one of 8 vivid colours deterministically derived from `name`.
 * Used as avatar background when the emoji is a generic music icon.
 */
function avatarColor(name: string): string {
  const colors = ['#E57373', '#64B5F6', '#81C784', '#FFB74D', '#BA68C8', '#4DD0E1', '#F06292', '#AED581'];
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function statusLabel(status?: string) {
  switch (status) {
    case 'calling':  return 'host';
    case 'ringing':  return 'squilla';
    case 'active':   return 'attivo';
    case 'left':     return 'uscito';
    case 'declined': return 'rifiutato';
    case 'missed':   return 'persa';
    default:         return 'in attesa';
  }
}

// ---------------------------------------------------------------------------
// PulseRing — double ring with the outer one more transparent
// ---------------------------------------------------------------------------

function PulseRing({ color }: { color: string }) {
  const scaleInner  = useRef(new Animated.Value(1)).current;
  const opacityInner = useRef(new Animated.Value(0.55)).current;
  const scaleOuter  = useRef(new Animated.Value(1)).current;
  const opacityOuter = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const inner = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scaleInner,  { toValue: 1.45, duration: 900, useNativeDriver: true }),
          Animated.timing(scaleInner,  { toValue: 1,    duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacityInner, { toValue: 0,    duration: 900, useNativeDriver: true }),
          Animated.timing(opacityInner, { toValue: 0.55, duration: 900, useNativeDriver: true }),
        ]),
      ]),
    );
    const outer = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scaleOuter,  { toValue: 1.75, duration: 1300, useNativeDriver: true }),
          Animated.timing(scaleOuter,  { toValue: 1,    duration: 1300, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacityOuter, { toValue: 0,    duration: 1300, useNativeDriver: true }),
          Animated.timing(opacityOuter, { toValue: 0.25, duration: 1300, useNativeDriver: true }),
        ]),
      ]),
    );
    inner.start();
    outer.start();
    return () => { inner.stop(); outer.stop(); };
  }, [scaleInner, opacityInner, scaleOuter, opacityOuter]);

  return (
    <>
      <Animated.View
        style={[
          s.pulseRing,
          { borderColor: color, transform: [{ scale: scaleOuter }], opacity: opacityOuter },
        ]}
      />
      <Animated.View
        style={[
          s.pulseRing,
          { borderColor: color, transform: [{ scale: scaleInner }], opacity: opacityInner },
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// AvatarBubble — shows emoji, Feather icon, or initial on coloured bg
// ---------------------------------------------------------------------------

function AvatarBubble({
  avatar,
  name = '',
  size = 96,
  pulse = false,
  pulseColor = '#67E8F9',
}: {
  avatar: string;
  name?: string;
  size?: number;
  pulse?: boolean;
  pulseColor?: string;
}) {
  const iconSize = size * 0.38;
  const showInitial = isFeatherIcon(avatar) || isMusicEmoji(avatar);
  const bgColor = showInitial ? avatarColor(name || avatar) : 'rgba(255,255,255,0.07)';
  const initial = (name || avatar).trim().charAt(0).toUpperCase();

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size + 60, height: size + 60 }}>
      {pulse && <PulseRing color={pulseColor} />}
      <View
        style={[
          s.avatarBubble,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bgColor,
            borderColor: pulseColor + '40',
          },
        ]}
      >
        {showInitial ? (
          <Text style={{ fontSize: size * 0.44, fontWeight: '700', color: '#fff' }}>{initial}</Text>
        ) : (
          <Text style={{ fontSize: size * 0.5 }}>{avatar}</Text>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ParticipantList — scrollable list for group calls
// ---------------------------------------------------------------------------

function ParticipantList({
  participantProfiles,
  participantStatuses,
  myUid,
  onRecall,
}: {
  participantProfiles: Record<string, { name: string; avatar: string }>;
  participantStatuses?: Record<string, string>;
  myUid?: string;
  onRecall?: (uid: string, profile: { name: string; avatar: string }) => void;
}) {
  const entries = Object.entries(participantProfiles);

  return (
    <ScrollView
      style={s.participantScroll}
      contentContainerStyle={s.participantScrollContent}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      {entries.map(([uid, profile]) => {
        const status = participantStatuses?.[uid];
        const isActive = status === 'active';
        const isDeclined = status === 'declined' || status === 'missed';
        const isGone = ['left', 'declined', 'missed'].includes(status ?? '');
        const isMe = uid === myUid;
        const bg = avatarColor(profile.name);
        const showInitial = isFeatherIcon(profile.avatar) || isMusicEmoji(profile.avatar);
        const initial = profile.name.trim().charAt(0).toUpperCase();

        return (
          <View key={uid} style={s.participantRow}>
            {/* Avatar 40px */}
            <View style={[s.participantAvatar, { backgroundColor: showInitial ? bg : 'rgba(255,255,255,0.08)' }]}>
              {showInitial ? (
                <Text style={s.participantAvatarInitial}>{initial}</Text>
              ) : (
                <Text style={s.participantAvatarEmoji}>{profile.avatar}</Text>
              )}
            </View>

            {/* Name */}
            <Text style={s.participantName} numberOfLines={1}>
              {profile.name}{isMe ? ' (tu)' : ''}
            </Text>

            {/* Mic icon if active */}
            {isActive && (
              <Feather name="mic" size={14} color="#00FF9C" style={{ marginRight: 6 }} />
            )}

            {/* Richiama button for declined/missed (not self) */}
            {isDeclined && !isMe && onRecall && (
              <TouchableOpacity
                onPress={() => onRecall(uid, profile)}
                style={s.recallBtn}
              >
                <Feather name="phone" size={12} color="#00FF9C" />
                <Text style={s.recallBtnText}>Richiama</Text>
              </TouchableOpacity>
            )}

            {/* Status pill — hide if showing recall button */}
            {(!isDeclined || isMe) && (
              <View style={[
                s.statusPill,
                isActive && s.statusPillActive,
                isGone  && s.statusPillGone,
              ]}>
                <Text style={[
                  s.statusPillText,
                  isActive && s.statusPillTextActive,
                  isGone   && s.statusPillTextGone,
                ]}>
                  {statusLabel(status)}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CallScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    call, phase, useSystemIncomingUI, isMuted, isSpeaker, isRecording, isPipMode, duration, endReason, canRejoin,
    acceptCall, declineCall, endCall, toggleMute, toggleSpeaker, toggleRecording,
    inviteParticipantsToCurrentCall, rejoinGroupCall, dismissEndedCall,
  } = useCall();
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const [declinedBanner, setDeclinedBanner] = useState<{ name: string; uid: string } | null>(null);
  const [liveStatuses, setLiveStatuses] = useState<Record<string, string> | null>(null);
  const prevStatusesRef = useRef<Record<string, string>>({});
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect when a participant transitions to 'declined' or 'missed' and show banner
  useEffect(() => {
    const statuses = call?.participantStatuses ?? {};
    const profiles = call?.participantProfiles ?? {};
    const myUid = auth.currentUser?.uid ?? '';
    Object.entries(statuses).forEach(([uid, status]) => {
      const prev = prevStatusesRef.current[uid];
      if (uid !== myUid && (status === 'declined' || status === 'missed') && prev && prev !== status) {
        const name = profiles[uid]?.name ?? 'Utente';
        setDeclinedBanner({ name, uid });
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => setDeclinedBanner(null), 4000);
      }
    });
    prevStatusesRef.current = { ...statuses };
  }, [call?.participantStatuses]);

  // Subscription live ai partecipanti dopo aver lasciato una group call
  useEffect(() => {
    if (phase !== 'ended' || endReason !== 'left' || !call?.id) {
      setLiveStatuses(null);
      return;
    }
    const unsub = listenForCallUpdates(call.id, (updated) => {
      if (updated) setLiveStatuses(updated.participantStatuses as Record<string, string> ?? null);
    });
    return () => unsub();
  }, [phase, endReason, call?.id]);

  const visible = phase !== null && !(Platform.OS === 'android' && phase === 'incoming' && useSystemIncomingUI);

  if (!visible || !call) return null;

  const myUid       = auth.currentUser?.uid;
  const isGroup     = call.type === 'group';
  const effectiveStatuses = liveStatuses ?? call.participantStatuses ?? {};
  const activeMembersCount = Object.entries(effectiveStatuses).filter(
    ([uid, status]) => uid !== (myUid ?? '') && status === 'active',
  ).length;
  const amCaller    = call.callerId === myUid;
  const remoteName  = amCaller ? call.calleeName : call.callerName;
  const remoteAvatar = amCaller ? call.calleeAvatar : call.callerAvatar;
  const displayName  = isGroup ? 'Chiamata di gruppo' : remoteName;
  const displayAvatar = isGroup ? null : remoteAvatar;

  const statusText = (): string => {
    switch (phase) {
      case 'ringing':    return t('call.calling');
      case 'incoming':   return isGroup ? 'Chiamata di gruppo' : t('call.incoming');
      case 'connecting': return t('call.connecting');
      case 'active':     return fmtDuration(duration);
      case 'ended': {
        if (endReason === 'left')     return 'Sei uscito dalla chiamata';
        if (endReason === 'declined') return t('call.declined');
        if (endReason === 'missed')   return t('call.missed');
        return t('call.ended');
      }
      default: return '';
    }
  };

  const statusColor = (): string => {
    if (phase === 'incoming') return '#00FF9C';
    if (phase === 'active')   return '#67E8F9';
    if (phase === 'ended')    return '#FF5C79';
    return '#97A4C7';
  };

  const pulseColor = phase === 'incoming' ? '#00FF9C' : '#67E8F9';

  // -------------------------------------------------------------------------
  // PiP layout (Android picture-in-picture)
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Full-screen layout — PiP usa lo stesso Modal con contenuto minimale
  // -------------------------------------------------------------------------
  return (
    <Modal
      visible={visible || (isPipMode && phase === 'active')}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      {isPipMode && phase === 'active' ? (
        <View style={s.pipContainer}>
          <Text style={s.pipAvatar}>{displayAvatar}</Text>
          <Text style={s.pipName} numberOfLines={1}>{displayName}</Text>
          <Text style={s.pipTimer}>{fmtDuration(duration)}</Text>
        </View>
      ) : <>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background */}
      <LinearGradient
        colors={['#080C14', '#0D1221', '#080C14']}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle ambient glow */}
      <View
        style={[
          s.glow,
          { backgroundColor: phase === 'incoming' ? 'rgba(0,255,156,0.05)' : 'rgba(103,232,249,0.05)' },
        ]}
      />

      <View style={[s.container, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}>

        {/* Top label */}
        <View style={s.topSection}>
          <Text style={s.typeLabel}>
            {isGroup ? 'MIUSLYK Group' : 'MIUSLYK'}
          </Text>
        </View>

        {/* Center: avatar + name + status + participant list */}
        <View style={s.center}>

          {/* Avatar — always show the caller/callee avatar, even in group calls */}
          <AvatarBubble
            avatar={displayAvatar ?? '🎵'}
            name={displayName ?? ''}
            size={96}
            pulse={phase === 'incoming' || phase === 'ringing'}
            pulseColor={pulseColor}
          />

          {/* Name */}
          <Text style={s.name} numberOfLines={1}>{displayName}</Text>

          {/* Status */}
          <Text style={[s.statusText, { color: statusColor() }]}>{statusText()}</Text>

          {/* E2E badge — 1:1 calls only, not ended */}
          {!isGroup && phase !== 'ended' && (
            <View style={s.e2eBadge}>
              <Feather name="lock" size={10} color="rgba(103,232,249,0.55)" />
              <Text style={s.e2eBadgeTxt}>Cifrata end-to-end</Text>
            </View>
          )}

          {/* REC badge */}
          {isRecording && phase === 'active' && (
            <View style={s.recBadge}>
              <View style={s.recDot} />
              <Text style={s.recLabel}>REC</Text>
            </View>
          )}

          {/* Group participant list */}
          {isGroup && call.participantProfiles && Object.keys(call.participantProfiles).length > 0 && (
            <View style={s.participantCard}>
              {/* Banner "X ha rifiutato" */}
              {declinedBanner && (
                <View style={s.declinedBanner}>
                  <Feather name="phone-missed" size={14} color="#FF5C79" />
                  <Text style={s.declinedBannerText}>{declinedBanner.name} ha rifiutato</Text>
                </View>
              )}
              <ParticipantList
                participantProfiles={call.participantProfiles}
                participantStatuses={effectiveStatuses as Record<string, import('../services/callService').ParticipantCallStatus>}
                myUid={myUid}
                onRecall={(uid, profile) => {
                  inviteParticipantsToCurrentCall(
                    [uid],
                    { [uid]: { name: profile.name, avatar: profile.avatar } },
                  ).catch(() => {});
                }}
              />
            </View>
          )}

        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Action buttons                                                   */}
        {/* ---------------------------------------------------------------- */}
        <View style={s.actions}>

          {/* INCOMING — decline left, accept right */}
          {phase === 'incoming' && (
            <View style={s.incomingRow}>
              <View style={s.btnCol}>
                <TouchableOpacity
                  style={[s.circleBtn, s.circleBtnRed]}
                  onPress={() => declineCall(call)}
                  activeOpacity={0.8}
                >
                  <Feather name="phone-off" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={s.btnLabel}>Rifiuta</Text>
              </View>

              <View style={s.btnCol}>
                <TouchableOpacity
                  style={[s.circleBtn, s.circleBtnGreen]}
                  onPress={() => acceptCall(call)}
                  activeOpacity={0.8}
                >
                  <Feather name="phone" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={s.btnLabel}>Rispondi</Text>
              </View>
            </View>
          )}

          {/* RINGING / CONNECTING — single red cancel button */}
          {(phase === 'ringing' || phase === 'connecting') && (
            <View style={s.singleBtnCol}>
              <TouchableOpacity
                style={[s.circleBtn, s.circleBtnRed]}
                onPress={endCall}
                activeOpacity={0.8}
              >
                <Feather name="phone-off" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={s.btnLabel}>{t('call.cancel')}</Text>
            </View>
          )}

          {/* ACTIVE — three main buttons + secondary pill row */}
          {phase === 'active' && (
            <>
              <View style={s.activeRow}>

                {/* Mute */}
                <View style={s.btnCol}>
                  <TouchableOpacity
                    style={[s.circleBtn, s.circleBtnGrey, isMuted && s.circleBtnGreyActive]}
                    onPress={toggleMute}
                    activeOpacity={0.8}
                  >
                    <Feather name={isMuted ? 'mic-off' : 'mic'} size={24} color={isMuted ? '#FF5C79' : '#fff'} />
                  </TouchableOpacity>
                  <Text style={s.btnLabel}>{isMuted ? t('call.unmute') : t('call.mute')}</Text>
                </View>

                {/* End call — larger, red, centred */}
                <View style={s.btnCol}>
                  <TouchableOpacity
                    style={[s.circleBtn, s.circleBtnRed, s.circleBtnLarge]}
                    onPress={endCall}
                    activeOpacity={0.8}
                  >
                    <Feather name="phone-off" size={30} color="#fff" />
                  </TouchableOpacity>
                  <Text style={s.btnLabel}>{isGroup ? 'Esci' : t('call.end')}</Text>
                </View>

                {/* Speaker */}
                <View style={s.btnCol}>
                  <TouchableOpacity
                    style={[s.circleBtn, s.circleBtnGrey, isSpeaker && s.circleBtnGreyActive]}
                    onPress={toggleSpeaker}
                    activeOpacity={0.8}
                  >
                    <Feather name={isSpeaker ? 'volume-x' : 'volume-2'} size={24} color={isSpeaker ? '#67E8F9' : '#fff'} />
                  </TouchableOpacity>
                  <Text style={s.btnLabel}>{isSpeaker ? t('call.earpiece') : t('call.speaker')}</Text>
                </View>

              </View>

              {/* Secondary pill row */}
              <View style={s.pillRow}>
                <TouchableOpacity
                  style={s.pillBtn}
                  onPress={() => setShowInviteModal(true)}
                  activeOpacity={0.8}
                >
                  <Feather name="user-plus" size={14} color="#67E8F9" style={{ marginRight: 6 }} />
                  <Text style={s.pillBtnLabel}>Aggiungi</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.pillBtn, isRecording && s.pillBtnRec]}
                  onPress={toggleRecording}
                  activeOpacity={0.8}
                >
                  <Feather
                    name={isRecording ? 'square' : 'circle'}
                    size={14}
                    color={isRecording ? '#FF5C79' : 'rgba(255,255,255,0.5)'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[s.pillBtnLabel, isRecording && s.pillBtnLabelRec]}>
                    {isRecording ? 'Ferma' : 'Registra'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ENDED */}
          {phase === 'ended' && (
            <View style={s.endedCard}>
              {/* Icona + motivo */}
              <View style={s.endedTopRow}>
                <Feather
                  name={endReason === 'left' ? 'log-out' : 'phone-missed'}
                  size={18}
                  color={endReason === 'left' ? '#67E8F9' : '#FF5C79'}
                />
                <Text style={[s.endedReasonTxt, { color: endReason === 'left' ? '#67E8F9' : '#FF5C79' }]}>
                  {statusText()}
                </Text>
              </View>

              {/* Durata chiamata */}
              {duration > 0 && (
                <View style={s.endedDurationRow}>
                  <Feather name="clock" size={12} color="rgba(255,255,255,0.3)" />
                  <Text style={s.endedDurationTxt}>{fmtDuration(duration)}</Text>
                </View>
              )}

              {/* Quante persone ancora connesse (group call lasciata) */}
              {isGroup && endReason === 'left' && (
                <View style={s.endedActiveRow}>
                  <View style={[s.endedActiveDot, { backgroundColor: activeMembersCount > 0 ? '#00FF9C' : '#666' }]} />
                  <Text style={[s.endedActiveTxt, { color: activeMembersCount > 0 ? '#00FF9C' : 'rgba(255,255,255,0.35)' }]}>
                    {activeMembersCount > 0
                      ? `${activeMembersCount} ${activeMembersCount === 1 ? 'persona ancora connessa' : 'persone ancora connesse'}`
                      : 'Chiamata terminata'}
                  </Text>
                </View>
              )}

              {/* Rejoin prominente */}
              {endReason === 'left' && canRejoin && (
                <TouchableOpacity style={s.bigRejoinBtn} onPress={rejoinGroupCall} activeOpacity={0.8}>
                  <Feather name="phone" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={s.bigRejoinBtnLabel}>Rientra nella chiamata</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.endedDismissBtn} onPress={dismissEndedCall} activeOpacity={0.8}>
                <Text style={s.endedDismissBtnLabel}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </View>

      {/* Group invite modal — logic unchanged */}
      <GroupCallSetupModal
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        mode="invite"
        existingParticipantIds={
          isGroup
            ? Object.keys(call.participantProfiles ?? {})
            : [call.callerId, call.calleeId].filter(Boolean)
        }
        onInviteParticipants={inviteParticipantsToCurrentCall}
      />
      </>}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  glow: {
    position: 'absolute',
    top: -120,
    left: -80,
    right: -80,
    height: 440,
    borderRadius: 440,
  },

  // Top
  topSection: {
    alignItems: 'center',
  },
  typeLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Center
  center: {
    alignItems: 'center',
    gap: 12,
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },

  // Avatar
  avatarBubble: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 1.5,
  },

  // Name & status
  name: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F7F8FF',
    letterSpacing: -0.5,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 280,
  },
  statusText: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 0.06,
  },

  // E2E badge
  e2eBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(103,232,249,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.15)',
  },
  e2eBadgeTxt: {
    color: 'rgba(103,232,249,0.55)',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },

  // REC badge
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

  // Participant list card
  participantCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  participantScroll: {
    maxHeight: 200,
  },
  participantScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  participantAvatarInitial: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  participantAvatarEmoji: {
    fontSize: 20,
  },
  participantName: {
    flex: 1,
    color: '#F7F8FF',
    fontSize: 14,
    fontWeight: '600',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  statusPillActive: {
    backgroundColor: 'rgba(0,255,156,0.15)',
  },
  statusPillGone: {
    backgroundColor: 'rgba(255,92,121,0.12)',
  },
  statusPillText: {
    fontSize: 11,
    color: '#97A4C7',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusPillTextActive: {
    color: '#00FF9C',
  },
  statusPillTextGone: {
    color: '#FF8AA0',
  },

  recallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.4)',
    backgroundColor: 'rgba(0,255,156,0.08)',
  },
  recallBtnText: {
    fontSize: 11,
    color: '#00FF9C',
    fontWeight: '600',
  },

  declinedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,92,121,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,92,121,0.25)',
  },
  declinedBannerText: {
    fontSize: 12,
    color: '#FF8AA0',
    fontWeight: '500',
  },

  // Actions wrapper
  actions: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 8,
    gap: 20,
  },

  // Button column (icon + label)
  btnCol: {
    alignItems: 'center',
    gap: 10,
  },
  btnLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    textAlign: 'center',
  },

  // Circle buttons
  circleBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  circleBtnRed: {
    backgroundColor: '#E53935',
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  circleBtnGreen: {
    backgroundColor: '#25D366',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  circleBtnGrey: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  circleBtnGreyActive: {
    backgroundColor: 'rgba(103,232,249,0.12)',
    borderColor: 'rgba(103,232,249,0.35)',
  },

  // Incoming row
  incomingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 24,
  },

  // Ringing single button
  singleBtnCol: {
    alignItems: 'center',
    gap: 10,
  },

  // Active row
  activeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 8,
  },

  // Secondary pill row
  pillRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillBtnRec: {
    backgroundColor: 'rgba(255,92,121,0.10)',
    borderColor: 'rgba(255,92,121,0.35)',
  },
  pillBtnLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '600',
  },
  pillBtnLabelRec: {
    color: '#FF5C79',
  },

  // Ended card
  endedCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  endedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  endedReasonTxt: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  endedDurationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  endedDurationTxt: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  endedActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  endedActiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  endedActiveTxt: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  bigRejoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(0,255,156,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.4)',
  },
  bigRejoinBtnLabel: {
    color: '#00FF9C',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  endedDismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  endedDismissBtnLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },

  // PiP
  pipContainer: {
    flex: 1,
    backgroundColor: '#080C14',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pipAvatar: {
    fontSize: 36,
  },
  pipName: {
    color: '#F7F8FF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  pipTimer: {
    color: '#00FF9C',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
});
