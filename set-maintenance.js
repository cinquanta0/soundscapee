const admin = require('firebase-admin');

async function run() {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: 'soundscape-74397',
    });
    const db = admin.firestore();
    await db.doc('appConfig/general').set({ maintenance: true }, { merge: true });
    console.log('✅ maintenance=true scritto');
  } catch (err) {
    console.error('ERRORE', err);
    process.exit(1);
  }
}

run();
