const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');

const patches = {
  it: {
    feed: { forYou: 'Per Te', following: 'Seguiti' },
    settings: { themeDark: '🌙 Tema scuro', themeLight: '☀️ Tema chiaro', themeSaved: 'Tema salvato automaticamente' },
    call: { history: 'Cronologia chiamate' },
    remix: { badge: 'REMIX' }
  },
  en: {
    feed: { forYou: 'For You', following: 'Following' },
    settings: { themeDark: '🌙 Dark theme', themeLight: '☀️ Light theme', themeSaved: 'Theme saved automatically' },
    call: { history: 'Call history' },
    remix: { badge: 'REMIX' }
  },
  es: {
    feed: { forYou: 'Para ti', following: 'Siguiendo' },
    settings: { themeDark: '🌙 Tema oscuro', themeLight: '☀️ Tema claro', themeSaved: 'Tema guardado automáticamente' },
    call: { history: 'Historial de llamadas' },
    remix: { badge: 'REMIX' }
  },
  fr: {
    feed: { forYou: 'Pour vous', following: 'Abonnements' },
    settings: { themeDark: '🌙 Thème sombre', themeLight: '☀️ Thème clair', themeSaved: 'Thème enregistré automatiquement' },
    call: { history: 'Historique d\'appels' },
    remix: { badge: 'REMIX' }
  },
  de: {
    feed: { forYou: 'Für dich', following: 'Abonnements' },
    settings: { themeDark: '🌙 Dunkles Design', themeLight: '☀️ Helles Design', themeSaved: 'Design automatisch gespeichert' },
    call: { history: 'Anrufliste' },
    remix: { badge: 'REMIX' }
  },
  pt: {
    feed: { forYou: 'Para você', following: 'Seguindo' },
    settings: { themeDark: '🌙 Tema escuro', themeLight: '☀️ Tema claro', themeSaved: 'Tema salvo automaticamente' },
    call: { history: 'Histórico de chamadas' },
    remix: { badge: 'REMIX' }
  }
};

for (const [lang, patch] of Object.entries(patches)) {
  const filePath = path.join(localesDir, `${lang}.json`);
  let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  for (const [section, keys] of Object.entries(patch)) {
    if (!data[section]) data[section] = {};
    for (const [key, value] of Object.entries(keys)) {
      data[section][key] = value;
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✅ Patched ${lang}.json`);
}

console.log('\nAll new strings added successfully!');
