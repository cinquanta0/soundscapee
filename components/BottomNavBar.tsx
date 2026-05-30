import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn  = () => Animated.spring(scale, { toValue: 0.82, useNativeDriver: true, speed: 28, bounciness: 4 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 28, bounciness: 4 }).start();

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      activeOpacity={1}
      style={styles.itemTouch}
    >
      <Animated.View style={[styles.itemInner, { transform: [{ scale }] }]}>
        <Feather name={tab.icon} size={19} color={isActive ? '#ffffff' : '#8A93B6'} />
        <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
          {t(NAV_KEYS[tab.id])}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Glass Pill ───────────────────────────────────────────────────────────────

// Iridescent gradient colors — cycles like a prism
const IRIS_COLORS = ['#67E8F9', '#818CF8', '#C084FC', '#F472B6', '#67E8F9'] as const;

function GlassPill({ translateX, width }: { translateX: Animated.Value; width: number }) {
  if (width === 0) return null;
  return (
    // Outer: gradient border (1px via padding)
    <Animated.View
      pointerEvents="none"
      style={[styles.pillOuter, { width, transform: [{ translateX }] }]}
    >
      <LinearGradient
        colors={IRIS_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Inner glass surface — 1px inset to reveal gradient border */}
      <View style={styles.pillInner}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={72} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.pillAndroidBg]} />
        )}
        {/* Very subtle white haze — keeps it glass-like, not colored */}
        <View style={styles.pillHaze} />
        {/* Top shimmer */}
        <View style={styles.pillShimmer} />
      </View>
    </Animated.View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BottomNavBar({ activeTab, onTabChange }: BottomNavBarProps) {
  const insets = useSafeAreaInsets();

  const [tabWidth, setTabWidth]   = useState(0);
  const tabWidthRef               = useRef(0);
  const pillX                     = useRef(new Animated.Value(0)).current;
  const pillXValue                = useRef(0);
  const activeIdxRef              = useRef(TABS.findIndex((t) => t.id === activeTab));

  // Touch tracking for drag detection
  const touchStartX  = useRef(0);
  const pillStartX   = useRef(0);
  const isDragging   = useRef(false);

  // Track raw pill value for snap
  useEffect(() => {
    const id = pillX.addListener(({ value }) => { pillXValue.current = value; });
    return () => pillX.removeListener(id);
  }, [pillX]);

  // Slide pill when activeTab changes
  useEffect(() => {
    const idx = TABS.findIndex((t) => t.id === activeTab);
    if (idx < 0 || tabWidthRef.current === 0) return;
    activeIdxRef.current = idx;
    Animated.spring(pillX, {
      toValue: idx * tabWidthRef.current,
      useNativeDriver: false,
      speed: 14,
      bounciness: 9,
    }).start();
  }, [activeTab, pillX]);

  const onBarLayout = useCallback((e: any) => {
    const w = e.nativeEvent.layout.width;
    const tw = w / TABS.length;
    tabWidthRef.current = tw;
    setTabWidth(tw);
    pillX.setValue(activeIdxRef.current * tw);
  }, [pillX]);

  const snapToIndex = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, TABS.length - 1));
    activeIdxRef.current = clamped;
    onTabChange(TABS[clamped].id);
    Animated.spring(pillX, {
      toValue: clamped * tabWidthRef.current,
      useNativeDriver: false,
      speed: 14,
      bounciness: 9,
    }).start();
  }, [pillX, onTabChange]);

  // ── Responder system: steal only on clear horizontal drag (>6px) ───────────

  const responderHandlers = {
    // Record touch start without claiming the responder — lets children get taps
    onStartShouldSetResponder: () => false,
    onStartShouldSetResponderCapture: () => false,

    // Claim responder only when horizontal movement is clear
    onMoveShouldSetResponder: (e: any) => {
      const dx = Math.abs(e.nativeEvent.pageX - touchStartX.current);
      const dy = Math.abs(e.nativeEvent.pageY - (e.nativeEvent.pageY - 0)); // always 0
      return dx > 6;
    },
    onMoveShouldSetResponderCapture: (e: any) => {
      const dx = Math.abs(e.nativeEvent.pageX - touchStartX.current);
      return dx > 6;
    },

    onResponderGrant: () => {
      isDragging.current = true;
      pillStartX.current = pillXValue.current;
    },
    onResponderMove: (e: any) => {
      const dx = e.nativeEvent.pageX - touchStartX.current;
      const raw = pillStartX.current + dx;
      const clamped = Math.max(0, Math.min(raw, tabWidthRef.current * (TABS.length - 1)));
      pillX.setValue(clamped);
    },
    onResponderRelease: () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const nearest = Math.round(pillXValue.current / tabWidthRef.current);
      snapToIndex(nearest);
    },
    onResponderTerminate: () => {
      isDragging.current = false;
    },
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.ambientLeft} />
      <View style={styles.ambientRight} />

      <View style={styles.barWrap}>
        <LinearGradient
          colors={['rgba(18,23,44,0.96)', 'rgba(10,14,28,0.96)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bar}
        >
          <View style={styles.barShine} />

          <View
            style={styles.pillTrack}
            onLayout={onBarLayout}
            // Record finger position on every touch so moveShouldSetResponder can measure dx
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
        </LinearGradient>
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
    paddingHorizontal: 14,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  ambientLeft: {
    position: 'absolute',
    left: 22,
    bottom: 20,
    width: 120,
    height: 62,
    borderRadius: 999,
    backgroundColor: 'rgba(79,124,255,0.10)',
  },
  ambientRight: {
    position: 'absolute',
    right: 18,
    bottom: 16,
    width: 108,
    height: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(79,124,255,0.07)',
  },
  barWrap: {
    borderRadius: 30,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.4,
        shadowRadius: 22,
      },
      android: { elevation: 18 },
    }),
  },
  bar: {
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.14)',
    overflow: 'hidden',
  },
  barShine: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    zIndex: 2,
  },
  pillTrack: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 2,
  },
  // Outer wrapper — the gradient shows as the 1px border
  pillOuter: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 22,
    overflow: 'hidden',
    padding: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#818CF8',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  // Inner glass surface — sits inside the 1px gradient border
  pillInner: {
    flex: 1,
    borderRadius: 21,
    overflow: 'hidden',
  },
  pillAndroidBg: {
    backgroundColor: 'rgba(15,20,50,0.80)',
  },
  // Barely-there white haze — glass feel without color tint
  pillHaze: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pillShimmer: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 999,
  },
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
    color: '#8A93B6',
  },
  labelActive: {
    color: '#ffffff',
  },
});
