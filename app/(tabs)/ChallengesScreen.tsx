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
import { C, T, S, R } from '../../constants/design';
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
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState<any | null>(null);
  const [challengeSounds, setChallengeSounds] = useState<any[]>([]);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [loadingSounds, setLoadingSounds] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

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
      sound?.unloadAsync().catch(() => {});
    };
  }, [sound]);

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
        creatorId: uid,
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

  const handleChallengePress = async (challenge: any) => {
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

  const handlePlay = async (item: any) => {
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
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          newSound.unloadAsync().catch(() => {});
        }
      });
    } catch (err) {
      console.error('Error playing sound:', err);
      Alert.alert(t('common.error'), t('challenges.errors.cannotPlay'));
    }
  };

  const handleVote = async (soundId: string) => {
    try {
      await voteForChallengeSound(soundId);
      
      const updatedSounds = challengeSounds.map((s: any) =>
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

  const getTimeRemaining = (endDate: Date) => {
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();

    if (diff <= 0) return t('challenges.ended');

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return t('challenges.daysHours', { days, hours });
    return t('challenges.hours', { hours });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={[C.bg, C.bgElevated, C.bg]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.loadingText}>{t('challenges.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[C.bgCanvas, C.bg, C.bgCanvas2]} style={StyleSheet.absoluteFill} />
      <View style={styles.ambientA} />
      <View style={styles.ambientB} />
      
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
                colors={['#003D25', '#001A10']}
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
                    <ActivityIndicator size="large" color={C.accent} />
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
  ambientA: {
    position: 'absolute',
    top: -10,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(0,255,156,0.08)',
  },
  ambientB: {
    position: 'absolute',
    top: 60,
    left: -20,
    width: 160,
    height: 160,
    borderRadius: 999,
    backgroundColor: 'rgba(99,214,255,0.06)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...T.body,
    color: C.textSecondary,
    marginTop: S.lg,
  },
  header: {
    padding: S.xl,
    paddingTop: 60,
    marginHorizontal: S.lg,
    marginTop: S.md,
    borderWidth: 1,
    borderColor: C.borderCanvas,
    borderRadius: R.xxl,
    backgroundColor: C.glassDark,
  },
  headerTitle: {
    ...T.displayM,
    color: C.textPrimary,
    marginBottom: S.xs,
  },
  headerSubtitle: {
    ...T.body,
    color: C.textSecondary,
  },
  scrollView: {
    flex: 1,
    padding: S.lg,
  },
  challengeCard: {
    marginBottom: S.lg,
    borderRadius: R.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.borderCanvas,
  },
  challengeGradient: {
    padding: S.xl,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: S.md,
  },
  challengeEmoji: {
    fontSize: 48,
  },
  challengeTimer: {
    backgroundColor: C.accentDim,
    paddingHorizontal: S.md,
    paddingVertical: 6,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: C.borderAccent,
  },
  timerText: {
    ...T.labelS,
    color: C.accent,
    fontWeight: '700',
  },
  challengeTitle: {
    ...T.displayM,
    color: C.textPrimary,
    marginBottom: S.sm,
  },
  challengeDescription: {
    ...T.body,
    color: C.textSecondary,
    marginBottom: S.lg,
  },
  challengeStats: {
    flexDirection: 'row',
    gap: S.xl,
    marginBottom: S.lg,
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
    ...T.h3,
    color: C.textPrimary,
  },
  challengeButton: {
    backgroundColor: '#00FF9C',
    paddingVertical: 14,
    borderRadius: R.sm,
    alignItems: 'center',
  },
  challengeButtonText: {
    ...T.body,
    fontWeight: '700',
    color: C.textOnAccent,
  },
  removeChallengeButton: {
    marginTop: S.md,
    backgroundColor: 'rgba(255,59,48,0.12)',
    paddingVertical: 10,
    borderRadius: R.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.3)',
  },
  removeChallengeButtonText: {
    color: C.error,
    fontWeight: '800',
    fontSize: 14,
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
    ...T.h2,
    color: C.textPrimary,
    marginBottom: S.sm,
  },
  emptySubtext: {
    ...T.body,
    color: C.textSecondary,
  },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: R.full,
    backgroundColor: '#00FF9C',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00FF9C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 32,
    color: C.textOnAccent,
  },

  createModalContent: {
    backgroundColor: C.bgCard,
    borderRadius: R.xxl,
    width: '100%',
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  createForm: {
    padding: S.xl,
  },
  label: {
    ...T.label,
    color: C.textSecondary,
    marginBottom: S.sm,
    marginTop: S.lg,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: C.bg,
    borderRadius: R.sm,
    padding: S.md,
    color: C.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    ...T.mono,
    color: C.textMuted,
    textAlign: 'right',
    marginTop: S.xs,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: S.sm,
  },
  emojiOption: {
    width: 50,
    height: 50,
    borderRadius: R.full,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: C.border,
  },
  emojiOptionSelected: {
    borderColor: C.accent,
    backgroundColor: C.accentDim,
  },
  emojiText: {
    fontSize: 24,
  },
  durationSelector: {
    flexDirection: 'row',
    gap: S.sm,
  },
  durationOption: {
    flex: 1,
    backgroundColor: C.bg,
    paddingVertical: S.md,
    borderRadius: R.sm,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: C.border,
  },
  durationOptionSelected: {
    borderColor: C.accent,
    backgroundColor: C.accentDim,
  },
  durationText: {
    ...T.body,
    fontWeight: '700',
    color: C.textPrimary,
  },
  createButton: {
    backgroundColor: C.accent,
    paddingVertical: S.lg,
    borderRadius: R.sm,
    alignItems: 'center',
    marginTop: S.xxl,
    marginBottom: S.xl,
  },
  createButtonText: {
    ...T.body,
    fontWeight: '700',
    color: C.textOnAccent,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: C.bgOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: S.lg,
  },
  modalContent: {
    backgroundColor: C.bgCard,
    borderRadius: R.xxl,
    width: '100%',
    height: '85%',
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: S.xl,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalTitle: {
    ...T.h1,
    color: C.textPrimary,
    marginBottom: S.xs,
  },
  modalSubtitle: {
    ...T.bodyS,
    color: C.textSecondary,
  },
  modalClose: {
    fontSize: 28,
    color: C.textSecondary,
  },
  modalRemoveButton: {
    backgroundColor: 'rgba(255,59,48,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.3)',
    borderRadius: R.sm,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    marginLeft: 10,
  },
  modalRemoveButtonText: {
    color: C.error,
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
    padding: S.lg,
  },
  soundItem: {
    backgroundColor: C.bg,
    borderRadius: R.lg,
    padding: S.lg,
    marginBottom: S.md,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    gap: S.md,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: R.full,
    backgroundColor: C.accentDim,
    borderWidth: 1,
    borderColor: C.borderAccent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    ...T.labelL,
    color: C.accent,
    fontWeight: '800',
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
    ...T.h4,
    color: C.textPrimary,
    marginBottom: 2,
  },
  username: {
    ...T.label,
    color: C.textSecondary,
  },
  soundActions: {
    flexDirection: 'row',
    gap: S.sm,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: R.full,
    backgroundColor: C.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 14,
  },
  voteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.xs,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    borderRadius: R.full,
  },
  voteIcon: {
    fontSize: 16,
  },
  voteCount: {
    ...T.body,
    fontWeight: '700',
    color: C.textPrimary,
  },

  participateButton: {
    backgroundColor: C.accent,
    marginHorizontal: S.lg,
    marginTop: S.lg,
    marginBottom: S.sm,
    paddingVertical: S.lg,
    borderRadius: R.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: S.sm,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  participateButtonText: {
    ...T.body,
    fontWeight: '800',
    color: C.textOnAccent,
  },
});
