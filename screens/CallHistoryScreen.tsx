import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { auth } from '../firebaseConfig';
import { db } from '../firebaseConfig';
import { getCallHistory, Call } from '../services/callService';
import { visiblePhotoFromSnap } from '../services/firebaseService';
import { useCall } from '../context/CallContext';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../constants/themes';

const _callHistoryPhotoCache: Record<string, string | null> = {};

interface Props {
  userId: string;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTimestamp(date: Date, t: any): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  if (diffDays === 0) return `${t('common.today')} ${time}`;
  if (diffDays === 1) return `${t('common.yesterday')} ${time}`;

  const months = [t('common.months.gen'), t('common.months.feb'), t('common.months.mar'), t('common.months.apr'), t('common.months.mag'), t('common.months.giu'), t('common.months.lug'), t('common.months.ago'), t('common.months.set'), t('common.months.ott'), t('common.months.nov'), t('common.months.dic')];
  if (diffDays < 7) return `${date.getDate()} ${months[date.getMonth()]} ${time}`;
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

const AVATAR_COLORS = ['#00FF9C','#8b5cf6','#f59e0b','#ef4444','#10b981','#f97316','#ec4899','#3b82f6'];

function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function CallHistoryScreen({ userId, onClose }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const { initiateCall, canRejoin, rejoinGroupCall, rejoinableCall } = useCall();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});

  useEffect(() => {
    getCallHistory(userId)
      .then(async (list) => {
        setCalls(list);
        const myUid = auth.currentUser?.uid;
        const uids = [...new Set(list.flatMap((c) => {
          if (c.type === 'group') return [];
          return c.callerId === myUid ? [c.calleeId] : [c.callerId];
        }))].filter(Boolean);
        const fetchedPhotos: Record<string, string | null> = {};
        await Promise.all(uids.map(async (uid) => {
          if (uid in _callHistoryPhotoCache) { fetchedPhotos[uid] = _callHistoryPhotoCache[uid]; return; }
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            const photo = (await visiblePhotoFromSnap(snap, uid)) ?? null;
            _callHistoryPhotoCache[uid] = photo;
            fetchedPhotos[uid] = photo;
          } catch { _callHistoryPhotoCache[uid] = null; fetchedPhotos[uid] = null; }
        }));
        setPhotos(fetchedPhotos);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const getOtherParty = useCallback((call: Call) => {
    const uid = auth.currentUser?.uid;
    if (call.type === 'group') {
      const profiles = call.participantProfiles ?? {};
      const others = Object.entries(profiles).filter(([id]) => id !== uid);
      const names = others.slice(0, 2).map(([, p]) => p.name).join(', ');
      const extra = others.length > 2 ? ` +${others.length - 2}` : '';
      return {
        name: names ? `${names}${extra}` : t('call.groupCall'),
        avatar: '👥',
        otherUid: '',
      };
    }
    const isOutgoing = call.callerId === uid;
    return {
      name: isOutgoing ? call.calleeName : call.callerName,
      avatar: isOutgoing ? call.calleeAvatar : call.callerAvatar,
      otherUid: isOutgoing ? call.calleeId : call.callerId,
    };
  }, []);

  const getCallType = useCallback((call: Call): { label: string; color: string; icon: React.ComponentProps<typeof Feather>['name'] } => {
    const uid = auth.currentUser?.uid;
    if (call.type === 'group') {
      const myStatus = call.participantStatuses?.[uid ?? ''];
      if (myStatus === 'declined' || myStatus === 'missed') return { label: t('call.missed'), color: '#FF5C79', icon: 'phone-missed' };
      return { label: t('call.group'), color: '#8B5CF6', icon: 'users' };
    }
    if (call.status === 'missed' || call.status === 'declined') {
      return { label: t('call.missed'), color: '#FF5C79', icon: 'phone-missed' };
    }
    if (call.callerId === uid) {
      return { label: t('call.outgoing'), color: colors.textAccent, icon: 'phone-outgoing' };
    }
    return { label: t('call.incoming'), color: colors.greenText, icon: 'phone-incoming' };
  }, [colors, t]);

  const renderItem = ({ item }: { item: Call }) => {
    const { name, avatar, otherUid } = getOtherParty(item);
    const { label, color, icon } = getCallType(item);
    const avatarColor = getAvatarColor(name);
    const isEmoji = avatar && avatar.length <= 2 && /\p{Emoji}/u.test(avatar);
    const photo = otherUid ? photos[otherUid] : null;

    return (
      <View style={s.row}>
        <View style={[s.avatarCircle, { backgroundColor: photo ? 'transparent' : avatarColor + '33', borderColor: avatarColor + '66', overflow: 'hidden' }]}>
          {photo
            ? <Image source={{ uri: photo }} style={{ width: 44, height: 44, borderRadius: 22 }} />
            : isEmoji
              ? <Text style={s.avatarText}>{avatar}</Text>
              : <Feather name="music" size={20} color={avatarColor} />}
        </View>

        <View style={s.info}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <View style={s.metaRow}>
            <View style={s.callTypeRow}>
              <Feather name={icon} size={13} color={color} />
              <Text style={[s.callType, { color }]}>{label}</Text>
            </View>
            {typeof (item as any).duration === 'number' && (item as any).duration > 0 && (
              <Text style={s.duration}>{formatDuration((item as any).duration)}</Text>
            )}
          </View>
        </View>

        <View style={s.right}>
          <Text style={s.timestamp}>{formatTimestamp(item.createdAt, t)}</Text>
          {!!otherUid && (
            <TouchableOpacity
              style={s.callBtn}
              onPress={() => initiateCall(otherUid, name, avatar || '🎵')}
            >
              <Feather name="phone" size={16} color={colors.greenText} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={colors.gradientBg} style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('call.history')}</Text>
        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
          <Feather name="x" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {canRejoin && rejoinableCall && (() => {
        const myUid = auth.currentUser?.uid ?? '';
        const profiles = rejoinableCall.participantProfiles ?? {};
        const activeUids = Object.entries(rejoinableCall.participantStatuses ?? {})
          .filter(([uid, status]) => uid !== myUid && status === 'active')
          .map(([uid]) => uid);
        const activeProfiles = activeUids.map((uid) => profiles[uid]).filter(Boolean);
        const names = activeProfiles.slice(0, 3).map((p) => p.name).join(', ');
        const extra = activeProfiles.length > 3 ? ` +${activeProfiles.length - 3}` : '';
        const subtitle = activeProfiles.length > 0
          ? `${names}${extra} ${activeProfiles.length === 1 ? t('call.areStillConnected_one') : t('call.areStillConnected_other')}`
          : t('call.othersStillConnected');
        return (
          <TouchableOpacity style={s.liveCard} onPress={rejoinGroupCall} activeOpacity={0.8}>
            <View style={s.liveDotWrap}>
              <View style={s.liveDot} />
            </View>
            <View style={s.liveAvatars}>
              {activeProfiles.slice(0, 3).map((p, i) => {
                const color = getAvatarColor(p.name);
                return (
                  <View key={i} style={[s.liveAvatar, { backgroundColor: color + '33', borderColor: color + '66', marginLeft: i > 0 ? -10 : 0 }]}>
                    <Text style={s.liveAvatarTxt}>{p.name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
                  </View>
                );
              })}
            </View>
            <View style={s.liveInfo}>
              <Text style={s.liveTitle}>{t('call.ongoing')}</Text>
              <Text style={s.liveSubtitle} numberOfLines={1}>{subtitle}</Text>
            </View>
            <View style={s.liveJoinBtn}>
              <Feather name="phone" size={16} color="#000" />
              <Text style={s.liveJoinTxt}>{t('call.rejoin')}</Text>
            </View>
          </TouchableOpacity>
        );
      })()}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#00FF9C" />
        </View>
      ) : calls.length === 0 ? (
        <View style={s.center}>
          <Feather name="phone-missed" size={48} color={colors.textMuted} />
          <Text style={s.emptyText}>{t('call.noCalls')}</Text>
        </View>
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      )}
    </LinearGradient>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    headerTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    closeBtn: {
      padding: 4,
    },
    list: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 32,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    avatarCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: {
      fontSize: 22,
    },
    info: {
      flex: 1,
      gap: 4,
    },
    name: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    callTypeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    callType: {
      fontSize: 13,
      fontWeight: '500',
    },
    duration: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    right: {
      alignItems: 'flex-end',
      gap: 6,
    },
    timestamp: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    callBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,255,156,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(0,255,156,0.3)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    separator: {
      height: 1,
      backgroundColor: colors.borderSubtle,
      marginLeft: 58,
    },
    liveCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 4,
      padding: 14,
      borderRadius: 16,
      backgroundColor: 'rgba(0,255,156,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(0,255,156,0.3)',
      gap: 10,
    },
    liveDotWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#00FF9C',
    },
    liveAvatars: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    liveAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    liveAvatarTxt: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    liveInfo: {
      flex: 1,
      gap: 2,
    },
    liveTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    liveSubtitle: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    liveJoinBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#00FF9C',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
    },
    liveJoinTxt: {
      color: '#000',
      fontSize: 13,
      fontWeight: '700',
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 16,
    },
  });
}
