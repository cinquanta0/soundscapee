// components/RemixProfileSection.js
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  getUserRemixes, 
  deleteRemix,
  getUserRemixStats 
} from '../services/remixService';

export default function RemixProfileSection({ onOpenRemixStudio }) {
  const [remixes, setRemixes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRemix, setSelectedRemix] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [remixesData, statsData] = await Promise.all([
        getUserRemixes(),
        getUserRemixStats(),
      ]);
      setRemixes(remixesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading remix data:', error);
      Alert.alert('Errore', 'Impossibile caricare i remix');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (remixId) => {
    Alert.alert(
      'Elimina Remix',
      'Vuoi davvero eliminare questo remix?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRemix(remixId);
              setRemixes(remixes.filter(r => r.id !== remixId));
              Alert.alert('✅', 'Remix eliminato');
              await loadData();
            } catch (error) {
              Alert.alert('Errore', 'Impossibile eliminare il remix');
            }
          },
        },
      ]
    );
  };

  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#06b6d4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Card */}
      {stats && (
        <LinearGradient
          colors={['#0891b2', '#3b82f6']}
          style={styles.statsCard}
        >
          <Text style={styles.statsTitle}>📊 Le Tue Stats Remix</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.totalRemixes}</Text>
              <Text style={styles.statLabel}>Remix</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.totalPlays}</Text>
              <Text style={styles.statLabel}>Play</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.totalLikes}</Text>
              <Text style={styles.statLabel}>Likes</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {(stats.avgTracksPerRemix ?? 0).toFixed(1)}
              </Text>
              <Text style={styles.statLabel}>Avg Tracce</Text>
            </View>
          </View>
        </LinearGradient>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>
          🎛️ I Miei Remix ({remixes.length})
        </Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={onOpenRemixStudio}
        >
          <Text style={styles.createButtonText}>➕ Nuovo</Text>
        </TouchableOpacity>
      </View>

      {/* Empty State */}
      {remixes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎛️</Text>
          <Text style={styles.emptyText}>Nessun remix ancora</Text>
          <Text style={styles.emptySubtext}>
            Crea il tuo primo remix mixando i tuoi suoni!
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={onOpenRemixStudio}
          >
            <Text style={styles.emptyButtonText}>🎵 Inizia a Remixare</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Remixes List */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.remixScroll}
          >
            {remixes.map((remix) => (
              <RemixCard
                key={remix.id}
                remix={remix}
                onPress={() => setSelectedRemix(remix)}
                onDelete={() => handleDelete(remix.id)}
                isSelected={selectedRemix?.id === remix.id}
              />
            ))}
          </ScrollView>

          {/* Selected Remix Details */}
          {selectedRemix && (
            <View style={styles.detailsCard}>
              <View style={styles.detailsHeader}>
                <Text style={styles.detailsTitle}>{selectedRemix.title}</Text>
                <TouchableOpacity onPress={() => setSelectedRemix(null)}>
                  <Text style={styles.detailsClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.detailsDescription}>
                {selectedRemix.description || 'Nessuna descrizione'}
              </Text>

              <View style={styles.detailsInfo}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>📊 Tracce:</Text>
                  <Text style={styles.infoValue}>{selectedRemix.tracksCount}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>⏱️ Durata:</Text>
                  <Text style={styles.infoValue}>
                    {(selectedRemix.totalDuration ?? 0).toFixed(1)}s
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>📅 Creato:</Text>
                  <Text style={styles.infoValue}>
                    {formatDate(selectedRemix.createdAt)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>👁️ Pubblico:</Text>
                  <Text style={styles.infoValue}>
                    {selectedRemix.isPublic ? '✓ Sì' : '✗ No'}
                  </Text>
                </View>
              </View>

              <View style={styles.detailsStats}>
                <View style={styles.detailsStat}>
                  <Text style={styles.detailsStatIcon}>▶️</Text>
                  <Text style={styles.detailsStatNumber}>
                    {selectedRemix.plays || 0}
                  </Text>
                </View>
                <View style={styles.detailsStat}>
                  <Text style={styles.detailsStatIcon}>❤️</Text>
                  <Text style={styles.detailsStatNumber}>
                    {selectedRemix.likes || 0}
                  </Text>
                </View>
                <View style={styles.detailsStat}>
                  <Text style={styles.detailsStatIcon}>🔗</Text>
                  <Text style={styles.detailsStatNumber}>
                    {selectedRemix.shares || 0}
                  </Text>
                </View>
              </View>

              {/* Processing Status */}
              {selectedRemix.isProcessed ? (
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>✅ Processato</Text>
                </View>
              ) : (
                <View style={[styles.statusBadge, { backgroundColor: '#eab308' }]}>
                  <Text style={styles.statusText}>⏳ In elaborazione...</Text>
                </View>
              )}

              {/* Actions */}
              <View style={styles.detailsActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => Alert.alert('Info', 'Feature in arrivo!')}
                >
                  <Text style={styles.actionButtonText}>🔗 Condividi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => Alert.alert('Info', 'Apri in editor (da implementare)')}
                >
                  <Text style={styles.actionButtonText}>✏️ Modifica</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// REMIX CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════

function RemixCard({ remix, onPress, onDelete, isSelected }) {
  return (
    <TouchableOpacity
      style={[styles.remixCard, isSelected && styles.remixCardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={['#1e293b', '#334155']}
        style={styles.remixCardGradient}
      >
        <View style={styles.remixCardHeader}>
          <View style={styles.remixIconContainer}>
            <Text style={styles.remixIcon}>🎛️</Text>
          </View>
          <TouchableOpacity
            style={styles.remixDeleteButton}
            onPress={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Text style={styles.remixDeleteIcon}>🗑️</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.remixCardTitle} numberOfLines={2}>
          {remix.title}
        </Text>

        <View style={styles.remixCardMeta}>
          <Text style={styles.remixCardMetaText}>
            {remix.tracksCount} tracce
          </Text>
          <Text style={styles.remixCardMetaText}>•</Text>
          <Text style={styles.remixCardMetaText}>
            {(remix.totalDuration ?? 0).toFixed(0)}s
          </Text>
        </View>

        <View style={styles.remixCardStats}>
          <View style={styles.remixCardStat}>
            <Text style={styles.remixCardStatIcon}>▶️</Text>
            <Text style={styles.remixCardStatText}>{remix.plays || 0}</Text>
          </View>
          <View style={styles.remixCardStat}>
            <Text style={styles.remixCardStatIcon}>❤️</Text>
            <Text style={styles.remixCardStatText}>{remix.likes || 0}</Text>
          </View>
        </View>

        <View style={styles.remixCardFooter}>
          {remix.isProcessed ? (
            <View style={styles.remixStatusDot} />
          ) : (
            <View style={[styles.remixStatusDot, { backgroundColor: '#eab308' }]} />
          )}
          <Text style={styles.remixStatusText}>
            {remix.isProcessed ? 'Pronto' : 'Processing'}
          </Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  
  // Stats Card
  statsCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.8,
    marginTop: 4,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  createButton: {
    backgroundColor: '#0891b2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },

  // Empty State
  emptyState: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: '#0891b2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Remix Scroll
  remixScroll: {
    marginBottom: 16,
  },

  // Remix Card
  remixCard: {
    width: 180,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  remixCardSelected: {
    transform: [{ scale: 1.05 }],
  },
  remixCardGradient: {
    padding: 16,
    minHeight: 200,
  },
  remixCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  remixIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0891b2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  remixIcon: {
    fontSize: 20,
  },
  remixDeleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  remixDeleteIcon: {
    fontSize: 12,
  },
  remixCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    minHeight: 40,
  },
  remixCardMeta: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  remixCardMetaText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  remixCardStats: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  remixCardStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  remixCardStatIcon: {
    fontSize: 12,
  },
  remixCardStatText: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  remixCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 'auto',
  },
  remixStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  remixStatusText: {
    fontSize: 10,
    color: '#64748b',
  },

  // Details Card
  detailsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  detailsClose: {
    fontSize: 20,
    color: '#94a3b8',
  },
  detailsDescription: {
    fontSize: 13,
    color: '#cbd5e1',
    marginBottom: 16,
  },
  detailsInfo: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 13,
    color: '#94a3b8',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  detailsStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#334155',
  },
  detailsStat: {
    alignItems: 'center',
  },
  detailsStatIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  detailsStatNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  statusBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  detailsActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});