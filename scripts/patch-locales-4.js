const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');

const patches = {
  it: {
    remix: { createFirstRemix: 'Crea il tuo primo remix mixando i tuoi suoni!', newBtn: 'Nuovo', statsTitle: 'Stats Remix', tracksRmx: 'Tracce/Rmx', totSec: 'Tot Sec' },
    upload: { showOnMap: 'Mostra sulla mappa', exactLocation: 'Posizione esatta' },
    explore: { emptyLeaderboardTitle: 'Classifica vuota', emptyLeaderboardDesc: 'Nessun ascolto registrato ancora. Sii il primo a salire in vetta.', globalCharts: 'GLOBAL CHARTS', topSounds: 'Top suoni', upNext: 'A SEGUIRE', listensCount: 'ascolti' },
    call: { groupCall: 'Chiamata di gruppo', group: 'Gruppo', missed: 'Persa', outgoing: 'In uscita', incoming: 'In entrata', ongoing: 'Chiamata in corso', othersStillConnected: 'Altri partecipanti ancora connessi', areStillConnected_one: 'è ancora connesso', areStillConnected_other: 'sono ancora connessi', rejoin: 'Rientra', noCalls: 'Nessuna chiamata' },
    common: { today: 'Oggi', yesterday: 'Ieri', months: { gen: 'gen', feb: 'feb', mar: 'mar', apr: 'apr', mag: 'mag', giu: 'giu', lug: 'lug', ago: 'ago', set: 'set', ott: 'ott', nov: 'nov', dic: 'dic' } }
  },
  en: {
    remix: { createFirstRemix: 'Create your first remix by mixing your sounds!', newBtn: 'New', statsTitle: 'Remix Stats', tracksRmx: 'Tracks/Rmx', totSec: 'Total Sec' },
    upload: { showOnMap: 'Show on map', exactLocation: 'Exact location' },
    explore: { emptyLeaderboardTitle: 'Empty leaderboard', emptyLeaderboardDesc: 'No listens recorded yet. Be the first to reach the top.', globalCharts: 'GLOBAL CHARTS', topSounds: 'Top sounds', upNext: 'UP NEXT', listensCount: 'listens' },
    call: { groupCall: 'Group call', group: 'Group', missed: 'Missed', outgoing: 'Outgoing', incoming: 'Incoming', ongoing: 'Ongoing call', othersStillConnected: 'Other participants still connected', areStillConnected_one: 'is still connected', areStillConnected_other: 'are still connected', rejoin: 'Rejoin', noCalls: 'No calls' },
    common: { today: 'Today', yesterday: 'Yesterday', months: { gen: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', mag: 'May', giu: 'Jun', lug: 'Jul', ago: 'Aug', set: 'Sep', ott: 'Oct', nov: 'Nov', dic: 'Dec' } }
  },
  es: {
    remix: { createFirstRemix: '¡Crea tu primer remix mezclando tus sonidos!', newBtn: 'Nuevo', statsTitle: 'Estadísticas', tracksRmx: 'Pistas/Rmx', totSec: 'Total Seg' },
    upload: { showOnMap: 'Mostrar en mapa', exactLocation: 'Ubicación exacta' },
    explore: { emptyLeaderboardTitle: 'Clasificación vacía', emptyLeaderboardDesc: 'No hay escuchas registradas aún. Sé el primero en llegar a la cima.', globalCharts: 'GLOBAL CHARTS', topSounds: 'Top sonidos', upNext: 'A CONTINUACIÓN', listensCount: 'escuchas' },
    call: { groupCall: 'Llamada grupal', group: 'Grupo', missed: 'Perdida', outgoing: 'Saliente', incoming: 'Entrante', ongoing: 'Llamada en curso', othersStillConnected: 'Otros participantes aún conectados', areStillConnected_one: 'aún está conectado', areStillConnected_other: 'aún están conectados', rejoin: 'Reunirse', noCalls: 'Sin llamadas' },
    common: { today: 'Hoy', yesterday: 'Ayer', months: { gen: 'ene', feb: 'feb', mar: 'mar', apr: 'abr', mag: 'may', giu: 'jun', lug: 'jul', ago: 'ago', set: 'sep', ott: 'oct', nov: 'nov', dic: 'dic' } }
  },
  fr: {
    remix: { createFirstRemix: 'Créez votre premier remix en mixant vos sons !', newBtn: 'Nouveau', statsTitle: 'Statistiques', tracksRmx: 'Pistes/Rmx', totSec: 'Total Sec' },
    upload: { showOnMap: 'Afficher sur la carte', exactLocation: 'Emplacement exact' },
    explore: { emptyLeaderboardTitle: 'Classement vide', emptyLeaderboardDesc: 'Aucune écoute enregistrée pour le moment. Soyez le premier à atteindre le sommet.', globalCharts: 'GLOBAL CHARTS', topSounds: 'Top sons', upNext: 'À SUIVRE', listensCount: 'écoutes' },
    call: { groupCall: 'Appel de groupe', group: 'Groupe', missed: 'Manqué', outgoing: 'Sortant', incoming: 'Entrant', ongoing: 'Appel en cours', othersStillConnected: 'Autres participants encore connectés', areStillConnected_one: 'est toujours connecté', areStillConnected_other: 'sont toujours connectés', rejoin: 'Rejoindre', noCalls: 'Aucun appel' },
    common: { today: 'Aujourd\'hui', yesterday: 'Hier', months: { gen: 'janv', feb: 'févr', mar: 'mars', apr: 'avr', mag: 'mai', giu: 'juin', lug: 'juil', ago: 'août', set: 'sept', ott: 'oct', nov: 'nov', dic: 'déc' } }
  },
  de: {
    remix: { createFirstRemix: 'Erstelle deinen ersten Remix, indem du deine Sounds mischst!', newBtn: 'Neu', statsTitle: 'Remix-Statistiken', tracksRmx: 'Titel/Rmx', totSec: 'Gesamt Sek' },
    upload: { showOnMap: 'Auf Karte zeigen', exactLocation: 'Genauer Standort' },
    explore: { emptyLeaderboardTitle: 'Leere Bestenliste', emptyLeaderboardDesc: 'Noch keine Wiedergaben aufgezeichnet. Sei der Erste an der Spitze.', globalCharts: 'GLOBAL CHARTS', topSounds: 'Top-Sounds', upNext: 'ALS NÄCHSTES', listensCount: 'Aufrufe' },
    call: { groupCall: 'Gruppenanruf', group: 'Gruppe', missed: 'Verpasst', outgoing: 'Ausgehend', incoming: 'Eingehend', ongoing: 'Laufender Anruf', othersStillConnected: 'Andere Teilnehmer noch verbunden', areStillConnected_one: 'ist noch verbunden', areStillConnected_other: 'sind noch verbunden', rejoin: 'Wieder beitreten', noCalls: 'Keine Anrufe' },
    common: { today: 'Heute', yesterday: 'Gestern', months: { gen: 'Jan', feb: 'Feb', mar: 'Mär', apr: 'Apr', mag: 'Mai', giu: 'Jun', lug: 'Jul', ago: 'Aug', set: 'Sep', ott: 'Okt', nov: 'Nov', dic: 'Dez' } }
  },
  pt: {
    remix: { createFirstRemix: 'Crie seu primeiro remix misturando seus sons!', newBtn: 'Novo', statsTitle: 'Estatísticas', tracksRmx: 'Faixas/Rmx', totSec: 'Total Seg' },
    upload: { showOnMap: 'Mostrar no mapa', exactLocation: 'Localização exata' },
    explore: { emptyLeaderboardTitle: 'Classificação vazia', emptyLeaderboardDesc: 'Nenhuma escuta registrada ainda. Seja o primeiro a chegar ao topo.', globalCharts: 'GLOBAL CHARTS', topSounds: 'Top sons', upNext: 'A SEGUIR', listensCount: 'escutas' },
    call: { groupCall: 'Chamada de grupo', group: 'Grupo', missed: 'Perdida', outgoing: 'Efetuada', incoming: 'Recebida', ongoing: 'Chamada em andamento', othersStillConnected: 'Outros participantes ainda conectados', areStillConnected_one: 'ainda está conectado', areStillConnected_other: 'ainda estão conectados', rejoin: 'Reentrar', noCalls: 'Sem chamadas' },
    common: { today: 'Hoje', yesterday: 'Ontem', months: { gen: 'jan', feb: 'fev', mar: 'mar', apr: 'abr', mag: 'mai', giu: 'jun', lug: 'jul', ago: 'ago', set: 'set', ott: 'out', nov: 'nov', dic: 'dez' } }
  }
};

for (const [lang, patch] of Object.entries(patches)) {
  const filePath = path.join(localesDir, `${lang}.json`);
  let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data.remix) data.remix = {};
  Object.assign(data.remix, patch.remix);
  
  if (!data.upload) data.upload = {};
  Object.assign(data.upload, patch.upload);

  if (!data.explore) data.explore = {};
  Object.assign(data.explore, patch.explore);

  if (!data.call) data.call = {};
  Object.assign(data.call, patch.call);

  if (!data.common) data.common = {};
  Object.assign(data.common, patch.common);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✅ Patched ${lang}.json`);
}

console.log('\nKeys added successfully!');
