const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');

const patches = {
  it: {
    explore: {
      modeLeaderboard: 'Classifiche',
      modeLeaderboardSubtitle: 'Top suoni globali',
    }
  },
  en: {
    explore: {
      modeLeaderboard: 'Leaderboards',
      modeLeaderboardSubtitle: 'Top global sounds',
    }
  },
  es: {
    explore: {
      modeLeaderboard: 'Clasificaciones',
      modeLeaderboardSubtitle: 'Mejores sonidos globales',
    }
  },
  fr: {
    explore: {
      modeLeaderboard: 'Classements',
      modeLeaderboardSubtitle: 'Top sons mondiaux',
    }
  },
  de: {
    explore: {
      modeLeaderboard: 'Bestenlisten',
      modeLeaderboardSubtitle: 'Top globale Sounds',
    }
  },
  pt: {
    explore: {
      modeLeaderboard: 'Classificações',
      modeLeaderboardSubtitle: 'Top sons globais',
    }
  },
};

for (const [lang, patch] of Object.entries(patches)) {
  const filePath = path.join(localesDir, `${lang}.json`);
  let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data.explore) data.explore = {};
  Object.assign(data.explore, patch.explore);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✅ Patched ${lang}.json`);
}

console.log('\nAll keys added!');
