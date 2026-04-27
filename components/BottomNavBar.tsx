import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C, T, S, Spring } from '../constants/design';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TabId = 'home' | 'explore' | 'map' | 'challenges' | 'communities' | 'profile' | 'messages';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
}

interface BottomNavBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TAB_ICONS: Record<TabId, React.ComponentProps<typeof Feather>['name']> = {
  home:        'radio',
  explore:     'search',
  map:         'map-pin',
  challenges:  'award',
  communities: 'users',
  messages:    'message-circle',
  profile:     'user',
};

// ─── NavItem ──────────────────────────────────────────────────────────────────

function NavItem({
  tab,
  isActive,
  onPress,
}: {
  tab: Tab;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale        = useRef(new Animated.Value(1)).current;
  const pillOpacity  = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const pillScaleX   = useRef(new Animated.Value(isActive ? 1 : 0.5)).current;
  const glowOpacity  = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const lift         = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pillOpacity, { toValue: isActive ? 1 : 0, useNativeDriver: true, ...Spring.snappy }),
      Animated.spring(pillScaleX,  { toValue: isActive ? 1 : 0.5, useNativeDriver: true, ...Spring.bouncy }),
      Animated.timing(glowOpacity, { toValue: isActive ? 1 : 0, duration: 250, useNativeDriver: true }),
      Animated.spring(lift,        { toValue: isActive ? 1 : 0, useNativeDriver: true, ...Spring.smooth }),
    ]).start();
  }, [glowOpacity, isActive, lift, pillOpacity, pillScaleX]);

  const onPressIn  = () => Animated.spring(scale, { toValue: 0.84, useNativeDriver: true, ...Spring.snappy }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, ...Spring.snappy }).start();
  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });

  return (
    <TouchableOpacity
      style={styles.navItem}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={1}
    >
      <Animated.View style={[styles.navItemInner, { transform: [{ scale }, { translateY }] }]}>

        {/* Icon zone with pill highlight */}
        <View style={styles.iconZone}>
          {/* Pill background */}
          <Animated.View style={[styles.pillWrap, { opacity: pillOpacity, transform: [{ scaleX: pillScaleX }] }]}>
            <LinearGradient
              colors={['rgba(0,255,156,0.24)', 'rgba(99,214,255,0.14)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.pill}
            />
          </Animated.View>
          {/* Outer glow halo */}
          <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />
          {/* Icon */}
          <Feather
            name={tab.icon}
            size={20}
            color={isActive ? C.accent : C.textMuted}
          />
        </View>

        {/* Label */}
        <Text
          style={[styles.label, isActive && styles.labelActive]}
          numberOfLines={1}
        >
          {tab.label}
        </Text>

        {/* Active dot */}
        <Animated.View
          style={[styles.activeDot, { opacity: pillOpacity, transform: [{ scaleX: pillScaleX }] }]}
        />

      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── BottomNavBar ─────────────────────────────────────────────────────────────

export default function BottomNavBar({ activeTab, onTabChange }: BottomNavBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const TABS: Tab[] = [
    { id: 'home',        label: t('nav.home'),        icon: TAB_ICONS.home        },
    { id: 'explore',     label: t('nav.explore'),     icon: TAB_ICONS.explore     },
    { id: 'map',         label: t('nav.map'),         icon: TAB_ICONS.map         },
    { id: 'challenges',  label: t('nav.challenges'),  icon: TAB_ICONS.challenges  },
    { id: 'communities', label: t('nav.communities'), icon: TAB_ICONS.communities },
    { id: 'messages',    label: t('nav.messages'),    icon: TAB_ICONS.messages    },
    { id: 'profile',     label: t('nav.profile'),     icon: TAB_ICONS.profile     },
  ];

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.ambientLeft} />
      <View style={styles.ambientRight} />
      <View style={styles.bar}>
        <LinearGradient
          colors={['rgba(125,255,208,0.08)', 'rgba(255,255,255,0.02)', 'rgba(99,214,255,0.06)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.barRim} />
        {TABS.map((tab) => (
          <NavItem
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onPress={() => onTabChange(tab.id)}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  ambientLeft: {
    position: 'absolute',
    left: 28,
    bottom: 18,
    width: 92,
    height: 46,
    borderRadius: 999,
    backgroundColor: 'rgba(0,255,156,0.08)',
  },
  ambientRight: {
    position: 'absolute',
    right: 28,
    bottom: 18,
    width: 88,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(99,214,255,0.06)',
  },
  bar: {
    overflow: 'hidden',
    flexDirection: 'row',
    paddingTop: S.sm + 1,
    paddingHorizontal: S.xs + 2,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.borderCanvas,
    backgroundColor: C.glassDark,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
      },
      android: { elevation: 20 },
    }),
  },
  barRim: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
  },
  navItemInner: {
    alignItems: 'center',
    gap: S.xs - 1,
    paddingHorizontal: S.xs,
    paddingBottom: 4,
  },
  iconZone: {
    width: 46,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pillWrap: {
    position: 'absolute',
    width: 46,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
  },
  pill: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  glow: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,255,156,0.16)',
  },
  label: {
    ...T.labelS,
    color: C.textMuted,
    letterSpacing: 0.45,
  },
  labelActive: {
    color: C.textPrimary,
    fontWeight: '600',
  },
  activeDot: {
    width: 18,
    height: 3,
    borderRadius: 999,
    backgroundColor: C.accentWarm,
    marginTop: 2,
  },
});
