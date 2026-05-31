const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');

const patches = {
  it: {
    remix: {
      noRemixYet: 'Nessun remix ancora',
      noDescription: 'Nessuna descrizione',
      processing: 'Elaborazione audio in corso...',
      loading: 'Caricamento...',
      tracksLabel: 'Tracce',
      durationLabel: 'Durata',
      createdAtLabel: 'Creato',
      publicLabel: 'Pubblico',
      yes: 'Sì',
      no: 'No',
      processed: 'Processato',
      inProcessing: 'In elaborazione...',
      deleteConfirmMsg: 'Vuoi davvero eliminare questo remix?',
      saveLocally: 'Locale',
      publish: 'Pubblica',
      trackCount: 'tracce',
      clearAll: 'Pulisci',
    },
    upload: {
      visibility: 'Visibilità',
      visPublic: 'Pubblico',
      visFollowers: 'Followers',
      visPrivate: 'Privato',
      allowShare: 'Permetti condivisione',
      chooseBackground: 'Scegli sfondo profilo',
    },
  },
  en: {
    remix: {
      noRemixYet: 'No remixes yet',
      noDescription: 'No description',
      processing: 'Processing audio...',
      loading: 'Loading...',
      tracksLabel: 'Tracks',
      durationLabel: 'Duration',
      createdAtLabel: 'Created',
      publicLabel: 'Public',
      yes: 'Yes',
      no: 'No',
      processed: 'Processed',
      inProcessing: 'Processing...',
      deleteConfirmMsg: 'Do you really want to delete this remix?',
      saveLocally: 'Save locally',
      publish: 'Publish',
      trackCount: 'tracks',
      clearAll: 'Clear all',
    },
    upload: {
      visibility: 'Visibility',
      visPublic: 'Public',
      visFollowers: 'Followers',
      visPrivate: 'Private',
      allowShare: 'Allow sharing',
      chooseBackground: 'Choose profile background',
    },
  },
  es: {
    remix: {
      noRemixYet: 'Ningún remix aún',
      noDescription: 'Sin descripción',
      processing: 'Procesando audio...',
      loading: 'Cargando...',
      tracksLabel: 'Pistas',
      durationLabel: 'Duración',
      createdAtLabel: 'Creado',
      publicLabel: 'Público',
      yes: 'Sí',
      no: 'No',
      processed: 'Procesado',
      inProcessing: 'Procesando...',
      deleteConfirmMsg: '¿Realmente quieres eliminar este remix?',
      saveLocally: 'Guardar localmente',
      publish: 'Publicar',
      trackCount: 'pistas',
      clearAll: 'Limpiar todo',
    },
    upload: {
      visibility: 'Visibilidad',
      visPublic: 'Público',
      visFollowers: 'Seguidores',
      visPrivate: 'Privado',
      allowShare: 'Permitir compartir',
      chooseBackground: 'Elegir fondo de perfil',
    },
  },
  fr: {
    remix: {
      noRemixYet: 'Aucun remix encore',
      noDescription: 'Aucune description',
      processing: 'Traitement audio en cours...',
      loading: 'Chargement...',
      tracksLabel: 'Pistes',
      durationLabel: 'Durée',
      createdAtLabel: 'Créé',
      publicLabel: 'Public',
      yes: 'Oui',
      no: 'Non',
      processed: 'Traité',
      inProcessing: 'En traitement...',
      deleteConfirmMsg: 'Voulez-vous vraiment supprimer ce remix ?',
      saveLocally: 'Sauvegarder localement',
      publish: 'Publier',
      trackCount: 'pistes',
      clearAll: 'Tout effacer',
    },
    upload: {
      visibility: 'Visibilité',
      visPublic: 'Public',
      visFollowers: 'Abonnés',
      visPrivate: 'Privé',
      allowShare: 'Autoriser le partage',
      chooseBackground: 'Choisir le fond de profil',
    },
  },
  de: {
    remix: {
      noRemixYet: 'Noch keine Remixes',
      noDescription: 'Keine Beschreibung',
      processing: 'Audio wird verarbeitet...',
      loading: 'Wird geladen...',
      tracksLabel: 'Titel',
      durationLabel: 'Dauer',
      createdAtLabel: 'Erstellt',
      publicLabel: 'Öffentlich',
      yes: 'Ja',
      no: 'Nein',
      processed: 'Verarbeitet',
      inProcessing: 'In Verarbeitung...',
      deleteConfirmMsg: 'Möchtest du diesen Remix wirklich löschen?',
      saveLocally: 'Lokal speichern',
      publish: 'Veröffentlichen',
      trackCount: 'Titel',
      clearAll: 'Alles löschen',
    },
    upload: {
      visibility: 'Sichtbarkeit',
      visPublic: 'Öffentlich',
      visFollowers: 'Follower',
      visPrivate: 'Privat',
      allowShare: 'Teilen erlauben',
      chooseBackground: 'Profil-Hintergrund wählen',
    },
  },
  pt: {
    remix: {
      noRemixYet: 'Nenhum remix ainda',
      noDescription: 'Sem descrição',
      processing: 'Processando áudio...',
      loading: 'Carregando...',
      tracksLabel: 'Faixas',
      durationLabel: 'Duração',
      createdAtLabel: 'Criado',
      publicLabel: 'Público',
      yes: 'Sim',
      no: 'Não',
      processed: 'Processado',
      inProcessing: 'Processando...',
      deleteConfirmMsg: 'Realmente quer excluir este remix?',
      saveLocally: 'Salvar localmente',
      publish: 'Publicar',
      trackCount: 'faixas',
      clearAll: 'Limpar tudo',
    },
    upload: {
      visibility: 'Visibilidade',
      visPublic: 'Público',
      visFollowers: 'Seguidores',
      visPrivate: 'Privado',
      allowShare: 'Permitir compartilhamento',
      chooseBackground: 'Escolher fundo do perfil',
    },
  },
};

for (const [lang, patch] of Object.entries(patches)) {
  const filePath = path.join(localesDir, `${lang}.json`);
  let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data.remix) data.remix = {};
  Object.assign(data.remix, patch.remix);

  if (!data.upload) data.upload = {};
  Object.assign(data.upload, patch.upload);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✅ Patched ${lang}.json`);
}

console.log('\nAll keys added!');
