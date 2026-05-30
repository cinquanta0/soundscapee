// app/(tabs)/ChallengesScreen.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { auth } from '../../firebaseConfig';
import { C, T, S, R } from '../../constants/design';
import { useTheme } from '../../context/ThemeContext';
import {
  getActiveChallenges,
  listenChallengeSounds,
  joinChallenge,
  voteForChallengeSound,
  getMyVoteInChallenge,
  incrementListens,
  createChallenge,
  deleteChallenge,
  getAvailableSoundsForChallenge,
} from '../../services/firebaseService';

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'] as const;
const RANK_BG = ['rgba(255,215,0,0.15)', 'rgba(192,192,192,0.12)', 'rgba(205,127,50,0.12)'] as const;

export default function ChallengesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const uid = auth.currentUser?.uid ?? '';
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState<any | null>(null);
  const [challengeSounds, setChallengeSounds] = useState<any[]>([]);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [loadingSounds, setLoadingSounds] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [votedSoundId, setVotedSoundId] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const challengeSoundsUnsub = useRef<(() => void) | null>(null);

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
  }, []);

  useEffect(() => {
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
    if (selectedChallenge.createdBy !== uid) return;

    try {
      await deleteChallenge(selectedChallenge.id);
      closeChallengeModal();
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
      closeChallengeModal();
      await loadChallenges();
      Alert.alert('✅', 'Sfida rimossa. Puoi rifarla quando vuoi.');
    } catch (error: any) {
      console.error('Error deleting challenge:', error);
      Alert.alert(t('common.error'), error?.message || 'Impossibile rimuovere la sfida');
    }
  };

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

      setNewChallengeTitle('');
      setNewChallengeDescription('');
      setNewChallengeEmoji('🎵');
      setNewChallengeDuration('7');
      setShowCreateModal(false);
      await loadChallenges();
      Alert.alert(t('challenges.created'), t('challenges.createdMsg'));
    } catch (error) {
      console.error('Error creating challenge:', error);
      Alert.alert(t('common.error'), t('challenges.errors.cannotCreate'));
    } finally {
      setCreating(false);
    }
  };

  const closeChallengeModal = () => {
    challengeSoundsUnsub.current?.();
    challengeSoundsUnsub.current = null;
    setShowChallengeModal(false);
    setSelectedChallenge(null);
    setChallengeSounds([]);
    setVotedSoundId(null);
  };

  const handleChallengePress = async (challenge: any) => {
    // Chiudi eventuale listener precedente
    challengeSoundsUnsub.current?.();
    challengeSoundsUnsub.current = null;

    setSelectedChallenge(challenge);
    setShowChallengeModal(true);
    setLoadingSounds(true);
    setVotedSoundId(null);
    setChallengeSounds([]);

    try {
      const myVote = await getMyVoteInChallenge(challenge.id);
      setVotedSoundId(myVote);
    } catch {
      // non bloccante
    }

    let firstLoad = true;
    challengeSoundsUnsub.current = listenChallengeSounds(challenge.id, (sounds: any[]) => {
      setChallengeSounds(sounds);
      if (firstLoad) {
        firstLoad = false;
        setLoadingSounds(false);
      }
    });
  };

  const handleParticipate = async () => {
    if (!uid) return;
    // iOS non supporta Modal annidati: chiudi prima il modal challenge
    setShowChallengeModal(false);
    await new Promise(resolve => setTimeout(resolve, 350));
    setLoadingUserSounds(true);
    setShowSoundPickerModal(true);
    try {
      const sounds = await getAvailableSoundsForChallenge(uid);
      setUserSounds(sounds);
    } catch {
      Alert.alert(t('common.error'), 'Impossibile caricare i tuoi sound.');
      setShowSoundPickerModal(false);
      setShowChallengeModal(true);
    } finally {
      setLoadingUserSounds(false);
    }
  };

  const handleCloseSoundPicker = () => {
    setShowSoundPickerModal(false);
    // Riapri il modal challenge (il listener è ancora attivo)
    setTimeout(() => setShowChallengeModal(true), 350);
  };

  const handleSubmitSound = async (soundId: string) => {
    if (!selectedChallenge || submittingChallenge) return;
    setSubmittingChallenge(true);
    try {
      await joinChallenge(selectedChallenge.id, soundId);
      setShowSoundPickerModal(false);
      Alert.alert('🎵', 'Sound inviato alla sfida!');
      setTimeout(() => setShowChallengeModal(true), 350);
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

      if (playingId === item.id) return;

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
      incrementListens(item.id).catch(() => {}); // fire-and-forget, no await

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
    if (!selectedChallenge || voting) return;
    if (votedSoundId) {
      Alert.alert('', 'Hai già votato in questa sfida.');
      return;
    }
    setVoting(true);
    try {
      await voteForChallengeSound(soundId, selectedChallenge.id);
      setVotedSoundId(soundId); // onSnapshot aggiornerà il conteggio automaticamente
      Alert.alert('✅', t('challenges.voteRegistered'));
    } catch (error: any) {
      console.error('Error voting:', error);
      Alert.alert(t('common.error'), error?.message || t('challenges.errors.alreadyVoted'));
    } finally {
      setVoting(false);
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
      <View style={s.loadingContainer}>
        <LinearGradient colors={colors.gradientBgAlt} style={StyleSheet.absoluteFill} />
        <View style={s.loadingAuraA} />
        <View style={s.loadingAuraB} />
        <View style={s.loadingPanel}>
          <Text style={s.loadingEyebrow}>Sound challenges</Text>
          <ActivityIndicator size="large" color="#67E8F9" />
          <Text style={s.loadingText}>{t('challenges.loading')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />
      <View style={s.ambientA} />
      <View style={s.ambientB} />

      {/* Header */}
      <LinearGradient colors={colors.gradientCard} style={s.header}>
        <View style={s.headerGlow} />
        <Text style={s.headerEyebrow}>Competitive audio</Text>
        <Text style={s.headerTitle}>{t('challenges.title')}</Text>
        <Text style={s.headerSubtitle}>{t('challenges.subtitle')}</Text>
      </LinearGradient>

      <ScrollView style={s.scrollView} showsVerticalScrollIndicator={false}>
        {challenges.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🎵</Text>
            <Text style={s.emptyText}>{t('challenges.noActive')}</Text>
            <Text style={s.emptySubtext}>{t('challenges.noActiveHint')}</Text>
          </View>
        ) : (
          challenges.map(challenge => (
            <TouchableOpacity
              key={challenge.id}
              style={s.challengeCard}
              onPress={() => handleChallengePress(challenge)}
            >
              <LinearGradient
                colors={colors.gradientCard}
                style={s.challengeGradient}
              >
                <View style={s.challengeHeader}>
                  <Text style={s.challengeEmoji}>{challenge.emoji}</Text>
                  <View style={s.challengeTimer}>
                    <Feather name="clock" size={11} color="#67E8F9" style={{ marginRight: 4 }} />
                    <Text style={s.timerText}>{getTimeRemaining(challenge.endDate)}</Text>
                  </View>
                </View>

                <Text style={s.challengeTitle}>{challenge.title}</Text>
                <Text style={s.challengeDescription}>{challenge.description}</Text>

                <View style={s.challengeStats}>
                  <View style={s.stat}>
                    <Feather name="users" size={14} color="#94a3b8" />
                    <Text style={s.statText}>{challenge.participants || 0}</Text>
                  </View>
                  <View style={s.stat}>
                    <Feather name="music" size={14} color="#94a3b8" />
                    <Text style={s.statText}>{challenge.soundCount || 0} sound</Text>
                  </View>
                </View>

                <View style={s.challengeButton}>
                  <Feather name="award" size={14} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={s.challengeButtonText}>{t('challenges.participate')}</Text>
                </View>

                {challenge.createdBy === uid && (
                  <TouchableOpacity
                    style={s.removeChallengeButton}
                    onPress={(e: any) => {
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
                    <Feather name="trash-2" size={13} color={C.error} style={{ marginRight: 6 }} />
                    <Text style={s.removeChallengeButtonText}>Rimuovi sfida</Text>
                  </TouchableOpacity>
                )}
              </LinearGradient>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* FAB per creare challenge */}
      <TouchableOpacity style={s.fab} onPress={() => setShowCreateModal(true)}>
        <Feather name="plus" size={24} color="#07110B" />
      </TouchableOpacity>

      {/* Modal crea challenge */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.createModalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t('challenges.createTitle')}</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Feather name="x" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={s.createForm}>
              <Text style={s.label}>{t('challenges.chooseEmoji')}</Text>
              <View style={s.emojiGrid}>
                {['🎵', '🎤', '🎧', '🎸', '🎹', '🥁', '🎺', '🎻', '🎼', '🔥', '⚡', '🌟', '💎', '🎭', '🎪', '🎨'].map(emoji => (
                  <TouchableOpacity
                    key={emoji}
                    style={[s.emojiOption, newChallengeEmoji === emoji && s.emojiOptionSelected]}
                    onPress={() => setNewChallengeEmoji(emoji)}
                  >
                    <Text style={s.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>{t('challenges.challengeTitle')}</Text>
              <TextInput
                style={s.input}
                placeholder={t('challenges.challengeTitlePlaceholder')}
                placeholderTextColor="#94a3b8"
                value={newChallengeTitle}
                onChangeText={setNewChallengeTitle}
                maxLength={50}
              />
              <Text style={s.charCount}>{newChallengeTitle.length}/50</Text>

              <Text style={s.label}>{t('challenges.description')}</Text>
              <TextInput
                style={[s.input, s.textArea]}
                placeholder={t('challenges.descriptionPlaceholder')}
                placeholderTextColor="#94a3b8"
                value={newChallengeDescription}
                onChangeText={setNewChallengeDescription}
                multiline
                maxLength={200}
              />
              <Text style={s.charCount}>{newChallengeDescription.length}/200</Text>

              <Text style={s.label}>{t('challenges.duration')}</Text>
              <View style={s.durationSelector}>
                {['3', '7', '14', '30'].map(days => (
                  <TouchableOpacity
                    key={days}
                    style={[s.durationOption, newChallengeDuration === days && s.durationOptionSelected]}
                    onPress={() => setNewChallengeDuration(days)}
                  >
                    <Text style={s.durationText}>{days}g</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[s.createButton, creating && { opacity: 0.5 }]}
                onPress={handleCreateChallenge}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="zap" size={16} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={s.createButtonText}>{t('challenges.createButton')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal selezione sound */}
      <Modal
        visible={showSoundPickerModal}
        animationType="slide"
        transparent
        onRequestClose={handleCloseSoundPicker}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Scegli un sound</Text>
              <TouchableOpacity onPress={handleCloseSoundPicker}>
                <Feather name="x" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {loadingUserSounds ? (
              <View style={s.loadingModal}>
                <ActivityIndicator size="large" color={C.accent} />
              </View>
            ) : userSounds.length === 0 ? (
              <View style={[s.emptyState, { flex: 1 }]}>
                <Feather name="mic" size={48} color={colors.textMuted} style={{ marginBottom: S.lg }} />
                <Text style={s.emptyText}>Nessun sound disponibile</Text>
                <Text style={s.emptySubtext}>Registra un sound dalla home e torna qui per partecipare.</Text>
              </View>
            ) : (
              <ScrollView style={s.soundsList}>
                {userSounds.map((s: any) => (
                  <View key={s.id} style={s.soundItem}>
                    <View style={s.soundInfo}>
                      <View style={s.soundUser}>
                        <Text style={s.userAvatar}>{s.mood || '🎵'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.soundTitle} numberOfLines={1}>{s.title || 'Sound'}</Text>
                          <Text style={s.username}>
                            {s.duration ? `${Math.floor(s.duration)}s` : ''}
                            {s.mood ? `  ·  ${s.mood}` : ''}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[s.submitButton, submittingChallenge && { opacity: 0.5 }]}
                        onPress={() => handleSubmitSound(s.id)}
                        disabled={submittingChallenge}
                      >
                        {submittingChallenge ? (
                          <ActivityIndicator size="small" color={C.accent} />
                        ) : (
                          <>
                            <Feather name="send" size={13} color="#fff" style={{ marginRight: 4 }} />
                            <Text style={s.submitButtonText}>Invia</Text>
                          </>
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

      {/* Challenge Details Modal */}
      <Modal
        visible={showChallengeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeChallengeModal}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            {selectedChallenge && (
              <>
                <View style={s.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.modalTitle}>
                      {selectedChallenge.emoji} {selectedChallenge.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Feather name="clock" size={11} color={colors.textSecondary} />
                      <Text style={s.modalSubtitle}>
                        {getTimeRemaining(selectedChallenge.endDate)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {selectedChallenge?.createdBy === uid && (
                      <TouchableOpacity
                        style={s.modalRemoveButton}
                        onPress={() => {
                          Alert.alert(
                            'Rimuovi sfida',
                            'Vuoi rimuovere questa sfida?',
                            [
                              { text: 'Annulla', style: 'cancel' },
                              { text: 'Rimuovi', style: 'destructive', onPress: handleDeleteSelectedChallenge },
                            ]
                          );
                        }}
                      >
                        <Feather name="trash-2" size={14} color={C.error} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={closeChallengeModal}
                    >
                      <Feather name="x" size={24} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Banner voto già espresso */}
                {votedSoundId && (
                  <View style={s.votedBanner}>
                    <Feather name="check-circle" size={14} color="#00FF9C" style={{ marginRight: 6 }} />
                    <Text style={s.votedBannerText}>
                      Hai già votato in questa sfida
                    </Text>
                  </View>
                )}

                {loadingSounds ? (
                  <View style={s.loadingModal}>
                    <ActivityIndicator size="large" color={C.accent} />
                  </View>
                ) : (
                  <>
                    <TouchableOpacity style={s.participateButton} onPress={handleParticipate}>
                      <Feather name="mic" size={16} color="#fff" />
                      <Text style={s.participateButtonText}>
                        {t('challenges.participateWithSound')}
                      </Text>
                    </TouchableOpacity>

                    <ScrollView style={s.soundsList}>
                      {challengeSounds.length === 0 ? (
                        <View style={s.emptyState}>
                          <Feather name="mic-off" size={48} color={colors.textMuted} style={{ marginBottom: S.lg }} />
                          <Text style={s.emptyText}>{t('challenges.noSounds')}</Text>
                          <Text style={s.emptySubtext}>{t('challenges.noSoundsHint')}</Text>
                        </View>
                      ) : (
                        challengeSounds.map((soundItem, index) => {
                          const isTop3 = index < 3;
                          const rankColor = isTop3 ? RANK_COLORS[index] : '#67E8F9';
                          const rankBg = isTop3 ? RANK_BG[index] : 'rgba(103,232,249,0.12)';
                          const isPlaying = playingId === soundItem.id;
                          const isMine = soundItem.userId === uid;
                          const isVoted = votedSoundId === soundItem.id;
                          const hasVotedOther = votedSoundId !== null && !isVoted;

                          return (
                            <View
                              key={soundItem.id}
                              style={[
                                s.soundItem,
                                isVoted && s.soundItemVoted,
                              ]}
                            >
                              <View style={[s.rankBadge, { backgroundColor: rankBg, borderColor: rankColor }]}>
                                {index === 0 ? (
                                  <Feather name="award" size={16} color={rankColor} />
                                ) : (
                                  <Text style={[s.rankText, { color: rankColor }]}>#{index + 1}</Text>
                                )}
                              </View>

                              <View style={s.soundInfo}>
                                <View style={s.soundUser}>
                                  <Text style={s.userAvatar}>{soundItem.userAvatar}</Text>
                                  <View style={{ flex: 1 }}>
                                    <Text style={s.soundTitle} numberOfLines={1}>{soundItem.title}</Text>
                                    <Text style={s.username}>{soundItem.username}</Text>
                                  </View>
                                </View>

                                <View style={s.soundActions}>
                                  <TouchableOpacity
                                    style={[s.playButton, isPlaying && s.playButtonActive]}
                                    onPress={() => handlePlay(soundItem)}
                                  >
                                    <Feather
                                      name={isPlaying ? 'pause' : 'play'}
                                      size={15}
                                      color="#fff"
                                    />
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    style={[
                                      s.voteButton,
                                      isVoted && s.voteButtonVoted,
                                      (hasVotedOther || isMine) && s.voteButtonDisabled,
                                    ]}
                                    onPress={() => handleVote(soundItem.id)}
                                    disabled={voting || hasVotedOther || isMine}
                                  >
                                    {voting && !votedSoundId ? (
                                      <ActivityIndicator size="small" color={C.accent} />
                                    ) : (
                                      <>
                                        <Feather
                                          name={isMine ? 'user' : 'thumbs-up'}
                                          size={14}
                                          color={isVoted ? '#00FF9C' : (hasVotedOther || isMine) ? colors.textMuted : colors.text}
                                        />
                                        <Text style={[
                                          s.voteCount,
                                          isVoted && { color: '#00FF9C' },
                                          (hasVotedOther || isMine) && { color: colors.textMuted },
                                        ]}>
                                          {soundItem.challengeVotes || 0}
                                        </Text>
                                      </>
                                    )}
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          );
                        })
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

function createStyles(colors: import('../../constants/themes').ThemeColors) {
  return StyleSheet.create({
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
      borderColor: colors.border,
      backgroundColor: colors.bgCard,
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
      color: colors.text,
      fontWeight: '700',
    },
    header: {
      padding: S.xl,
      paddingTop: 18,
      marginHorizontal: S.lg,
      marginTop: S.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: R.xl,
      backgroundColor: colors.bgCard,
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
      color: colors.text,
      marginBottom: S.xs,
    },
    headerSubtitle: {
      ...T.body,
      color: colors.textSecondary,
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
      borderColor: colors.border,
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
      flexDirection: 'row',
      alignItems: 'center',
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
      color: colors.text,
      marginBottom: S.sm,
    },
    challengeDescription: {
      ...T.body,
      color: colors.textSecondary,
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
    statText: {
      ...T.h3,
      color: colors.text,
    },
    challengeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#8B5CFF',
      paddingVertical: 12,
      borderRadius: R.sm,
    },
    challengeButtonText: {
      ...T.body,
      fontWeight: '700',
      color: '#fff',
    },
    removeChallengeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: S.md,
      backgroundColor: 'rgba(255,59,48,0.12)',
      paddingVertical: 10,
      borderRadius: R.sm,
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
      color: colors.text,
      marginBottom: S.sm,
      textAlign: 'center',
    },
    emptySubtext: {
      ...T.body,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: S.lg,
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
    createModalContent: {
      backgroundColor: colors.bgCard,
      borderRadius: R.xxl,
      width: '100%',
      maxHeight: '90%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    createForm: {
      padding: S.xl,
    },
    label: {
      ...T.label,
      color: colors.textSecondary,
      marginBottom: S.sm,
      marginTop: S.lg,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    input: {
      backgroundColor: colors.bgInput,
      borderRadius: R.sm,
      padding: S.md,
      color: colors.text,
      fontSize: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    textArea: {
      height: 100,
      textAlignVertical: 'top',
    },
    charCount: {
      ...T.mono,
      color: colors.textMuted,
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
      backgroundColor: colors.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.border,
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
      backgroundColor: colors.surfaceLight,
      paddingVertical: S.md,
      borderRadius: R.sm,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.border,
    },
    durationOptionSelected: {
      borderColor: '#67E8F9',
      backgroundColor: 'rgba(103,232,249,0.12)',
    },
    durationText: {
      ...T.body,
      fontWeight: '700',
      color: colors.text,
    },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#8B5CFF',
      paddingVertical: S.lg,
      borderRadius: R.sm,
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
      backgroundColor: colors.bgOverlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: S.lg,
    },
    modalContent: {
      backgroundColor: colors.bgCard,
      borderRadius: R.xxl,
      width: '100%',
      height: '85%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: S.xl,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      ...T.h1,
      color: colors.text,
      marginBottom: S.xs,
    },
    modalSubtitle: {
      ...T.bodyS,
      color: colors.textSecondary,
    },
    modalRemoveButton: {
      backgroundColor: 'rgba(255,59,48,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,59,48,0.3)',
      borderRadius: R.sm,
      padding: S.sm,
    },
    votedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0,255,156,0.08)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,255,156,0.15)',
      paddingHorizontal: S.xl,
      paddingVertical: S.sm,
    },
    votedBannerText: {
      ...T.labelS,
      color: '#00FF9C',
      fontWeight: '700',
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
      backgroundColor: colors.surfaceLight,
      borderRadius: R.lg,
      padding: S.lg,
      marginBottom: S.md,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      gap: S.md,
      alignItems: 'center',
    },
    soundItemVoted: {
      borderColor: 'rgba(0,255,156,0.3)',
      backgroundColor: 'rgba(0,255,156,0.05)',
    },
    rankBadge: {
      width: 40,
      height: 40,
      borderRadius: R.full,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    rankText: {
      ...T.labelL,
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
      marginRight: S.sm,
    },
    userAvatar: {
      fontSize: 24,
    },
    soundTitle: {
      ...T.h4,
      color: colors.text,
      marginBottom: 2,
    },
    username: {
      ...T.label,
      color: colors.textSecondary,
    },
    soundActions: {
      flexDirection: 'row',
      gap: S.sm,
      alignItems: 'center',
    },
    playButton: {
      width: 36,
      height: 36,
      borderRadius: R.full,
      backgroundColor: '#8B5CFF',
      justifyContent: 'center',
      alignItems: 'center',
    },
    playButtonActive: {
      backgroundColor: '#6B3CDF',
    },
    voteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: S.md,
      paddingVertical: S.sm,
      borderRadius: R.full,
      minWidth: 52,
      justifyContent: 'center',
    },
    voteButtonVoted: {
      backgroundColor: 'rgba(0,255,156,0.12)',
      borderColor: 'rgba(0,255,156,0.35)',
    },
    voteButtonDisabled: {
      opacity: 0.35,
    },
    voteCount: {
      ...T.body,
      fontWeight: '700',
      color: colors.text,
      fontSize: 13,
    },
    participateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: S.sm,
      backgroundColor: '#8B5CFF',
      marginHorizontal: S.lg,
      marginTop: S.lg,
      marginBottom: S.sm,
      paddingVertical: S.lg,
      borderRadius: R.lg,
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
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#8B5CFF',
      paddingHorizontal: S.md,
      paddingVertical: S.sm,
      borderRadius: R.full,
    },
    submitButtonText: {
      ...T.label,
      color: '#fff',
      fontWeight: '700',
    },
  });
}
