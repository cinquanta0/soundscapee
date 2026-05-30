import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PanGestureHandler, State, TouchableOpacity } from 'react-native-gesture-handler';
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
  { id: 'home',       label: 'Feed',       icon: 'activity',       accent: '#67E8F9' },
  { id: 'explore',    label: 'Explore',    icon: 'compass',         accent: '#8B5CFF' },
  { id: 'map',        label: 'Map',        icon: 'map-pin',         accent: '#4F7CFF' },
  { id: 'challenges', label: 'Challenges', icon: 'award',           accent: '#FF9B5E' },
  { id: 'messages',   label: 'Messages',   icon: 'message-circle',  accent: '#F472FF' },
  { id: 'profile',    label: 'Profile',    icon: 'user',            accent: '#4F7CFF' },
];

const NAV_KEYS: Record<TabId, string> = {
  home: 'nav.home', explore: 'nav.explore', map: 'nav.map',
  challenges: 'nav.challenges', communities: 'nav.communities',
  messages: 'nav.messages', profile: 'nav.profile',
};

// ─── Single NavItem ───────────────────────────────────────────────────────────

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
  const iconColor = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(iconColor, {
      toValue: isActive ? 1 : 0,
      useNativeDriver: false,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [isActive, iconColor]);

  const pressIn  = () => Animated.spring(scale, { toValue: 0.82, useNativeDriver: true, speed: 28, bounciness: 4 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 28, bounciness: 4 }).start();

  const animatedIconColor = iconColor.interpolate({
    inputRange: [0, 1],
    outputRange: ['#8A93B6', '#ffffff'],
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      activeOpacity={1}
      style={styles.itemTouch}
    >
      <Animated.View style={[styles.itemInner, { transform: [{ scale }] }]}>
        <Animated.Text>
          <Feather name={tab.icon} size={19} color={isActive ? '#ffffff' : '#8A93B6'} />
        </Animated.Text>
        <Animated.Text style={[styles.label, { color: animatedIconColor }]} numberOfLines={1}>
          {t(NAV_KEYS[tab.id])}
        </Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Glass Pill ───────────────────────────────────────────────────────────────

function GlassPill({ translateX, width }: { translateX: Animated.Value; width: number }) {
  if (width === 0) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pill, { width, transform: [{ translateX }] }]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.pillAndroidBg]} />
      )}
      {/* Blue tint overlay */}
      <View style={styles.pillTint} />
      {/* Top shimmer */}
      <View style={styles.pillShimmer} />
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BottomNavBar({ activeTab, onTabChange }: BottomNavBarProps) {
  const insets = useSafeAreaInsets();

  const [tabWidth, setTabWidth] = useState(0);
  const tabWidthRef = useRef(0);
  const pillX       = useRef(new Animated.Value(0)).current;
  const pillXValue  = useRef(0);
  const panStartX   = useRef(0);
  const activeIdxRef = useRef(TABS.findIndex((t) => t.id === activeTab));

  // Track raw pill value for snap-on-release
  useEffect(() => {
    const id = pillX.addListener(({ value }) => { pillXValue.current = value; });
    return () => pillX.removeListener(id);
  }, [pillX]);

  // Slide pill when activeTab changes from outside (e.g. tap)
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

  // ── Gesture handlers ────────────────────────────────────────────────────────

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

  const onGestureEvent = useCallback((e: any) => {
    const { state, translationX } = e.nativeEvent;
    if (state !== State.ACTIVE) return;
    const raw = panStartX.current + translationX;
    const clamped = Math.max(0, Math.min(raw, tabWidthRef.current * (TABS.length - 1)));
    pillX.setValue(clamped);
  }, [pillX]);

  const onHandlerStateChange = useCallback((e: any) => {
    const { state, translationX } = e.nativeEvent;
    if (state === State.BEGAN) {
      panStartX.current = pillXValue.current;
    }
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      const finalX = Math.max(0, Math.min(
        panStartX.current + translationX,
        tabWidthRef.current * (TABS.length - 1),
      ));
      const nearestIdx = Math.round(finalX / tabWidthRef.current);
      snapToIndex(nearestIdx);
    }
  }, [snapToIndex]);

  const handleTabPress = useCallback((tab: Tab, idx: number) => {
    snapToIndex(idx);
  }, [snapToIndex]);

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {/* Ambient glow blobs */}
      <View style={styles.ambientLeft} />
      <View style={styles.ambientRight} />

      <View style={styles.barWrap}>
        <LinearGradient
          colors={['rgba(18,23,44,0.96)', 'rgba(10,14,28,0.96)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bar}
        >
          {/* Top shine line */}
          <View style={styles.barShine} />

          <PanGestureHandler
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onHandlerStateChange}
            activeOffsetX={[-6, 6]}
            failOffsetY={[-10, 10]}
          >
            <Animated.View style={styles.pillTrack} onLayout={onBarLayout}>
              {/* Sliding glass pill (behind tab items) */}
              <GlassPill translateX={pillX} width={tabWidth} />

              {/* Tab items */}
              {TABS.map((tab, idx) => (
                <NavItem
                  key={tab.id}
                  tab={tab}
                  isActive={activeTab === tab.id}
                  onPress={() => handleTabPress(tab, idx)}
                />
              ))}
            </Animated.View>
          </PanGestureHandler>
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
    paddingHorizontal: 0,
  },
  // ── Glass pill ──
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(79,124,255,0.45)',
    // subtle outer glow via shadow
    ...Platform.select({
      ios: {
        shadowColor: '#4F7CFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
      },
    }),
  },
  pillAndroidBg: {
    backgroundColor: 'rgba(20,30,70,0.75)',
  },
  pillTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(79,124,255,0.18)',
  },
  pillShimmer: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 999,
  },
  // ── Tab items ──
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
  },
});
