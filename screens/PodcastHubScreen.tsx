import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PodcastScreen from './PodcastScreen';
import PodcastDetailScreen from './PodcastDetailScreen';
import PlaylistListScreen from './PlaylistListScreen';
import PlaylistDetailScreen from './PlaylistDetailScreen';
import ITSSchoolScreen from './ITSSchoolScreen';

type PodcastView = 'feed' | 'school' | 'playlists' | 'podcastDetail' | 'playlistDetail';

const TABS: { id: Exclude<PodcastView, 'podcastDetail' | 'playlistDetail'>; icon: React.ComponentProps<typeof Feather>['name']; labelKey: string; subtitle: string }[] = [
  { id: 'feed', icon: 'mic', labelKey: 'podcast.tabFeed', subtitle: 'episodi e nuove uscite' },
  { id: 'school', icon: 'book-open', labelKey: 'podcast.tabSchool', subtitle: 'format learning e ITS' },
  { id: 'playlists', icon: 'layers', labelKey: 'podcast.tabPlaylists', subtitle: 'raccolte curate e mood mix' },
];

export default function PodcastHubScreen({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [view, setView] = useState<PodcastView>('feed');
  const [selectedPodcastId, setSelectedPodcastId] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<{ id: string; name: string } | null>(null);

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

  return (
    <View style={styles.container}>
      {!compact && (
        <LinearGradient
          colors={['rgba(17,22,45,0.96)', 'rgba(10,14,28,0.96)']}
          style={styles.hero}
        >
          <View style={styles.heroGlow} />
          <Text style={styles.eyebrow}>Audio narratives</Text>
          <Text style={styles.title}>Podcast hub</Text>
          <Text style={styles.subtitle}>
            Episodi, format scuola e playlist editoriali dentro una struttura più leggibile e coerente con il nuovo feed.
          </Text>
        </LinearGradient>
      )}

      <View style={[styles.tabsRow, compact && styles.tabsRowCompact]}>
        {TABS.map((tab) => {
          const active = view === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabCard, compact && styles.tabCardCompact, active && styles.tabCardActive]}
              onPress={() => setView(tab.id)}
              activeOpacity={0.9}
            >
              <View style={[styles.tabIconWrap, compact && styles.tabIconWrapCompact, active && styles.tabIconWrapActive]}>
                <Feather name={tab.icon} size={16} color={active ? '#67E8F9' : '#94A0C3'} />
              </View>
              <Text style={[styles.tabTitle, active && styles.tabTitleActive]}>{t(tab.labelKey)}</Text>
              {!compact && <Text style={styles.tabSubtitle}>{tab.subtitle}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

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

const styles = StyleSheet.create({
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
    borderColor: 'rgba(163,177,255,0.14)',
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
    color: '#F7F8FF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  subtitle: {
    color: '#97A4C7',
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
    borderColor: 'rgba(163,177,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
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
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
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
    color: '#F7F8FF',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  tabTitleActive: {
    color: '#67E8F9',
  },
  tabSubtitle: {
    color: '#8390B2',
    fontSize: 11,
    lineHeight: 16,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
});
