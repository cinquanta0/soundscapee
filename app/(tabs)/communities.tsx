import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { getCommunities, createCommunity, deleteCommunity } from '../../services/firebaseService';
import { joinCommunity, leaveCommunity, requestToJoin, cancelJoinRequest, getMyJoinRequest, getMyRole } from '../../services/communityService';
import CommunityDetailScreen from '../../screens/CommunityDetailScreen';

export default function CommunitiesScreen() {
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<any | null>(null);
  const [membershipState, setMembershipState] = useState<Record<string, 'member' | 'pending' | null>>({});
  const [viewingProfile, setViewingProfile] = useState<any | null>(null);
  const [newCommunity, setNewCommunity] = useState({
    name: '',
    description: '',
    category: 'General',
    isPublic: true,
  });

  useEffect(() => {
    loadCommunities();
  }, []);

  const loadCommunities = async () => {
    try {
      const data = await getCommunities();
      setCommunities(data);
      // Controlla stato iscrizione per ogni community
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const states: Record<string, 'member' | 'pending' | null> = {};
      await Promise.all(data.map(async (c: any) => {
        const role = await getMyRole(c.id).catch(() => null);
        if (role) { states[c.id] = 'member'; return; }
        const hasPending = await getMyJoinRequest(c.id).catch(() => false);
        states[c.id] = hasPending ? 'pending' : null;
      }));
      setMembershipState(states);
    } catch {
      Alert.alert(t('common.error'), t('communities.errors.cannotLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinAction = async (community: any) => {
    const uid = auth.currentUser?.uid;
    const state = membershipState[community.id];
    try {
      if (state === 'member') {
        await leaveCommunity(community.id);
        setMembershipState((prev) => ({ ...prev, [community.id]: null }));
        Alert.alert('👋 Uscito dalla community');
      } else if (state === 'pending') {
        await cancelJoinRequest(community.id);
        setMembershipState((prev) => ({ ...prev, [community.id]: null }));
        Alert.alert('Richiesta annullata');
      } else if (community.isPublic !== false || community.creatorId === uid) {
        await joinCommunity(community.id);
        setMembershipState((prev) => ({ ...prev, [community.id]: 'member' }));
        Alert.alert('✅ Iscritto!');
      } else {
        await requestToJoin(community.id);
        setMembershipState((prev) => ({ ...prev, [community.id]: 'pending' }));
        Alert.alert('⏳ Richiesta inviata', "L'admin deve approvarla");
      }
      loadCommunities();
    } catch (e: any) {
      Alert.alert('Errore', e.message);
    }
  };

  const handleDeleteCommunity = async (community: any) => {
    Alert.alert(
      '🗑 Elimina community',
      `Vuoi eliminare "${community.name}"? Questa azione è irreversibile.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCommunity(community.id);
              loadCommunities();
            } catch (e: any) {
              Alert.alert('Errore', e.message);
            }
          },
        },
      ],
    );
  };

  const handleCreate = async () => {
    if (!newCommunity.name.trim()) {
      Alert.alert(t('common.error'), t('communities.errors.nameRequired'));
      return;
    }
    try {
      await createCommunity(newCommunity);
      Alert.alert('✅ Community creata!');
      setShowCreateModal(false);
      setNewCommunity({ name: '', description: '', category: 'General', isPublic: true });
      loadCommunities();
    } catch (e: any) {
      Alert.alert('Errore', e.message);
    }
  };

  const handleViewProfile = async (userId: string) => {
    try {
      const snap = await getDoc(doc(db, 'users', userId));
      if (snap.exists()) setViewingProfile({ id: userId, ...snap.data() });
    } catch {}
  };

  // Dettaglio community aperto
  if (selectedCommunity) {
    return (
      <>
        <CommunityDetailScreen
          community={selectedCommunity}
          onClose={() => { setSelectedCommunity(null); loadCommunities(); }}
          onCommunityDeleted={() => { setSelectedCommunity(null); loadCommunities(); }}
          onViewProfile={handleViewProfile}
        />
        {/* Modal profilo utente */}
        <Modal visible={!!viewingProfile} transparent animationType="fade" onRequestClose={() => setViewingProfile(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#1e293b', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 56 }}>{viewingProfile?.avatar || '🎵'}</Text>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{viewingProfile?.username || 'Utente'}</Text>
              {viewingProfile?.bio ? <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' }}>{viewingProfile.bio}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 24, marginTop: 8 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{viewingProfile?.followersCount ?? 0}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Follower</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{viewingProfile?.followingCount ?? 0}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Following</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{viewingProfile?.soundsCount ?? 0}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Suoni</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setViewingProfile(null)} style={{ marginTop: 16, paddingHorizontal: 32, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 }}>
                <Text style={{ color: '#fff' }}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#0f172a', '#1e293b']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#06b6d4" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('communities.title')}</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateModal(true)}>
          <Text style={styles.createButtonText}>{t('communities.create')}</Text>
        </TouchableOpacity>
      </View>

      {/* Communities List */}
      <FlatList
        data={communities}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const uid = auth.currentUser?.uid;
          const state = membershipState[item.id];
          const isOwner = item.creatorId === uid;
          const joinLabel = state === 'member' ? 'Iscritto ✓' : state === 'pending' ? '⏳ In attesa' : item.isPublic !== false ? t('communities.join') : '🔒 Richiedi';
          const joinStyle = state === 'member' ? styles.joinButtonMember : state === 'pending' ? styles.joinButtonPending : styles.joinButton;
          return (
            <TouchableOpacity style={styles.communityCard} onPress={() => setSelectedCommunity(item)}>
              <View style={styles.communityHeader}>
                <Text style={styles.communityAvatar}>{item.avatar}</Text>
                <View style={styles.communityInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.communityName}>{item.name}</Text>
                    {item.isPublic === false && <Text style={styles.privateBadge}>🔒</Text>}
                  </View>
                  <Text style={styles.communityStats}>
                    {t('communities.membersAndSounds', { members: item.membersCount, sounds: item.soundsCount })}
                  </Text>
                </View>
                {isOwner && item.isPublic === false && (
                  <TouchableOpacity
                    style={styles.deleteCardBtn}
                    onPress={(e) => { e.stopPropagation?.(); handleDeleteCommunity(item); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.deleteCardTxt}>🗑</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.communityDescription} numberOfLines={2}>{item.description}</Text>
              <View style={styles.communityFooter}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{item.category}</Text>
                </View>
                <TouchableOpacity style={joinStyle} onPress={(e) => { e.stopPropagation?.(); handleJoinAction(item); }}>
                  <Text style={styles.joinButtonText}>{joinLabel}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>{t('communities.noCommunities')}</Text>
            <Text style={styles.emptySubtext}>{t('communities.noCommunitiesHint')}</Text>
          </View>
        }
      />

      {/* Create Community Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('communities.createTitle')}</Text>

            <TextInput
              style={styles.input}
              placeholder={t('communities.namePlaceholder')}
              placeholderTextColor="#94a3b8"
              value={newCommunity.name}
              onChangeText={(name) => setNewCommunity({ ...newCommunity, name })}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('communities.descriptionPlaceholder')}
              placeholderTextColor="#94a3b8"
              multiline
              value={newCommunity.description}
              onChangeText={(description) => setNewCommunity({ ...newCommunity, description })}
            />

            {/* Toggle Pubblica / Privata */}
            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleLabel}>{newCommunity.isPublic ? '🌍 Pubblica' : '🔒 Privata'}</Text>
                <Text style={styles.toggleSub}>{newCommunity.isPublic ? 'Chiunque può entrare' : 'Iscrizione con approvazione'}</Text>
              </View>
              <Switch
                value={!newCommunity.isPublic}
                onValueChange={(val) => setNewCommunity({ ...newCommunity, isPublic: !val })}
                trackColor={{ false: '#334155', true: '#06b6d4' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonCreate} onPress={handleCreate}>
                <Text style={styles.modalButtonText}>{t('common.create')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  createButton: {
    backgroundColor: '#06b6d4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  communityCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  communityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  communityAvatar: {
    fontSize: 32,
    marginRight: 12,
  },
  communityInfo: {
    flex: 1,
  },
  communityName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  communityStats: {
    fontSize: 12,
    color: '#94a3b8',
  },
  communityDescription: {
    fontSize: 14,
    color: '#cbd5e1',
    marginBottom: 12,
  },
  communityFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: '#06b6d4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  joinButtonMember: {
    backgroundColor: 'rgba(52,199,89,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.4)',
  },
  joinButtonPending: {
    backgroundColor: 'rgba(255,159,10,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.4)',
  },
  joinButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  privateBadge: {
    fontSize: 12,
  },
  deleteCardBtn: {
    padding: 4,
    marginLeft: 8,
  },
  deleteCardTxt: {
    fontSize: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  toggleLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    marginBottom: 12,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalButtonCancel: {
    flex: 1,
    backgroundColor: '#334155',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCreate: {
    flex: 1,
    backgroundColor: '#06b6d4',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});