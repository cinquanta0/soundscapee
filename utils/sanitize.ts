/**
 * Rimuove tag HTML e caratteri di controllo da una stringa.
 * React Native renderizza testo come testo puro, ma i dati in Firestore
 * potrebbero essere usati in contesti HTML (email, admin panel, ecc.).
 */
export function sanitize(str: string): string {
  if (typeof str !== 'string') return '';

  // Rimuovi tag HTML (angle brackets e contenuto)
  let clean = str.replace(/<[^>]*>/g, '');

  // Rimuovi caratteri di controllo (eccetto tab \t e newline \n \r)
  clean = clean.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  return clean;
}

/**
 * Sanitizza e tronca a maxLen caratteri.
 */
export function sanitizeField(str: string, maxLen: number): string {
  return sanitize(str).slice(0, maxLen);
}
