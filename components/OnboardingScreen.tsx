import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const SLIDES = [
    {
      icon: '🎧',
      title: t('onboarding.slide1_title'),
      subtitle: t('onboarding.slide1_subtitle'),
      color: '#F59E0B',
    },
    {
      icon: '🎙️',
      title: t('onboarding.slide2_title'),
      subtitle: t('onboarding.slide2_subtitle'),
      color: '#00FF9C',
    },
    {
      icon: '🗺️',
      title: t('onboarding.slide3_title'),
      subtitle: t('onboarding.slide3_subtitle'),
      color: '#8B5CF6',
    },
  ];

  const goTo = (index: number) => {
    setCurrent(index);
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const handleNext = () => {
    if (current < SLIDES.length - 1) {
      goTo(current + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    await AsyncStorage.setItem('soundscape_onboarding_done', '1');
    onComplete();
  };

  const slide = SLIDES[current];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <View style={[styles.iconWrap, { borderColor: s.color + '40', backgroundColor: s.color + '18' }]}>
              <Text style={styles.icon}>{s.icon}</Text>
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.subtitle}>{s.subtitle}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.dot,
              i === current
                ? { width: 24, backgroundColor: slide.color }
                : { backgroundColor: 'rgba(255,255,255,0.2)' },
            ]}
            onPress={() => goTo(i)}
          />
        ))}
      </View>

      <View style={styles.actions}>
        {current < SLIDES.length - 1 ? (
          <>
            <TouchableOpacity style={styles.skipBtn} onPress={handleComplete}>
              <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextText}>{t('onboarding.next')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: slide.color }]}
            onPress={handleComplete}
          >
            <Text style={styles.startText}>{t('onboarding.start')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
    paddingBottom: 16,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 20,
  },
  iconWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 16,
  },
  icon: { fontSize: 50 },
  title: {
    fontFamily: 'System',
    fontSize: 24,
    fontWeight: '700',
    color: '#F8F4EF',
    textAlign: 'center',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 15,
    color: '#8A8D96',
    textAlign: 'center',
    lineHeight: 22,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 28,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    width: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    gap: 12,
    marginBottom: 8,
  },
  skipBtn: {
    padding: 8,
  },
  skipText: {
    color: '#4A4D56',
    fontSize: 15,
  },
  nextBtn: {
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  nextText: {
    color: '#F8F4EF',
    fontSize: 15,
    fontWeight: '500',
  },
  startBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  startText: {
    color: '#080808',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
