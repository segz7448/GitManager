// Must be imported before nacl.setPRNG below - provides
// global.crypto.getRandomValues, which Hermes doesn't have natively.
import 'react-native-get-random-values';

import nacl from 'tweetnacl';
import sealedbox from 'tweetnacl-sealedbox-js';
import { encode as btoa, decode as atob } from 'base-64';

// tweetnacl's own auto-detection checks `self.crypto`, but Hermes doesn't
// reliably define a global `self` the way browsers/web workers do - so
// rather than gamble on that working, wire the PRNG explicitly using the
// polyfill's actual target (`global.crypto.getRandomValues`).
nacl.setPRNG((x, n) => {
  const bytes = global.crypto.getRandomValues(new Uint8Array(n));
  for (let i = 0; i < n; i++) x[i] = bytes[i];
});

/**
 * Encrypts a secret value for GitHub Actions using the repo's public key,
 * exactly as GitHub's docs specify (libsodium sealed box / X25519 +
 * XSalsa20-Poly1305). publicKeyBase64 comes from GitHub's
 * /actions/secrets/public-key endpoint.
 *
 * Returns a base64 string ready to send as `encrypted_value`.
 */
export function encryptSecretValue(plainTextValue, publicKeyBase64) {
  const publicKeyBinary = base64ToUint8Array(publicKeyBase64);
  const messageBytes = utf8ToUint8Array(plainTextValue);
  const sealed = sealedbox.seal(messageBytes, publicKeyBinary);
  return uint8ArrayToBase64(sealed);
}

function utf8ToUint8Array(str) {
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    bytes[i] = utf8.charCodeAt(i);
  }
  return bytes;
}

function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
