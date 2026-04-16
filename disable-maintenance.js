/**
 * Disabilita la maintenance mode su Firestore.
 * Eseguire con: node disable-maintenance.js
 * Richiede che firebase CLI sia loggato (npx firebase login).
 */
const { execSync } = require('child_process');

const project = 'soundscape-74397';
const payload = JSON.stringify({ maintenance: false, minBuildVersion: 1 });

try {
  // Usa firebase CLI per eseguire un comando Firestore
  const result = execSync(
    `npx firebase firestore:set --project ${project} --merge appConfig/general '${payload}'`,
    { encoding: 'utf8', stdio: 'pipe' }
  );
  console.log('✅ maintenance=false settato su Firestore');
  console.log(result);
} catch (e) {
  console.error('Errore (CLI):', e.message);
  console.log('');
  console.log('Alternative: imposta manualmente nel Firebase Console:');
  console.log('  Firestore → appConfig → general → maintenance = false');
}
