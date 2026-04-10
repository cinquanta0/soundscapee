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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { getCommunities, toggleCommunityMembership, createCommunity } from '../../services/firebaseService';

export default function CommunitiesScreen() {
  const { t } = useTranslation();
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCommunity, setNewCommunity] = useState({
    name: '',
    description: '',
    category: 'General',
  });

  useEffect(() => {
    loadCommunities();
  }, []);

  const loadCommunities = async () => {
    try {
      const data = await getCommunities();
      setCommunities(data);
    } catch (error) {
      Alert.alert(t('common.error'), t('communities.errors.cannotLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (communityId) => {
    try {
      const joined = await toggleCommunityMembership(communityId);
      Alert.alert(joined ? t('communities.joined') : t('communities.left'));
      loadCommunities();
    } catch (error) {
      Alert.alert('Errore', error.message);
    }
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
      setNewCommunity({ name: '', description: '', category: 'General' });
      loadCommunities();
    } catch (error) {
      Alert.alert('Errore', error.message);
    }
  };

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
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.createButtonText}>{t('communities.create')}</Text>
        </TouchableOpacity>
      </View>

      {/* Communities List */}
      <FlatList
        data={communities}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.communityCard}
            onPress={() => Alert.alert('Community', t('communities.selected', { name: item.name }))}
          >
            <View style={styles.communityHeader}>
              <Text style={styles.communityAvatar}>{item.avatar}</Text>
              <View style={styles.communityInfo}>
                <Text style={styles.communityName}>{item.name}</Text>
                <Text style={styles.communityStats}>
                  {t('communities.membersAndSounds', { members: item.membersCount, sounds: item.soundsCount })}
                </Text>
              </View>
            </View>
            <Text style={styles.communityDescription} numberOfLines={2}>
              {item.description}
            </Text>
            <View style={styles.communityFooter}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{item.category}</Text>
              </View>
              <TouchableOpacity
                style={styles.joinButton}
                onPress={() => handleJoin(item.id)}
              >
                <Text style={styles.joinButtonText}>{t('communities.join')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
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

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowCreateModal(false)}
              >
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
  joinButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
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