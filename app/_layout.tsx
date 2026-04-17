import Constants from 'expo-constants';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Updates from 'expo-updates';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import { auth, db, functions } from '../firebaseConfig';
import { initI18n } from '../i18n';
import { registerForPushNotifications } from '../services/notificationService';

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
        Scarica l'ultima versione per continuare.
      </Text>
      <TouchableOpacity style={fu.button} onPress={() => Linking.openURL(storeUrl)}>
        <Text style={fu.buttonText}>Aggiorna ora</Text>
      </TouchableOpacity>
    </View>
  );
}


const fu = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  body: { color: '#94a3b8', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  button: { backgroundColor: '#06b6d4', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default function RootLayout() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [i18nReady, setI18nReady] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const u = await Updates.checkForUpdateAsync();
        if (u.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {}
    })();
  }, []);

  // Initialise i18n as early as possible
  useEffect(() => {
    initI18n().then(() => setI18nReady(true)).catch(() => setI18nReady(true));
  }, []);

  // Controlla se la build è ancora supportata
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'appConfig', 'general'));
        if (!snap.exists()) return;
        const minBuild = snap.data().minBuildVersion;
        if (!minBuild) return;
        const currentBuild = parseInt(Constants.nativeBuildVersion ?? '0', 10);
        if (currentBuild < minBuild) setForceUpdate(true);
      } catch {}
    })();
  }, []);

  // Ascolta cambiamenti auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      // Registra push token quando l'utente è loggato (non anonimi)
      if (firebaseUser && !firebaseUser.isAnonymous) {
        // Garantisce campi school/security sul doc utente anche se la prima call al login e fallita.
        httpsCallable(functions, 'upsertSchoolProfile')({})
          .catch((err) => console.warn('upsertSchoolProfile failed:', err?.message || err));
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
      router.replace('/(tabs)');
    } else if (!user && segments[0] !== 'login') {
      router.replace('/login');
    }
  }, [user, loading, segments]);

  if (forceUpdate) return <ForceUpdateScreen />;

  if (loading || !i18nReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#06b6d4" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
