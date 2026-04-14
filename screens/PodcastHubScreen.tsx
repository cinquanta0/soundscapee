import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import PodcastScreen from './PodcastScreen';
import PodcastListScreen from './PodcastListScreen';
import PodcastDetailScreen from './PodcastDetailScreen';
import PlaylistListScreen from './PlaylistListScreen';
import PlaylistDetailScreen from './PlaylistDetailScreen';
import ITSSchoolScreen from './ITSSchoolScreen';

type PodcastView = 'feed' | 'its' | 'school' | 'playlists' | 'podcastDetail' | 'playlistDetail';

export default function PodcastHubScreen() {
  const [view, setView] = useState<PodcastView>('feed');
  const [selectedPodcastId, setSelectedPodcastId] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<{ id: string; name: string } | null>(null);

  if (view === 'podcastDetail' && selectedPodcastId) {
    return (
      <PodcastDetailScreen
        podcastId={selectedPodcastId}
        onBack={() => {
          setSelectedPodcastId(null);
          setView('its');
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
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, view === 'feed' && styles.tabActive]}
          onPress={() => setView('feed')}
        >
          <Text style={[styles.tabText, view === 'feed' && styles.tabTextActive]}>Feed</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, view === 'its' && styles.tabActive]}
          onPress={() => setView('its')}
        >
          <Text style={[styles.tabText, view === 'its' && styles.tabTextActive]}>ITS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, view === 'school' && styles.tabActive]}
          onPress={() => setView('school')}
        >
          <Text style={[styles.tabText, view === 'school' && styles.tabTextActive]}>Scuola</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, view === 'playlists' && styles.tabActive]}
          onPress={() => setView('playlists')}
        >
          <Text style={[styles.tabText, view === 'playlists' && styles.tabTextActive]}>Playlist</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {view === 'feed' && <PodcastScreen />}
        {view === 'its' && (
          <PodcastListScreen
            initialTab="its"
            hideTabs
            onSelectPodcast={(podcastId) => {
              setSelectedPodcastId(podcastId);
              setView('podcastDetail');
            }}
          />
        )}
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
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: 'rgba(0,255,156,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.3)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#00FF9C',
  },
  content: {
    flex: 1,
  },
});
