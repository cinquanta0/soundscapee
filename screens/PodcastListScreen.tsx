import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PodcastCard from '../components/PodcastCard';
import { C } from '../constants/design';
import { getPodcasts, Podcast } from '../services/podcastService';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'tutti' | 'scuola';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onSelectPodcast: (id: string) => void;
  initialTab?: Tab;
  hideTabs?: boolean;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PodcastListScreen({ onSelectPodcast, initialTab = 'tutti', hideTabs = false }: Props) {
  const { t } = useTranslation();
  const [all, setAll] = useState<Podcast[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await getPodcasts(100);
      setAll(data);
    } catch {
      setError(t('podcast.cannotLoad'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const effectiveTab: Tab = hideTabs ? 'scuola' : activeTab;
  const lista = effectiveTab === 'scuola'
    ? all.filter((p) => p.isITS === true)
    : all.filter((p) => !p.isITS);

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0A0A0A', '#0D0D0D', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      {/* Tab selector */}
      {!hideTabs && (
        <View style={s.tabsWrap}>
          <TouchableOpacity
            style={[s.tab, activeTab === 'tutti' && s.tabActive]}
            onPress={() => setActiveTab('tutti')}
            activeOpacity={0.75}
          >
            <Text style={[s.tabTxt, activeTab === 'tutti' && s.tabTxtActive]}>
              {t('podcast.tabAll')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === 'scuola' && s.tabActive]}
            onPress={() => setActiveTab('scuola')}
            activeOpacity={0.75}
          >
            <Text style={[s.tabTxt, activeTab === 'scuola' && s.tabTxtActive]}>
              {t('podcast.tabSchool')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={s.centered}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={s.centered}>
          <Feather name="alert-circle" size={36} color="rgba(255,100,100,0.6)" />
          <Text style={s.errorTxt}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryTxt}>{t('common.ok')}</Text>
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
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
          ListEmptyComponent={
            <View style={s.centered}>
              <Feather name="mic-off" size={40} color="rgba(255,255,255,0.15)" />
              <Text style={s.emptyTxt}>{t('podcast.empty')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  tabsWrap: {
    flexDirection: 'row',
    marginHorizontal: 16, marginTop: 12, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10, padding: 3,
    borderWidth: 1, borderColor: C.border,
  },
  tab: {
    flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8,
  },
  tabActive: {
    backgroundColor: C.accentDim,
    borderWidth: 1, borderColor: C.borderAccent,
  },
  tabTxt: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.35)' },
  tabTxtActive: { color: C.accent },

  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 14,
  },
  emptyContainer: { flexGrow: 1 },
  listContent: { padding: 16, gap: 12 },

  emptyTxt: { fontSize: 15, color: 'rgba(255,255,255,0.3)', textAlign: 'center' },

  errorTxt: { fontSize: 14, color: 'rgba(255,100,100,0.85)', textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1, borderColor: C.borderAccent, backgroundColor: C.accentDim,
  },
  retryTxt: { color: C.accent, fontSize: 13, fontWeight: '600' },
});
