import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);

  const handleRecord = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      // Simula timer
      const interval = setInterval(() => {
        setRecordTime(prev => {
          if (prev >= 30) {
            clearInterval(interval);
            setIsRecording(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      setRecordTime(0);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Background Gradient */}
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#533483']}
        style={StyleSheet.absoluteFill}
      />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>🎧</Text>
          <Text style={styles.title}>SoundScape</Text>
          <Text style={styles.subtitle}>Cattura i suoni del tuo mondo</Text>
        </View>

        {/* Record Button */}
        <View style={styles.recordSection}>
          <Text style={styles.instructions}>
            {isRecording ? `Registrando... ${recordTime}s` : 'Tap per registrare'}
          </Text>
          
          <TouchableOpacity
            style={styles.recordButton}
            onPress={handleRecord}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={isRecording ? ['#dc2626', '#991b1b'] : ['#ff416c', '#ff4b2b']}
              style={styles.recordGradient}
            >
              <View style={[
                styles.recordInner,
                isRecording && styles.recordInnerStop
              ]} />
            </LinearGradient>
          </TouchableOpacity>

          {isRecording && (
            <Text style={styles.timer}>{recordTime}s / 30s</Text>
          )}
        </View>

        {/* Demo Cards */}
        <View style={styles.cardsSection}>
          <Text style={styles.sectionTitle}>Suoni Popolari</Text>
          
          <SoundCard
            emoji="🌊"
            title="Onde al Tramonto"
            user="@marco_coastal"
            mood="Rilassante"
            listens="1.2k"
          />
          
          <SoundCard
            emoji="🌧️"
            title="Pioggia sui Vigneti"
            user="@sofia_nature"
            mood="Rilassante"
            listens="892"
          />
          
          <SoundCard
            emoji="🚃"
            title="Tram Mattutino"
            user="@milano_sounds"
            mood="Energico"
            listens="456"
          />
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoEmoji}>✨</Text>
          <Text style={styles.infoText}>
            Questo è un DEMO. L'app completa include:{'\n'}
            • Registrazione audio vera{'\n'}
            • Mappa interattiva{'\n'}
            • Sistema XP e badge{'\n'}
            • Feed infinito{'\n'}
            • E molto altro!
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// Mini Card Component
const SoundCard = ({ emoji, title, user, mood, listens }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <Text style={styles.cardEmoji}>{emoji}</Text>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardUser}>{user}</Text>
      </View>
      <View style={[
        styles.moodBadge,
        { backgroundColor: mood === 'Rilassante' ? '#3b82f6' : '#f97316' }
      ]}>
        <Text style={styles.moodText}>{mood}</Text>
      </View>
    </View>
    <View style={styles.cardFooter}>
      <Text style={styles.cardStat}>🎧 {listens}</Text>
      <Text style={styles.cardStat}>❤️ {Math.floor(Math.random() * 500)}</Text>
      <Text style={styles.cardStat}>💬 {Math.floor(Math.random() * 50)}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 64,
    marginBottom: 10,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  recordSection: {
    alignItems: 'center',
    marginVertical: 40,
  },
  instructions: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 30,
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  recordGradient: {
    flex: 1,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fff',
  },
  recordInnerStop: {
    width: 50,
    height: 50,
    borderRadius: 12,
  },
  timer: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ef4444',
    marginTop: 20,
  },
  cardsSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 20,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardEmoji: {
    fontSize: 40,
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  cardUser: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  moodBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  moodText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  cardFooter: {
    flexDirection: 'row',
    gap: 16,
  },
  cardStat: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  infoBox: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 16,
    padding: 20,
    marginTop: 30,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    alignItems: 'center',
  },
  infoEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 22,
  },
});