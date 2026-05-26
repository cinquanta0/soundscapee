const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onTaskDispatched } = require('firebase-functions/v2/tasks');
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
const SCHOOL_EMAIL_DOMAINS = (process.env.SCHOOL_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
const SCHOOL_BOOTSTRAP_ADMINS = (process.env.SCHOOL_BOOTSTRAP_ADMINS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const SCHOOL_TEST_VERIFIED_UIDS = (process.env.SCHOOL_TEST_VERIFIED_UIDS || '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

function getUserDocRef(uid) {
  return admin.firestore().collection('users').doc(uid);
}

function extractDomain(email = '') {
  const idx = email.lastIndexOf('@');
  return idx > -1 ? email.slice(idx + 1).toLowerCase() : '';
}

function isSchoolDomain(email = '') {
  if (!SCHOOL_EMAIL_DOMAINS.length) return true;
  const domain = extractDomain(email);
  return SCHOOL_EMAIL_DOMAINS.includes(domain);
}

async function writeAuditLog(action, actorId, targetId, details = {}) {
  await admin.firestore().collection('auditLogs').add({
    action,
    actorId,
    targetId: targetId || '',
    details,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function getSchoolRole(uid) {
  const snap = await getUserDocRef(uid).get();
  if (!snap.exists) return 'student';
  return snap.data()?.schoolRole || 'student';
}

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
  // Accetta audio, video e application/octet-stream (comune per file Firebase Storage
  // caricati senza Content-Type esplicito)
  const allowedMime = ['audio/', 'video/', 'application/octet-stream'];
  if (!allowedMime.some((t) => contentType.startsWith(t))) {
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

    const tmpDir = os.tmpdir();
    const inputFiles = [];
    let outputFile;

    try {
      // Inizializza bucket e carica il documento remix
      // (erano fuori dal try-catch — qualsiasi errore qui dava "internal" generico)
      const bucket = admin.storage().bucket();
      outputFile = path.join(tmpDir, `remix_${remixId}_${Date.now()}.m4a`);

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

      // 2. Scarica tutte le tracce preservando l'estensione reale
      for (let i = 0; i < remix.tracks.length; i++) {
        const track = remix.tracks[i];
        const urlPath = (track.audioUrl || '').split('?')[0];
        const rawExt = urlPath.split('.').pop().toLowerCase();
        const ext = ['webm', 'ogg', 'm4a', 'mp3', 'mp4', 'aac'].includes(rawExt) ? rawExt : 'm4a';
        const tmpFile = path.join(tmpDir, `track_${i}_${Date.now()}.${ext}`);
        await downloadFile(track.audioUrl, tmpFile);
        inputFiles.push(tmpFile);
      }

      // 3. Costruisci il comando FFmpeg con filter_complex
      await new Promise((resolve, reject) => {
        let cmd = ffmpeg();

        // Aggiungi tutti gli input
        inputFiles.forEach((f) => cmd.input(f));

        // Costruisci i filtri per ogni traccia
        const nTracks = remix.tracks.length;
        const filterParts = remix.tracks.map((track, i) => {
          const trimStart = Math.max(0, track.trimStart || 0);
          const rawTrimEnd = (track.trimEnd != null && track.trimEnd > 0)
            ? track.trimEnd
            : (track.duration || 30);
          const trimEnd = rawTrimEnd > trimStart ? rawTrimEnd : trimStart + 0.1;
          // Compensate for amix normalization (divides by nTracks) by pre-scaling volume
          const volume = Math.max(0.01, Math.min(2, track.volume || 1)) * nTracks;
          const offsetSec = Math.max(0, track.offsetStart || 0);

          // FFmpeg 4.1 compatible chain — no aformat, no adelay `all` option
          let chain =
            `[${i}:a]` +
            `atrim=start=${trimStart}:end=${trimEnd},` +
            `asetpts=PTS-STARTPTS,` +
            `aresample=44100,` +
            `volume=${volume}`;

          if (offsetSec > 0) {
            // adelay takes ms per channel; repeat for L and R
            const offsetMs = Math.round(offsetSec * 1000);
            chain += `,adelay=${offsetMs}|${offsetMs}`;
          }

          chain += `[t${i}]`;
          return chain;
        });

        // amix without normalize= option (added only in FFmpeg 4.3+)
        const mixInputs = remix.tracks.map((_, i) => `[t${i}]`).join('');
        const mixFilter = `${mixInputs}amix=inputs=${nTracks}:duration=longest[out]`;

        const filterComplex = [...filterParts, mixFilter].join(';');
        console.log('[processRemix] filter_complex:', filterComplex);

        cmd
          .complexFilter(filterComplex)
          .outputOptions(['-map', '[out]', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2'])
          .output(outputFile)
          .on('end', resolve)
          .on('error', (err) => {
            console.error('[processRemix] FFmpeg error:', err.message);
            reject(new Error(`FFmpeg error: ${err.message}`));
          })
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
      // Ri-lancia gli HttpsError (not-found, permission-denied, ecc.) senza modificarli
      if (error instanceof HttpsError) throw error;

      // Per errori inaspettati: aggiorna Firestore e restituisce il messaggio reale
      // (prima questo blocco mancava per bucket/Firestore fuori dal try — dava "internal" generico)
      await db.collection('remixes').doc(remixId).update({
        processingStatus: 'error',
        processingError: error.message,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {}); // ignora se anche questo fallisce

      throw new HttpsError('internal', `Errore durante il processing: ${error.message}`);

    } finally {
      // Pulizia file temporanei
      inputFiles.forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });
      if (outputFile) { try { fs.unlinkSync(outputFile); } catch (_) {} }
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
    const isCall = data.type === 'incoming_call';

    // Supporta sia pushTokens (array, multi-device) che pushToken (legacy singolo)
    const rawTokens = userData.pushTokens ?? (userData.pushToken ? [userData.pushToken] : []);
    const mobileTokens = [...new Set(rawTokens)].filter(t => t?.startsWith('ExponentPushToken'));
    const rawFcmTokens = Array.isArray(userData.fcmPushTokens) ? userData.fcmPushTokens : [];
    const fcmMobileTokens = [...new Set(rawFcmTokens)].filter(Boolean);

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
    // iosExpoPushTokens: token Expo salvati specificamente da dispositivi iOS
    // (notificationService.js salva in questo campo solo su Platform.OS === 'ios')
    const rawIosTokens = Array.isArray(userData.iosExpoPushTokens) ? userData.iosExpoPushTokens : [];
    const iosExpoPushTokens = new Set([...rawIosTokens].filter(t => t?.startsWith('ExponentPushToken')));

    for (const token of mobileTokens) {
      // iOS tokens are handled separately in the iosExpoPushTokens block below.
      if (iosExpoPushTokens.has(token)) continue;
      // Per le chiamate su Android: FCM data-only (sotto) sveglia IncomingCallService
      // che mostra lo schermo intero con pulsanti accetta/rifiuta. Il push Expo per
      // le chiamate viene saltato perché non ha quei pulsanti e confonde l'utente.
      if (isCall && fcmMobileTokens.length > 0) continue;

      promises.push(
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: token,
            ...(isCall
              ? { _contentAvailable: true }
              : {
                sound: data.channelId === 'calls' ? 'soundscape_call.wav' : 'default',
                title,
                body,
                channelId: data.channelId || 'default',
              }),
            data,
            priority: 'high',
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

    // 2b. iOS call notification — title+body separata per mostrare banner su iOS.
    // I token iOS sono salvati in iosExpoPushTokens da notificationService.js (Platform.OS==='ios').
    // Su iOS i data-only push vengono ignorati in background; serve una notification message visibile.
    if (isCall && iosExpoPushTokens.size > 0) {
      for (const token of iosExpoPushTokens) {
        promises.push(
          fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: token,
              sound: 'soundscape_call.wav',
              title,
              body,
              data,
              priority: 'high',
              _contentAvailable: true,
            }),
          }).catch((e) => console.error(`[push] iOS call push error per ${userId}:`, e))
        );
      }
    }

    if (isCall && fcmMobileTokens.length > 0) {
      const stringData = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      );
      promises.push(
        admin.messaging().sendEachForMulticast({
          tokens: fcmMobileTokens,
          data: stringData,
          android: {
            priority: 'high',
            ttl: 60 * 1000,
          },
        }).then(async (response) => {
          const invalidTokens = [];
          response.responses.forEach((item, index) => {
            if (item.success) return;
            const errorCode = item.error?.code;
            console.error(`[push] FCM call error per ${userId}:`, errorCode || item.error?.message || item.error);
            if (
              errorCode === 'messaging/registration-token-not-registered'
              || errorCode === 'messaging/invalid-registration-token'
            ) {
              invalidTokens.push(fcmMobileTokens[index]);
            }
          });
          if (invalidTokens.length) {
            await db.collection('users').doc(userId).update({
              fcmPushTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
            }).catch(() => {});
          }
        }).catch((e) => console.error(`[push] FCM multicast error per ${userId}:`, e))
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

function getAddedReaction(beforeReactions = {}, afterReactions = {}) {
  const emojis = new Set([
    ...Object.keys(beforeReactions || {}),
    ...Object.keys(afterReactions || {}),
  ]);

  for (const emoji of emojis) {
    const beforeUsers = Array.isArray(beforeReactions?.[emoji]) ? beforeReactions[emoji] : [];
    const afterUsers = Array.isArray(afterReactions?.[emoji]) ? afterReactions[emoji] : [];
    const addedUser = afterUsers.find((uid) => !beforeUsers.includes(uid));
    if (addedUser) return { emoji, userId: addedUser };
  }

  return null;
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

// ── Trigger: nuovo messaggio privato ──────────────────────────────────────────
exports.onMessageCreated = onDocumentCreated(
  { document: 'messaggi/{msgId}', region: 'europe-west1' },
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;
    if (msg.isDeleted) return;

    const { senderId, receiverId, duration, statusReply, statusId, type, text, replyTo } = msg;
    if (!receiverId || senderId === receiverId) return;

    const db = admin.firestore();
    const senderDoc = await db.collection('users').doc(senderId).get();
    const senderName = senderDoc.data()?.username || senderDoc.data()?.displayName || 'Qualcuno';

    if (statusReply) {
      await sendNotificationToUser(db, receiverId, {
        title: '💬 Ha risposto al tuo stato!',
        body: type === 'text'
          ? `${senderName} ha risposto al tuo stato: ${String(text || '').slice(0, 80)}`
          : `${senderName} ha risposto al tuo stato${duration ? ` (${duration}s)` : ''}`,
        data: { type: 'status_reply', senderId, ...(statusId ? { statusId } : {}) },
      });
    } else if (replyTo?.id) {
      await sendNotificationToUser(db, receiverId, {
        title: '↩️ Ha risposto al tuo messaggio!',
        body: type === 'text'
          ? `${senderName}: ${String(text || '').slice(0, 100)}`
          : `${senderName} ti ha risposto con un vocale${duration ? ` di ${duration}s` : ''}`,
        data: { type: 'message_reply', senderId, replyToId: replyTo.id },
      });
    } else {
      await sendNotificationToUser(db, receiverId, {
        title: type === 'text' ? '💬 Nuovo messaggio!' : '🎤 Nuovo messaggio vocale!',
        body: type === 'text'
          ? `${senderName}: ${String(text || '').slice(0, 100)}`
          : `${senderName} ti ha inviato un messaggio${duration ? ` di ${duration}s` : ''}`,
        data: { type: 'message', senderId },
      });
    }
  }
);

// ── Trigger: reaction su messaggio privato ────────────────────────────────────
exports.onMessageReactionUpdated = onDocumentUpdated(
  { document: 'messaggi/{msgId}', region: 'europe-west1' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const beforeReactions = before.reactions ?? {};
    const afterReactions = after.reactions ?? {};
    const beforeStr = JSON.stringify(beforeReactions);
    const afterStr = JSON.stringify(afterReactions);
    if (beforeStr === afterStr) return;

    const added = getAddedReaction(beforeReactions, afterReactions);
    if (!added?.userId) return;

    const ownerId = after.senderId;
    const reactorId = added.userId;
    if (!ownerId || !reactorId || ownerId === reactorId) return;

    const db = admin.firestore();
    const reactorDoc = await db.collection('users').doc(reactorId).get();
    const reactorName = reactorDoc.data()?.username || reactorDoc.data()?.displayName || 'Qualcuno';
    const preview = after.type === 'text'
      ? String(after.text || '').slice(0, 80)
      : `Vocale${after.duration ? ` · ${after.duration}s` : ''}`;

    await sendNotificationToUser(db, ownerId, {
      title: `${added.emoji} Nuova reaction!`,
      body: `${reactorName} ha reagito al tuo messaggio${preview ? `: ${preview}` : ''}`,
      data: {
        type: 'message_reaction',
        senderId: reactorId,
        emoji: added.emoji,
      },
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
  const crypto = require('crypto');
  const db = admin.firestore();

  if (!appId) {
    throw new HttpsError('failed-precondition', 'Agora App ID non configurato');
  }

  const { channelName } = request.data ?? {};
  if (!channelName || typeof channelName !== 'string') {
    throw new HttpsError('invalid-argument', 'channelName mancante');
  }

  // Genera o recupera la chiave di cifratura per questo canale (atomic via transaction)
  const callRef = db.collection('calls').doc(channelName);
  const { encKey, encSalt } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(callRef);
    const data = snap.data() || {};
    if (data.encKey && data.encSalt) {
      return { encKey: data.encKey, encSalt: data.encSalt };
    }
    const key = crypto.randomBytes(32).toString('base64');
    const salt = Array.from(crypto.randomBytes(32));
    tx.set(callRef, { encKey: key, encSalt: salt }, { merge: true });
    return { encKey: key, encSalt: salt };
  });

  // Senza certificato → dev mode senza token Agora ma con chiave E2E
  if (!appCertificate) {
    return { token: null, encKey, encSalt };
  }

  const { RtcTokenBuilder, RtcRole } = require('agora-token');
  const expireTs = Math.floor(Date.now() / 1000) + 3600; // 1 ora
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId, appCertificate, channelName, 0, RtcRole.PUBLISHER, expireTs, expireTs,
  );
  return { token, encKey, encSalt };
});

exports.streakReminder = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'Europe/Rome', region: 'europe-west1' },
  async () => {
    const db = admin.firestore();
    const todayRome = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
    const yesterdayRome = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

    const usersSnap = await db.collection('users').get();
    const promises = [];
    const resetBatch = db.batch();
    let resetCount = 0;

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const streak = data.streakCount || 0;

      if (streak === 0) continue;
      if (data.lastPublishDate === todayRome) continue; // pubblicato oggi, nessun problema

      if (data.lastPublishDate === yesterdayRome) {
        // Streak a rischio: ha pubblicato ieri ma non ancora oggi — manda reminder
        if (!data.pushToken && !data.fcmWebToken) continue;
        promises.push(
          sendNotificationToUser(db, userDoc.id, {
            title: '🔥 Streak in pericolo!',
            body: `Non perdere la tua streak di ${streak} ${streak === 1 ? 'giorno' : 'giorni'}! Pubblica qualcosa ora.`,
            data: { type: 'streak_reminder' },
          })
        );
      } else {
        // Streak già persa (mancano 2+ giorni) — azzera in batch
        resetBatch.update(userDoc.ref, { streakCount: 0 });
        resetCount++;
      }
    }

    if (resetCount > 0) await resetBatch.commit();
    await Promise.allSettled(promises);
    console.log(`[streakReminder] Reminder: ${promises.length}, Reset: ${resetCount}`);
  }
);

// Azzera streak scadute ogni notte a mezzanotte+5min, così il reset avviene
// appena scatta il nuovo giorno senza aspettare le 20:00.
exports.resetStaleStreaks = onSchedule(
  { schedule: '5 0 * * *', timeZone: 'Europe/Rome', region: 'europe-west1' },
  async () => {
    const db = admin.firestore();
    const yesterdayRome = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

    const snap = await db.collection('users').where('streakCount', '>', 0).get();
    if (snap.empty) return;

    const batch = db.batch();
    let count = 0;
    for (const doc of snap.docs) {
      const lpd = doc.data().lastPublishDate;
      // lastPublishDate mancante o antecedente a ieri → streak persa
      if (!lpd || lpd < yesterdayRome) {
        batch.update(doc.ref, { streakCount: 0 });
        count++;
      }
    }
    if (count > 0) await batch.commit();
    console.log(`[resetStaleStreaks] Azzerate ${count} streak scadute`);
  }
);

// ── Scheduled: sincronizza profili users da Firebase Auth ─────────────────────
// Serve per riparare utenti autenticati ma con doc Firestore mancante/incompleto,
// senza richiedere logout/login.
exports.syncAuthUsersToProfiles = onSchedule(
  { schedule: 'every 10 minutes', region: 'europe-west1' },
  async () => {
    const db = admin.firestore();
    let nextPageToken = undefined;
    let scanned = 0;
    let updated = 0;
    let created = 0;

    do {
      const page = await admin.auth().listUsers(1000, nextPageToken);
      nextPageToken = page.pageToken;

      for (const user of page.users) {
        scanned += 1;
        const uid = user.uid;
        const emailNorm = String(user.email || '').toLowerCase();
        const userRef = db.collection('users').doc(uid);
        const userSnap = await userRef.get();
        const existing = userSnap.exists ? (userSnap.data() || {}) : {};

        const fallbackBaseName = (emailNorm.split('@')[0] || `user_${uid.slice(0, 6)}`).trim() || `user_${uid.slice(0, 6)}`;
        const fallbackUsername = String(existing.username || fallbackBaseName)
          .toLowerCase()
          .replace(/\s+/g, '_')
          .slice(0, 50);
        const fallbackDisplayName = String(existing.displayName || existing.username || fallbackBaseName).slice(0, 100);

        const isBootstrapAdmin = SCHOOL_BOOTSTRAP_ADMINS.includes(emailNorm);
        const effectiveRole = isBootstrapAdmin ? 'admin' : (existing.schoolRole || 'student');
        const forcedVerifiedForTesting = SCHOOL_TEST_VERIFIED_UIDS.includes(uid);
        const emailVerified = forcedVerifiedForTesting || !!user.emailVerified;

        await userRef.set({
          email: user.email || existing.email || '',
          username: fallbackUsername || `user_${uid.slice(0, 6)}`,
          displayName: fallbackDisplayName || fallbackBaseName,
          avatar: existing.avatar || '🎧',
          bio: existing.bio || 'Nuovo utente MIUSLYK 🎵',
          recordingsCount: Number.isFinite(existing.recordingsCount) ? existing.recordingsCount : 0,
          followersCount: Number.isFinite(existing.followersCount) ? existing.followersCount : 0,
          followingCount: Number.isFinite(existing.followingCount) ? existing.followingCount : 0,
          friendsCount: Number.isFinite(existing.friendsCount) ? existing.friendsCount : 0,
          isPremium: typeof existing.isPremium === 'boolean' ? existing.isPremium : false,
          ...(userSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
          schoolRole: effectiveRole,
          ...(isBootstrapAdmin ? { isAdmin: true } : {}),
          emailVerified,
          schoolDomainAllowed: forcedVerifiedForTesting ? true : isSchoolDomain(user.email || ''),
          lastActive: existing.lastActive || admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        if (userSnap.exists) updated += 1;
        else created += 1;
      }
    } while (nextPageToken);

    console.log(`[syncAuthUsersToProfiles] scanned=${scanned} updated=${updated} created=${created}`);
  },
);

// ── School security callables ─────────────────────────────────────────────────
exports.upsertSchoolProfile = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  const email = request.auth?.token?.email || '';
  const emailNorm = String(email || '').toLowerCase();
  if (!uid) throw new HttpsError('unauthenticated', 'Non autenticato');

  const userRef = getUserDocRef(uid);
  const userSnap = await userRef.get();
  const existing = userSnap.exists ? (userSnap.data() || {}) : {};
  const fallbackBaseName = (emailNorm.split('@')[0] || `user_${uid.slice(0, 6)}`).trim() || `user_${uid.slice(0, 6)}`;
  const fallbackUsername = String(existing.username || fallbackBaseName).toLowerCase().replace(/\s+/g, '_').slice(0, 50);
  const fallbackDisplayName = String(existing.displayName || existing.username || fallbackBaseName).slice(0, 100);

  const role = await getSchoolRole(uid);
  const isBootstrapAdmin = SCHOOL_BOOTSTRAP_ADMINS.includes(emailNorm);
  const effectiveRole = isBootstrapAdmin ? 'admin' : role;
  const forcedVerifiedForTesting = SCHOOL_TEST_VERIFIED_UIDS.includes(uid);
  const emailVerified = forcedVerifiedForTesting || !!request.auth?.token?.email_verified;
  await userRef.set({
    email,
    username: fallbackUsername || `user_${uid.slice(0, 6)}`,
    displayName: fallbackDisplayName || fallbackBaseName,
    avatar: existing.avatar || '🎧',
    bio: existing.bio || 'Nuovo utente MIUSLYK 🎵',
    recordingsCount: Number.isFinite(existing.recordingsCount) ? existing.recordingsCount : 0,
    followersCount: Number.isFinite(existing.followersCount) ? existing.followersCount : 0,
    followingCount: Number.isFinite(existing.followingCount) ? existing.followingCount : 0,
    friendsCount: Number.isFinite(existing.friendsCount) ? existing.friendsCount : 0,
    isPremium: typeof existing.isPremium === 'boolean' ? existing.isPremium : false,
    ...(userSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    schoolRole: effectiveRole,
    ...(isBootstrapAdmin ? { isAdmin: true } : {}),
    emailVerified,
    schoolDomainAllowed: forcedVerifiedForTesting ? true : isSchoolDomain(email),
    lastActive: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return {
    role: effectiveRole,
    isAdmin: isBootstrapAdmin,
    emailVerified,
    schoolDomainAllowed: forcedVerifiedForTesting ? true : isSchoolDomain(email),
  };
});

exports.setSchoolRoleByAdmin = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Non autenticato');
  const adminDoc = await getUserDocRef(uid).get();
  if (!adminDoc.exists || adminDoc.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Solo admin');
  }
  const targetUserId = request.data?.targetUserId;
  const role = request.data?.role;
  if (!targetUserId || !['teacher', 'student', 'admin'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Parametri non validi');
  }
  await getUserDocRef(targetUserId).set({
    schoolRole: role,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
});

exports.createClassSecure = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  const email = request.auth?.token?.email || '';
  const forcedVerifiedForTesting = SCHOOL_TEST_VERIFIED_UIDS.includes(uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Non autenticato');
  if (!forcedVerifiedForTesting && !request.auth?.token?.email_verified) {
    throw new HttpsError('permission-denied', 'Email non verificata');
  }
  if (!forcedVerifiedForTesting && !isSchoolDomain(email)) {
    throw new HttpsError('permission-denied', 'Email scolastica richiesta');
  }
  const role = await getSchoolRole(uid);
  if (role !== 'teacher' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Ruolo docente richiesto');
  }

  const className = (request.data?.name || '').trim();
  if (!className || className.length > 120) {
    throw new HttpsError('invalid-argument', 'Nome classe non valido');
  }
  const codeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += codeChars[Math.floor(Math.random() * codeChars.length)];

  const db = admin.firestore();
  const userDoc = await getUserDocRef(uid).get();
  const teacherName = userDoc.data()?.username || userDoc.data()?.displayName || 'Docente';
  const classRef = await db.collection('classes').add({
    name: className,
    code,
    teacherId: uid,
    teacherName,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('classes').doc(classRef.id).collection('members').doc(uid).set({
    userId: uid,
    role: 'teacher',
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await writeAuditLog('class_create', uid, classRef.id, { className });
  return { classId: classRef.id, code };
});

exports.joinClassSecure = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Non autenticato');
  const code = (request.data?.code || '').trim().toUpperCase();
  if (!code) throw new HttpsError('invalid-argument', 'Codice mancante');
  const db = admin.firestore();
  const snap = await db.collection('classes').where('code', '==', code).limit(1).get();
  if (snap.empty) throw new HttpsError('not-found', 'Classe non trovata');
  const classDoc = snap.docs[0];
  const existing = await classDoc.ref.collection('members').doc(uid).get();
  if (existing.exists) {
    const status = existing.data()?.status || 'approved';
    return { classId: classDoc.id, status };
  }
  await classDoc.ref.collection('members').doc(uid).set({
    userId: uid,
    role: 'student',
    status: 'pending',
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeAuditLog('class_join_request', uid, classDoc.id, { status: 'pending' });
  return { classId: classDoc.id, status: 'pending' };
});

exports.approveClassMemberSecure = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Non autenticato');
  const classId = request.data?.classId;
  const studentId = request.data?.studentId;
  if (!classId || !studentId) throw new HttpsError('invalid-argument', 'Parametri mancanti');
  const db = admin.firestore();
  const classSnap = await db.collection('classes').doc(classId).get();
  if (!classSnap.exists) throw new HttpsError('not-found', 'Classe non trovata');
  if (classSnap.data().teacherId !== uid) throw new HttpsError('permission-denied', 'Solo docente classe');
  await db.collection('classes').doc(classId).collection('members').doc(studentId).set({
    userId: studentId,
    role: 'student',
    status: 'approved',
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeAuditLog('class_member_approve', uid, classId, { studentId });
  return { ok: true };
});

exports.rejectClassMemberSecure = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Non autenticato');
  const classId = request.data?.classId;
  const studentId = request.data?.studentId;
  if (!classId || !studentId) throw new HttpsError('invalid-argument', 'Parametri mancanti');
  const db = admin.firestore();
  const classSnap = await db.collection('classes').doc(classId).get();
  if (!classSnap.exists) throw new HttpsError('not-found', 'Classe non trovata');
  if (classSnap.data().teacherId !== uid) throw new HttpsError('permission-denied', 'Solo docente classe');
  await db.collection('classes').doc(classId).collection('members').doc(studentId).set({
    userId: studentId,
    role: 'student',
    status: 'rejected',
    rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeAuditLog('class_member_reject', uid, classId, { studentId });
  return { ok: true };
});

exports.approveSubmissionSecure = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Non autenticato');
  const submissionId = request.data?.submissionId;
  if (!submissionId) throw new HttpsError('invalid-argument', 'submissionId mancante');
  const db = admin.firestore();
  const ref = db.collection('lessonSubmissions').doc(submissionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Consegna non trovata');
  const data = snap.data();
  if (data.teacherId !== uid) throw new HttpsError('permission-denied', 'Solo docente assegnata');
  await ref.update({
    status: 'approved',
    teacherFeedback: '',
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('podcast').doc(data.podcastId).update({ submissionStatus: 'approved' });
  await writeAuditLog('submission_approve', uid, submissionId, { classId: data.classId, podcastId: data.podcastId });
  return { ok: true };
});

exports.rejectSubmissionSecure = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Non autenticato');
  const submissionId = request.data?.submissionId;
  const feedback = (request.data?.feedback || '').trim();
  if (!submissionId || !feedback) throw new HttpsError('invalid-argument', 'Parametri non validi');
  const db = admin.firestore();
  const ref = db.collection('lessonSubmissions').doc(submissionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Consegna non trovata');
  const data = snap.data();
  if (data.teacherId !== uid) throw new HttpsError('permission-denied', 'Solo docente assegnata');
  await ref.update({
    status: 'rejected',
    teacherFeedback: feedback,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('podcast').doc(data.podcastId).update({
    submissionStatus: 'rejected',
    teacherFeedback: feedback,
  });
  await writeAuditLog('submission_reject', uid, submissionId, { classId: data.classId, podcastId: data.podcastId });
  return { ok: true };
});

exports.gradeSubmissionSecure = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Non autenticato');
  const submissionId = request.data?.submissionId;
  const grade = Number(request.data?.grade);
  const gradeComment = (request.data?.gradeComment || '').trim();
  if (!submissionId || Number.isNaN(grade) || grade < 0 || grade > 100) {
    throw new HttpsError('invalid-argument', 'Parametri non validi');
  }
  const db = admin.firestore();
  const ref = db.collection('lessonSubmissions').doc(submissionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Consegna non trovata');
  const data = snap.data();
  if (data.teacherId !== uid) throw new HttpsError('permission-denied', 'Solo docente assegnata');
  await ref.update({
    grade: Math.round(grade),
    gradeComment,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('podcast').doc(data.podcastId).update({
    grade: Math.round(grade),
    gradeComment,
  });
  await writeAuditLog('submission_grade', uid, submissionId, { grade: Math.round(grade), classId: data.classId });
  return { ok: true };
});

exports.notifyTeacherOnSubmission = onDocumentCreated(
  { document: 'lessonSubmissions/{submissionId}', region: 'europe-west1' },
  async (event) => {
    const data = event.data?.data();
    if (!data?.teacherId || !data?.studentName) return;
    await sendNotificationToUser(admin.firestore(), data.teacherId, {
      title: 'Nuova consegna in attesa',
      body: `${data.studentName} ha inviato un compito da revisionare.`,
      data: { type: 'school_submission_pending', submissionId: event.params.submissionId, classId: data.classId || '' },
    });
  },
);

exports.notifyStudentOnSubmissionDecision = onDocumentUpdated(
  { document: 'lessonSubmissions/{submissionId}', region: 'europe-west1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === after.status) return;
    if (!after.studentId || !['approved', 'rejected'].includes(after.status)) return;
    await sendNotificationToUser(admin.firestore(), after.studentId, {
      title: after.status === 'approved' ? 'Compito approvato' : 'Compito da rivedere',
      body: after.status === 'approved'
        ? 'La tua consegna e stata approvata dal docente.'
        : `Il docente ha lasciato un feedback: ${after.teacherFeedback || 'nessun dettaglio'}`,
      data: { type: 'school_submission_reviewed', submissionId: event.params.submissionId, classId: after.classId || '' },
    });
  },
);


// ── Trigger: nuovo messaggio vocale in community ──────────────────────────────
exports.onCommunityMessageCreated = onDocumentCreated(
  { document: 'communities/{communityId}/chat/{messageId}', region: 'europe-west1' },
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;
    const { communityId } = event.params;
    const { senderId, senderName, audioDuration } = msg;

    const db = admin.firestore();
    // Prendi tutti i membri della community
    const membersSnap = await db.collection('communities').doc(communityId).collection('members').get();
    const communityDoc = await db.collection('communities').doc(communityId).get();
    const communityName = communityDoc.data()?.name || 'Community';

    // Notifica a tutti i membri tranne chi ha inviato
    await Promise.all(
      membersSnap.docs
        .filter((m) => m.id !== senderId)
        .map((m) =>
          sendNotificationToUser(db, m.id, {
            title: `🎤 ${communityName}`,
            body: `${senderName} ha inviato un vocale${audioDuration ? ` di ${Math.round(audioDuration)}s` : ''}`,
            data: { type: 'community_message', communityId },
          }).catch(() => {}),
        ),
    );
  },
);

// ── Trigger: richiesta di iscrizione community approvata ─────────────────────
exports.onCommunityJoinRequestCreated = onDocumentCreated(
  { document: 'communities/{communityId}/joinRequests/{userId}', region: 'europe-west1' },
  async (event) => {
    const req = event.data?.data();
    if (!req) return;
    const { communityId } = event.params;

    const db = admin.firestore();
    const communityDoc = await db.collection('communities').doc(communityId).get();
    const communityName = communityDoc.data()?.name || 'Community';
    const createdBy = communityDoc.data()?.createdBy;
    if (!createdBy) return;

    await sendNotificationToUser(db, createdBy, {
      title: `👤 Nuova richiesta — ${communityName}`,
      body: `${req.userName || 'Qualcuno'} vuole unirsi alla tua community`,
      data: { type: 'community_join_request', communityId },
    });
  },
);

// ── Trigger: richiesta di iscrizione approvata — notifica il richiedente ──────
exports.onCommunityMemberAdded = onDocumentCreated(
  { document: 'communities/{communityId}/members/{userId}', region: 'europe-west1' },
  async (event) => {
    const member = event.data?.data();
    if (!member || member.role === 'admin') return; // non notificare il creatore
    const { communityId, userId } = event.params;

    const db = admin.firestore();
    const communityDoc = await db.collection('communities').doc(communityId).get();
    const communityName = communityDoc.data()?.name || 'Community';

    await sendNotificationToUser(db, userId, {
      title: `✅ Sei stato approvato!`,
      body: `Sei ora membro di "${communityName}"`,
      data: { type: 'community_approved', communityId },
    });
  },
);

// ── Cloud Function: processCollab ─────────────────────────────────────────────
// Mixa le due tracce audio di una sessione collab e salva il risultato.
exports.processCollab = onCall(
  { timeoutSeconds: 180, memory: '1GiB', region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Non autenticato');

    const { sessionId } = request.data;
    if (!sessionId || typeof sessionId !== 'string') throw new HttpsError('invalid-argument', 'sessionId non valido');

    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    const sessionDoc = await db.collection('collabSessions').doc(sessionId).get();
    if (!sessionDoc.exists) throw new HttpsError('not-found', 'Sessione non trovata');
    const session = sessionDoc.data();

    if (session.hostId !== uid) throw new HttpsError('permission-denied', 'Solo l\'host può mixare');
    if (!session.hostTrackUrl || !session.guestTrackUrl) throw new HttpsError('failed-precondition', 'Tracce mancanti');

    const tmpDir = os.tmpdir();
    const hostPath = path.join(tmpDir, `collab_host_${sessionId}.m4a`);
    const guestPath = path.join(tmpDir, `collab_guest_${sessionId}.m4a`);
    const outPath = path.join(tmpDir, `collab_result_${sessionId}.m4a`);

    // Scarica le due tracce (SSRF-safe: usa solo host Firebase Storage)
    const downloadCollabFile = async (url, dest) => {
      let parsedUrl;
      try { parsedUrl = new URL(url); } catch { throw new Error('URL non valido'); }
      if (!ALLOWED_STORAGE_HOSTS.includes(parsedUrl.hostname)) throw new Error(`Host non consentito: ${parsedUrl.hostname}`);
      if (parsedUrl.protocol !== 'https:') throw new Error('Solo HTTPS consentito');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download fallito (${res.status}): ${url}`);
      const buffer = await res.buffer();
      if (buffer.length > MAX_TRACK_SIZE_BYTES) throw new Error('File troppo grande (max 50 MB)');
      fs.writeFileSync(dest, buffer);
    };

    try {
      await Promise.all([
        downloadCollabFile(session.hostTrackUrl, hostPath),
        downloadCollabFile(session.guestTrackUrl, guestPath),
      ]);

      // Mix con FFmpeg: amix a volume uguale
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(hostPath)
          .input(guestPath)
          .complexFilter('[0:a]volume=1.0[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=longest[out]')
          .outputOptions(['-map', '[out]', '-c:a', 'aac', '-b:a', '128k'])
          .output(outPath)
          .on('end', resolve)
          .on('error', (err) => reject(new Error(`FFmpeg: ${err.message}`)))
          .run();
      });

      // Durata del mix (prima di upload, outPath esiste ancora)
      const resultDuration = await new Promise((resolve) => {
        ffmpeg.ffprobe(outPath, (err, meta) => {
          resolve(err ? 0 : Math.round(meta.format.duration || 0));
        });
      });

      // Upload risultato con download token (non richiede IAM signing)
      const destPath = `collabs/${sessionId}/result.m4a`;
      const downloadToken = uuidv4();
      await bucket.upload(outPath, {
        destination: destPath,
        metadata: { contentType: 'audio/mp4', metadata: { firebaseStorageDownloadTokens: downloadToken } },
      });
      const encodedPath = encodeURIComponent(destPath);
      const resultUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

      await db.collection('collabSessions').doc(sessionId).update({
        status: 'done',
        resultUrl,
        resultDuration,
      });

      return { resultUrl, resultDuration };
    } catch (error) {
      // Ripristina status a 'uploading' così il client non rimane bloccato sullo spinner
      await db.collection('collabSessions').doc(sessionId).update({ status: 'uploading' }).catch(() => {});
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Errore mixing: ${error.message}`);
    } finally {
      [hostPath, guestPath, outPath].forEach((f) => { try { fs.unlinkSync(f); } catch {} });
    }
  },
);

// ── Notifica: sfida battle ricevuta ───────────────────────────────────────────
exports.onBattleCreated = onDocumentCreated(
  { document: 'battles/{battleId}', region: 'europe-west1' },
  async (event) => {
    const battle = event.data?.data();
    if (!battle || battle.status !== 'pending') return;
    const db = admin.firestore();
    await sendNotificationToUser(db, battle.opponentId, {
      title: `⚔️ ${battle.challengerName} ti sfida!`,
      body: `Sound Battle — tema: ${battle.theme}. Hai 30 secondi per rispondere!`,
      data: { type: 'battle_invite', battleId: event.params.battleId },
    });
  },
);

// ── Notifica: invito collab ricevuto ──────────────────────────────────────────
exports.onCollabInvite = onDocumentCreated(
  { document: 'collabSessions/{sessionId}', region: 'europe-west1' },
  async (event) => {
    const session = event.data?.data();
    if (!session || session.status !== 'pending') return;
    const db = admin.firestore();
    const modeTxt = session.mode === 'sync' ? 'sessione sync' : 'sessione a turni';
    await sendNotificationToUser(db, session.guestId, {
      title: `🎙 Invito Collab da ${session.hostName}!`,
      body: `${session.hostName} ti invita a una ${modeTxt}`,
      data: { type: 'collab_invite', sessionId: event.params.sessionId },
    });
  },
);

// ── Chiamata in arrivo — notifica push al callee (o a tutti gli invitees per group call) ───
exports.onCallCreated = onDocumentCreated(
  { document: 'calls/{callId}', region: 'europe-west1' },
  async (event) => {
    const call = event.data?.data();
    if (!call || call.status !== 'ringing') return;

    const db = admin.firestore();
    const { calleeId, callerName, callerAvatar, invitees, type } = call;
    const callId = event.params.callId;

    const isGroup = type === 'group';
    const targets = isGroup && Array.isArray(invitees) && invitees.length > 0
      ? invitees
      : [calleeId];

    const participantProfiles = call.participantProfiles || {};

    function buildGroupBody(recipientUid) {
      const names = Object.entries(participantProfiles)
        .filter(([id]) => id !== recipientUid)
        .map(([, p]) => p.name)
        .filter(Boolean);
      if (names.length === 0) return `${callerName ?? 'Utente'} ti sta chiamando`;
      if (names.length <= 3) return `${names.join(', ')} ti stanno aspettando`;
      return `${names.slice(0, 2).join(', ')} e altri ${names.length - 2} ti stanno aspettando`;
    }

    await Promise.all(targets.map((uid) => {
      const notifBody = isGroup ? buildGroupBody(uid) : 'Chiamata vocale in arrivo';
      return sendNotificationToUser(db, uid, {
        title: isGroup ? '📞 Chiamata di gruppo in arrivo' : `📞 ${callerName ?? 'Utente'} ti sta chiamando`,
        body: notifBody,
        data: {
          type: 'incoming_call',
          callId,
          callerName: callerName ?? 'Utente',
          callerAvatar: callerAvatar ?? '',
          channelId: 'calls',
          callType: isGroup ? 'group' : 'audio',
          notifBody,
        },
      });
    }));

    // Schedula cleanup automatico dopo 30s — copre il caso in cui Android
    // rifiuta dal lockscreen ma il write Firestore non parte (JS bridge dormiente)
    try {
      const { getFunctions } = require('firebase-admin/functions');
      await getFunctions().taskQueue('cleanupRingingCall').enqueue(
        { callId },
        { scheduleDelaySeconds: 15 },
      );
    } catch (e) {
      console.warn('[onCallCreated] enqueue timeout task failed:', e.message);
    }
  },
);

// ── Chiamata cancellata/terminata — ferma lo squillo sul device del callee ────────────────
exports.onCallUpdated = onDocumentUpdated(
  { document: 'calls/{callId}', region: 'europe-west1' },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Scatta solo quando la chiamata passa da ringing a uno stato terminale
    const TERMINAL = ['ended', 'cancelled', 'missed', 'declined'];
    if (before.status !== 'ringing' || !TERMINAL.includes(after.status)) return;

    const db = admin.firestore();
    const callId = event.params.callId;
    const isGroup = before.type === 'group';
    const targets = isGroup && Array.isArray(before.invitees) && before.invitees.length > 0
      ? before.invitees
      : (before.calleeId ? [before.calleeId] : []);

    if (targets.length === 0) return;

    await Promise.all(targets.map(async (uid) => {
      try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) return;
        const userData = userDoc.data();

        // 1. FCM native tokens (Android) — dati flat, SoundscapeFirebaseMessagingService li riconosce
        const fcmTokens = [...new Set(
          Array.isArray(userData.fcmPushTokens) ? userData.fcmPushTokens : []
        )].filter(Boolean);
        if (fcmTokens.length > 0) {
          await admin.messaging().sendEachForMulticast({
            tokens: fcmTokens,
            data: { type: 'call_dismissed', callId },
            android: { priority: 'high', ttl: 30 * 1000 },
          }).catch((e) => console.error(`[onCallUpdated] FCM error per ${uid}:`, e.message));
          console.log(`[onCallUpdated] call_dismissed FCM → ${uid} (${fcmTokens.length} token)`);
        }

        // Expo push NON viene usato per call_dismissed: Expo wrappa i dati in body/title
        // e SoundscapeFirebaseMessagingService non riconosce il tipo → notifica di debug visibile.
        // Android usa FCM native (sopra); iOS gestisce il dismiss via listener Firestore in JS.
      } catch (e) {
        console.error(`[onCallUpdated] errore per ${uid}:`, e.message);
      }
    }));
  },
);

exports.cleanupRingingCall = onTaskDispatched(
  { retryConfig: { maxAttempts: 1 }, rateLimits: { maxConcurrentDispatches: 20 }, region: 'europe-west1' },
  async (req) => {
    const { callId } = req.data;
    if (!callId) return;
    const db = admin.firestore();
    const ref = db.collection('calls').doc(callId);
    const snap = await ref.get();
    if (!snap.exists) return;
    if (snap.data().status === 'ringing') {
      await ref.update({ status: 'missed' });
      console.log(`[cleanupRingingCall] call ${callId} marcata missed`);
    }
  },
);

exports.cleanupStaleRingingCalls = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west1' },
  async () => {
    const db = admin.firestore();
    const threshold = new Date(Date.now() - 55 * 1000);
    const snap = await db.collection('calls')
      .where('status', '==', 'ringing')
      .where('createdAt', '<=', threshold)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.update(doc.ref, { status: 'missed' }));
    await batch.commit();
    console.log(`[cleanupStaleRingingCalls] chiuse ${snap.size} chiamate bloccate`);
  },
);

exports.onGroupCallInviteUpdated = onDocumentUpdated(
  { document: 'calls/{callId}', region: 'europe-west1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || after.type !== 'group') return;

    const beforeStatuses = before.participantStatuses || {};
    const afterStatuses = after.participantStatuses || {};
    const beforeProfiles = before.participantProfiles || {};
    const afterProfiles = after.participantProfiles || {};
    const callId = event.params.callId;
    const db = admin.firestore();

    const newlyRingingInvitees = Object.keys(afterStatuses).filter((uid) => {
      const nextStatus = afterStatuses[uid];
      const prevStatus = beforeStatuses[uid];
      return nextStatus === 'ringing' && prevStatus !== 'ringing' && uid !== after.callerId;
    });

    if (!newlyRingingInvitees.length) return;

    const hostName = after.callerName ?? 'Utente';
    await Promise.all(newlyRingingInvitees.map((uid) => {
      const otherNames = Object.entries(afterProfiles)
        .filter(([id]) => id !== uid)
        .map(([, p]) => p.name)
        .filter(Boolean);
      let body;
      if (otherNames.length === 0) body = `${hostName} ti sta aspettando`;
      else if (otherNames.length <= 3) body = `${otherNames.join(', ')} ti stanno aspettando`;
      else body = `${otherNames.slice(0, 2).join(', ')} e altri ${otherNames.length - 2} ti stanno aspettando`;
      return sendNotificationToUser(db, uid, {
        title: '📞 Chiamata di gruppo in arrivo',
        body,
        data: {
          type: 'incoming_call',
          callId,
          callerName: hostName,
          callerAvatar: after.callerAvatar ?? '',
          channelId: 'calls',
          participantCount: String(Object.keys(afterProfiles).length),
          callType: 'group',
          notifBody: body,
        },
      });
    }));
  },
);

// ── Finalizza battles scadute ─────────────────────────────────────────────────
// Ogni 10 minuti controlla le battles in stato 'voting' con votingEndsAt nel passato
// e dichiara il vincitore. Risolve il problema per cui finalizeBattle veniva chiamata
// solo lato client (solo se qualcuno aveva la schermata aperta).
exports.finalizeStaleBattles = onSchedule(
  { schedule: 'every 10 minutes', region: 'europe-west1' },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collection('battles')
      .where('status', '==', 'voting')
      .where('votingEndsAt', '<=', now)
      .get();
    if (snap.empty) return;
    await Promise.all(snap.docs.map(async (battleDoc) => {
      const d = battleDoc.data();
      if (d.winnerId !== undefined) return;
      const winnerId = (d.challengerVotes >= d.opponentVotes)
        ? d.challengerId
        : d.opponentId;
      const loserId = winnerId === d.challengerId ? d.opponentId : d.challengerId;
      const winnerName = winnerId === d.challengerId ? d.challengerName : d.opponentName;
      const loserName = loserId === d.challengerId ? d.challengerName : d.opponentName;
      await battleDoc.ref.update({ status: 'done', winnerId });
      await Promise.all([
        db.collection('users').doc(winnerId).update({
          battleWins: admin.firestore.FieldValue.increment(1),
        }).catch(() => {}),
        sendNotificationToUser(db, winnerId, {
          title: '🏆 Hai vinto la battle!',
          body: `Hai battuto ${loserName} — tema: ${d.theme}`,
          data: { type: 'battle_result', battleId: battleDoc.id, result: 'won' },
        }),
        sendNotificationToUser(db, loserId, {
          title: '😔 Battle conclusa',
          body: `${winnerName} ha vinto — tema: ${d.theme}. Riprova!`,
          data: { type: 'battle_result', battleId: battleDoc.id, result: 'lost' },
        }),
      ]);
    }));
  },
);

// ── Notifica: qualcuno ha partecipato alla tua challenge ──────────────────────
exports.onSoundJoinedChallenge = onDocumentUpdated(
  { document: 'sounds/{soundId}', region: 'europe-west1' },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    // Scatta solo quando challengeId viene impostato per la prima volta
    if (!after.challengeId || before.challengeId) return;
    const db = admin.firestore();
    const challengeSnap = await db.collection('challenges').doc(after.challengeId).get();
    if (!challengeSnap.exists) return;
    const challenge = challengeSnap.data();
    // Non notificare se è il creatore stesso che partecipa
    if (after.userId === challenge.createdBy) return;
    await sendNotificationToUser(db, challenge.createdBy, {
      title: '🎵 Nuovo partecipante alla tua sfida!',
      body: `${after.username || 'Un utente'} ha inviato un sound per "${challenge.title}"`,
      data: { type: 'challenge_participation', challengeId: after.challengeId },
    });
  },
);
