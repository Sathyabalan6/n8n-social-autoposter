const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const DEFAULT_SALT = 'socialpulse-vault-salt-2026';
const SALT = process.env.ENCRYPTION_SALT || DEFAULT_SALT;

function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256');
}

function getMasterKey() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('[Security Exception] ENCRYPTION_SECRET environment variable is missing. Halting to prevent unencrypted operations.');
  }
  return deriveKey(secret, SALT);
}

function getLegacyKey() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || SALT === DEFAULT_SALT) return null;
  return deriveKey(secret, DEFAULT_SALT);
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
    // Attempt fallback with legacy default salt if custom salt is configured
    const legacyKey = getLegacyKey();
    if (legacyKey) {
      try {
        const data = Buffer.from(ciphertextBase64, 'base64');
        const iv = data.subarray(0, IV_LENGTH);
        const authTag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
        const decipher = crypto.createDecipheriv(ALGORITHM, legacyKey, iv);
        decipher.setAuthTag(authTag);
        return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
      } catch {
        // Fall through
      }
    }
    console.error('[Crypto Vault] Decryption failed or payload tampered:', err.message);
    return null;
  }
}

function getApprovalSecret() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('[Security Exception] ENCRYPTION_SECRET environment variable is missing.');
  }
  return secret;
}

function generateApprovalToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const secret = getApprovalSecret();
  const tokenHash = crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
  const expiresAt = Date.now() + 72 * 60 * 60 * 1000; // 72 hours
  return { rawToken, tokenHash, expiresAt };
}

function validateApprovalToken(rawToken, storedHash, expiresAt) {
  if (!rawToken || !storedHash) return false;
  if (expiresAt && Date.now() > expiresAt) return false;
  const secret = getApprovalSecret();
  const computedHash = crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
}

module.exports = {
  encrypt,
  decrypt,
  generateApprovalToken,
  validateApprovalToken
};
