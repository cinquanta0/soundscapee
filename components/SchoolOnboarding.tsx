import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';

const { width: SW } = Dimensions.get('window');

interface Slide {
  icon: string;
  titleKey: string;
  subtitleKey: string;
  color: string;
}

const SLIDES: Slide[] = [
  {
    icon: '🎓',
    titleKey: 'school.onboarding.slide1Title',
    subtitleKey: 'school.onboarding.slide1Subtitle',
    color: '#F0A500',
  },
  {
    icon: '📋',
    titleKey: 'school.onboarding.slide2Title',
    subtitleKey: 'school.onboarding.slide2Subtitle',
    color: '#4D8BF5',
  },
  {
    icon: '🎤',
    titleKey: 'school.onboarding.slide3Title',
    subtitleKey: 'school.onboarding.slide3Subtitle',
    color: '#00C97A',
  },
];

export default function SchoolOnboarding({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  const slide = SLIDES[current];
  const isLast = current === SLIDES.length - 1;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      <View style={s.overlay}>
        <View style={s.card}>

          {/* Top accent line */}
          <View style={[s.topAccent, { backgroundColor: slide.color }]} />

          {/* Icon */}
          <View style={[s.iconWrap, { borderColor: slide.color + '40', backgroundColor: slide.color + '15' }]}>
            <Text style={s.icon}>{slide.icon}</Text>
          </View>

          {/* Step counter */}
          <Text style={s.stepLabel}>{current + 1} / {SLIDES.length}</Text>

          {/* Text */}
          <Text style={[s.title, { color: slide.color }]}>{t(slide.titleKey)}</Text>
          <Text style={s.subtitle}>{t(slide.subtitleKey)}</Text>

          {/* Progress dots */}
          <View style={s.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  s.dot,
                  i === current
                    ? { backgroundColor: slide.color, width: 22 }
                    : i < current
                      ? { backgroundColor: slide.color + '60', width: 8 }
                      : { backgroundColor: 'rgba(255,255,255,0.12)', width: 8 },
                ]}
              />
            ))}
          </View>

          {/* Actions */}
          <View style={s.actions}>
            {!isLast ? (
              <TouchableOpacity onPress={onComplete} style={s.skipBtn}>
                <Text style={s.skipTxt}>{t('school.onboarding.skip')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[s.nextBtn, { backgroundColor: slide.color }]}
              onPress={() => isLast ? onComplete() : setCurrent(c => c + 1)}
            >
              <Text style={s.nextTxt}>
                {isLast ? t('school.onboarding.start') : t('school.onboarding.next')}
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4,8,18,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0F1F35',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1A2D4A',
    width: Math.min(SW - 48, 380),
    alignItems: 'center',
    overflow: 'hidden',
    paddingBottom: 28,
  },
  topAccent: {
    height: 3,
    width: '100%',
    marginBottom: 28,
    opacity: 0.8,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  icon: { fontSize: 40 },
  stepLabel: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
    paddingHorizontal: 20,
    lineHeight: 26,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 28,
    marginBottom: 20,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginBottom: 24,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  skipTxt: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  nextTxt: {
    color: '#060400',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
