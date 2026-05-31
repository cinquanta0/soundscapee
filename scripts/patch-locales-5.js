const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');

const patches = {
  it: { upload: { privacySecurity: 'Privacy e Sicurezza', useApproxLocation: 'Usa posizione approssimata', approxLocationDesc: 'Protegge la tua privacy nascondendo le coordinate esatte.' } },
  en: { upload: { privacySecurity: 'Privacy & Security', useApproxLocation: 'Use approximate location', approxLocationDesc: 'Protects your privacy by hiding exact coordinates.' } },
  es: { upload: { privacySecurity: 'Privacidad y Seguridad', useApproxLocation: 'Usar ubicación aproximada', approxLocationDesc: 'Protege tu privacidad ocultando las coordenadas exactas.' } },
  fr: { upload: { privacySecurity: 'Confidentialité et Sécurité', useApproxLocation: 'Utiliser la position approximative', approxLocationDesc: 'Protège votre confidentialité en masquant les coordonnées exactes.' } },
  de: { upload: { privacySecurity: 'Datenschutz & Sicherheit', useApproxLocation: 'Ungefähren Standort verwenden', approxLocationDesc: 'Schützt Ihre Privatsphäre durch Verbergen genauer Koordinaten.' } },
  pt: { upload: { privacySecurity: 'Privacidade e Segurança', useApproxLocation: 'Usar localização aproximada', approxLocationDesc: 'Protege sua privacidade ocultando coordenadas exatas.' } }
};

for (const [lang, patch] of Object.entries(patches)) {
  const filePath = path.join(localesDir, `${lang}.json`);
  let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data.upload) data.upload = {};
  Object.assign(data.upload, patch.upload);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✅ Patched ${lang}.json`);
}
