const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');

const patches = {
  it: {
    remix: { myRemixes: 'I Miei Remix', remixes: 'Remix', startRemixing: 'Inizia a Remixare', deleteRemix: 'Elimina Remix' }
  },
  en: {
    remix: { myRemixes: 'My Remixes', remixes: 'Remixes', startRemixing: 'Start Remixing', deleteRemix: 'Delete Remix' }
  },
  es: {
    remix: { myRemixes: 'Mis Remixes', remixes: 'Remixes', startRemixing: 'Empezar a Remixar', deleteRemix: 'Eliminar Remix' }
  },
  fr: {
    remix: { myRemixes: 'Mes Remix', remixes: 'Remix', startRemixing: 'Commencer le Remix', deleteRemix: 'Supprimer le Remix' }
  },
  de: {
    remix: { myRemixes: 'Meine Remixes', remixes: 'Remixes', startRemixing: 'Remixen starten', deleteRemix: 'Remix löschen' }
  },
  pt: {
    remix: { myRemixes: 'Meus Remixes', remixes: 'Remixes', startRemixing: 'Começar a Remixar', deleteRemix: 'Excluir Remix' }
  }
};

for (const [lang, patch] of Object.entries(patches)) {
  const filePath = path.join(localesDir, `${lang}.json`);
  let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data.remix) data.remix = {};
  for (const [key, value] of Object.entries(patch.remix)) {
    data.remix[key] = value;
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✅ Patched ${lang}.json`);
}

console.log('\nRemix strings added successfully!');
