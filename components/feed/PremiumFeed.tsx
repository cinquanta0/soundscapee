import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../constants/themes';

function buildC(colors: ThemeColors) {
  return {
    bgCard: colors.bgCard,
    bgCardAlt: colors.bgElevated,
    bgGlass: colors.surfaceLight,
    border: colors.border,
    borderStrong: colors.borderSubtle,
    text: colors.text,
    textDim: colors.textSecondary,
    textFaint: colors.textMuted,
    cyan: colors.cyan,
    blue: colors.blue,
    lime: '#D9FF5A',
    purple: colors.purple,
    pink: colors.pink,
    red: colors.red,
  };
}
type CType = ReturnType<typeof buildC>;

type HeaderProps = {
  soundsCount: number;
  streakCount: number;
  unreadCount: number;
  avatar: React.ReactNode;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
};

type HeroProps = {
  title: string;
  subtitle: string;
  cta: string;
  recordingLabel?: string;
  isRecording: boolean;
  onPress: () => void;
};

type SearchProps = {
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
};

type Chip = {
  id: string;
  label: string;
};

type MoodProps = {
  items: Chip[];
  activeId: string;
  onSelect: (id: string) => void;
};

type QuickActionsProps = {
  onHowItWorks: () => void;
  onNewDrop: () => void;
};

type CardProps = {
  post: any;
  avatar: React.ReactNode;
  moodColor: string;
  isPlaying: boolean;
  playProgress: number;
  playPosition: number;
  liked: boolean;
  busy: boolean;
  timeLabel: string;
  onOpenUser: () => void;
  onOptions: () => void;
  onPlay: () => void;
  onLike: () => void;
  onComments: () => void;
  onDelete?: () => void;
  onOpenBackstage?: () => void;
};

export function FeedHomeHeader({
  soundsCount,
  streakCount,
  unreadCount,
  avatar,
  onOpenNotifications,
  onOpenProfile,
}: HeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const C = useMemo(() => buildC(colors), [colors]);
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.headerWrap}>
      <LinearGradient
        colors={['rgba(88,94,255,0.14)', 'rgba(9,10,24,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGlow}
      />
      <View style={styles.brandRow}>
        <View style={styles.brandLeft}>
          <Image
            source={require('../../assets/images/icon.png')}
            style={styles.brandMark}
            resizeMode="cover"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle}>MIUSLYK</Text>
            <View style={styles.metaRow}>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>{t('feed.onAir')}</Text>
              </View>
              <Text style={styles.metaText}>{t('feed.dropsActive', { count: soundsCount })}</Text>
              <Text style={styles.metaAccent}>{t('feed.streak', { count: streakCount })}</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconShell} onPress={onOpenNotifications}>
            <Feather name="bell" size={18} color={C.text} />
            {unreadCount > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileShell} onPress={onOpenProfile}>
            {avatar}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export function FeedHeroCard({
  title,
  subtitle,
  cta,
  recordingLabel,
  isRecording,
  onPress,
}: HeroProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const C = useMemo(() => buildC(colors), [colors]);
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <LinearGradient
      colors={colors.gradientCard}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.heroCard}
    >
      <View style={styles.heroAuraOne} />
      <View style={styles.heroAuraTwo} />
      <View style={styles.heroNoiseBars}>
        {[20, 34, 12, 26, 18, 42, 24, 14, 38, 16, 29, 10].map((h, i) => (
          <View key={i} style={[styles.heroNoiseBar, { height: h }]} />
        ))}
      </View>

      <View style={styles.heroTopPill}>
        <Feather name="radio" size={12} color={C.cyan} />
        <Text style={styles.heroTopPillText}>{t('feed.broadcastStudio')}</Text>
      </View>

      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>

      <TouchableOpacity
        style={[styles.heroButton, isRecording && styles.heroButtonDanger]}
        onPress={onPress}
      >
        <LinearGradient
          colors={isRecording ? ['#FF617E', '#FF8A66'] : ['#67E8F9', '#8B5CFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroButtonGradient}
        >
          <Feather name={isRecording ? 'square' : 'mic'} size={16} color="#050816" />
          <Text style={styles.heroButtonText}>{isRecording ? recordingLabel : cta}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </LinearGradient>
  );
}

export function FeedSearchBar({ value, placeholder, onChangeText }: SearchProps) {
  const { colors } = useTheme();
  const C = useMemo(() => buildC(colors), [colors]);
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.searchWrap}>
      <Feather name="search" size={17} color={C.textDim} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textFaint}
        style={styles.searchInput}
      />
      <View style={styles.searchPulse} />
    </View>
  );
}

export function FeedMoodChips({ items, activeId, onSelect }: MoodProps) {
  const { colors } = useTheme();
  const C = useMemo(() => buildC(colors), [colors]);
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.chipsRow}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onSelect(item.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function FeedQuickActions({ onHowItWorks, onNewDrop }: QuickActionsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const C = useMemo(() => buildC(colors), [colors]);
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.quickRow}>
      <TouchableOpacity style={styles.quickCard} onPress={onHowItWorks}>
        <View style={[styles.quickOrb, { borderColor: 'rgba(103,232,249,0.35)' }]}>
          <Feather name="zap" size={18} color={C.cyan} />
        </View>
        <Text style={styles.quickTitle}>{t('feed.howItFlows')}</Text>
        <Text style={styles.quickCaption}>{t('feed.howItFlowsCaption')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.quickCard} onPress={onNewDrop}>
        <View style={[styles.quickOrb, { borderColor: 'rgba(79,124,255,0.35)' }]}>
          <Ionicons name="add" size={22} color={C.blue} />
        </View>
        <Text style={styles.quickTitle}>{t('feed.newDrop')}</Text>
        <Text style={styles.quickCaption}>{t('feed.newDropCaption')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function FeedSoundCard({
  post,
  avatar,
  moodColor,
  isPlaying,
  playProgress,
  playPosition,
  liked,
  busy,
  timeLabel,
  onOpenUser,
  onOptions,
  onPlay,
  onLike,
  onComments,
  onDelete,
  onOpenBackstage,
}: CardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const C = useMemo(() => buildC(colors), [colors]);
  const styles = useMemo(() => createStyles(C), [C]);
  const waveform = Array.from({ length: 32 }, (_, i) => {
    let h = 0;
    const seed = post.id || 'x';
    for (let j = 0; j < seed.length; j += 1) h += seed.charCodeAt(j) * (i + 2);
    return 10 + (h % 34);
  });

  return (
    <LinearGradient
      colors={['rgba(17,22,45,0.96)', 'rgba(10,14,29,0.98)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.cardGlow} />
      <View style={styles.cardHeader}>
        <TouchableOpacity style={styles.cardUser} onPress={onOpenUser}>
          <View style={styles.avatarFrame}>{avatar}</View>
          <View style={{ flex: 1 }}>
            <View style={styles.userLine}>
              <Text style={styles.userName}>{post.username}</Text>
              {post.isVerified && (
                <View style={styles.verifiedDot}>
                  <Feather name="check" size={9} color="#050816" />
                </View>
              )}
            </View>
            <Text style={styles.userMeta}>{timeLabel}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.cardHeaderRight}>
          <View style={[styles.moodPill, { borderColor: moodColor + '66', backgroundColor: moodColor + '16' }]}>
            <View style={[styles.moodPillDot, { backgroundColor: moodColor }]} />
            <Text style={[styles.moodPillText, { color: moodColor }]}>{post.mood}</Text>
          </View>
          <TouchableOpacity style={styles.moreButton} onPress={onOptions}>
            <Feather name="more-horizontal" size={17} color={C.textDim} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bodyTop}>
        <View style={styles.titleBlock}>
          {post.isCollab && post.collaboratorName ? (
            <View style={styles.collabPill}>
              <Feather name="mic" size={11} color={C.pink} />
              <Text style={styles.collabText}>{t('feed.collabWith', { name: post.collaboratorName })}</Text>
            </View>
          ) : null}
          <Text style={styles.cardTitle}>{post.title}</Text>
          {!!post.description && <Text style={styles.cardDescription}>{post.description}</Text>}
        </View>
        <View style={styles.signalBadge}>
          <Text style={styles.signalValue}>{post.listens ?? 0}</Text>
          <Text style={styles.signalLabel}>{t('feed.listens')}</Text>
        </View>
      </View>

      <View style={styles.playerShell}>
        <TouchableOpacity
          style={[styles.playOrb, busy && styles.playOrbDisabled]}
          onPress={onPlay}
          disabled={busy}
        >
          <LinearGradient
            colors={busy ? [colors.bgElevated, colors.bgCard] : ['#67E8F9', '#8B5CFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playOrbInner}
          >
            <Feather
              name={isPlaying ? 'pause' : 'play'}
              size={22}
              color="#050816"
              style={!isPlaying ? { marginLeft: 2 } : undefined}
            />
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.wavePanel}>
          <View style={styles.waveTopLine}>
            <Text style={styles.waveLabel}>{busy ? t('feed.buffering') : isPlaying ? t('feed.playingNow') : t('feed.readyToPlay')}</Text>
            <Text style={styles.waveTime}>{isPlaying ? `${playPosition}s` : (post.duration > 0 ? `${post.duration}s` : '?s')}</Text>
          </View>
          <View style={styles.waveBars}>
            {waveform.map((height, i) => {
              const active = isPlaying && i / waveform.length < playProgress / 100;
              return (
                <View
                  key={`${post.id}-${i}`}
                  style={[
                    styles.waveBar,
                    {
                      height,
                      backgroundColor: active ? C.cyan : 'rgba(143, 160, 201, 0.22)',
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <TouchableOpacity style={styles.metricButton} onPress={onLike}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={16} color={liked ? C.red : C.textDim} />
            <Text style={styles.metricText}>{post.likes}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.metricButton} onPress={onComments}>
            <Feather name="message-circle" size={15} color={C.textDim} />
            <Text style={styles.metricText}>{post.comments}</Text>
          </TouchableOpacity>
          {onOpenBackstage ? (
            <TouchableOpacity style={styles.backstagePill} onPress={onOpenBackstage}>
              <Feather name="video" size={12} color={C.cyan} />
              <Text style={styles.backstageText}>{t('feed.backstage')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {onDelete ? (
          <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
            <Feather name="trash-2" size={14} color={C.textDim} />
          </TouchableOpacity>
        ) : null}
      </View>
    </LinearGradient>
  );
}

export function FeedEmptyState() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const C = useMemo(() => buildC(colors), [colors]);
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <LinearGradient colors={['rgba(16,20,40,0.9)', 'rgba(10,12,24,0.95)']} style={styles.emptyState}>
      <View style={styles.emptyOrb}>
        <Feather name="mic-off" size={26} color={C.cyan} />
      </View>
      <Text style={styles.emptyTitle}>{t('feed.emptyTitle')}</Text>
      <Text style={styles.emptyCaption}>{t('feed.emptyCaption')}</Text>
    </LinearGradient>
  );
}

function createStyles(C: CType) { return StyleSheet.create({
  headerWrap: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
  },
  headerGlow: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    height: 140,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  brandMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  brandBar: {
    width: 4,
    borderRadius: 999,
    backgroundColor: '#F7F8FF',
  },
  brandTitle: {
    color: C.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.22)',
    backgroundColor: 'rgba(103,232,249,0.08)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.cyan,
  },
  liveBadgeText: {
    color: C.cyan,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  metaText: {
    color: C.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  metaAccent: {
    color: C.blue,
    fontSize: 13,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconShell: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bgGlass,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileShell: {
    width: 52,
    height: 52,
    borderRadius: 26,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: C.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: '#0A0915',
    fontSize: 10,
    fontWeight: '800',
  },
  heroCard: {
    borderRadius: 26,
    padding: 14,
    minHeight: 144,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
  },
  heroAuraOne: {
    position: 'absolute',
    right: -24,
    top: -18,
    width: 186,
    height: 186,
    borderRadius: 999,
    backgroundColor: 'rgba(79,124,255,0.18)',
  },
  heroAuraTwo: {
    position: 'absolute',
    left: -28,
    bottom: -54,
    width: 132,
    height: 132,
    borderRadius: 999,
    backgroundColor: 'rgba(139,92,255,0.15)',
  },
  heroNoiseBars: {
    position: 'absolute',
    right: 14,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    opacity: 0.45,
  },
  heroNoiseBar: {
    width: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(103,232,249,0.32)',
  },
  heroTopPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  heroTopPillText: {
    color: C.cyan,
    fontSize: 11,
    fontWeight: '700',
  },
  heroTitle: {
    color: C.text,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 23,
    maxWidth: '78%',
  },
  heroSubtitle: {
    color: C.textDim,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 5,
    maxWidth: '76%',
  },
  heroButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#7C5CFF',
    shadowOpacity: 0.34,
    shadowRadius: 18,
    elevation: 10,
  },
  heroButtonDanger: {
    shadowColor: '#FF617E',
  },
  heroButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  heroButtonText: {
    color: '#050816',
    fontSize: 13,
    fontWeight: '800',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    padding: 0,
  },
  searchPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.cyan,
    opacity: 0.7,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipActive: {
    backgroundColor: 'rgba(103,232,249,0.12)',
    borderColor: 'rgba(103,232,249,0.3)',
  },
  chipText: {
    color: C.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: C.cyan,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  quickCard: {
    flex: 1,
    minHeight: 74,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'space-between',
  },
  quickOrb: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  quickCaption: {
    color: C.textDim,
    fontSize: 10,
    lineHeight: 13,
    maxWidth: 104,
  },
  card: {
    borderRadius: 22,
    padding: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
  },
  cardGlow: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: 'rgba(103,232,249,0.08)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  cardUser: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarFrame: {
    padding: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  userLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
  },
  verifiedDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.cyan,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMeta: {
    color: C.textFaint,
    fontSize: 11,
    marginTop: 2,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  moodPillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  moodPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  moreButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bodyTop: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  titleBlock: {
    flex: 1,
  },
  collabPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(244,114,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(244,114,255,0.22)',
    marginBottom: 10,
  },
  collabText: {
    color: C.pink,
    fontSize: 11,
    fontWeight: '700',
  },
  cardTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 21,
    marginBottom: 6,
  },
  cardDescription: {
    color: C.textDim,
    fontSize: 13,
    lineHeight: 18,
  },
  signalBadge: {
    width: 62,
    minHeight: 62,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  signalValue: {
    color: C.blue,
    fontSize: 16,
    fontWeight: '800',
  },
  signalLabel: {
    color: C.textFaint,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  playerShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  playOrb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#67E8F9',
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 10,
  },
  playOrbDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  playOrbInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wavePanel: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  waveTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  waveLabel: {
    color: C.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  waveTime: {
    color: C.textFaint,
    fontSize: 11,
    fontWeight: '700',
  },
  waveBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 34,
  },
  waveBar: {
    flex: 1,
    borderRadius: 999,
    alignSelf: 'flex-end',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  metricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  metricText: {
    color: C.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  backstagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(103,232,249,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.18)',
  },
  backstageText: {
    color: C.cyan,
    fontSize: 11,
    fontWeight: '700',
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  emptyState: {
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 8,
  },
  emptyOrb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(103,232,249,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.2)',
    marginBottom: 12,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyCaption: {
    color: C.textDim,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
}); }
