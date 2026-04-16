// app/(tabs)/ChallengesScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { auth } from '../../firebaseConfig';
import {
  getActiveChallenges,
  getChallengeSounds,
  joinChallenge,
  voteForChallengeSound,
  incrementListens,
  createChallenge, // 🆕 AGGIUNGI QUESTO
  deleteChallenge,
} from '../../services/firebaseService';

export default function ChallengesScreen() {
  const { t } = useTranslation();
  const uid = auth.currentUser?.uid ?? '';
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [challengeSounds, setChallengeSounds] = useState([]);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [loadingSounds, setLoadingSounds] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [sound, setSound] = useState(null);

  // 🆕 STATI PER CREARE CHALLENGE
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChallengeTitle, setNewChallengeTitle] = useState('');
  const [newChallengeDescription, setNewChallengeDescription] = useState('');
  const [newChallengeEmoji, setNewChallengeEmoji] = useState('🎵');
  const [newChallengeDuration, setNewChallengeDuration] = useState('7'); // giorni
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadChallenges();
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  const loadChallenges = async () => {
    try {
      setLoading(true);
      const data = await getActiveChallenges();
      setChallenges(data);
    } catch (error) {
      console.error('Error loading challenges:', error);
      Alert.alert(t('common.error'), t('challenges.errors.cannotLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSelectedChallenge = async () => {
    if (!selectedChallenge) return;
    if (!uid) return;

    if (selectedChallenge.createdBy !== uid) return; // solo creatore

    try {
      await deleteChallenge(selectedChallenge.id);
      setShowChallengeModal(false);
      setSelectedChallenge(null);
      setChallengeSounds([]);
      await loadChallenges();
      Alert.alert('✅', 'Sfida rimossa. Puoi rifarla quando vuoi.');
    } catch (error: any) {
      console.error('Error deleting challenge:', error);
      Alert.alert(t('common.error'), error?.message || 'Impossibile rimuovere la sfida');
    }
  };

  const handleDeleteChallengeById = async (challengeId: string) => {
    if (!uid) return;
    const challenge = challenges.find((c: any) => c.id === challengeId);
    if (challenge && challenge.createdBy !== uid) return;

    try {
      await deleteChallenge(challengeId);
      setShowChallengeModal(false);
      setSelectedChallenge(null);
      setChallengeSounds([]);
      await loadChallenges();
      Alert.alert('✅', 'Sfida rimossa. Puoi rifarla quando vuoi.');
    } catch (error: any) {
      console.error('Error deleting challenge:', error);
      Alert.alert(t('common.error'), error?.message || 'Impossibile rimuovere la sfida');
    }
  };

  // 🆕 FUNZIONE PER CREARE CHALLENGE
  const handleCreateChallenge = async () => {
    if (!newChallengeTitle.trim()) {
      Alert.alert(t('common.error'), t('challenges.errors.titleRequired'));
      return;
    }

    if (!newChallengeDescription.trim()) {
      Alert.alert(t('common.error'), t('challenges.errors.descriptionRequired'));
      return;
    }

    setCreating(true);
    try {
      const durationDays = parseInt(newChallengeDuration) || 7;
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + durationDays);

      await createChallenge({
        title: newChallengeTitle.trim(),
        description: newChallengeDescription.trim(),
        emoji: newChallengeEmoji,
        endDate: endDate,
        creatorId: auth.currentUser.uid,
      });

      // Reset form
      setNewChallengeTitle('');
      setNewChallengeDescription('');
      setNewChallengeEmoji('🎵');
      setNewChallengeDuration('7');
      setShowCreateModal(false);

      // Ricarica challenges
      await loadChallenges();

      Alert.alert(t('challenges.created'), t('challenges.createdMsg'));
    } catch (error) {
      console.error('Error creating challenge:', error);
      Alert.alert(t('common.error'), t('challenges.errors.cannotCreate'));
    } finally {
      setCreating(false);
    }
  };

  const handleChallengePress = async (challenge) => {
    try {
      setSelectedChallenge(challenge);
      setShowChallengeModal(true);
      setLoadingSounds(true);

      const sounds = await getChallengeSounds(challenge.id);
      setChallengeSounds(sounds);
    } catch (error) {
      console.error('Error loading challenge sounds:', error);
      Alert.alert(t('common.error'), t('challenges.errors.cannotLoadSounds'));
    } finally {
      setLoadingSounds(false);
    }
  };

  const handlePlay = async (item) => {
    try {
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
        setPlayingId(null);
      }

      if (playingId === item.id) {
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: item.audioUrl },
        { shouldPlay: true }
      );

      setSound(newSound);
      setPlayingId(item.id);
      await incrementListens(item.id);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setPlayingId(null);
          newSound.unloadAsync();
        }
      });
    } catch (err) {
      console.error('Error playing sound:', err);
      Alert.alert(t('common.error'), t('challenges.errors.cannotPlay'));
    }
  };

  const handleVote = async (soundId) => {
    try {
      await voteForChallengeSound(soundId);
      
      const updatedSounds = challengeSounds.map(s => 
        s.id === soundId 
          ? { ...s, challengeVotes: (s.challengeVotes || 0) + 1 }
          : s
      );
      setChallengeSounds(updatedSounds);
      
      Alert.alert('✅', t('challenges.voteRegistered'));
    } catch (error) {
      console.error('Error voting:', error);
      Alert.alert(t('common.error'), t('challenges.errors.alreadyVoted'));
    }
  };

  const getTimeRemaining = (endDate) => {
    const now = new Date();
    const diff = endDate - now;

    if (diff <= 0) return t('challenges.ended');

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return t('challenges.daysHours', { days, hours });
    return t('challenges.hours', { hours });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#06b6d4" />
        <Text style={styles.loadingText}>{t('challenges.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('challenges.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('challenges.subtitle')}</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {challenges.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎵</Text>
            <Text style={styles.emptyText}>{t('challenges.noActive')}</Text>
            <Text style={styles.emptySubtext}>{t('challenges.noActiveHint')}</Text>
          </View>
        ) : (
          challenges.map(challenge => (
            <TouchableOpacity
              key={challenge.id}
              style={styles.challengeCard}
              onPress={() => handleChallengePress(challenge)}
            >
              <LinearGradient
                colors={['#0891b2', '#3b82f6']}
                style={styles.challengeGradient}
              >
                <View style={styles.challengeHeader}>
                  <Text style={styles.challengeEmoji}>{challenge.emoji}</Text>
                  <View style={styles.challengeTimer}>
                    <Text style={styles.timerText}>{t('challenges.endsIn', { time: getTimeRemaining(challenge.endDate) })}</Text>
                  </View>
                </View>

                <Text style={styles.challengeTitle}>{challenge.title}</Text>
                <Text style={styles.challengeDescription}>{challenge.description}</Text>

                <View style={styles.challengeStats}>
                  <View style={styles.stat}>
                    <Text style={styles.statIcon}>👥</Text>
                    <Text style={styles.statText}>{challenge.participants || 0}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statIcon}>🎵</Text>
                    <Text style={styles.statText}>{challenge.soundCount || 0}</Text>
                  </View>
                </View>

                <View style={styles.challengeButton}>
                  <Text style={styles.challengeButtonText}>{t('challenges.participate')}</Text>
                </View>

                {challenge.createdBy === uid && (
                  <TouchableOpacity
                    style={styles.removeChallengeButton}
                    onPress={(e: any) => {
                      // Evita che il tap apra il modal
                      e.stopPropagation?.();
                      Alert.alert(
                        'Rimuovi sfida',
                        'Vuoi rimuovere questa sfida? Così potrai rifarla e tutti potranno votare di nuovo.',
                        [
                          { text: 'Annulla', style: 'cancel' },
                          { text: 'Rimuovi', style: 'destructive', onPress: () => handleDeleteChallengeById(challenge.id) },
                        ]
                      );
                    }}
                  >
                    <Text style={styles.removeChallengeButtonText}>Rimuovi sfida</Text>
                  </TouchableOpacity>
                )}
              </LinearGradient>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* 🆕 FLOATING ACTION BUTTON PER CREARE CHALLENGE */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      >
        <Text style={styles.fabIcon}>➕</Text>
      </TouchableOpacity>

      {/* 🆕 MODAL PER CREARE CHALLENGE */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.createModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('challenges.createTitle')}</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.createForm}>
              {/* Emoji Selector */}
              <Text style={styles.label}>{t('challenges.chooseEmoji')}</Text>
              <View style={styles.emojiGrid}>
                {['🎵', '🎤', '🎧', '🎸', '🎹', '🥁', '🎺', '🎻', '🎼', '🔥', '⚡', '🌟', '💎', '🎭', '🎪', '🎨'].map(emoji => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.emojiOption,
                      newChallengeEmoji === emoji && styles.emojiOptionSelected
                    ]}
                    onPress={() => setNewChallengeEmoji(emoji)}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Title */}
              <Text style={styles.label}>{t('challenges.challengeTitle')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('challenges.challengeTitlePlaceholder')}
                placeholderTextColor="#94a3b8"
                value={newChallengeTitle}
                onChangeText={setNewChallengeTitle}
                maxLength={50}
              />
              <Text style={styles.charCount}>{newChallengeTitle.length}/50</Text>

              {/* Description */}
              <Text style={styles.label}>{t('challenges.description')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={t('challenges.descriptionPlaceholder')}
                placeholderTextColor="#94a3b8"
                value={newChallengeDescription}
                onChangeText={setNewChallengeDescription}
                multiline
                maxLength={200}
              />
              <Text style={styles.charCount}>{newChallengeDescription.length}/200</Text>

              {/* Duration */}
              <Text style={styles.label}>{t('challenges.duration')}</Text>
              <View style={styles.durationSelector}>
                {['3', '7', '14', '30'].map(days => (
                  <TouchableOpacity
                    key={days}
                    style={[
                      styles.durationOption,
                      newChallengeDuration === days && styles.durationOptionSelected
                    ]}
                    onPress={() => setNewChallengeDuration(days)}
                  >
                    <Text style={styles.durationText}>{days}g</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Create Button */}
              <TouchableOpacity
                style={[styles.createButton, creating && { opacity: 0.5 }]}
                onPress={handleCreateChallenge}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createButtonText}>{t('challenges.createButton')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Challenge Details Modal (esistente) */}
      <Modal
        visible={showChallengeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowChallengeModal(false);
          setSelectedChallenge(null);
          setChallengeSounds([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedChallenge && (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>
                      {selectedChallenge.emoji} {selectedChallenge.title}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      {t('challenges.endsIn', { time: getTimeRemaining(selectedChallenge.endDate) })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setShowChallengeModal(false);
                      setSelectedChallenge(null);
                      setChallengeSounds([]);
                    }}
                  >
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>

                  {selectedChallenge?.createdBy === uid && (
                    <TouchableOpacity
                      style={styles.modalRemoveButton}
                      onPress={() => {
                        Alert.alert(
                          'Rimuovi sfida',
                          'Vuoi rimuovere questa sfida? Così potrai rifarla e tutti potranno votare di nuovo.',
                          [
                            { text: 'Annulla', style: 'cancel' },
                            { text: 'Rimuovi', style: 'destructive', onPress: handleDeleteSelectedChallenge },
                          ]
                        );
                      }}
                    >
                      <Text style={styles.modalRemoveButtonText}>Rimuovi</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {loadingSounds ? (
                  <View style={styles.loadingModal}>
                    <ActivityIndicator size="large" color="#06b6d4" />
                  </View>
                ) : (
                  <>
                    {/* 🆕 BOTTONE PARTECIPA */}
                    <TouchableOpacity
                      style={styles.participateButton}
                      onPress={() => {
                        setShowChallengeModal(false);
                        Alert.alert(
                          t('challenges.howToParticipate'),
                          t('challenges.howToParticipateMsg'),
                          [{ text: t('common.ok') }]
                        );
                      }}
                    >
                      <Text style={styles.participateButtonText}>
                        {t('challenges.participateWithSound')}
                      </Text>
                    </TouchableOpacity>

                    <ScrollView style={styles.soundsList}>
                    {challengeSounds.length === 0 ? (
                      <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🎤</Text>
                        <Text style={styles.emptyText}>{t('challenges.noSounds')}</Text>
                        <Text style={styles.emptySubtext}>{t('challenges.noSoundsHint')}</Text>
                      </View>
                    ) : (
                      challengeSounds.map((soundItem, index) => (
                        <View key={soundItem.id} style={styles.soundItem}>
                          <View style={styles.rankBadge}>
                            <Text style={styles.rankText}>#{index + 1}</Text>
                          </View>

                          <View style={styles.soundInfo}>
                            <View style={styles.soundUser}>
                              <Text style={styles.userAvatar}>{soundItem.userAvatar}</Text>
                              <View>
                                <Text style={styles.soundTitle}>{soundItem.title}</Text>
                                <Text style={styles.username}>{soundItem.username}</Text>
                              </View>
                            </View>

                            <View style={styles.soundActions}>
                              <TouchableOpacity
                                style={styles.playButton}
                                onPress={() => handlePlay(soundItem)}
                              >
                                <Text style={styles.playIcon}>
                                  {playingId === soundItem.id ? '⏸' : '▶️'}
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.voteButton}
                                onPress={() => handleVote(soundItem.id)}
                              >
                                <Text style={styles.voteIcon}>👍</Text>
                                <Text style={styles.voteCount}>
                                  {soundItem.challengeVotes || 0}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      ))
                    )}
                  </ScrollView>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  challengeCard: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  challengeGradient: {
    padding: 20,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  challengeEmoji: {
    fontSize: 48,
  },
  challengeTimer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  timerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  challengeTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  challengeDescription: {
    fontSize: 14,
    color: '#e0f2fe',
    marginBottom: 16,
    lineHeight: 20,
  },
  challengeStats: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statIcon: {
    fontSize: 16,
  },
  statText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  challengeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  challengeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0891b2',
  },
  removeChallengeButton: {
    marginTop: 12,
    backgroundColor: 'rgba(255,59,48,0.15)',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.35)',
  },
  removeChallengeButtonText: {
    color: '#FF3B30',
    fontWeight: '800',
    fontSize: 14,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94a3b8',
  },
  
  // 🆕 FAB STYLES
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0891b2',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 32,
    color: '#fff',
  },

  // 🆕 CREATE MODAL STYLES
  createModalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    width: '100%',
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  createForm: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
    marginTop: 4,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emojiOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#334155',
  },
  emojiOptionSelected: {
    borderColor: '#06b6d4',
    backgroundColor: '#1e293b',
  },
  emojiText: {
    fontSize: 24,
  },
  durationSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  durationOption: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#334155',
  },
  durationOptionSelected: {
    borderColor: '#06b6d4',
    backgroundColor: '#1e293b',
  },
  durationText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  createButton: {
    backgroundColor: '#0891b2',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 20,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // EXISTING MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    width: '100%',
    height: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
  },
  modalClose: {
    fontSize: 28,
    color: '#94a3b8',
  },
  modalRemoveButton: {
    backgroundColor: 'rgba(255,59,48,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 10,
  },
  modalRemoveButtonText: {
    color: '#FF3B30',
    fontWeight: '900',
    fontSize: 12,
  },
  loadingModal: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  soundsList: {
    flex: 1,
    padding: 16,
  },
  soundItem: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    gap: 12,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0891b2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  soundInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  soundUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  userAvatar: {
    fontSize: 24,
  },
  soundTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  username: {
    fontSize: 12,
    color: '#94a3b8',
  },
  soundActions: {
    flexDirection: 'row',
    gap: 8,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0891b2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 14,
  },
  voteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  voteIcon: {
    fontSize: 16,
  },
  voteCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  // 🆕 PARTICIPATE BUTTON
  participateButton: {
    backgroundColor: '#0891b2',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#0891b2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  participateButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
});