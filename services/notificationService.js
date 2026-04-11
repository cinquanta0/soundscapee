// services/notificationService.js
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// In Expo Go (SDK 53+) le push notification remote non sono supportate
const IS_EXPO_GO = Constants.appOwnership === 'expo';
import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';

// Configura come vengono gestite le notifiche in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Registra il dispositivo per ricevere notifiche push
 * @param {string} userId - ID dell'utente
 * @returns {Promise<string|null>} Token FCM o null
 */
export async function registerForPushNotifications(userId) {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#06b6d4',
    });
  }

  if (IS_EXPO_GO) {
    console.log('⚠️ Push notifications non disponibili in Expo Go (SDK 53+). Usa un development build.');
    return null;
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('❌ Permesso notifiche negato');
      return null;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
      console.log('⚠️ Impossibile ottenere push token:', e.message);
      return null;
    }

    // Salva il token nel profilo utente
    if (userId && token) {
      await setDoc(
        doc(db, 'users', userId),
        { pushToken: token, updatedAt: new Date() },
        { merge: true }
      );
    }
  } else {
    console.log('⚠️ Devi usare un dispositivo fisico per le notifiche push');
  }

  return token;
}

/**
 * Invia una notifica push a un utente specifico
 * @param {string} userId - ID destinatario
 * @param {string} title - Titolo notifica
 * @param {string} body - Corpo notifica
 * @param {object} data - Dati extra
 */
export async function sendPushNotification(userId, title, body, data = {}) {
  try {
    // Ottieni il token push dell'utente
    const userDoc = await getDoc(doc(db, 'users', userId));
    const pushToken = userDoc.data()?.pushToken;

    if (!pushToken) {
      console.log('⚠️ Utente non ha token push');
      return;
    }

    // Salva la notifica nel database
    await addDoc(collection(db, 'notifications'), {
      userId,
      title,
      body,
      data,
      read: false,
      createdAt: new Date(),
    });

    // Invia tramite Expo Push API
    const message = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
      channelId: 'default',
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('📤 Notifica inviata:', result);
    return result;
  } catch (error) {
    console.error('❌ Errore invio notifica:', error);
    throw error;
  }
}

/**
 * Invia notifica quando qualcuno mette like
 */
export async function notifyLike(soundId, likerUserId, soundOwnerId) {
  if (likerUserId === soundOwnerId) return; // Non notificare se sei tu stesso

  try {
    // Ottieni info del liker
    const likerDoc = await getDoc(doc(db, 'users', likerUserId));
    const likerName = likerDoc.data()?.username || 'Qualcuno';

    // Ottieni titolo del suono
    const soundDoc = await getDoc(doc(db, 'sounds', soundId));
    const soundTitle = soundDoc.data()?.title || 'il tuo suono';

    await sendPushNotification(
      soundOwnerId,
      '❤️ Nuovo like!',
      `${likerName} ha messo like a "${soundTitle}"`,
      { type: 'like', soundId, userId: likerUserId }
    );
  } catch (error) {
    console.error('Errore notifica like:', error);
  }
}

/**
 * Invia notifica quando qualcuno commenta
 */
export async function notifyComment(soundId, commenterUserId, soundOwnerId, commentText) {
  if (commenterUserId === soundOwnerId) return;

  try {
    const commenterDoc = await getDoc(doc(db, 'users', commenterUserId));
    const commenterName = commenterDoc.data()?.username || 'Qualcuno';

    const soundDoc = await getDoc(doc(db, 'sounds', soundId));
    const soundTitle = soundDoc.data()?.title || 'il tuo suono';

    await sendPushNotification(
      soundOwnerId,
      '💬 Nuovo commento!',
      `${commenterName}: "${commentText.substring(0, 50)}${commentText.length > 50 ? '...' : ''}"`,
      { type: 'comment', soundId, userId: commenterUserId }
    );
  } catch (error) {
    console.error('Errore notifica commento:', error);
  }
}

/**
 * Invia notifica quando qualcuno ti segue
 */
export async function notifyFollow(followerId, followedUserId) {
  if (followerId === followedUserId) return;

  try {
    const followerDoc = await getDoc(doc(db, 'users', followerId));
    const followerName = followerDoc.data()?.username || 'Qualcuno';

    await sendPushNotification(
      followedUserId,
      '👥 Nuovo follower!',
      `${followerName} ha iniziato a seguirti`,
      { type: 'follow', userId: followerId }
    );
  } catch (error) {
    console.error('Errore notifica follow:', error);
  }
}

/**
 * Ottieni tutte le notifiche di un utente
 */
export async function getUserNotifications(userId) {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('Errore caricamento notifiche:', error);
    return [];
  }
}

/**
 * Segna una notifica come letta
 */
export async function markNotificationAsRead(notificationId) {
  try {
    await setDoc(
      doc(db, 'notifications', notificationId),
      { read: true },
      { merge: true }
    );
  } catch (error) {
    console.error('Errore aggiornamento notifica:', error);
  }
}