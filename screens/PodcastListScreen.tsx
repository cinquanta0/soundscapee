import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import PodcastCard from '../components/PodcastCard';
import { getPodcasts, Podcast } from '../services/podcastService';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onSelectPodcast: (id: string) => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'tutti' | 'its';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PodcastListScreen({ onSelectPodcast }: Props) {
  const [all, setAll] = useState<Podcast[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('tutti');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await getPodcasts(100);
      setAll(data);
    } catch {
      setError('Impossibile caricare i podcast. Controlla la connessione.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filtered lists ─────────────────────────────────────────────────────────
  // I documenti vecchi (senza campo isITS) vengono trattati come isITS = false

  const lista = activeTab === 'its'
    ? all.filter((p) => p.isITS === true)
    : all.filter((p) => !p.isITS);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <LinearGradient
        colors={['#050508', '#0D0D1A', '#1A0A2E']}
        style={StyleSheet.absoluteFill}
      />

      {/* Tab bar */}
      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, activeTab === 'tutti' && s.tabActive]}
          onPress={() => setActiveTab('tutti')}
          activeOpacity={0.75}
        >
          <Text style={[s.tabTxt, activeTab === 'tutti' && s.tabTxtActive]}>
            Tutti
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === 'its' && s.tabActive]}
          onPress={() => setActiveTab('its')}
          activeOpacity={0.75}
        >
          <Text style={[s.tabTxt, activeTab === 'its' && s.tabTxtActive]}>
            ITS
          </Text>
        </TouchableOpacity>
      </View>

      {/* Loading iniziale */}
      {loading && (
        <View style={s.centered}>
          <ActivityIndicator color="#00FF9C" size="large" />
        </View>
      )}

      {/* Errore */}
      {!loading && error && (
        <View style={s.centered}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={s.errorTxt}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryTxt}>Riprova</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Lista */}
      {!loading && !error && (
        <FlatList
          data={lista}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PodcastCard
              podcast={item}
              onPress={() => onSelectPodcast(item.id)}
            />
          )}
          contentContainerStyle={lista.length === 0 ? s.emptyContainer : s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#00FF9C"
              colors={['#00FF9C']}
            />
          }
          ListEmptyComponent={
            <View style={s.centered}>
              <Text style={s.emptyIcon}>🎙</Text>
              <Text style={s.emptyTxt}>Nessun podcast disponibile</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
  },

  // ── Tabs ──
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: 'rgba(0,255,156,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.3)',
  },
  tabTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
  },
  tabTxtActive: {
    color: '#00FF9C',
  },

  // ── States ──
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },

  // ── Empty ──
  emptyIcon: {
    fontSize: 48,
  },
  emptyTxt: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },

  // ── Error ──
  errorIcon: {
    fontSize: 40,
  },
  errorTxt: {
    fontSize: 14,
    color: 'rgba(255,100,100,0.9)',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.4)',
    backgroundColor: 'rgba(0,255,156,0.1)',
  },
  retryTxt: {
    color: '#00FF9C',
    fontSize: 13,
    fontWeight: '600',
  },
});
