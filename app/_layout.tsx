import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebaseConfig';
import { initI18n } from '../i18n';
import { registerForPushNotifications } from '../services/notificationService';

// Mantieni lo splash screen visibile mentre i font caricano
SplashScreen.preventAutoHideAsync().catch(() => {});

const STORE_URL_ANDROID = 'https://play.google.com/store/apps/details?id=com.cucucucucuione.soundscapemobile';
const STORE_URL_IOS = 'https://apps.apple.com/app/soundscape/id0'; // aggiorna con l'ID reale

function ForceUpdateScreen() {
  const storeUrl = Platform.OS === 'ios' ? STORE_URL_IOS : STORE_URL_ANDROID;
  return (
    <View style={fu.container}>
      <Text style={fu.emoji}>🔄</Text>
      <Text style={fu.title}>Aggiorna Soundscape</Text>
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
        {"Soundscape è temporaneamente offline per miglioramenti.\nTorna tra poco!"}
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
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
