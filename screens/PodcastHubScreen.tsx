import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../constants/themes';
import PodcastScreen from './PodcastScreen';
import PodcastDetailScreen from './PodcastDetailScreen';
import PlaylistListScreen from './PlaylistListScreen';
import PlaylistDetailScreen from './PlaylistDetailScreen';
import ITSSchoolScreen from './ITSSchoolScreen';

type PodcastView = 'feed' | 'school' | 'playlists' | 'podcastDetail' | 'playlistDetail';

const TABS: { id: Exclude<PodcastView, 'podcastDetail' | 'playlistDetail'>; icon: React.ComponentProps<typeof Feather>['name']; labelKey: string; subtitleKey: string }[] = [
  { id: 'feed', icon: 'mic', labelKey: 'podcast.tabFeed', subtitleKey: 'podcast.tabFeedSubtitle' },
  { id: 'school', icon: 'book-open', labelKey: 'podcast.tabSchool', subtitleKey: 'podcast.tabSchoolSubtitle' },
  { id: 'playlists', icon: 'layers', labelKey: 'podcast.tabPlaylists', subtitleKey: 'podcast.tabPlaylistsSubtitle' },
];

export default function PodcastHubScreen({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [view, setView] = useState<PodcastView>('feed');
  const [selectedPodcastId, setSelectedPodcastId] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<{ id: string; name: string } | null>(null);
  const [schoolFullscreen, setSchoolFullscreen] = useState(false);

  if (view === 'podcastDetail' && selectedPodcastId) {
    return (
      <PodcastDetailScreen
        podcastId={selectedPodcastId}
        onBack={() => {
          setSelectedPodcastId(null);
          setView('feed');
        }}
      />
    );
  }

  if (view === 'playlistDetail' && selectedPlaylist) {
    return (
      <PlaylistDetailScreen
        playlistId={selectedPlaylist.id}
        playlistName={selectedPlaylist.name}
        onBack={() => {
          setSelectedPlaylist(null);
          setView('playlists');
        }}
      />
    );
  }

  // Full-screen Scuola/ITS: nasconde hero+tab, lascia tutto lo spazio alla schermata
  const isSchoolFull = view === 'school' && schoolFullscreen;

  if (isSchoolFull) {
    return (
      <View style={styles.container}>
        <ITSSchoolScreen />
        <TouchableOpacity
          style={styles.exitFullBtn}
          onPress={() => setSchoolFullscreen(false)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('podcast.exitFullscreen', 'Esci da schermo intero')}
        >
          <Feather name="minimize-2" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!compact && (
        <LinearGradient
          colors={colors.gradientCard}
          style={styles.hero}
        >
          <View style={styles.heroGlow} />
          <Text style={styles.eyebrow}>{t('podcast.hubEyebrow')}</Text>
          <Text style={styles.title}>{t('podcast.hubTitle')}</Text>
          <Text style={styles.subtitle}>{t('podcast.hubSubtitle')}</Text>
        </LinearGradient>
      )}

      <View style={[styles.tabsRow, compact && styles.tabsRowCompact]}>
        {TABS.map((tab) => {
          const active = view === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabCard, compact && styles.tabCardCompact, active && styles.tabCardActive]}
              onPress={() => { setView(tab.id); setSchoolFullscreen(false); }}
              activeOpacity={0.9}
            >
              <View style={[styles.tabIconWrap, compact && styles.tabIconWrapCompact, active && styles.tabIconWrapActive]}>
                <Feather name={tab.icon} size={16} color={active ? '#67E8F9' : '#94A0C3'} />
              </View>
              <Text style={[styles.tabTitle, active && styles.tabTitleActive]}>{t(tab.labelKey)}</Text>
              {!compact && <Text style={styles.tabSubtitle}>{t(tab.subtitleKey)}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bottone "schermo intero" — solo quando la tab Scuola/ITS è attiva */}
      {view === 'school' && (
        <TouchableOpacity
          style={styles.fullscreenBar}
          onPress={() => setSchoolFullscreen(true)}
          activeOpacity={0.8}
        >
          <Feather name="maximize-2" size={14} color="#67E8F9" />
          <Text style={styles.fullscreenBarTxt}>{t('podcast.enterFullscreen', 'Schermo intero')}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.content}>
        {view === 'feed' && <PodcastScreen compact={compact} />}
        {view === 'school' && <ITSSchoolScreen />}
        {view === 'playlists' && (
          <PlaylistListScreen
            onSelectPlaylist={(playlistId, name) => {
              setSelectedPlaylist({ id: playlistId, name });
              setView('playlistDetail');
            }}
          />
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      minHeight: 0,
    },
    hero: {
      marginHorizontal: 16,
      marginTop: 2,
      marginBottom: 10,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      overflow: 'hidden',
    },
    heroGlow: {
      position: 'absolute',
      right: -18,
      top: -26,
      width: 150,
      height: 150,
      borderRadius: 999,
      backgroundColor: 'rgba(139,92,255,0.12)',
    },
    eyebrow: {
      color: '#67E8F9',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    title: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.8,
      marginBottom: 6,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      maxWidth: '94%',
    },
    tabsRow: {
      flexDirection: 'row',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 10,
    },
    tabsRowCompact: {
      marginTop: 2,
      marginBottom: 10,
    },
    tabCard: {
      flex: 1,
      minHeight: 108,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
      padding: 14,
    },
    tabCardCompact: {
      minHeight: 62,
      padding: 10,
    },
    tabCardActive: {
      borderColor: 'rgba(103,232,249,0.24)',
      backgroundColor: 'rgba(103,232,249,0.08)',
    },
    tabIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    tabIconWrapCompact: {
      width: 32,
      height: 32,
      borderRadius: 16,
      marginBottom: 8,
    },
    tabIconWrapActive: {
      borderColor: 'rgba(103,232,249,0.2)',
      backgroundColor: 'rgba(103,232,249,0.12)',
    },
    tabTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '800',
      marginBottom: 2,
    },
    tabTitleActive: {
      color: '#67E8F9',
    },
    tabSubtitle: {
      color: colors.textSecondary,
      fontSize: 11,
      lineHeight: 16,
    },
    content: {
      flex: 1,
      minHeight: 0,
    },
    // Barra "Schermo intero" sopra ITS quando la tab è attiva
    fullscreenBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingVertical: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(103,232,249,0.24)',
      backgroundColor: 'rgba(103,232,249,0.08)',
    },
    fullscreenBarTxt: {
      color: '#67E8F9',
      fontSize: 12,
      fontWeight: '700',
    },
    // FAB per uscire dal full-screen — in basso a destra (ergonomico, no status bar)
    exitFullBtn: {
      position: 'absolute',
      bottom: 24,
      right: 18,
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(20,30,60,0.92)',
      borderWidth: 1,
      borderColor: 'rgba(103,232,249,0.4)',
      zIndex: 50,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 8,
    },
  });
}
