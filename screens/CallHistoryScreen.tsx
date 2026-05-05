import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { auth } from '../firebaseConfig';
import { getCallHistory, Call } from '../services/callService';
import { useCall } from '../context/CallContext';

interface Props {
  userId: string;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  if (diffDays === 0) return `Oggi ${hours}:${minutes}`;
  if (diffDays === 1) return 'Ieri';

  const months = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
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
  const { initiateCall } = useCall();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCallHistory(userId)
      .then(setCalls)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const getOtherParty = useCallback((call: Call) => {
    const uid = auth.currentUser?.uid;
    const isOutgoing = call.callerId === uid;
    return {
      name: isOutgoing ? call.calleeName : call.callerName,
      avatar: isOutgoing ? call.calleeAvatar : call.callerAvatar,
      otherUid: isOutgoing ? call.calleeId : call.callerId,
    };
  }, []);

  const getCallType = useCallback((call: Call): { label: string; color: string } => {
    const uid = auth.currentUser?.uid;
    if (call.status === 'missed' || call.status === 'declined') {
      return { label: '📵 Persa', color: '#FF5C79' };
    }
    if (call.callerId === uid) {
      return { label: '📞 In uscita', color: '#67E8F9' };
    }
    return { label: '📲 In entrata', color: '#00FF9C' };
  }, []);

  const renderItem = ({ item }: { item: Call }) => {
    const { name, avatar, otherUid } = getOtherParty(item);
    const { label, color } = getCallType(item);
    const avatarColor = getAvatarColor(name);
    const isEmoji = avatar && avatar.length <= 2 && /\p{Emoji}/u.test(avatar);

    return (
      <View style={styles.row}>
        <View style={[styles.avatarCircle, { backgroundColor: avatarColor + '33', borderColor: avatarColor + '66' }]}>
          <Text style={styles.avatarText}>{isEmoji ? avatar : '🎵'}</Text>
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.callType, { color }]}>{label}</Text>
            {typeof (item as any).duration === 'number' && (item as any).duration > 0 && (
              <Text style={styles.duration}>{formatDuration((item as any).duration)}</Text>
            )}
          </View>
        </View>

        <View style={styles.right}>
          <Text style={styles.timestamp}>{formatTimestamp(item.createdAt)}</Text>
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => initiateCall(otherUid, name, avatar || '🎵')}
          >
            <Feather name="phone" size={16} color="#00FF9C" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={['#050508', '#0A0A18']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cronologia chiamate</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Feather name="x" size={22} color="#F7F8FF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#00FF9C" />
        </View>
      ) : calls.length === 0 ? (
        <View style={styles.center}>
          <Feather name="phone-missed" size={48} color="#333" />
          <Text style={styles.emptyText}>Nessuna chiamata</Text>
        </View>
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
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
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    color: '#F7F8FF',
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
    color: '#F7F8FF',
    fontSize: 15,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callType: {
    fontSize: 13,
    fontWeight: '500',
  },
  duration: {
    color: 'rgba(247,248,255,0.4)',
    fontSize: 12,
  },
  right: {
    alignItems: 'flex-end',
    gap: 6,
  },
  timestamp: {
    color: 'rgba(247,248,255,0.4)',
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
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginLeft: 58,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: 'rgba(247,248,255,0.3)',
    fontSize: 16,
  },
});
