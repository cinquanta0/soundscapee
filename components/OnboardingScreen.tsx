import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../constants/themes';

const { width } = Dimensions.get('window');

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
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
      icon: '📞',
      title: t('onboarding.slide3_title'),
      subtitle: t('onboarding.slide3_subtitle'),
      color: '#67E8F9',
    },
    {
      icon: '⚔️',
      title: t('onboarding.slide4_title'),
      subtitle: t('onboarding.slide4_subtitle'),
      color: '#8B5CF6',
    },
    {
      icon: '🗺️',
      title: t('onboarding.slide5_title'),
      subtitle: t('onboarding.slide5_subtitle'),
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
    await AsyncStorage.setItem('miuslyk_onboarding_done', '1');
    onComplete();
  };

  const slide = SLIDES[current];

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom', 'left', 'right']}>
      <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {SLIDES.map((sl, i) => (
          <View key={i} style={[s.slide, { width }]}>
            <View style={[s.iconWrap, { borderColor: sl.color + '40', backgroundColor: sl.color + '18' }]}>
              <Text style={s.icon}>{sl.icon}</Text>
            </View>
            <Text style={s.title}>{sl.title}</Text>
            <Text style={s.subtitle}>{sl.subtitle}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <TouchableOpacity
            key={i}
            style={[
              s.dot,
              i === current
                ? { width: 24, backgroundColor: slide.color }
                : { backgroundColor: colors.surfaceMedium },
            ]}
            onPress={() => goTo(i)}
          />
        ))}
      </View>

      <View style={s.actions}>
        {current < SLIDES.length - 1 ? (
          <>
            <TouchableOpacity style={s.skipBtn} onPress={handleComplete}>
              <Text style={s.skipText}>{t('onboarding.skip')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.nextBtn} onPress={handleNext}>
              <Text style={s.nextText}>{t('onboarding.next')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[s.startBtn, { backgroundColor: slide.color }]}
            onPress={handleComplete}
          >
            <Text style={s.startText}>{t('onboarding.start')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
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
      color: colors.text,
      textAlign: 'center',
      lineHeight: 32,
    },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
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
      color: colors.textSecondary,
      fontSize: 15,
    },
    nextBtn: {
      paddingVertical: 13,
      paddingHorizontal: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(0,255,156,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(0,255,156,0.25)',
    },
    nextText: {
      color: '#00FF9C',
      fontSize: 15,
      fontWeight: '600',
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
      color: colors.bg,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  });
}
