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
  createChallenge,
  deleteChallenge,
  getUserSounds,
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

  // Stati per creare challenge
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChallengeTitle, setNewChallengeTitle] = useState('');
  const [newChallengeDescription, setNewChallengeDescription] = useState('');
  const [newChallengeEmoji, setNewChallengeEmoji] = useState('🎵');
  const [newChallengeDuration, setNewChallengeDuration] = useState('7');
  const [creating, setCreating] = useState(false);

  // Stati per selezionare il sound da inviare alla challenge
  const [showSoundPickerModal, setShowSoundPickerModal] = useState(false);
  const [userSounds, setUserSounds] = useState<any[]>([]);
  const [loadingUserSounds, setLoadingUserSounds] = useState(false);
  const [submittingChallenge, setSubmittingChallenge] = useState(false);

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

  const handleParticipate = async () => {
    if (!uid) return;
    // iOS non supporta Modal annidati: chiudiamo prima il modal della challenge
    setShowChallengeModal(false);
    // Piccolo delay per permettere ad iOS di chiudere il primo modal
    await new Promise(resolve => setTimeout(resolve, 350));
    setLoadingUserSounds(true);
    setShowSoundPickerModal(true);
    try {
      const sounds = await getUserSounds(uid);
      setUserSounds(sounds.filter((s: any) => !s.challengeId));
    } catch {
      Alert.alert(t('common.error'), 'Impossibile caricare i tuoi sound.');
      setShowSoundPickerModal(false);
      setShowChallengeModal(true);
    } finally {
      setLoadingUserSounds(false);
    }
  };

  const handleSubmitSound = async (soundId: string) => {
    if (!selectedChallenge || submittingChallenge) return;
    setSubmittingChallenge(true);
    try {
      await joinChallenge(selectedChallenge.id, soundId);
      setShowSoundPickerModal(false);
      Alert.alert('🎵', 'Sound inviato alla sfida!');
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'Errore durante la partecipazione.');
    } finally {
      setSubmittingChallenge(false);
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
        <LinearGradient colors={['#050816', '#0B1230', '#180828']} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingAuraA} />
        <View style={styles.loadingAuraB} />
        <View style={styles.loadingPanel}>
          <Text style={styles.loadingEyebrow}>Sound challenges</Text>
          <ActivityIndicator size="large" color="#67E8F9" />
          <Text style={styles.loadingText}>{t('challenges.loading')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[C.bgCanvas, C.bg, C.bgCanvas2]} style={StyleSheet.absoluteFill} />
      <View style={styles.ambientA} />
      <View style={styles.ambientB} />
      
      {/* Header */}
      <LinearGradient colors={['rgba(17,22,45,0.96)', 'rgba(10,14,28,0.96)']} style={styles.header}>
        <View style={styles.headerGlow} />
        <Text style={styles.headerEyebrow}>Competitive audio</Text>
        <Text style={styles.headerTitle}>{t('challenges.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('challenges.subtitle')}</Text>
      </LinearGradient>

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
                colors={['rgba(17,22,45,0.98)', 'rgba(10,14,28,0.98)']}
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

      {/* Modal selezione sound per partecipare */}
      <Modal
        visible={showSoundPickerModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSoundPickerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Scegli un sound</Text>
              <TouchableOpacity onPress={() => setShowSoundPickerModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingUserSounds ? (
              <View style={styles.loadingModal}>
                <ActivityIndicator size="large" color={C.accent} />
              </View>
            ) : userSounds.length === 0 ? (
              <View style={[styles.emptyState, { flex: 1 }]}>
                <Text style={styles.emptyIcon}>🎤</Text>
                <Text style={styles.emptyText}>Nessun sound disponibile</Text>
                <Text style={styles.emptySubtext}>
                  Registra un sound dalla home e torna qui per partecipare.
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.soundsList}>
                {userSounds.map((s: any) => (
                  <View key={s.id} style={styles.soundItem}>
                    <View style={styles.soundInfo}>
                      <View style={styles.soundUser}>
                        <Text style={styles.userAvatar}>{s.mood || '🎵'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.soundTitle} numberOfLines={1}>{s.title || 'Sound'}</Text>
                          <Text style={styles.username}>
                            {s.duration ? `${Math.floor(s.duration)}s` : ''}
                            {s.mood ? `  ·  ${s.mood}` : ''}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.voteButton, submittingChallenge && { opacity: 0.5 }]}
                        onPress={() => handleSubmitSound(s.id)}
                        disabled={submittingChallenge}
                      >
                        {submittingChallenge ? (
                          <ActivityIndicator size="small" color={C.accent} />
                        ) : (
                          <Text style={[styles.voteCount, { fontSize: 12 }]}>Invia</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
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
                    <TouchableOpacity
                      style={styles.participateButton}
                      onPress={handleParticipate}
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
  loadingAuraA: {
    position: 'absolute',
    right: -80,
    top: 90,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(103,232,249,0.08)',
  },
  loadingAuraB: {
    position: 'absolute',
    left: -70,
    bottom: 100,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(139,92,255,0.08)',
  },
  loadingPanel: {
    alignItems: 'center',
    gap: 14,
    minWidth: 220,
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.14)',
    backgroundColor: 'rgba(9,12,28,0.84)',
  },
  loadingEyebrow: {
    color: '#67E8F9',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  loadingText: {
    ...T.body,
    color: '#F7F8FF',
    fontWeight: '700',
  },
  header: {
    padding: S.xl,
    paddingTop: 18,
    marginHorizontal: S.lg,
    marginTop: S.md,
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.14)',
    borderRadius: R.xl,
    backgroundColor: 'rgba(17,22,45,0.96)',
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute',
    right: -18,
    top: -20,
    width: 150,
    height: 150,
    borderRadius: 999,
    backgroundColor: 'rgba(139,92,255,0.12)',
  },
  headerEyebrow: {
    color: '#67E8F9',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
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
    padding: S.md,
  },
  challengeCard: {
    marginBottom: S.md,
    borderRadius: R.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.14)',
  },
  challengeGradient: {
    padding: S.lg,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: S.md,
  },
  challengeEmoji: {
    fontSize: 38,
  },
  challengeTimer: {
    backgroundColor: 'rgba(103,232,249,0.12)',
    paddingHorizontal: S.md,
    paddingVertical: 6,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.24)',
  },
  timerText: {
    ...T.labelS,
    color: '#67E8F9',
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
    marginBottom: S.md,
  },
  challengeStats: {
    flexDirection: 'row',
    gap: S.xl,
    marginBottom: S.md,
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
    backgroundColor: '#8B5CFF',
    paddingVertical: 12,
    borderRadius: R.sm,
    alignItems: 'center',
  },
  challengeButtonText: {
    ...T.body,
    fontWeight: '700',
    color: '#fff',
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
    width: 56,
    height: 56,
    borderRadius: R.full,
    backgroundColor: '#67E8F9',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#67E8F9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 26,
    color: '#07110B',
  },

  createModalContent: {
    backgroundColor: 'rgba(9,12,28,0.98)',
    borderRadius: R.xxl,
    width: '100%',
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.14)',
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
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: R.sm,
    padding: S.md,
    color: C.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.14)',
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
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(163,177,255,0.14)',
  },
  emojiOptionSelected: {
    borderColor: '#67E8F9',
    backgroundColor: 'rgba(103,232,249,0.12)',
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
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: S.md,
    borderRadius: R.sm,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(163,177,255,0.14)',
  },
  durationOptionSelected: {
    borderColor: '#67E8F9',
    backgroundColor: 'rgba(103,232,249,0.12)',
  },
  durationText: {
    ...T.body,
    fontWeight: '700',
    color: C.textPrimary,
  },
  createButton: {
    backgroundColor: '#8B5CFF',
    paddingVertical: S.lg,
    borderRadius: R.sm,
    alignItems: 'center',
    marginTop: S.xxl,
    marginBottom: S.xl,
  },
  createButtonText: {
    ...T.body,
    fontWeight: '700',
    color: '#fff',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: C.bgOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: S.lg,
  },
  modalContent: {
    backgroundColor: 'rgba(9,12,28,0.98)',
    borderRadius: R.xxl,
    width: '100%',
    height: '85%',
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.14)',
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
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: R.lg,
    padding: S.lg,
    marginBottom: S.md,
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.14)',
    flexDirection: 'row',
    gap: S.md,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: R.full,
    backgroundColor: 'rgba(103,232,249,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.24)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    ...T.labelL,
    color: '#67E8F9',
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
    backgroundColor: '#8B5CFF',
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
    borderColor: 'rgba(163,177,255,0.14)',
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
    backgroundColor: '#8B5CFF',
    marginHorizontal: S.lg,
    marginTop: S.lg,
    marginBottom: S.sm,
    paddingVertical: S.lg,
    borderRadius: R.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: S.sm,
    shadowColor: '#8B5CFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  participateButtonText: {
    ...T.body,
    fontWeight: '800',
    color: '#fff',
  },
});
