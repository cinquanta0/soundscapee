import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../constants/themes';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, ActivityIndicator, StatusBar, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../firebaseConfig';
import { getFriendsList } from '../services/firebaseService';
import { useCall } from '../context/CallContext';
import { ParticipantProfile } from '../services/callService';

const MAX_PARTICIPANTS = 6;
const FEATHER_AVATARS = new Set(['music', 'headphones', 'radio', 'mic', 'speaker', 'disc', 'volume-2', 'play-circle', 'star', 'zap', 'heart', 'sun', 'moon', 'cloud', 'wind', 'droplet']);

interface Friend {
  id: string;
  username: string;
  avatar: string;
  profilePicture?: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  mode?: 'create' | 'invite';
  existingParticipantIds?: string[];
  onInviteParticipants?: (inviteeIds: string[], inviteeProfiles: Record<string, ParticipantProfile>) => Promise<void>;
}

export default function GroupCallSetupModal({
  visible,
  onClose,
  mode = 'create',
  existingParticipantIds = [],
  onInviteParticipants,
}: Props) {
  const insets = useSafeAreaInsets();
  const { initiateGroupCall } = useCall();
  const { colors } = useTheme();
  const st = useMemo(() => createStyles(colors), [colors]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const callerSlot = mode === 'create' ? 1 : 0;
  const availableSlots = Math.max(0, MAX_PARTICIPANTS - existingParticipantIds.length - callerSlot);

  useEffect(() => {
    if (!visible) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setLoading(true);
    setSelected(new Set());
    getFriendsList(uid)
      .then((list: Friend[]) => setFriends(list))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible]);

  const visibleFriends = useMemo(
    () => friends.filter((friend) => !existingParticipantIds.includes(friend.id)),
    [friends, existingParticipantIds],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < availableSlots) {
        next.add(id);
      }
      return next;
    });
  }, [availableSlots]);

  const handleStart = useCallback(async () => {
    if (selected.size === 0 || starting) return;
    setStarting(true);
    const inviteeIds = Array.from(selected);
    const inviteeProfiles: Record<string, ParticipantProfile> = {};
    for (const id of inviteeIds) {
      const f = friends.find((x) => x.id === id);
      if (f) inviteeProfiles[id] = { name: f.username, avatar: f.avatar, ...(f.profilePicture ? { photo: f.profilePicture } : {}) };
    }
    onClose();
    if (mode === 'invite' && onInviteParticipants) {
      await onInviteParticipants(inviteeIds, inviteeProfiles).catch(() => {});
    } else {
      await initiateGroupCall(inviteeIds, inviteeProfiles).catch(() => {});
    }
    setStarting(false);
  }, [selected, friends, mode, onInviteParticipants, initiateGroupCall, onClose, starting]);

  const renderItem = ({ item }: { item: Friend }) => {
    const isSel = selected.has(item.id);
    const isDisabled = !isSel && selected.size >= availableSlots;
    const isFeatherAvatar = FEATHER_AVATARS.has(item.avatar);
    return (
      <TouchableOpacity
        style={[st.row, isSel && st.rowSelected, isDisabled && st.rowDisabled]}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.75}
      >
        <View style={[st.avatar, isSel && { borderColor: '#00FF9C' }, item.profilePicture ? { overflow: 'hidden', padding: 0 } : null]}>
          {item.profilePicture ? (
            <Image source={{ uri: item.profilePicture }} style={{ width: 44, height: 44, borderRadius: 22 }} />
          ) : isFeatherAvatar ? (
            <Feather name={item.avatar as any} size={20} color="#F7F8FF" />
          ) : (
            <Text style={st.avatarTxt}>{item.avatar || item.username[0]?.toUpperCase()}</Text>
          )}
        </View>
        <Text style={[st.name, isSel && { color: '#F7F8FF' }]}>{item.username}</Text>
        <View style={[st.check, isSel && st.checkSelected]}>
          {isSel && <Feather name="check" size={14} color="#060913" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />

      <View style={[st.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        <View style={st.header}>
          <TouchableOpacity onPress={onClose} style={st.backBtn}>
            <Feather name="x" size={22} color="#F7F8FF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>{mode === 'invite' ? 'Aggiungi partecipanti' : 'Chiamata di gruppo'}</Text>
            <Text style={st.subtitle}>Seleziona fino a {availableSlots} amici</Text>
          </View>
        </View>

        {selected.size > 0 && (
          <View style={st.selectedBar}>
            <Text style={st.selectedCount}>{selected.size} selezionat{selected.size === 1 ? 'o' : 'i'}</Text>
          </View>
        )}

        {loading ? (
          <View style={st.center}>
            <ActivityIndicator color="#00FF9C" />
          </View>
        ) : visibleFriends.length === 0 ? (
          <View style={st.center}>
            <Feather name="users" size={48} color="#333" />
            <Text style={st.emptyTxt}>Nessun amico disponibile</Text>
            <Text style={st.emptySubtxt}>Hai gia raggiunto il limite o invitato tutti</Text>
          </View>
        ) : (
          <FlatList
            data={visibleFriends}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={st.list}
            ItemSeparatorComponent={() => <View style={st.sep} />}
          />
        )}

        <TouchableOpacity
          style={[st.startBtn, (selected.size === 0 || starting) && st.startBtnDisabled]}
          onPress={handleStart}
          disabled={selected.size === 0 || starting}
        >
          {starting ? (
            <ActivityIndicator color="#060913" />
          ) : (
            <Text style={st.startBtnTxt}>
              {selected.size === 0
                ? 'Seleziona almeno un amico'
                : mode === 'invite'
                  ? `➕ Invita (${selected.size})`
                  : `📞 Chiama (${selected.size + 1} persone)`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 20,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 20,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    selectedBar: {
      backgroundColor: 'rgba(0,255,156,0.08)',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: 'rgba(0,255,156,0.2)',
    },
    selectedCount: {
      color: '#00FF9C',
      fontSize: 13,
      fontWeight: '600',
    },
    list: {
      paddingTop: 4,
      paddingBottom: 16,
      flex: 1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 14,
    },
    rowSelected: {
      backgroundColor: 'rgba(0,255,156,0.06)',
    },
    rowDisabled: {
      opacity: 0.35,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1.5,
      borderColor: colors.borderSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    avatarTxt: {
      fontSize: 22,
    },
    name: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: 16,
      fontWeight: '600',
    },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkSelected: {
      backgroundColor: '#00FF9C',
      borderColor: '#00FF9C',
    },
    sep: {
      height: 1,
      backgroundColor: colors.borderSubtle,
      marginLeft: 62,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    emptyTxt: {
      color: colors.textMuted,
      fontSize: 17,
      fontWeight: '600',
    },
    emptySubtxt: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: 'center',
    },
    startBtn: {
      backgroundColor: '#00FF9C',
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 16,
    },
    startBtnDisabled: {
      backgroundColor: colors.surfaceLight,
    },
    startBtnTxt: {
      color: '#060913',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
