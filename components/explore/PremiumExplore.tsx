import React, { useRef, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

const C = {
  text: '#F7F8FF',
  textDim: '#9BA7C8',
  textMute: '#6F7896',
  cyan: '#67E8F9',
  blue: '#4F7CFF',
  lime: '#D9FF5A',
  purple: '#8B5CFF',
  pink: '#F472FF',
  orange: '#FF9B5E',
  red: '#FF5C7A',
  gold: '#FFD166',
  silver: '#B0BEC5',
  bronze: '#CD7C4A',
  border: 'rgba(163, 177, 255, 0.16)',
  borderStrong: 'rgba(103,232,249,0.24)',
  card: 'rgba(17, 22, 45, 0.96)',
  glass: 'rgba(255,255,255,0.03)',
};

type Section = 'suoni' | 'podcast' | 'radio' | 'battles' | 'utenti' | 'leaderboard';

type ModeItem = {
  id: Section;
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  accent: string;
};

type HeaderProps = {
  title: string;
  subtitle: string;
};

type ModesProps = {
  section: Section;
  items: ModeItem[];
  onSelect: (id: Section) => void;
};

type SearchProps = {
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
};

type ChipItem = {
  id: string;
  label: string;
};

type ChipsProps = {
  items: ChipItem[];
  activeId: string;
  onSelect: (id: string) => void;
};

type FeatureProps = {
  section: Section;
  onOpenSection: (section: Section) => void;
};

type SoundCardProps = {
  item: any;
  isPlaying: boolean;
  busy: boolean;
  onPress: () => void;
};

type UserCardProps = {
  user: any;
  onPress: () => void;
};

type BattleCardProps = {
  battle: any;
  canCancel: boolean;
  canceling: boolean;
  onPress: () => void;
  onCancel: () => void;
};

export function ExploreHeader({ title, subtitle }: HeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <LinearGradient
        colors={['rgba(79,124,255,0.14)', 'rgba(10,13,26,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGlow}
      />
      <Text style={styles.eyebrow}>{t('explore.discoverHub')}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

export function ExploreModeRail({ section, items, onSelect }: ModesProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.modeRail}
    >
      {items.map((item) => {
        const active = item.id === section;
        return (
          <TouchableOpacity
            key={item.id}
            style={[styles.modeCard, active && styles.modeCardActive]}
            onPress={() => onSelect(item.id)}
          >
            <LinearGradient
              colors={active ? [item.accent + '44', 'rgba(15,20,38,0.92)'] : ['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)']}
              style={styles.modeCardFill}
            >
              <View style={[styles.modeIconWrap, { borderColor: active ? item.accent + '55' : C.border }]}>
                <Feather name={item.icon} size={16} color={active ? item.accent : C.textDim} />
              </View>
              <Text style={[styles.modeTitle, active && { color: C.text }]}>{item.title}</Text>
              <Text style={styles.modeSubtitle}>{item.subtitle}</Text>
            </LinearGradient>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function ExploreSearchBar({ value, placeholder, onChangeText, onClear }: SearchProps) {
  return (
    <View style={styles.searchWrap}>
      <Feather name="search" size={18} color={C.textDim} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textMute}
        style={styles.searchInput}
        returnKeyType="search"
        blurOnSubmit
      />
      {value.length > 0 ? (
        <TouchableOpacity style={styles.clearButton} onPress={onClear}>
          <Feather name="x" size={16} color={C.textDim} />
        </TouchableOpacity>
      ) : (
        <View style={styles.searchPulse} />
      )}
    </View>
  );
}

export function ExploreChips({ items, activeId, onSelect }: ChipsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <TouchableOpacity
            key={item.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(item.id)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function ExploreFeatureStrip({ section, onOpenSection }: FeatureProps) {
  const { t } = useTranslation();
  const items = [
    {
      id: 'radio' as Section,
      title: 'Live radio',
      subtitle: t('explore.featureRadioSubtitle'),
      accent: C.cyan,
      icon: 'radio' as const,
    },
    {
      id: 'podcast' as Section,
      title: 'Podcast vault',
      subtitle: t('explore.featurePodcastSubtitle'),
      accent: C.purple,
      icon: 'mic' as const,
    },
    {
      id: 'battles' as Section,
      title: 'Sound battles',
      subtitle: t('explore.featureBattlesSubtitle'),
      accent: C.orange,
      icon: 'crosshair' as const,
    },
  ];

  return (
    <View style={styles.featureRow}>
      {items.map((item) => {
        const active = section === item.id;
        return (
          <TouchableOpacity
            key={item.id}
            style={[styles.featureCard, active && { borderColor: item.accent + '55' }]}
            onPress={() => onOpenSection(item.id)}
          >
            <View style={[styles.featureIcon, { backgroundColor: item.accent + '16', borderColor: item.accent + '33' }]}>
              <Feather name={item.icon} size={16} color={item.accent} />
            </View>
            <Text style={styles.featureTitle}>{item.title}</Text>
            <Text style={styles.featureSubtitle}>{item.subtitle}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ExploreSectionHeading({
  title,
  caption,
  counter,
}: { title: string; caption: string; counter?: number | string }) {
  return (
    <View style={styles.sectionHead}>
      <View>
        <Text style={styles.sectionCaption}>{caption}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {counter != null ? (
        <View style={styles.sectionCounter}>
          <Text style={styles.sectionCounterText}>{counter}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ExploreSoundCard({ item, isPlaying, busy, onPress }: SoundCardProps) {
  const bars = Array.from({ length: 18 }, (_, i) => {
    let h = 0;
    const seed = item.id || 'x';
    for (let j = 0; j < seed.length; j += 1) h += seed.charCodeAt(j) * (i + 3);
    return 10 + (h % 20);
  });

  return (
    <LinearGradient colors={['rgba(17,22,45,0.98)', 'rgba(10,14,28,0.98)']} style={styles.soundCard}>
      <View style={styles.soundMetaRow}>
        <Text style={styles.soundAuthorText}>{item.username}</Text>
      </View>

      <View style={styles.soundMainRow}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.soundTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.soundSubline}>
            {item.duration > 0 ? `${item.duration}s` : '?s'} · {item.likes || 0} likes · {item.listens || 0} listens
          </Text>
          <View style={styles.waveRow}>
            {bars.map((height, index) => (
              <View
                key={`${item.id}-${index}`}
                style={[
                  styles.waveBar,
                  {
                    height,
                    backgroundColor: isPlaying ? C.cyan : 'rgba(150,166,207,0.22)',
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <TouchableOpacity style={[styles.playButton, busy && styles.playButtonDisabled]} onPress={onPress} disabled={busy}>
          <LinearGradient
            colors={busy ? ['#354067', '#2A3357'] : ['#67E8F9', '#8B5CFF']}
            style={styles.playButtonFill}
          >
            <Feather name={isPlaying ? 'pause' : 'play'} size={20} color="#050816" style={!isPlaying ? { marginLeft: 2 } : undefined} />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

export function ExploreUserCard({ user, onPress }: UserCardProps) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity style={styles.userCard} onPress={onPress} activeOpacity={0.86}>
      <View style={[styles.userAvatar, user.profilePicture ? { overflow: 'hidden', padding: 0 } : null]}>
        {user.profilePicture ? (
          <Image source={{ uri: user.profilePicture }} style={{ width: 54, height: 54, borderRadius: 27 }} />
        ) : /^[a-z][a-z-]*$/.test(user.avatar) ? (
          <Feather name={user.avatar as any} size={26} color="#00FF9C" />
        ) : (
          <Text style={{ fontSize: 26 }}>{user.avatar || '🎧'}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.userName}>@{user.username || t('profile.defaultName').toLowerCase()}</Text>
        <Text style={styles.userBio} numberOfLines={1}>{user.bio || t('explore.userBioFallback')}</Text>
      </View>
      <Feather name="arrow-up-right" size={17} color={C.textDim} />
    </TouchableOpacity>
  );
}

export function ExploreBattleCard({
  battle,
  canCancel,
  canceling,
  onPress,
  onCancel,
}: BattleCardProps) {
  const { t } = useTranslation();
  const total = battle.challengerVotes + battle.opponentVotes;
  const challPct = total > 0 ? Math.round((battle.challengerVotes / total) * 100) : 50;
  const timeLeft = battle.votingEndsAt ? Math.max(0, battle.votingEndsAt.getTime() - Date.now()) : 0;
  const hLeft = Math.floor(timeLeft / 3600000);
  const mLeft = Math.floor((timeLeft % 3600000) / 60000);

  return (
    <TouchableOpacity style={styles.battleCard} onPress={onPress} activeOpacity={0.86}>
      <View style={styles.battleTop}>
        <View style={styles.battleTheme}>
          <Ionicons name="flame-outline" size={12} color={C.orange} />
          <Text style={styles.battleThemeText}>{battle.theme}</Text>
        </View>
        <Text style={styles.battleTime}>{hLeft}h {mLeft}m</Text>
      </View>

      <View style={styles.battleCenter}>
        <View style={styles.battleUserBlock}>
          {battle.challengerPhoto
            ? <Image source={{ uri: battle.challengerPhoto }} style={[styles.battleAvatarImg, { borderColor: C.orange }]} />
            : /^[a-z][a-z-]*$/.test(battle.challengerAvatar)
              ? <Feather name={battle.challengerAvatar as any} size={28} color={C.orange} />
              : <Text style={styles.battleAvatar}>{battle.challengerAvatar}</Text>}
          <Text style={[styles.battleName, { color: C.orange }]} numberOfLines={1}>{battle.challengerName}</Text>
          <Text style={styles.battleVotes}>{battle.challengerVotes}</Text>
        </View>
        <View style={styles.battleVersus}>
          <Text style={styles.battleVs}>VS</Text>
        </View>
        <View style={styles.battleUserBlock}>
          {battle.opponentPhoto
            ? <Image source={{ uri: battle.opponentPhoto }} style={[styles.battleAvatarImg, { borderColor: C.purple }]} />
            : /^[a-z][a-z-]*$/.test(battle.opponentAvatar)
              ? <Feather name={battle.opponentAvatar as any} size={28} color={C.purple} />
              : <Text style={styles.battleAvatar}>{battle.opponentAvatar}</Text>}
          <Text style={[styles.battleName, { color: C.purple }]} numberOfLines={1}>{battle.opponentName}</Text>
          <Text style={styles.battleVotes}>{battle.opponentVotes}</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${challPct}%` }]} />
      </View>

      <View style={styles.battleFooter}>
        <Text style={styles.battleFooterText}>{t('explore.votesCta', { count: total })}</Text>
        {canCancel ? (
          <TouchableOpacity style={styles.cancelPill} onPress={onCancel} disabled={canceling}>
            <Text style={styles.cancelPillText}>{canceling ? t('explore.canceling') : t('common.cancel')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export function ExploreEmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

type LeaderboardProps = {
  items: any[];
  playingId: string | null;
  busy: boolean;
  onPlay: (item: any) => void;
};

const RANK_CONFIG = [
  { color: C.gold, glowColor: 'rgba(255,209,102,0.18)', borderColor: 'rgba(255,209,102,0.45)', label: 'I', icon: 'award' as const },
  { color: C.silver, glowColor: 'rgba(176,190,197,0.14)', borderColor: 'rgba(176,190,197,0.35)', label: 'II', icon: 'award' as const },
  { color: C.bronze, glowColor: 'rgba(205,124,74,0.14)', borderColor: 'rgba(205,124,74,0.35)', label: 'III', icon: 'award' as const },
];

function LeaderboardPodiumCard({ item, rank, isPlaying, busy, onPlay }: { item: any; rank: number; isPlaying: boolean; busy: boolean; onPlay: () => void }) {
  const cfg = RANK_CONFIG[rank];
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isPlaying) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isPlaying]);

  const bars = Array.from({ length: 12 }, (_, i) => {
    let h = 0;
    const seed = item.id || 'x';
    for (let j = 0; j < seed.length; j++) h += seed.charCodeAt(j) * (i + 2);
    return 6 + (h % 18);
  });

  return (
    <Animated.View style={[lbStyles.podiumCard, { transform: [{ scale: pulseAnim }] }]}>
      <LinearGradient
        colors={['rgba(17,22,45,0.98)', 'rgba(10,14,28,0.99)']}
        style={[lbStyles.podiumCardInner, { borderColor: cfg.borderColor }]}
      >
        <View style={[lbStyles.podiumGlow, { backgroundColor: cfg.glowColor }]} />
        <View style={lbStyles.podiumTop}>
          <View style={[lbStyles.rankBadge, { borderColor: cfg.borderColor, backgroundColor: cfg.color + '18' }]}>
            <Feather name={cfg.icon} size={11} color={cfg.color} />
            <Text style={[lbStyles.rankLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={lbStyles.podiumListens}>{(item.listens || 0).toLocaleString()}</Text>
        </View>
        <Text style={lbStyles.podiumTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={lbStyles.podiumAuthor}>{item.username}</Text>
        <View style={lbStyles.podiumWave}>
          {bars.map((h, i) => (
            <View key={i} style={[lbStyles.podiumBar, { height: h, backgroundColor: isPlaying ? cfg.color : cfg.color + '44' }]} />
          ))}
        </View>
        <TouchableOpacity
          style={[lbStyles.podiumPlay, { borderColor: cfg.borderColor }]}
          onPress={onPlay}
          disabled={busy}
        >
          <Feather name={isPlaying ? 'pause' : 'play'} size={16} color={cfg.color} style={!isPlaying ? { marginLeft: 2 } : undefined} />
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

function LeaderboardRow({ item, rank, isPlaying, busy, onPlay }: { item: any; rank: number; isPlaying: boolean; busy: boolean; onPlay: () => void }) {
  return (
    <TouchableOpacity style={lbStyles.row} onPress={onPlay} disabled={busy} activeOpacity={0.82}>
      <View style={lbStyles.rowRank}>
        <Text style={lbStyles.rowRankNum}>{rank + 1}</Text>
      </View>
      <View style={lbStyles.rowInfo}>
        <Text style={lbStyles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={lbStyles.rowMeta}>{item.username} · {(item.listens || 0).toLocaleString()} ascolti</Text>
      </View>
      <View style={[lbStyles.rowPlay, isPlaying && lbStyles.rowPlayActive]}>
        <Feather name={isPlaying ? 'pause' : 'play'} size={15} color={isPlaying ? C.cyan : C.textDim} style={!isPlaying ? { marginLeft: 1 } : undefined} />
      </View>
    </TouchableOpacity>
  );
}

export function ExploreLeaderboard({ items, playingId, busy, onPlay }: LeaderboardProps) {
  const podium = items.slice(0, 3);
  const rest = items.slice(3);

  if (items.length === 0) {
    return (
      <View style={lbStyles.empty}>
        <View style={lbStyles.emptyIcon}>
          <Feather name="bar-chart-2" size={28} color={C.gold} />
        </View>
        <Text style={lbStyles.emptyTitle}>Classifica vuota</Text>
        <Text style={lbStyles.emptySubtitle}>Nessun ascolto registrato ancora. Sii il primo a salire in vetta.</Text>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={lbStyles.container}>
      <View style={lbStyles.header}>
        <View style={lbStyles.headerIconWrap}>
          <Feather name="bar-chart-2" size={18} color={C.gold} />
        </View>
        <View>
          <Text style={lbStyles.headerCaption}>GLOBAL CHARTS</Text>
          <Text style={lbStyles.headerTitle}>Top suoni</Text>
        </View>
      </View>

      <View style={lbStyles.podiumRow}>
        {podium.map((item, i) => (
          <LeaderboardPodiumCard
            key={item.id}
            item={item}
            rank={i}
            isPlaying={playingId === item.id}
            busy={busy}
            onPlay={() => onPlay(item)}
          />
        ))}
      </View>

      {rest.length > 0 && (
        <View style={lbStyles.restSection}>
          <Text style={lbStyles.restCaption}>A SEGUIRE</Text>
          {rest.map((item, i) => (
            <LeaderboardRow
              key={item.id}
              item={item}
              rank={i + 3}
              isPlaying={playingId === item.id}
              busy={busy}
              onPlay={() => onPlay(item)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const lbStyles = StyleSheet.create({
  container: { paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,209,102,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,209,102,0.3)',
  },
  headerCaption: {
    color: C.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 2,
  },
  headerTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  podiumRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    gap: 8,
    marginBottom: 20,
  },
  podiumCard: { flex: 1 },
  podiumCardInner: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    overflow: 'hidden',
    minHeight: 150,
  },
  podiumGlow: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  podiumTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  rankLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  podiumListens: {
    color: C.textMute,
    fontSize: 9,
    fontWeight: '700',
  },
  podiumTitle: {
    color: C.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 3,
    lineHeight: 16,
  },
  podiumAuthor: {
    color: C.textMute,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 8,
  },
  podiumWave: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 22,
    marginBottom: 8,
  },
  podiumBar: {
    width: 3,
    borderRadius: 2,
  },
  podiumPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  restSection: {
    paddingHorizontal: 16,
  },
  restCaption: {
    color: C.textMute,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(163,177,255,0.08)',
  },
  rowRank: {
    width: 28,
    alignItems: 'center',
  },
  rowRankNum: {
    color: C.textMute,
    fontSize: 14,
    fontWeight: '900',
  },
  rowInfo: { flex: 1 },
  rowTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  rowMeta: {
    color: C.textMute,
    fontSize: 11,
  },
  rowPlay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowPlayActive: {
    borderColor: 'rgba(103,232,249,0.35)',
    backgroundColor: 'rgba(103,232,249,0.08)',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,209,102,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,209,102,0.25)',
    marginBottom: 16,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: C.textMute,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});


const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerGlow: {
    position: 'absolute',
    top: -14,
    left: 0,
    right: 0,
    height: 140,
  },
  eyebrow: {
    color: C.cyan,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: C.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: C.textDim,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: '92%',
  },
  modeRail: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 6,
  },
  modeCard: {
    width: 124,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  modeCardActive: {
    borderColor: C.borderStrong,
  },
  modeCardFill: {
    padding: 12,
    minHeight: 92,
    justifyContent: 'space-between',
  },
  modeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTitle: {
    color: C.textDim,
    fontSize: 14,
    fontWeight: '800',
  },
  modeSubtitle: {
    color: C.textMute,
    fontSize: 10,
    lineHeight: 14,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.glass,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginHorizontal: 16,
    marginTop: 10,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    padding: 0,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  searchPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.cyan,
    opacity: 0.72,
  },
  chipsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.glass,
  },
  chipActive: {
    borderColor: 'rgba(103,232,249,0.26)',
    backgroundColor: 'rgba(103,232,249,0.09)',
  },
  chipText: {
    color: C.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: C.cyan,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 0,
    marginBottom: 14,
  },
  featureCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.glass,
    padding: 12,
    minHeight: 88,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  featureTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  featureSubtitle: {
    color: C.textMute,
    fontSize: 10,
    lineHeight: 13,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionCaption: {
    color: C.cyan,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  sectionCounter: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,255,0.22)',
  },
  sectionCounterText: {
    color: C.lime,
    fontWeight: '800',
    fontSize: 14,
  },
  soundCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  soundMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  soundAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soundMoodDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  soundAuthorText: {
    color: C.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  soundMoodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  soundMoodText: {
    fontSize: 11,
    fontWeight: '700',
  },
  soundMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  soundTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  soundSubline: {
    color: C.textDim,
    fontSize: 13,
    marginBottom: 12,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 34,
  },
  waveBar: {
    width: 5,
    borderRadius: 999,
  },
  playButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: 'hidden',
    shadowColor: '#67E8F9',
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 10,
  },
  playButtonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  playButtonFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.glass,
    padding: 14,
  },
  userAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  userName: {
    color: C.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  userBio: {
    color: C.textDim,
    fontSize: 13,
  },
  battleCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,155,94,0.22)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 16,
  },
  battleTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  battleTheme: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,155,94,0.26)',
    backgroundColor: 'rgba(255,155,94,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  battleThemeText: {
    color: C.orange,
    fontSize: 11,
    fontWeight: '800',
  },
  battleTime: {
    color: C.textMute,
    fontSize: 12,
    fontWeight: '700',
  },
  battleCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  battleUserBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  battleAvatar: {
    fontSize: 28,
  },
  battleAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  battleName: {
    fontSize: 13,
    fontWeight: '800',
  },
  battleVotes: {
    color: C.text,
    fontSize: 18,
    fontWeight: '900',
  },
  battleVersus: {
    width: 52,
    alignItems: 'center',
  },
  battleVs: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 18,
    fontWeight: '900',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(139,92,255,0.26)',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.orange,
  },
  battleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  battleFooterText: {
    flex: 1,
    color: C.textMute,
    fontSize: 12,
  },
  cancelPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,92,122,0.26)',
    backgroundColor: 'rgba(255,92,122,0.1)',
  },
  cancelPillText: {
    color: C.red,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 56,
    paddingHorizontal: 28,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: C.textDim,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
});
