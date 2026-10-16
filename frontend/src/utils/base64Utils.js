/**
 * Converts a base64 string to a Uint8Array.
 * Optimized for local memory handling.
 */
export function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts a Uint8Array or ArrayBuffer to a base64 string.
 * Uses 32KB chunks to prevent V8 heap string allocation overflows and call stack limits.
 */
export function uint8ArrayToBase64(bytes) {
  const CHUNK_SIZE = 32768;
  const len = bytes.length;
  let binary = '';
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
