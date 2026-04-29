const admin = require('firebase-admin');

// Inizializza con le credenziali se disponibili, altrimenti usa il client SDK
let db;
let docFn = null;
let setDocFn = null;
let useAdminDb = false;

try {
  // Prova con admin SDK se disponibile
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    });
    db = admin.firestore();
    useAdminDb = true;
  } else {
    // Fallback al client SDK
    const { initializeApp } = require('firebase/app');
    const { getFirestore, doc, setDoc } = require('firebase/firestore');

    const firebaseConfig = {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
    };

    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    docFn = doc;
    setDocFn = setDoc;
  }
} catch (error) {
  console.error('Errore inizializzazione Firebase:', error.message);
  process.exit(1);
}

async function enableMaintenance() {
  try {
    const docRef = useAdminDb ? db.doc('appConfig/general') : docFn(db, 'appConfig', 'general');

    if (useAdminDb) {
      await docRef.set({ maintenance: true }, { merge: true });
    } else {
      await setDocFn(docRef, { maintenance: true }, { merge: true });
    }

    console.log('✅ Modalità manutenzione ATTIVATA per Android');
    console.log('Gli utenti Android vedranno ora la schermata di manutenzione');
    console.log('Per disattivare: imposta maintenance: false nel documento appConfig/general');
  } catch (error) {
    console.error('❌ Errore nell\'attivazione della manutenzione:', error.message);
    console.log('\n🔧 Puoi attivarla manualmente dalla Firebase Console:');
    console.log('1. Vai su https://console.firebase.google.com/');
    console.log('2. Seleziona il progetto soundscape-74397');
    console.log('3. Vai su Firestore Database');
    console.log('4. Crea/modifica il documento: appConfig/general');
    console.log('5. Aggiungi campo: maintenance = true');
  }
}

enableMaintenance();
