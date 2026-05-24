import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Linking, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { auth, db } from '../firebaseConfig';
import { initI18n } from '../i18n';
import { registerForPushNotifications, listenUserNotifications } from '../services/notificationService';
import { CallProvider, useCall } from '../context/CallContext';
import CallScreen from '../screens/CallScreen';

function RejoinBanner() {
  const { canRejoin, rejoinableCall, phase, rejoinGroupCall } = useCall();
  const insets = useSafeAreaInsets();
  const insetsRef = useRef(insets);
  useEffect(() => { insetsRef.current = insets; }, [insets]);

  const posRef = useRef<{ x: number; y: number } | null>(null);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragStartRef = useRef({ x: 0, y: 0 });
  const rejoinRef = useRef(rejoinGroupCall);
  useEffect(() => { rejoinRef.current = rejoinGroupCall; }, [rejoinGroupCall]);

  useEffect(() => {
    if (canRejoin && posRef.current === null) {
      const init = { x: 12, y: insetsRef.current.top + 4 };
      posRef.current = init;
      pan.setValue(init);
    }
    if (!canRejoin) posRef.current = null;
  }, [canRejoin]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4,
      onPanResponderGrant: () => {
        dragStartRef.current = posRef.current ?? { x: 12, y: 60 };
      },
      onPanResponderMove: (_, gs) => {
        pan.setValue({
          x: dragStartRef.current.x + gs.dx,
          y: dragStartRef.current.y + gs.dy,
        });
      },
      onPanResponderRelease: (_, gs) => {
        if (Math.abs(gs.dx) < 8 && Math.abs(gs.dy) < 8) {
          rejoinRef.current();
          return;
        }
        const { width, height } = Dimensions.get('window');
        const cur = insetsRef.current;
        const rawX = dragStartRef.current.x + gs.dx;
        const rawY = dragStartRef.current.y + gs.dy;
        const newX = Math.max(8, Math.min(rawX, width - 216));
        const newY = Math.max(cur.top + 4, Math.min(rawY, height - cur.bottom - 54));
        const newPos = { x: newX, y: newY };
        posRef.current = newPos;
        Animated.spring(pan, { toValue: newPos, useNativeDriver: false, bounciness: 4 }).start();
      },
    })
  ).current;

  if (!canRejoin || !rejoinableCall || phase !== null) return null;

  const isGroup = rejoinableCall.type === 'group';
  const myUid = auth.currentUser?.uid;
  const name = isGroup
    ? 'Chiamata di gruppo'
    : (rejoinableCall.callerId === myUid ? rejoinableCall.calleeName : rejoinableCall.callerName);

  return (
    <Animated.View
      style={[rb.pill, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]}
      {...panResponder.panHandlers}
    >
      <View style={rb.dot} />
      <Text style={rb.name} numberOfLines={1}>{name}</Text>
      <Feather name="phone" size={14} color="#00FF9C" />
    </Animated.View>
  );
}

const rb = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 30,
    backgroundColor: 'rgba(13,18,33,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,156,0.35)',
    zIndex: 9999,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#00FF9C',
  },
  name: {
    color: '#F7F8FF',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 140,
  },
});

// ── In-app notification banner ────────────────────────────────────────────────
function InAppNotificationBanner() {
  const [current, setCurrent] = useState<any | null>(null);
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const insets = useSafeAreaInsets();
  const queueRef = useRef<any[]>([]);
  const activeRef = useRef(false);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissRef = useRef<() => void>(() => {});
  const tryShowNextRef = useRef<() => void>(() => {});

  dismissRef.current = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    Animated.timing(slideAnim, { toValue: -120, useNativeDriver: true, duration: 220 }).start(() => {
      activeRef.current = false;
      setCurrent(null);
      setTimeout(() => tryShowNextRef.current(), 300);
    });
  };

  tryShowNextRef.current = () => {
    if (activeRef.current || queueRef.current.length === 0) return;
    const next = queueRef.current.shift();
    activeRef.current = true;
    setCurrent(next);
    slideAnim.setValue(-120);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 5 }).start();
    timerRef.current = setTimeout(() => dismissRef.current(), 4000);
  };

  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubFirestore?.();
      unsubFirestore = null;
      prevIdsRef.current = new Set();
      if (!user) return;
      let initialized = false;
      unsubFirestore = listenUserNotifications(user.uid, (notifs: any[]) => {
        if (!initialized) {
          prevIdsRef.current = new Set(notifs.map((n: any) => n.id));
          initialized = true;
          return;
        }
        const newNotifs = notifs.filter((n: any) => !prevIdsRef.current.has(n.id));
        notifs.forEach((n: any) => prevIdsRef.current.add(n.id));
        if (newNotifs.length > 0) {
          queueRef.current.push(...newNotifs);
          tryShowNextRef.current();
        }
      });
    });
    return () => { unsubAuth(); unsubFirestore?.(); };
  }, []);

  if (!current) return null;

  return (
    <Animated.View style={[nb.container, { top: insets.top + 10, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={nb.inner} activeOpacity={0.95} onPress={() => dismissRef.current()}>
        <View style={nb.textWrap}>
          <Text style={nb.title} numberOfLines={1}>{current.title}</Text>
          <Text style={nb.body} numberOfLines={2}>{current.body}</Text>
        </View>
        <TouchableOpacity
          style={nb.closeBtn}
          onPress={() => dismissRef.current()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="x" size={15} color="#9A9A9A" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const nb = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9997,
    elevation: 18,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18,12,28,0.97)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    gap: 12,
  },
  textWrap: { flex: 1 },
  title: { color: '#F7F8FF', fontSize: 14, fontWeight: '700' },
  body: { color: '#aaa', fontSize: 12, marginTop: 3, lineHeight: 17 },
  closeBtn: { padding: 2 },
});

// Mantieni lo splash screen visibile mentre i font caricano
SplashScreen.preventAutoHideAsync().catch(() => {});

const STORE_URL_ANDROID = 'https://play.google.com/store/apps/details?id=com.cucucucucuione.soundscapemobile';
const STORE_URL_IOS = 'https://apps.apple.com/app/miuslyk/id0'; // aggiorna con l'ID reale

function ForceUpdateScreen() {
  const storeUrl = Platform.OS === 'ios' ? STORE_URL_IOS : STORE_URL_ANDROID;
  return (
    <View style={fu.container}>
      <Text style={fu.emoji}>🔄</Text>
      <Text style={fu.title}>Aggiorna MIUSLYK</Text>
      <Text style={fu.body}>
        Questa versione non è più supportata.{'\n'}
        {"Scarica l'ultima versione per continuare."}
      </Text>
      <TouchableOpacity style={fu.button} onPress={() => Linking.openURL(storeUrl)}>
        <Text style={fu.buttonText}>Aggiorna ora</Text>
      </TouchableOpacity>
    </View>
  );
}

function MaintenanceScreen() {
  return (
    <View style={fu.container}>
      <Text style={fu.emoji}>🔧</Text>
      <Text style={fu.title}>Manutenzione in corso</Text>
      <Text style={fu.body}>
        {"MIUSLYK è temporaneamente offline per miglioramenti.\nTorna tra poco!"}
      </Text>
    </View>
  );
}

const fu = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  body: { color: '#9A9A9A', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  button: { backgroundColor: '#00FF9C', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default function RootLayout() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [i18nReady, setI18nReady] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
  const otaFetchStartedRef = useRef(false);

  // Precarica font vettoriali — fondamentale su Android per evitare icone trasparenti
  const [fontsLoaded] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    'Feather': require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf'),
  });

  const router = useRouter();
  const segments = useSegments();

  // Nascondi lo splash screen non appena i font sono pronti
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Initialise i18n as early as possible
  useEffect(() => {
    initI18n().then(() => setI18nReady(true)).catch(() => setI18nReady(true));
  }, []);

  // OTA updates — scarica e applica silenziosamente
  useEffect(() => {
    if (!Updates.isEnabled) return;
    if (isUpdatePending) {
      Updates.reloadAsync().catch(() => {});
      return;
    }
    if (!isUpdateAvailable || otaFetchStartedRef.current) return;
    otaFetchStartedRef.current = true;
    Updates.fetchUpdateAsync()
      .then((result) => { if (result.isNew) return Updates.reloadAsync(); })
      .catch(() => {});
  }, [isUpdateAvailable, isUpdatePending]);

  // Controlla se la build è ancora supportata e se c'è maintenance mode
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'appConfig', 'general'));
        if (!snap.exists()) return;
        const data = snap.data();

        // Maintenance mode
        if (data.maintenance === true) {
          setMaintenance(true);
          return;
        }

        // Force update
        const minBuild = data.minBuildVersion;
        if (!minBuild) return;
        const currentBuild = parseInt(Constants.nativeBuildVersion ?? '0', 10);
        if (currentBuild < minBuild) setForceUpdate(true);
      } catch {
        // Offline o errore di rete: non bloccare l'app
      }
    })();
  }, []);

  // Ascolta cambiamenti auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Se l'utente è anonimo (residuo del vecchio codice Codex), lo slogghiamo
      // e lo mandiamo al login per far usare un account reale.
      if (firebaseUser?.isAnonymous) {
        try { await signOut(auth); } catch {}
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(firebaseUser);
      setLoading(false);
      // Registra push token quando l'utente è loggato (non anonimi)
      if (firebaseUser && !firebaseUser.isAnonymous) {
        registerForPushNotifications(firebaseUser.uid).catch(() => {});
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';

    if (!user && inAuthGroup) {
      router.replace('/login');
    } else if (user && !inAuthGroup && segments[0] !== 'login') {
      // Naviga sempre a /(tabs) — il session restore in index.tsx gestisce già
      // il redirect a 'explore' quando RNTP è attivo. Navigare direttamente a
      // /(tabs)/explore attiverebbe explore.tsx come tab Expo Router separato,
      // creando una seconda istanza di ExploreScreen che apre un secondo Modal
      // contemporaneamente a quello di index.tsx (due "schermate" stacked).
      router.replace('/(tabs)');
    } else if (!user && segments[0] !== 'login') {
      router.replace('/login');
    }
  }, [user, loading, segments]);

  if (maintenance) return <MaintenanceScreen />;
  if (forceUpdate) return <ForceUpdateScreen />;

  if (loading || !i18nReady || !fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' }}>
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <CallProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <CallScreen />
      <RejoinBanner />
      <InAppNotificationBanner />
    </CallProvider>
  );
}
