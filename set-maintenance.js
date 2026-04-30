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
    if (fs.existsSync(candidate)) {
      return admin.credential.cert(require(candidate));
    }
  }

  return admin.credential.applicationDefault();
}

async function run() {
  const rawValue = (process.argv[2] || '').trim().toLowerCase();
  if (!['true', 'false'].includes(rawValue)) {
    console.error('Uso: node set-maintenance.js <true|false>');
    process.exit(1);
  }

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: resolveCredential(),
        projectId,
      });
    }

    const maintenance = rawValue === 'true';
    const db = admin.firestore();
    await db.doc('appConfig/general').set({ maintenance }, { merge: true });
    const snap = await db.doc('appConfig/general').get();
    console.log(`✅ maintenance=${maintenance} scritto su ${projectId}`);
    console.log(JSON.stringify(snap.data()));
  } catch (err) {
    console.error('ERRORE', err);
    process.exit(1);
  }
}

run();
