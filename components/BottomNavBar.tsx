import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C, T, S, Elevation, Spring } from '../constants/design';

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

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pillOpacity, { toValue: isActive ? 1 : 0, useNativeDriver: true, ...Spring.snappy }),
      Animated.spring(pillScaleX,  { toValue: isActive ? 1 : 0.5, useNativeDriver: true, ...Spring.bouncy }),
      Animated.timing(glowOpacity, { toValue: isActive ? 1 : 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [isActive]);

  const onPressIn  = () => Animated.spring(scale, { toValue: 0.84, useNativeDriver: true, ...Spring.snappy }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, ...Spring.snappy }).start();

  return (
    <TouchableOpacity
      style={styles.navItem}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={1}
    >
      <Animated.View style={[styles.navItemInner, { transform: [{ scale }] }]}>

        {/* Icon zone with pill highlight */}
        <View style={styles.iconZone}>
          {/* Pill background */}
          <Animated.View
            style={[
              styles.pill,
              { opacity: pillOpacity, transform: [{ scaleX: pillScaleX }] },
            ]}
          />
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
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {/* Top edge highlight line */}
      <View style={styles.topEdge} />

      <View style={styles.bar}>
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
    backgroundColor: 'rgba(10, 10, 10, 0.96)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
      android: { elevation: 20 },
    }),
  },
  topEdge: {
    height: 1,
    backgroundColor: C.border,
  },
  bar: {
    flexDirection: 'row',
    paddingTop: S.sm + 2,
    paddingHorizontal: S.xs,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
  },
  navItemInner: {
    alignItems: 'center',
    gap: S.xs - 1,
    paddingHorizontal: S.xs,
  },
  iconZone: {
    width: 42,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    width: 42,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 156, 0.15)',
  },
  glow: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.accentGlow,
  },
  label: {
    ...T.labelS,
    color: C.textMuted,
  },
  labelActive: {
    color: C.accent,
    fontWeight: '600',
  },
  activeDot: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: C.accent,
    marginTop: 1,
  },
});
