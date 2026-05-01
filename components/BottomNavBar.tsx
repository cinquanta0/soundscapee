import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

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
  { id: 'home', label: 'Feed', icon: 'activity', accent: '#67E8F9' },
  { id: 'explore', label: 'Explore', icon: 'compass', accent: '#8B5CFF' },
  { id: 'map', label: 'Map', icon: 'map-pin', accent: '#4F7CFF' },
  { id: 'challenges', label: 'Challenges', icon: 'award', accent: '#FF9B5E' },
  { id: 'messages', label: 'Messages', icon: 'message-circle', accent: '#F472FF' },
  { id: 'profile', label: 'Profile', icon: 'user', accent: '#D9FF5A' },
];

function NavItem({
  tab,
  isActive,
  onPress,
}: {
  tab: Tab;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const lift = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const pillOpacity = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(lift, { toValue: isActive ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 8 }),
      Animated.timing(glow, { toValue: isActive ? 1 : 0, duration: 220, useNativeDriver: true }),
      Animated.timing(pillOpacity, { toValue: isActive ? 1 : 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [glow, isActive, lift, pillOpacity]);

  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const pressIn = () => Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 26, bounciness: 6 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26, bounciness: 6 }).start();

  return (
    <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={1} style={styles.itemTouch}>
      <Animated.View style={[styles.itemInner, { transform: [{ scale }, { translateY }] }]}>
        <Animated.View style={[styles.iconGlow, { opacity: glow, backgroundColor: tab.accent + '26' }]} />
        <Animated.View style={[styles.iconShell, isActive && { borderColor: tab.accent + '55' }]}>
          <Animated.View style={[styles.activePill, { opacity: pillOpacity }]}>
            <LinearGradient
              colors={[tab.accent + '22', 'rgba(13,16,31,0.82)']}
              style={styles.activePillFill}
            />
          </Animated.View>
          <Feather name={tab.icon} size={19} color={isActive ? tab.accent : '#8A93B6'} />
        </Animated.View>
        <Text style={[styles.label, isActive && { color: '#F7F8FF' }]} numberOfLines={1}>{tab.label}</Text>
        <View style={[styles.underline, isActive && { backgroundColor: tab.accent, opacity: 1 }]} />
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function BottomNavBar({ activeTab, onTabChange }: BottomNavBarProps) {
  const insets = useSafeAreaInsets();

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
          {TABS.map((tab) => (
            <NavItem
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              onPress={() => onTabChange(tab.id)}
            />
          ))}
        </LinearGradient>
      </View>
    </View>
  );
}

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
    backgroundColor: 'rgba(103,232,249,0.08)',
  },
  ambientRight: {
    position: 'absolute',
    right: 18,
    bottom: 16,
    width: 108,
    height: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(139,92,255,0.08)',
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
    flexDirection: 'row',
    paddingTop: 10,
    paddingHorizontal: 4,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.14)',
  },
  barShine: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  itemTouch: {
    flex: 1,
    alignItems: 'center',
  },
  itemInner: {
    alignItems: 'center',
    gap: 4,
    paddingBottom: 6,
  },
  iconGlow: {
    position: 'absolute',
    top: -2,
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  iconShell: {
    width: 48,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
  },
  activePillFill: {
    flex: 1,
  },
  label: {
    color: '#8A93B6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.25,
  },
  underline: {
    width: 18,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'transparent',
    opacity: 0,
    marginTop: 2,
  },
});
