const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

admin.initializeApp();
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const ALLOWED_STORAGE_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
];
const MAX_TRACK_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Scarica un file da Firebase Storage (SSRF-safe).
 */
async function downloadFile(url, destPath) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('URL non valido');
  }
  if (!ALLOWED_STORAGE_HOSTS.includes(parsedUrl.hostname)) {
    throw new Error(`Host non consentito: ${parsedUrl.hostname}`);
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Solo HTTPS consentito');
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download fallito (${response.status})`);
  }

  const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_TRACK_SIZE_BYTES) {
    throw new Error('File troppo grande (max 50 MB)');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('audio/') && !contentType.startsWith('video/')) {
    throw new Error(`Tipo MIME non consentito: ${contentType}`);
  }

  const buffer = await response.buffer();
  if (buffer.length > MAX_TRACK_SIZE_BYTES) {
    throw new Error('File troppo grande (max 50 MB)');
  }
  fs.writeFileSync(destPath, buffer);
}

/**
 * Cloud Function: processRemix
 *
 * Riceve un remixId, scarica le tracce audio da Firebase Storage,
 * le mixa con FFmpeg rispettando volume/offset/trim, carica il file
 * mixato su Storage e aggiorna Firestore con isProcessed=true e audioUrl.
 */
exports.processRemix = onCall(
  { timeoutSeconds: 300, memory: '1GiB', region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Devi essere autenticato');
    }

    const { remixId } = request.data;
    if (!remixId || typeof remixId !== 'string' || remixId.length > 128) {
      throw new HttpsError('invalid-argument', 'remixId non valido');
    }

    const db = admin.firestore();

    // Rate limiting: max 10 remix processing per utente al giorno
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const quotaRef = db.collection('remixQuota').doc(`${uid}_${today}`);
    const DAILY_LIMIT = 10;

    const quotaResult = await db.runTransaction(async (tx) => {
      const quotaDoc = await tx.get(quotaRef);
      const count = quotaDoc.exists ? (quotaDoc.data().count || 0) : 0;
      if (count >= DAILY_LIMIT) return false;
      tx.set(quotaRef, { count: count + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return true;
    });

    if (!quotaResult) {
      throw new HttpsError('resource-exhausted', 'Limite giornaliero di remix raggiunto (max 10)');
    }
    const bucket = admin.storage().bucket();

    // 1. Carica il documento remix
    const remixDoc = await db.collection('remixes').doc(remixId).get();
    if (!remixDoc.exists) {
      throw new HttpsError('not-found', 'Remix non trovato');
    }

    const remix = remixDoc.data();
    if (remix.userId !== uid) {
      throw new HttpsError('permission-denied', 'Non autorizzato');
    }

    if (!remix.tracks || remix.tracks.length === 0) {
      throw new HttpsError('invalid-argument', 'Il remix non ha tracce');
    }

    // Marca come "in elaborazione"
    await db.collection('remixes').doc(remixId).update({
      processingStatus: 'processing',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const tmpDir = os.tmpdir();
    const inputFiles = [];
    const outputFile = path.join(tmpDir, `remix_${remixId}_${Date.now()}.m4a`);

    try {
      // 2. Scarica tutte le tracce
      for (let i = 0; i < remix.tracks.length; i++) {
        const track = remix.tracks[i];
        const tmpFile = path.join(tmpDir, `track_${i}_${Date.now()}.m4a`);
        await downloadFile(track.audioUrl, tmpFile);
        inputFiles.push(tmpFile);
      }

      // 3. Costruisci il comando FFmpeg con filter_complex
      await new Promise((resolve, reject) => {
        let cmd = ffmpeg();

        // Aggiungi tutti gli input
        inputFiles.forEach((f) => cmd.input(f));

        // Costruisci i filtri per ogni traccia
        const filterParts = remix.tracks.map((track, i) => {
          const trimStart = track.trimStart || 0;
          const trimEnd = track.trimEnd || track.duration || 30;
          const volume = Math.max(0.01, Math.min(2, track.volume || 1));
          const offsetMs = Math.round((track.offsetStart || 0) * 1000);

          // atrim taglia la porzione di audio
          // asetpts resetta i timestamp dopo il trim
          // volume regola il volume
          // adelay aggiunge il ritardo iniziale (offset sulla timeline)
          return (
            `[${i}:a]` +
            `atrim=start=${trimStart}:end=${trimEnd},` +
            `asetpts=PTS-STARTPTS,` +
            `volume=${volume},` +
            `adelay=${offsetMs}|${offsetMs}` +
            `[t${i}]`
          );
        });

        // Mixa tutte le tracce in una sola
        const mixInputs = remix.tracks.map((_, i) => `[t${i}]`).join('');
        const mixFilter =
          `${mixInputs}amix=inputs=${remix.tracks.length}:duration=longest:normalize=0[out]`;

        const filterComplex = [...filterParts, mixFilter].join(';');

        cmd
          .complexFilter(filterComplex)
          .outputOptions(['-map', '[out]', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100'])
          .output(outputFile)
          .on('end', resolve)
          .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
          .run();
      });

      // 4. Carica il file mixato su Firebase Storage
      const destPath = `remixes/${uid}/${remixId}.m4a`;
      const downloadToken = uuidv4();

      await bucket.upload(outputFile, {
        destination: destPath,
        metadata: {
          contentType: 'audio/mp4',
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });

      // Costruisci URL di download compatibile con Firebase Storage
      const encodedPath = encodeURIComponent(destPath);
      const audioUrl =
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

      // 5. Aggiorna Firestore
      await db.collection('remixes').doc(remixId).update({
        isProcessed: true,
        processingStatus: 'done',
        audioUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, audioUrl };

    } catch (error) {
      // In caso di errore, aggiorna lo stato su Firestore
      await db.collection('remixes').doc(remixId).update({
        processingStatus: 'error',
        processingError: error.message,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      throw new HttpsError('internal', `Errore durante il processing: ${error.message}`);

    } finally {
      // Pulizia file temporanei
      inputFiles.forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });
      try { fs.unlinkSync(outputFile); } catch (_) {}
    }
  }
);

// ── Notification helper ───────────────────────────────────────────────────────
async function sendNotificationToUser(db, userId, { title, body, data = {} }) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    const { fcmWebToken } = userData;

    // Supporta sia pushTokens (array, multi-device) che pushToken (legacy singolo)
    const rawTokens = userData.pushTokens ?? (userData.pushToken ? [userData.pushToken] : []);
    const mobileTokens = [...new Set(rawTokens)].filter(t => t?.startsWith('ExponentPushToken'));

    const promises = [];

    // 1. Salva la notifica in Firestore (in-app inbox)
    promises.push(
      db.collection('notifications').add({
        userId,
        title,
        body,
        data,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    );

    // 2. Expo Push (mobile) — invia a tutti i device dell'utente
    for (const token of mobileTokens) {
      promises.push(
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: token,
            sound: 'default',
            title,
            body,
            data,
            priority: 'high',
            channelId: 'default',
          }),
        })
          .then(async (res) => {
            const json = await res.json();
            const result = json?.data;
            if (result?.status === 'error') {
              console.error(`[push] Expo error per ${userId} token ${token.slice(-8)}: ${result.message} (${result.details?.error})`);
              // Token non valido: rimuovilo dall'array
              if (result.details?.error === 'DeviceNotRegistered') {
                await db.collection('users').doc(userId).update({
                  pushTokens: admin.firestore.FieldValue.arrayRemove(token),
                  pushToken: admin.firestore.FieldValue.delete(), // pulisce anche il legacy
                });
                console.log(`[push] token rimosso per ${userId}: ${token.slice(-8)}`);
              }
            } else {
              console.log(`[push] Expo OK per ${userId} (${token.slice(-8)})`);
            }
          })
          .catch((e) => console.error(`[push] fetch error per ${userId}:`, e))
      );
    }

    // 3. FCM Web Push
    if (fcmWebToken) {
      const stringData = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      );
      promises.push(
        admin.messaging().send({
          token: fcmWebToken,
          notification: { title, body },
          data: stringData,
          webpush: {
            notification: { title, body, icon: '/favicon.ico', badge: '/favicon.ico' },
            fcmOptions: { link: data.url || '/' },
          },
        }).catch((e) => {
          // Token scaduto o revocato: rimuovilo
          if (e.code === 'messaging/registration-token-not-registered') {
            return db.collection('users').doc(userId).update({ fcmWebToken: admin.firestore.FieldValue.delete() });
          }
          console.error('FCM web push error:', e);
        })
      );
    }

    await Promise.allSettled(promises);
  } catch (err) {
    console.error(`sendNotificationToUser error (${userId}):`, err);
  }
}

// ── HTTPS callable: converti WebM → M4A ──────────────────────────────────────
// Chiamata dal sito web dopo ogni upload di un suono .webm.
// Usa onCall (HTTPS) invece di un trigger Firestore → nessun permesso EventArc.
exports.convertWebmToM4a = onCall(
  { timeoutSeconds: 300, memory: '1GiB', region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Devi essere autenticato');

    const { soundId, audioUrl, userId } = request.data;
    if (!soundId || !audioUrl) throw new HttpsError('invalid-argument', 'soundId e audioUrl richiesti');
    if (!audioUrl.includes('.webm')) return { skipped: true, reason: 'not webm' };

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const tmpDir = os.tmpdir();
    const inputFile = path.join(tmpDir, `webm_${soundId}_${Date.now()}.webm`);
    const outputFile = path.join(tmpDir, `m4a_${soundId}_${Date.now()}.m4a`);

    try {
      await db.collection('sounds').doc(soundId).update({ converted: 'processing' });
      await downloadFile(audioUrl, inputFile);

      await new Promise((resolve, reject) => {
        ffmpeg(inputFile)
          .outputOptions(['-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart'])
          .output(outputFile)
          .on('end', resolve)
          .on('error', (err) => reject(new Error(`FFmpeg: ${err.message}`)))
          .run();
      });

      const destPath = `sounds/${userId || uid}/${soundId}_converted.m4a`;
      const downloadToken = uuidv4();
      await bucket.upload(outputFile, {
        destination: destPath,
        metadata: { contentType: 'audio/mp4', metadata: { firebaseStorageDownloadTokens: downloadToken } },
      });

      const encodedPath = encodeURIComponent(destPath);
      const newAudioUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
      await db.collection('sounds').doc(soundId).update({ audioUrl: newAudioUrl, converted: true });

      console.log(`✅ [CONVERT] ${soundId}: WebM → M4A`);
      return { success: true, audioUrl: newAudioUrl };
    } catch (err) {
      console.error(`❌ [CONVERT] ${soundId}:`, err.message);
      await db.collection('sounds').doc(soundId).update({ converted: 'error' }).catch(() => {});
      throw new HttpsError('internal', err.message);
    } finally {
      try { fs.unlinkSync(inputFile); } catch (_) {}
      try { fs.unlinkSync(outputFile); } catch (_) {}
    }
  }
);

// ── Trigger: like su podcast ─────────────────────────────────────────────────
exports.onPodcastLiked = onDocumentCreated(
  { document: 'podcast/{podcastId}/likes/{likerId}', region: 'europe-west1' },
  async (event) => {
    const { podcastId, likerId } = event.params;
    const db = admin.firestore();
    const podDoc = await db.collection('podcast').doc(podcastId).get();
    if (!podDoc.exists) return;
    const pod = podDoc.data();
    if (pod.userId === likerId) return; // no self-notification
    const likerDoc = await db.collection('users').doc(likerId).get();
    const likerName = likerDoc.data()?.username || likerDoc.data()?.displayName || 'Qualcuno';
    await sendNotificationToUser(db, pod.userId, {
      title: '👍 Like al tuo podcast!',
      body: `${likerName} ha messo like a "${pod.title}"`,
      data: { type: 'podcast_like', podcastId, userId: likerId },
    });
  }
);

// ── Trigger: commento su podcast ──────────────────────────────────────────────
exports.onPodcastCommentCreated = onDocumentCreated(
  { document: 'podcast/{podcastId}/comments/{commentId}', region: 'europe-west1' },
  async (event) => {
    const { podcastId } = event.params;
    const comment = event.data?.data();
    if (!comment) return;
    const db = admin.firestore();
    const podDoc = await db.collection('podcast').doc(podcastId).get();
    if (!podDoc.exists) return;
    const pod = podDoc.data();
    if (pod.userId === comment.userId) return; // no self-notification
    const preview = comment.text?.length > 60 ? comment.text.substring(0, 60) + '…' : comment.text;
    await sendNotificationToUser(db, pod.userId, {
      title: '💬 Commento al tuo podcast!',
      body: `${comment.username}: "${preview}"`,
      data: { type: 'podcast_comment', podcastId, userId: comment.userId },
    });
  }
);

// ── Trigger: nuovo like ───────────────────────────────────────────────────────
exports.onLikeCreated = onDocumentCreated(
  { document: 'sounds/{soundId}/likes/{likerId}', region: 'europe-west1' },
  async (event) => {
    const { soundId, likerId } = event.params;
    if (!event.data) return;

    const db = admin.firestore();
    const soundDoc = await db.collection('sounds').doc(soundId).get();
    if (!soundDoc.exists) return;
    const sound = soundDoc.data();
    if (sound.userId === likerId) return; // no self-notification

    const likerDoc = await db.collection('users').doc(likerId).get();
    const likerName = likerDoc.data()?.username || likerDoc.data()?.displayName || 'Qualcuno';

    await sendNotificationToUser(db, sound.userId, {
      title: '❤️ Nuovo like!',
      body: `${likerName} ha messo like a "${sound.title}"`,
      data: { type: 'like', soundId, userId: likerId },
    });
  }
);

// ── Trigger: nuovo commento ───────────────────────────────────────────────────
exports.onCommentCreated = onDocumentCreated(
  { document: 'sounds/{soundId}/comments/{commentId}', region: 'europe-west1' },
  async (event) => {
    const { soundId } = event.params;
    const comment = event.data?.data();
    if (!comment) return;

    const db = admin.firestore();
    const soundDoc = await db.collection('sounds').doc(soundId).get();
    if (!soundDoc.exists) return;
    const sound = soundDoc.data();
    if (sound.userId === comment.userId) return;

    const commenterDoc = await db.collection('users').doc(comment.userId).get();
    const commenterName = commenterDoc.data()?.username || commenterDoc.data()?.displayName || 'Qualcuno';
    const text = comment.text || '';
    const preview = text.length > 60 ? text.substring(0, 60) + '…' : text;

    await sendNotificationToUser(db, sound.userId, {
      title: '💬 Nuovo commento!',
      body: `${commenterName}: "${preview}"`,
      data: { type: 'comment', soundId, userId: comment.userId },
    });
  }
);

// ── Trigger: nuovo follower ───────────────────────────────────────────────────
exports.onFollowCreated = onDocumentCreated(
  { document: 'users/{userId}/followers/{followerId}', region: 'europe-west1' },
  async (event) => {
    const { userId, followerId } = event.params;
    if (userId === followerId) return;
    if (!event.data) return;

    const db = admin.firestore();
    const followerDoc = await db.collection('users').doc(followerId).get();
    const followerName = followerDoc.data()?.username || followerDoc.data()?.displayName || 'Qualcuno';

    await sendNotificationToUser(db, userId, {
      title: '👥 Nuovo follower!',
      body: `${followerName} ha iniziato a seguirti`,
      data: { type: 'follow', userId: followerId },
    });
  }
);

// ── Trigger: nuovo messaggio vocale privato ───────────────────────────────────
exports.onMessageCreated = onDocumentCreated(
  { document: 'messaggi/{msgId}', region: 'europe-west1' },
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;

    const { senderId, receiverId, duration } = msg;
    if (!receiverId || senderId === receiverId) return;

    const db = admin.firestore();
    const senderDoc = await db.collection('users').doc(senderId).get();
    const senderName = senderDoc.data()?.username || senderDoc.data()?.displayName || 'Qualcuno';

    await sendNotificationToUser(db, receiverId, {
      title: '🎤 Nuovo messaggio vocale!',
      body: `${senderName} ti ha inviato un messaggio${duration ? ` di ${duration}s` : ''}`,
      data: { type: 'message', senderId },
    });
  }
);

// ── Trigger: richiesta di amicizia ricevuta ───────────────────────────────────
exports.onFriendRequestCreated = onDocumentCreated(
  { document: 'friendRequests/{reqId}', region: 'europe-west1' },
  async (event) => {
    const req = event.data?.data();
    if (!req || req.status !== 'pending') return;

    const db = admin.firestore();
    const senderId = req.initiatedBy;
    const receiverId = (req.users || []).find((u) => u !== senderId);
    if (!receiverId) return;

    const senderDoc = await db.collection('users').doc(senderId).get();
    const senderName = senderDoc.data()?.username || senderDoc.data()?.displayName || 'Qualcuno';

    await sendNotificationToUser(db, receiverId, {
      title: '👤 Richiesta di amicizia!',
      body: `${senderName} vuole essere tuo amico`,
      data: { type: 'friend_request', senderId },
    });
  }
);

// ── Trigger: richiesta di amicizia accettata ──────────────────────────────────
exports.onFriendRequestAccepted = onDocumentUpdated(
  { document: 'friendRequests/{reqId}', region: 'europe-west1' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.status === after.status) return; // nessun cambio
    if (after.status !== 'accepted') return;

    const db = admin.firestore();
    const senderId = after.initiatedBy; // chi aveva inviato la richiesta
    const accepterId = (after.users || []).find((u) => u !== senderId);
    if (!accepterId) return;

    const accepterDoc = await db.collection('users').doc(accepterId).get();
    const accepterName = accepterDoc.data()?.username || accepterDoc.data()?.displayName || 'Qualcuno';

    await sendNotificationToUser(db, senderId, {
      title: '🎉 Amicizia accettata!',
      body: `${accepterName} ha accettato la tua richiesta di amicizia`,
      data: { type: 'friend_accepted', userId: accepterId },
    });
  }
);

// ── Trigger: nuovo remix che usa i tuoi suoni ─────────────────────────────────
exports.onRemixCreated = onDocumentCreated(
  { document: 'remixes/{remixId}', region: 'europe-west1' },
  async (event) => {
    const remix = event.data?.data();
    if (!remix || !remix.tracks?.length) return;

    const db = admin.firestore();
    const remixerId = remix.userId;
    const remixTitle = remix.title || 'un remix';

    const remixerDoc = await db.collection('users').doc(remixerId).get();
    const remixerName = remixerDoc.data()?.username || remixerDoc.data()?.displayName || 'Qualcuno';

    // Notifica gli owner unici dei suoni usati (escludi il remixer stesso)
    const notifiedOwners = new Set();
    for (const track of remix.tracks) {
      if (!track.soundId) continue;
      const soundDoc = await db.collection('sounds').doc(track.soundId).get();
      if (!soundDoc.exists) continue;
      const ownerId = soundDoc.data()?.userId;
      if (!ownerId || ownerId === remixerId || notifiedOwners.has(ownerId)) continue;
      notifiedOwners.add(ownerId);
      await sendNotificationToUser(db, ownerId, {
        title: '🎛️ Il tuo suono è stato remixato!',
        body: `${remixerName} ha creato "${remixTitle}" usando il tuo audio`,
        data: { type: 'remix', remixId: event.params.remixId, userId: remixerId },
      });
    }
  }
);

// ── Scheduled: streak reminder ogni giorno alle 20:00 (Europe/Rome) ──────────
// Notifica gli utenti con streak > 0 che non hanno ancora pubblicato oggi.
// ── Trigger: host va live in radio ────────────────────────────────────────────
exports.onRadioCreated = onDocumentCreated(
  { document: 'radio/{roomId}', region: 'europe-west1' },
  async (event) => {
    const room = event.data?.data();
    if (!room || !room.isLive) return;

    const { hostId, hostName, title } = room;
    if (!hostId) { console.log('[onRadioCreated] hostId mancante, skip'); return; }

    const db = admin.firestore();
    console.log(`[onRadioCreated] TRIGGERED — Host: ${hostId} (${hostName}), title: "${title}", isLive: ${room.isLive}`);

    const followersSnap = await db
      .collection('follows')
      .where('followingId', '==', hostId)
      .get();

    console.log(`[onRadioCreated] Follower trovati nella collection 'follows': ${followersSnap.size}`);
    if (followersSnap.empty) {
      console.log(`[onRadioCreated] Nessun follower trovato per hostId=${hostId} — notifiche non inviate`);
      return;
    }

    const promises = followersSnap.docs.map((followerDoc) => {
      const followerId = followerDoc.data().followerId;
      console.log(`[onRadioCreated] Invio notifica a followerId: ${followerId}`);
      return sendNotificationToUser(db, followerId, {
        title: '📻 Radio Live!',
        body: `${hostName} è appena andato live: "${title}"`,
        data: { type: 'radio_live', roomId: event.params.roomId, hostId },
      });
    });

    await Promise.allSettled(promises);
    console.log(`[onRadioCreated] Done — notifiche inviate a ${promises.length} follower di ${hostName}`);
  }
);

// ── Trigger: radio programmata diventa live (update isLive false→true) ────────
exports.onRadioGoesLive = onDocumentUpdated(
  { document: 'radio/{roomId}', region: 'europe-west1' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    // Scatta solo quando isLive passa da false a true
    if (before.isLive || !after.isLive) return;

    const { hostId, hostName, title } = after;
    if (!hostId) return;

    const db = admin.firestore();
    const followersSnap = await db
      .collection('follows')
      .where('followingId', '==', hostId)
      .get();

    if (followersSnap.empty) return;

    const promises = followersSnap.docs.map((followerDoc) =>
      sendNotificationToUser(db, followerDoc.data().followerId, {
        title: '📻 Radio Live!',
        body: `${hostName} è appena andato live: "${title}"`,
        data: { type: 'radio_live', roomId: event.params.roomId, hostId },
      })
    );

    await Promise.allSettled(promises);
    console.log(`[onRadioGoesLive] Notifiche inviate a ${promises.length} follower di ${hostName}`);
  }
);

// ── Trigger: nuova radio programmata creata ────────────────────────────────────
exports.onScheduledRadioCreated = onDocumentCreated(
  { document: 'radio/{roomId}', region: 'europe-west1' },
  async (event) => {
    const room = event.data?.data();
    // Scatta solo per radio programmate (isLive=false con scheduledFor)
    if (!room || room.isLive || !room.scheduledFor) return;

    const { hostId, hostName, title, scheduledFor } = room;
    if (!hostId) return;

    const db = admin.firestore();
    const followersSnap = await db
      .collection('follows')
      .where('followingId', '==', hostId)
      .get();

    if (followersSnap.empty) return;

    // Formatta l'orario in modo leggibile (Europe/Rome)
    const scheduledDate = scheduledFor.toDate ? scheduledFor.toDate() : new Date(scheduledFor._seconds * 1000);
    const timeStr = scheduledDate.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    const promises = followersSnap.docs.map((followerDoc) =>
      sendNotificationToUser(db, followerDoc.data().followerId, {
        title: '📅 Radio programmata!',
        body: `${hostName} andrà live "${title}" il ${timeStr}`,
        data: { type: 'radio_scheduled', roomId: event.params.roomId, hostId },
      })
    );

    await Promise.allSettled(promises);
    console.log(`[onScheduledRadioCreated] Notifiche inviate a ${promises.length} follower di ${hostName}`);
  }
);

// ─── Notifica radio live — callable diretta dall'host ─────────────────────────
exports.notifyRadioLive = onCall({ region: 'europe-west1' }, async (request) => {
  const { roomId, hostId, hostName, title, isScheduled } = request.data ?? {};
  if (!roomId || !hostId || !hostName) {
    throw new HttpsError('invalid-argument', 'Parametri mancanti');
  }

  const db = admin.firestore();
  const followersSnap = await db
    .collection('follows')
    .where('followingId', '==', hostId)
    .get();

  console.log(`[notifyRadioLive] hostId=${hostId} (${hostName}), follower=${followersSnap.size}, scheduled=${!!isScheduled}`);

  if (followersSnap.empty) return { sent: 0 };

  const notifTitle = isScheduled ? '📅 Radio programmata!' : '📻 Radio Live!';
  const notifBody = isScheduled
    ? `${hostName} ha programmato una radio: "${title}"`
    : `${hostName} è appena andato live: "${title}"`;

  const promises = followersSnap.docs.map((doc) =>
    sendNotificationToUser(db, doc.data().followerId, {
      title: notifTitle,
      body: notifBody,
      data: { type: isScheduled ? 'radio_scheduled' : 'radio_live', roomId, hostId },
    })
  );

  await Promise.allSettled(promises);
  console.log(`[notifyRadioLive] Inviate a ${promises.length} follower`);
  return { sent: promises.length };
});

// ─── Agora Token ──────────────────────────────────────────────────────────────

exports.getAgoraToken = onCall({ region: 'europe-west1' }, async (request) => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId) {
    throw new HttpsError('failed-precondition', 'Agora App ID non configurato');
  }
  // Senza certificato → dev mode senza token
  if (!appCertificate) {
    return { token: null };
  }

  const { channelName } = request.data ?? {};
  if (!channelName || typeof channelName !== 'string') {
    throw new HttpsError('invalid-argument', 'channelName mancante');
  }

  const { RtcTokenBuilder, RtcRole } = require('agora-token');
  const expireTs = Math.floor(Date.now() / 1000) + 3600; // 1 ora
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId, appCertificate, channelName, 0, RtcRole.PUBLISHER, expireTs, expireTs,
  );
  return { token };
});

exports.streakReminder = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'Europe/Rome', region: 'europe-west1' },
  async () => {
    const db = admin.firestore();
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' UTC
    // 'sv-SE' locale produce date in formato YYYY-MM-DD, rispettando il DST reale di Rome
    const todayRome = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

    const usersSnap = await db.collection('users').get();
    const promises = [];

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const streak = data.streakCount || 0;

      // Salta se streak = 0 (niente da perdere) o ha già pubblicato oggi
      if (streak === 0) continue;
      if (data.lastPublishDate === todayRome || data.lastPublishDate === today) continue;

      // Salta se non ha token per le notifiche
      if (!data.pushToken && !data.fcmWebToken) continue;

      promises.push(
        sendNotificationToUser(db, userDoc.id, {
          title: '🔥 Streak in pericolo!',
          body: `Non perdere la tua streak di ${streak} ${streak === 1 ? 'giorno' : 'giorni'}! Pubblica qualcosa ora.`,
          data: { type: 'streak_reminder' },
        })
      );
    }

    await Promise.allSettled(promises);
    console.log(`[streakReminder] Notifiche inviate: ${promises.length}`);
  }
);

