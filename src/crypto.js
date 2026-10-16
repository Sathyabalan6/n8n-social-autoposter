const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT = 'socialpulse-vault-salt-2026';

function getMasterKey() {
  const secret = process.env.ENCRYPTION_SECRET || 'socialpulse-default-vault-key-32b!';
  return crypto.pbkdf2Sync(secret, SALT, 100000, 32, 'sha256');
}

/**
 * Encrypts data using AES-256-GCM Authenticated Envelope Encryption
 */
function encrypt(plaintext) {
  if (!plaintext) return '';
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts AES-256-GCM ciphertext and validates authentication tag
 */
function decrypt(ciphertextBase64) {
  if (!ciphertextBase64) return '';
  try {
    const key = getMasterKey();
    const data = Buffer.from(ciphertextBase64, 'base64');

    if (data.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('Invalid ciphertext payload length');
    }

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  } catch (err) {
    console.error('[Crypto Vault] Decryption failed or payload tampered:', err.message);
    return null;
  }
}

module.exports = {
  encrypt,
  decrypt
};
