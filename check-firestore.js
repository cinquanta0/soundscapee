const admin = require('firebase-admin');

// Usa le credenziali di default (firebase CLI login)
const { execSync } = require('child_process');

try {
  const result = execSync(
    'npx firebase firestore:get --project soundscape-74397 appConfig/general',
    { encoding: 'utf8', stdio: 'pipe' }
  );
  console.log('appConfig/general:', result);
} catch (e) {
  console.log('CLI non supporta get. Usa Firebase Console:');
  console.log('Firestore → appConfig → general');
  console.log('Cerca i campi: minBuildVersion, maintenance, o altri');
}
