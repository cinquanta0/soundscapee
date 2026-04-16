const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

db.doc('appConfig/general').set({ minBuildVersion: 0 }, { merge: true })
  .then(() => { console.log('✅ minBuildVersion impostato a 0'); process.exit(0); })
  .catch(e => { console.error('❌', e.message); process.exit(1); });
