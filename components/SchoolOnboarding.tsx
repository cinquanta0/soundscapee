import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C } from '../constants/design';

const { width: SW } = Dimensions.get('window');

interface Slide {
  icon: string;
  titleKey: string;
  subtitleKey: string;
  featherIcon: string;
  color: string;
}

const SLIDES: Slide[] = [
  {
    icon: '🎓',
    titleKey: 'school.onboarding.slide1Title',
    subtitleKey: 'school.onboarding.slide1Subtitle',
    featherIcon: 'award',
    color: '#F0A500',
  },
  {
    icon: '📋',
    titleKey: 'school.onboarding.slide2Title',
    subtitleKey: 'school.onboarding.slide2Subtitle',
    featherIcon: 'clipboard',
    color: '#4D8BF5',
  },
  {
    icon: '🎤',
    titleKey: 'school.onboarding.slide3Title',
    subtitleKey: 'school.onboarding.slide3Subtitle',
    featherIcon: 'mic',
    color: C.accent,
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

          {/* Top accent bar */}
          <View style={[s.topAccent, { backgroundColor: slide.color }]} />

          {/* Icon circle */}
          <View style={[s.iconWrap, { borderColor: slide.color + '40', backgroundColor: slide.color + '12' }]}>
            <Text style={s.icon}>{slide.icon}</Text>
          </View>

          {/* Step counter */}
          <Text style={s.stepLabel}>{current + 1} / {SLIDES.length}</Text>

          {/* Text */}
          <Text style={[s.title, { color: slide.color }]}>{t(slide.titleKey)}</Text>
          <Text style={s.subtitle}>{t(slide.subtitleKey)}</Text>

          {/* Progress dots */}
          <View style={s.dots}>
            {SLIDES.map((sl, i) => (
              <View
                key={i}
                style={[
                  s.dot,
                  i === current
                    ? { backgroundColor: slide.color, width: 22 }
                    : i < current
                      ? { backgroundColor: slide.color + '55', width: 8 }
                      : { backgroundColor: C.glassMid, width: 8 },
                ]}
              />
            ))}
          </View>

          {/* Actions */}
          <View style={s.actions}>
            {!isLast && (
              <TouchableOpacity onPress={onComplete} style={s.skipBtn}>
                <Text style={s.skipTxt}>{t('school.onboarding.skip')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.nextBtn, { backgroundColor: slide.color }]}
              onPress={() => isLast ? onComplete() : setCurrent(c => c + 1)}
              activeOpacity={0.85}
            >
              <Feather
                name={isLast ? 'check' : 'arrow-right'}
                size={16}
                color="#050508"
                style={{ marginRight: 4 }}
              />
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
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: C.bgCard,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.borderStrong,
    width: Math.min(SW - 48, 380),
    alignItems: 'center',
    overflow: 'hidden',
    paddingBottom: 28,
  },
  topAccent: {
    height: 3,
    width: '100%',
    marginBottom: 28,
  },
  iconWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  icon: { fontSize: 40 },
  stepLabel: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    paddingHorizontal: 20,
    lineHeight: 27,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 28,
    marginBottom: 22,
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
    paddingVertical: 12,
  },
  skipTxt: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    gap: 4,
  },
  nextTxt: {
    color: '#050508',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
