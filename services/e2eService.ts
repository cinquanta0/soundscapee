import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import * as SecureStore from 'expo-secure-store';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

// Re-export per convenienza
export { encodeBase64, decodeBase64 };

const SK_KEY = 'e2e_sk_v1';

/**
 * Genera o recupera il keypair E2E dell'utente.
 * Chiave privata: SecureStore (criptato dal SO).
 * Chiave pubblica: Firestore users/{uid}.publicKey
 */
export async function initE2EKeys(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  let sk: Uint8Array;
  const stored = await SecureStore.getItemAsync(SK_KEY);
  if (stored) {
    sk = decodeBase64(stored);
  } else {
    const kp = nacl.box.keyPair();
    await SecureStore.setItemAsync(SK_KEY, encodeBase64(kp.secretKey));
    sk = kp.secretKey;
  }

  const kp = nacl.box.keyPair.fromSecretKey(sk);
  const myPkB64 = encodeBase64(kp.publicKey);

  const snap = await getDoc(doc(db, 'users', user.uid));
  if (snap.data()?.publicKey !== myPkB64) {
    await updateDoc(doc(db, 'users', user.uid), { publicKey: myPkB64 });
  }
}

export async function getMySecretKey(): Promise<Uint8Array | null> {
  const stored = await SecureStore.getItemAsync(SK_KEY);
  if (!stored) return null;
  return decodeBase64(stored);
}

export async function getRecipientPublicKey(userId: string): Promise<Uint8Array | null> {
  const snap = await getDoc(doc(db, 'users', userId));
  const pk = snap.data()?.publicKey;
  if (!pk) return null;
  return decodeBase64(pk);
}

/**
 * Cifra un testo con NaCl box (X25519 + XSalsa20-Poly1305).
 * Salva anche spk (sender public key) e rpk (recipient public key)
 * così entrambi possono decriptare usando solo la propria chiave privata + DH.
 */
export function encryptForConversation(
  text: string,
  mySecretKey: Uint8Array,
  theirPublicKey: Uint8Array,
  myPublicKey: Uint8Array,
): { enc: string; n: string; spk: string; rpk: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const sharedKey = nacl.box.before(theirPublicKey, mySecretKey);
  const ciphertext = nacl.box.after(encodeUTF8(text), nonce, sharedKey);
  return {
    enc: encodeBase64(ciphertext),
    n: encodeBase64(nonce),
    spk: encodeBase64(myPublicKey),
    rpk: encodeBase64(theirPublicKey),
  };
}

/**
 * Decifra un messaggio.
 * Se sono il mittente uso rpk per derivare la shared key.
 * Se sono il destinatario uso spk.
 * Le due derivano la stessa chiave per il teorema DH.
 */
/** Deriva la shared key DH tra due partecipanti. */
export function computeSharedKey(theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array {
  return nacl.box.before(theirPublicKey, mySecretKey);
}

/** Restituisce la chiave pubblica dell'utente corrente in base64 (utile per rilevare rotazione). */
export async function getMyPublicKeyB64(): Promise<string | null> {
  const sk = await getMySecretKey();
  if (!sk) return null;
  return encodeBase64(nacl.box.keyPair.fromSecretKey(sk).publicKey);
}

// ─── Audio E2E ────────────────────────────────────────────────────────────────

/**
 * Cifra i byte di un file audio con una chiave simmetrica fresca (XSalsa20-Poly1305).
 * Restituisce i byte cifrati + la chiave + il nonce (da sigillare poi con sealAudioKey).
 */
export function encryptAudioBytes(
  audioBytes: Uint8Array,
): { encrypted: Uint8Array; audioKey: Uint8Array; audioNonce: Uint8Array } {
  const audioKey = nacl.randomBytes(nacl.secretbox.keyLength);
  const audioNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(audioBytes, audioNonce, audioKey);
  return { encrypted, audioKey, audioNonce };
}

/** Decifra i byte di un file audio. Restituisce null se corrotto o chiave sbagliata. */
export function decryptAudioBytes(
  encrypted: Uint8Array,
  audioKey: Uint8Array,
  audioNonce: Uint8Array,
): Uint8Array | null {
  return nacl.secretbox.open(encrypted, audioNonce, audioKey);
}

/**
 * Sigilla (audioKey + audioNonce) con la shared key DH — solo i partecipanti possono aprirla.
 * Impacchetta audioKey + audioNonce in un unico payload cifrato.
 */
export function sealAudioKey(
  audioKey: Uint8Array,
  audioNonce: Uint8Array,
  sharedKey: Uint8Array,
): { encAudioKey: string; encAudioKeyNonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const payload = new Uint8Array(audioKey.length + audioNonce.length);
  payload.set(audioKey);
  payload.set(audioNonce, audioKey.length);
  const encrypted = nacl.box.after(payload, nonce, sharedKey);
  return { encAudioKey: encodeBase64(encrypted), encAudioKeyNonce: encodeBase64(nonce) };
}

/** Apre la chiave audio sigillata. Restituisce null se fallisce. */
export function openAudioKey(
  encAudioKey: string,
  encAudioKeyNonce: string,
  sharedKey: Uint8Array,
): { audioKey: Uint8Array; audioNonce: Uint8Array } | null {
  try {
    const payload = nacl.box.open.after(
      decodeBase64(encAudioKey),
      decodeBase64(encAudioKeyNonce),
      sharedKey,
    );
    if (!payload) return null;
    return {
      audioKey: payload.slice(0, nacl.secretbox.keyLength),
      audioNonce: payload.slice(nacl.secretbox.keyLength),
    };
  } catch {
    return null;
  }
}

export function decryptForConversation(
  enc: string,
  n: string,
  spk: string,
  rpk: string,
  myUid: string,
  senderId: string,
  mySecretKey: Uint8Array,
): string | null {
  try {
    const theirPK = myUid === senderId
      ? decodeBase64(rpk)
      : decodeBase64(spk);
    const sharedKey = nacl.box.before(theirPK, mySecretKey);
    const plain = nacl.box.open.after(decodeBase64(enc), decodeBase64(n), sharedKey);
    if (!plain) return null;
    return decodeUTF8(plain);
  } catch {
    return null;
  }
}
