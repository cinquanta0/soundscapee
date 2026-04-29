import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

// I valori Firebase sono configurazione pubblica (non segreti).
// La sicurezza è garantita dalle Firestore Security Rules, non dalla API key.
// Hardcoded come fallback per garantire che il bundle iOS nativo (xcodebuild) li riceva sempre.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAvBTHZ4mlSEbUTHYaU9Tkg6q4CXL4nrzc',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'soundscape-74397.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'soundscape-74397',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'soundscape-74397.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '1048962605733',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:1048962605733:web:a226ed05a8ef039db5a34c',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? 'G-F2XF6F0LVN',
};

const app = initializeApp(firebaseConfig);

// Auth con persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'europe-west1');
