import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../constants/themes';

export type TabId = 'home' | 'explore' | 'map' | 'challenges' | 'communities' | 'profile' | 'messages';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  accent: string;
}

interface BottomNavBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: Tab[] = [
  { id: 'home',       label: 'Feed',       icon: 'activity',      accent: '#67E8F9' },
  { id: 'explore',    label: 'Explore',    icon: 'compass',        accent: '#8B5CFF' },
  { id: 'map',        label: 'Map',        icon: 'map-pin',        accent: '#4F7CFF' },
  { id: 'challenges', label: 'Challenges', icon: 'award',          accent: '#FF9B5E' },
  { id: 'messages',   label: 'Messages',   icon: 'message-circle', accent: '#F472FF' },
  { id: 'profile',    label: 'Profile',    icon: 'user',           accent: '#4F7CFF' },
];

const NAV_KEYS: Record<TabId, string> = {
  home: 'nav.home', explore: 'nav.explore', map: 'nav.map',
  challenges: 'nav.challenges', communities: 'nav.communities',
  messages: 'nav.messages', profile: 'nav.profile',
};

const IRIS = ['#67E8F9', '#818CF8', '#C084FC', '#F472B6', '#67E8F9'] as [string, string, ...string[]];

// ─── NavItem ──────────────────────────────────────────────────────────────────

function NavItem({ tab, isActive, onPress }: { tab: Tab; isActive: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.82, useNativeDriver: true, speed: 28, bounciness: 4 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 28, bounciness: 4 }).start();

  return (
    <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={1} style={styles.itemTouch}>
      <Animated.View style={[styles.itemInner, { transform: [{ scale }] }]}>
        <Feather name={tab.icon} size={19} color={isActive ? '#ffffff' : colors.iconInactive} />
        <Text style={[styles.label, { color: isActive ? '#ffffff' : colors.iconInactive }]} numberOfLines={1}>
          {t(NAV_KEYS[tab.id])}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Glass Pill ───────────────────────────────────────────────────────────────
// On iOS: the bar is already blurred → pill is a lighter "lens" over the blur.
// On Android: solid tinted pill since BlurView is unreliable.

function GlassPill({ translateX, width }: { translateX: Animated.Value; width: number }) {
  if (width === 0) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.pillOuter, { width, transform: [{ translateX }] }]}>
      {/* Iridescent gradient border via 1px padding */}
      <LinearGradient colors={IRIS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      <View style={styles.pillInner}>
        {Platform.OS === 'ios' ? (
          // Lighter blur over the already-dark-blurred bar → creates depth
          <BlurView intensity={40} tint="systemUltraThinMaterial" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.pillAndroidBg]} />
        )}
        {/* White highlight — makes pill brighter than bar */}
        <View style={styles.pillHighlight} />
        {/* Top shimmer */}
        <View style={styles.pillShimmer} />
      </View>
    </Animated.View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BottomNavBar({ activeTab, onTabChange }: BottomNavBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const dynStyles = useMemo(() => createDynStyles(colors), [colors]);

  const [tabWidth, setTabWidth] = useState(0);
  const tabWidthRef  = useRef(0);
  const pillX        = useRef(new Animated.Value(0)).current;
  const pillXValue   = useRef(0);
  const activeIdxRef = useRef(TABS.findIndex((t) => t.id === activeTab));
  const touchStartX  = useRef(0);
  const pillStartX   = useRef(0);
  const isDragging   = useRef(false);

  useEffect(() => {
    const id = pillX.addListener(({ value }) => { pillXValue.current = value; });
    return () => pillX.removeListener(id);
  }, [pillX]);

  useEffect(() => {
    const idx = TABS.findIndex((t) => t.id === activeTab);
    if (idx < 0 || tabWidthRef.current === 0) return;
    activeIdxRef.current = idx;
    Animated.spring(pillX, { toValue: idx * tabWidthRef.current, useNativeDriver: false, speed: 14, bounciness: 9 }).start();
  }, [activeTab, pillX]);

  const onBarLayout = useCallback((e: any) => {
    const tw = e.nativeEvent.layout.width / TABS.length;
    tabWidthRef.current = tw;
    setTabWidth(tw);
    pillX.setValue(activeIdxRef.current * tw);
  }, [pillX]);

  const snapToIndex = useCallback((idx: number) => {
    const c = Math.max(0, Math.min(idx, TABS.length - 1));
    activeIdxRef.current = c;
    onTabChange(TABS[c].id);
    Animated.spring(pillX, { toValue: c * tabWidthRef.current, useNativeDriver: false, speed: 14, bounciness: 9 }).start();
  }, [pillX, onTabChange]);

  const responderHandlers = {
    onStartShouldSetResponder: () => false,
    onStartShouldSetResponderCapture: () => false,
    onMoveShouldSetResponder: (e: any) => Math.abs(e.nativeEvent.pageX - touchStartX.current) > 6,
    onMoveShouldSetResponderCapture: (e: any) => Math.abs(e.nativeEvent.pageX - touchStartX.current) > 6,
    onResponderGrant: () => { isDragging.current = true; pillStartX.current = pillXValue.current; },
    onResponderMove: (e: any) => {
      const raw = pillStartX.current + (e.nativeEvent.pageX - touchStartX.current);
      pillX.setValue(Math.max(0, Math.min(raw, tabWidthRef.current * (TABS.length - 1))));
    },
    onResponderRelease: () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      snapToIndex(Math.round(pillXValue.current / tabWidthRef.current));
    },
    onResponderTerminate: () => { isDragging.current = false; },
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.barWrap}>

        {/* ── Bar background ────────────────────────────────────────────────── */}
        {Platform.OS === 'ios' ? (
          // Full-bar blur → app content behind is blurred (the "underwater" feel)
          <BlurView intensity={58} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, dynStyles.barAndroidBg]} />
        )}

        {/* Very thin dark tint so icons stay readable over any bright content */}
        <View style={styles.barTint} />

        {/* Iridescent top border line */}
        <LinearGradient
          colors={IRIS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.barTopBorder, { opacity: 0.7 }]}
        />

        {/* ── Tab row ──────────────────────────────────────────────────────── */}
        <View
          style={styles.pillTrack}
          onLayout={onBarLayout}
          onTouchStart={(e) => {
            touchStartX.current = e.nativeEvent.pageX;
            pillStartX.current  = pillXValue.current;
          }}
          {...responderHandlers}
        >
          <GlassPill translateX={pillX} width={tabWidth} />

          {TABS.map((tab, idx) => (
            <NavItem
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              onPress={() => snapToIndex(idx)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Static styles (unchanged between themes) ─────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    zIndex: 20,
  },
  barWrap: {
    borderRadius: 30,
    overflow: 'hidden',   // clips BlurView to pill shape
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      android: { elevation: 18 },
    }),
  },
  // Barely-there dark veil so text/icons are readable over bright content
  barTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,12,24,0.30)',
  },
  // Iridescent 1px line at the very top of the bar
  barTopBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  pillTrack: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 2,
  },
  // ── Pill ──
  pillOuter: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 22,
    overflow: 'hidden',
    padding: 1,           // exposes LinearGradient as border
  },
  pillInner: {
    flex: 1,
    borderRadius: 21,
    overflow: 'hidden',
  },
  pillAndroidBg: {
    backgroundColor: 'rgba(79,100,220,0.28)',
  },
  // White-ish overlay to make pill visibly brighter than the bar
  pillHighlight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  pillShimmer: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 999,
  },
  // ── Items ──
  itemTouch: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 8,
  },
  itemInner: {
    alignItems: 'center',
    gap: 3,
    paddingTop: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: 'rgba(255,255,255,0.4)',
  },
  labelActive: {
    color: '#ffffff',
  },
});

// ─── Dynamic styles (theme-dependent) ────────────────────────────────────────

function createDynStyles(colors: ThemeColors) {
  return StyleSheet.create({
    barAndroidBg: {
      backgroundColor: colors.navBg,
    },
  });
}
