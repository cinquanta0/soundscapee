/**
 * Script di diagnostica Firestore — legge dati reali con Admin SDK
 * Uso: node diagnose-firestore.js
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const localRequire = createRequire(__filename);
const functionsRequire = createRequire(path.join(__dirname, 'functions', 'package.json'));

let admin;
try {
  admin = localRequire('firebase-admin');
} catch {
  admin = functionsRequire('firebase-admin');
}

const projectId = 'soundscape-74397';

function resolveCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
  }
  const candidatePaths = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(__dirname, 'service-account.json'),
    path.join(process.env.USERPROFILE || '', 'Downloads', 'soundscape-74397-firebase-adminsdk-fbsvc-c105189361.json'),
  ].filter(Boolean);
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) return admin.credential.cert(require(candidate));
  }
  return admin.credential.applicationDefault();
}

async function run() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: resolveCredential(), projectId });
  }
  const db = admin.firestore();

  console.log('\n🔍 DIAGNOSI FIRESTORE — soundscape-74397\n' + '='.repeat(50));

  // 1. appConfig/general
  console.log('\n📋 appConfig/general:');
  const cfg = await db.doc('appConfig/general').get();
  if (cfg.exists) {
    console.log('  ', JSON.stringify(cfg.data()));
  } else {
    console.log('  ❌ DOCUMENTO NON ESISTE!');
  }

  // 2. Conta sounds
  console.log('\n🎵 Collection sounds:');
  const soundsCount = await db.collection('sounds').count().get();
  console.log(`  Totale documenti: ${soundsCount.data().count}`);

  if (soundsCount.data().count > 0) {
    // Leggi i 3 più recenti
    const recentSounds = await db.collection('sounds').orderBy('createdAt', 'desc').limit(3).get();
    console.log('  Ultimi 3 suoni:');
    recentSounds.docs.forEach(d => {
      const data = d.data();
      console.log(`    - [${d.id}] "${data.title}" by @${data.username} | createdAt: ${data.createdAt?.toDate()}`);
    });
  } else {
    console.log('  ❌ LA COLLECTION È VUOTA! Nessun suono nel database.');
  }

  // 3. Conta users
  console.log('\n👤 Collection users:');
  const usersCount = await db.collection('users').count().get();
  console.log(`  Totale utenti: ${usersCount.data().count}`);

  // 4. Conta podcast
  console.log('\n🎙 Collection podcast:');
  const podcastCount = await db.collection('podcast').count().get();
  console.log(`  Totale podcast: ${podcastCount.data().count}`);

  // 5. Verifica regole Firestore (non possiamo leggere le live rules con Admin SDK,
  //    ma possiamo verificare che la lettura funzioni)
  console.log('\n🔒 Test lettura sounds con Admin SDK (bypassa rules):');
  const testRead = await db.collection('sounds').limit(1).get();
  console.log(`  Admin SDK può leggere sounds: ${!testRead.empty ? '✅ Sì' : '⚠️ Collection vuota'}`);

  console.log('\n' + '='.repeat(50));
  console.log('✅ Diagnostica completata\n');
}

run().catch(err => {
  console.error('❌ ERRORE:', err.message);
  process.exit(1);
});
