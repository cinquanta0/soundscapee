const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');

const patches = {
  it: {
    map: {
      share: 'Condividi',
      report: 'Segnala',
      block: 'Blocca',
    }
  },
  en: {
    map: {
      share: 'Share',
      report: 'Report',
      block: 'Block',
    }
  },
  es: {
    map: {
      share: 'Compartir',
      report: 'Reportar',
      block: 'Bloquear',
    }
  },
  fr: {
    map: {
      share: 'Partager',
      report: 'Signaler',
      block: 'Bloquer',
    }
  },
  de: {
    map: {
      share: 'Teilen',
      report: 'Melden',
      block: 'Blockieren',
    }
  },
  pt: {
    map: {
      share: 'Compartilhar',
      report: 'Denunciar',
      block: 'Bloquear',
    }
  },
};

for (const [lang, patch] of Object.entries(patches)) {
  const filePath = path.join(localesDir, `${lang}.json`);
  let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data.map) data.map = {};
  Object.assign(data.map, patch.map);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✅ Patched ${lang}.json`);
}

console.log('\nAll keys added!');
