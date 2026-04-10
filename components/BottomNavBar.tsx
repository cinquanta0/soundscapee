import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

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

const ACTIVE_COLOR   = '#06b6d4';
const INACTIVE_COLOR = '#475569';
const BG             = 'rgba(8, 12, 20, 0.97)';
const BORDER         = 'rgba(255, 255, 255, 0.06)';

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
  const scale    = useRef(new Animated.Value(1)).current;
  const dotScale = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const dotOpacity = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(dotScale, {
        toValue: isActive ? 1 : 0,
        useNativeDriver: true,
        tension: 180,
        friction: 12,
      }),
      Animated.timing(dotOpacity, {
        toValue: isActive ? 1 : 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive]);

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.82,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  return (
    <TouchableOpacity
      style={styles.navItem}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View style={[styles.navItemInner, { transform: [{ scale }] }]}>
        <View style={styles.iconWrapper}>
          <Feather
            name={tab.icon}
            size={22}
            color={isActive ? ACTIVE_COLOR : INACTIVE_COLOR}
          />
          {/* Glow dietro l'icona attiva */}
          {isActive && <View style={styles.iconGlow} />}
        </View>

        <Text
          style={[
            styles.navLabel,
            isActive && styles.navLabelActive,
          ]}
          numberOfLines={1}
        >
          {tab.label}
        </Text>

        {/* Dot indicator */}
        <Animated.View
          style={[
            styles.dot,
            {
              transform: [{ scaleX: dotScale }],
              opacity: dotOpacity,
            },
          ]}
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
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
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
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    // Ombra per separazione visiva
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  bar: {
    flexDirection: 'row',
    paddingTop: 10,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
  },
  navItemInner: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  iconWrapper: {
    position: 'relative',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlow: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: INACTIVE_COLOR,
    letterSpacing: 0.2,
  },
  navLabelActive: {
    color: ACTIVE_COLOR,
    fontWeight: '600',
  },
  dot: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: ACTIVE_COLOR,
    marginTop: 2,
  },
});
