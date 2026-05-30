import React, { useState, useEffect, useMemo } from 'react';
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
import { C, T, S, R } from '../../constants/design';
import { useTheme } from '../../context/ThemeContext';
import { doc, getDoc } from 'firebase/firestore';
import { getCommunities, createCommunity, deleteCommunity, getFollowStats } from '../../services/firebaseService';
import { joinCommunity, leaveCommunity, requestToJoin, cancelJoinRequest, getMyJoinRequest, getMyRole } from '../../services/communityService';
import CommunityDetailScreen from '../../screens/CommunityDetailScreen';

export default function CommunitiesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<any | null>(null);
  const [membershipState, setMembershipState] = useState<Record<string, 'member' | 'pending' | null>>({});
  const [viewingProfile, setViewingProfile] = useState<any | null>(null);
  const [viewingProfileStats, setViewingProfileStats] = useState<{ followers: number; following: number } | null>(null);
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
      const [snap, stats] = await Promise.all([
        getDoc(doc(db, 'users', userId)),
        getFollowStats(userId),
      ]);
      if (snap.exists()) setViewingProfile({ id: userId, ...snap.data() });
      setViewingProfileStats(stats);
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
        <Modal visible={!!viewingProfile} transparent animationType="fade" onRequestClose={() => { setViewingProfile(null); setViewingProfileStats(null); }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#161616', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 56 }}>{viewingProfile?.avatar || '🎵'}</Text>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{viewingProfile?.username || 'Utente'}</Text>
              {viewingProfile?.bio ? <Text style={{ color: '#9A9A9A', fontSize: 13, textAlign: 'center' }}>{viewingProfile.bio}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 24, marginTop: 8 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{viewingProfileStats?.followers ?? viewingProfile?.followersCount ?? 0}</Text>
                  <Text style={{ color: '#9A9A9A', fontSize: 11 }}>Follower</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{viewingProfileStats?.following ?? viewingProfile?.followingCount ?? 0}</Text>
                  <Text style={{ color: '#9A9A9A', fontSize: 11 }}>Following</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{viewingProfile?.soundsCount ?? 0}</Text>
                  <Text style={{ color: '#9A9A9A', fontSize: 11 }}>Suoni</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => { setViewingProfile(null); setViewingProfileStats(null); }} style={{ marginTop: 16, paddingHorizontal: 32, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 }}>
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
      <View style={s.loadingContainer}>
        <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#00FF9C" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />
      <View style={s.ambientA} />
      <View style={s.ambientB} />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('communities.title')}</Text>
        <TouchableOpacity style={s.createButton} onPress={() => setShowCreateModal(true)}>
          <Text style={s.createButtonText}>{t('communities.create')}</Text>
        </TouchableOpacity>
      </View>

      {/* Communities List */}
      <FlatList
        data={communities}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const uid = auth.currentUser?.uid;
          const state = membershipState[item.id];
          const isOwner = item.creatorId === uid;
          const joinLabel = state === 'member' ? 'Iscritto ✓' : state === 'pending' ? '⏳ In attesa' : item.isPublic !== false ? t('communities.join') : '🔒 Richiedi';
          const joinStyle = state === 'member' ? s.joinButtonMember : state === 'pending' ? s.joinButtonPending : s.joinButton;
          return (
            <TouchableOpacity style={s.communityCard} onPress={() => setSelectedCommunity(item)}>
              <View style={s.communityHeader}>
                <Text style={s.communityAvatar}>{item.avatar}</Text>
                <View style={s.communityInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.communityName}>{item.name}</Text>
                    {item.isPublic === false && <Text style={s.privateBadge}>🔒</Text>}
                  </View>
                  <Text style={s.communityStats}>
                    {t('communities.membersAndSounds', { members: item.membersCount, sounds: item.soundsCount })}
                  </Text>
                </View>
                {isOwner && item.isPublic === false && (
                  <TouchableOpacity
                    style={s.deleteCardBtn}
                    onPress={(e) => { e.stopPropagation?.(); handleDeleteCommunity(item); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={s.deleteCardTxt}>🗑</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={s.communityDescription} numberOfLines={2}>{item.description}</Text>
              <View style={s.communityFooter}>
                <View style={s.categoryBadge}>
                  <Text style={s.categoryText}>{item.category}</Text>
                </View>
                <TouchableOpacity style={joinStyle} onPress={(e) => { e.stopPropagation?.(); handleJoinAction(item); }}>
                  <Text style={s.joinButtonText}>{joinLabel}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>👥</Text>
            <Text style={s.emptyText}>{t('communities.noCommunities')}</Text>
            <Text style={s.emptySubtext}>{t('communities.noCommunitiesHint')}</Text>
          </View>
        }
      />

      {/* Create Community Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>{t('communities.createTitle')}</Text>

            <TextInput
              style={s.input}
              placeholder={t('communities.namePlaceholder')}
              placeholderTextColor="#94a3b8"
              value={newCommunity.name}
              onChangeText={(name) => setNewCommunity({ ...newCommunity, name })}
            />
            <TextInput
              style={[s.input, s.textArea]}
              placeholder={t('communities.descriptionPlaceholder')}
              placeholderTextColor="#94a3b8"
              multiline
              value={newCommunity.description}
              onChangeText={(description) => setNewCommunity({ ...newCommunity, description })}
            />

            {/* Toggle Pubblica / Privata */}
            <View style={s.toggleRow}>
              <View>
                <Text style={s.toggleLabel}>{newCommunity.isPublic ? '🌍 Pubblica' : '🔒 Privata'}</Text>
                <Text style={s.toggleSub}>{newCommunity.isPublic ? 'Chiunque può entrare' : 'Iscrizione con approvazione'}</Text>
              </View>
              <Switch
                value={!newCommunity.isPublic}
                onValueChange={(val) => setNewCommunity({ ...newCommunity, isPublic: !val })}
                trackColor={{ false: 'rgba(255,255,255,0.08)', true: '#00FF9C' }}
                thumbColor="#fff"
              />
            </View>

            <View style={s.modalButtons}>
              <TouchableOpacity style={s.modalButtonCancel} onPress={() => setShowCreateModal(false)}>
                <Text style={s.modalButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalButtonCreate} onPress={handleCreate}>
                <Text style={s.modalButtonText}>{t('common.create')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: import('../../constants/themes').ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    ambientA: {
      position: 'absolute',
      top: -10,
      left: -30,
      width: 170,
      height: 170,
      borderRadius: 999,
      backgroundColor: 'rgba(99,214,255,0.07)',
    },
    ambientB: {
      position: 'absolute',
      top: 80,
      right: -20,
      width: 180,
      height: 180,
      borderRadius: 999,
      backgroundColor: 'rgba(0,255,156,0.08)',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.bg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: S.lg,
      paddingTop: S.sm,
      marginHorizontal: S.lg,
      marginTop: S.sm,
      marginBottom: S.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: R.xl,
      backgroundColor: colors.bgCard,
    },
    headerTitle: {
      ...T.h1,
      color: colors.text,
    },
    createButton: {
      backgroundColor: '#00FF9C',
      paddingHorizontal: S.lg,
      paddingVertical: 10,
      borderRadius: R.full,
      shadowColor: '#00FF9C',
      shadowOpacity: 0.26,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
    },
    createButtonText: {
      color: C.textOnAccent,
      fontWeight: '700',
      fontSize: 13,
    },
    list: {
      padding: S.lg,
    },
    communityCard: {
      backgroundColor: colors.bgCard,
      borderRadius: R.xl,
      padding: S.lg,
      marginBottom: S.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    communityHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: S.md,
    },
    communityAvatar: {
      fontSize: 32,
      marginRight: S.md,
    },
    communityInfo: {
      flex: 1,
    },
    communityName: {
      ...T.h3,
      color: colors.text,
      marginBottom: S.xs,
    },
    communityStats: {
      ...T.label,
      color: colors.textSecondary,
    },
    communityDescription: {
      ...T.body,
      color: colors.textSecondary,
      marginBottom: S.md,
    },
    communityFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    categoryBadge: {
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: S.md,
      paddingVertical: 7,
      borderRadius: R.full,
    },
    categoryText: {
      ...T.labelS,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    joinButton: {
      backgroundColor: '#00FF9C',
      paddingHorizontal: S.lg,
      paddingVertical: 10,
      borderRadius: R.full,
    },
    joinButtonMember: {
      backgroundColor: 'rgba(0,255,156,0.12)',
      paddingHorizontal: S.lg,
      paddingVertical: S.sm,
      borderRadius: R.sm,
      borderWidth: 1,
      borderColor: C.borderAccent,
    },
    joinButtonPending: {
      backgroundColor: 'rgba(255,159,10,0.12)',
      paddingHorizontal: S.lg,
      paddingVertical: S.sm,
      borderRadius: R.sm,
      borderWidth: 1,
      borderColor: 'rgba(255,159,10,0.3)',
    },
    joinButtonText: {
      ...T.label,
      color: C.textOnAccent,
      fontWeight: '700',
    },
    privateBadge: {
      fontSize: 12,
    },
    deleteCardBtn: {
      padding: S.xs,
      marginLeft: S.sm,
    },
    deleteCardTxt: {
      fontSize: 18,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: R.sm,
      padding: S.md,
      marginBottom: S.md,
    },
    toggleLabel: {
      ...T.body,
      color: colors.text,
      fontWeight: '600',
    },
    toggleSub: {
      ...T.labelS,
      color: colors.textSecondary,
      marginTop: 2,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyIcon: {
      fontSize: 64,
      marginBottom: S.lg,
    },
    emptyText: {
      ...T.body,
      color: colors.textSecondary,
    },
    emptySubtext: {
      ...T.label,
      color: colors.textMuted,
      marginTop: S.xs,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.bgOverlay,
      justifyContent: 'center',
      padding: S.lg,
    },
    modalContent: {
      backgroundColor: colors.bgCard,
      borderRadius: R.xxl,
      padding: S.xxl,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalTitle: {
      ...T.h2,
      color: colors.text,
      marginBottom: S.lg,
    },
    input: {
      backgroundColor: colors.bgInput,
      borderRadius: R.sm,
      borderWidth: 1,
      borderColor: colors.border,
      padding: S.md,
      color: colors.text,
      fontSize: 14,
      marginBottom: S.md,
    },
    textArea: {
      height: 100,
      textAlignVertical: 'top',
    },
    modalButtons: {
      flexDirection: 'row',
      gap: S.md,
      marginTop: S.lg,
    },
    modalButtonCancel: {
      flex: 1,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      borderRadius: R.sm,
      alignItems: 'center',
    },
    modalButtonCreate: {
      flex: 1,
      backgroundColor: C.accent,
      padding: 14,
      borderRadius: R.sm,
      alignItems: 'center',
    },
    modalButtonText: {
      ...T.body,
      fontWeight: '600',
      color: C.textOnAccent,
    },
  });
}
