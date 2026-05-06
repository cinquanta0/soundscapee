import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../firebaseConfig';
import { getFriendsList } from '../services/firebaseService';
import { useCall } from '../context/CallContext';
import { ParticipantProfile } from '../services/callService';

const MAX_PARTICIPANTS = 3;
const FEATHER_AVATARS = new Set(['music', 'headphones', 'radio', 'mic', 'speaker', 'disc', 'volume-2', 'play-circle', 'star', 'zap', 'heart', 'sun', 'moon', 'cloud', 'wind', 'droplet']);

interface Friend {
  id: string;
  username: string;
  avatar: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function GroupCallSetupModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { initiateGroupCall } = useCall();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

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

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_PARTICIPANTS - 1) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleStart = useCallback(async () => {
    if (selected.size === 0 || starting) return;
    setStarting(true);
    const inviteeIds = Array.from(selected);
    const inviteeProfiles: Record<string, ParticipantProfile> = {};
    for (const id of inviteeIds) {
      const f = friends.find((x) => x.id === id);
      if (f) inviteeProfiles[id] = { name: f.username, avatar: f.avatar };
    }
    onClose();
    await initiateGroupCall(inviteeIds, inviteeProfiles).catch(() => {});
    setStarting(false);
  }, [selected, friends, initiateGroupCall, onClose, starting]);

  const renderItem = ({ item }: { item: Friend }) => {
    const isSel = selected.has(item.id);
    const isDisabled = !isSel && selected.size >= MAX_PARTICIPANTS - 1;
    const isFeatherAvatar = FEATHER_AVATARS.has(item.avatar);
    return (
      <TouchableOpacity
        style={[st.row, isSel && st.rowSelected, isDisabled && st.rowDisabled]}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.75}
      >
        <View style={[st.avatar, isSel && { borderColor: '#00FF9C' }]}>
          {isFeatherAvatar ? (
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
      <LinearGradient colors={['#050508', '#0A0A18', '#05050C']} style={StyleSheet.absoluteFill} />

      <View style={[st.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        <View style={st.header}>
          <TouchableOpacity onPress={onClose} style={st.backBtn}>
            <Feather name="x" size={22} color="#F7F8FF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>Chiamata di gruppo</Text>
            <Text style={st.subtitle}>Seleziona fino a {MAX_PARTICIPANTS - 1} amici</Text>
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
        ) : friends.length === 0 ? (
          <View style={st.center}>
            <Feather name="users" size={48} color="#333" />
            <Text style={st.emptyTxt}>Nessun amico trovato</Text>
            <Text style={st.emptySubtxt}>Aggiungi amici per chiamarli in gruppo</Text>
          </View>
        ) : (
          <FlatList
            data={friends}
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
              {selected.size === 0 ? 'Seleziona almeno un amico' : `📞 Chiama (${selected.size + 1} persone)`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#F7F8FF',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: 'rgba(247,248,255,0.4)',
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
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarTxt: {
    fontSize: 22,
  },
  name: {
    flex: 1,
    color: 'rgba(247,248,255,0.7)',
    fontSize: 16,
    fontWeight: '600',
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: {
    backgroundColor: '#00FF9C',
    borderColor: '#00FF9C',
  },
  sep: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginLeft: 62,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTxt: {
    color: 'rgba(247,248,255,0.4)',
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtxt: {
    color: 'rgba(247,248,255,0.25)',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  startBtnTxt: {
    color: '#060913',
    fontSize: 16,
    fontWeight: '700',
  },
});
