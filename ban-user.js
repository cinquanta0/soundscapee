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
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(__dirname, 'service-account.json'),
    path.join(process.env.USERPROFILE || '', 'Downloads', 'soundscape-74397-firebase-adminsdk-fbsvc-c105189361.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return admin.credential.cert(require(p));
  }
  return admin.credential.applicationDefault();
}

async function run() {
  const uid = (process.argv[2] || '').trim();
  const action = (process.argv[3] || 'ban').trim();

  if (!uid) {
    console.error('Uso: node ban-user.js <UID> [ban|unban]');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: resolveCredential(), projectId });
  }

  const authAdmin = admin.auth();

  if (action === 'unban') {
    await authAdmin.updateUser(uid, { disabled: false });
    console.log(`✅ Utente ${uid} riabilitato`);
    return;
  }

  // Ban: revoca sessioni attive + disabilita account
  await authAdmin.revokeRefreshTokens(uid);
  await authAdmin.updateUser(uid, { disabled: true });

  const user = await authAdmin.getUser(uid);
  console.log(`✅ Bannato: ${user.email ?? uid}`);
  console.log(`   Token revocati alle: ${new Date().toISOString()}`);
  console.log(`   Per riabilitare: node ban-user.js ${uid} unban`);
}

run().catch((err) => {
  console.error('ERRORE', err.message);
  process.exit(1);
});
