const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const MAGIC_HEADER = Buffer.from('SPV2'); // SocialPulse Vault v2 Header
const PBKDF2_ROUNDS = 310000; // OWASP recommended minimum for PBKDF2-HMAC-SHA256

// Legacy salt retained strictly for transparent migration of existing v1 data
const LEGACY_SALT = 'socialpulse-vault-salt-2026';

function getMasterSecret() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new Error('[Security Exception] ENCRYPTION_SECRET environment variable is missing or shorter than 16 chars. Halting to protect data.');
  }
  return secret;
}

/**
 * Derives a key using PBKDF2 with a distinct salt and high iteration count
 */
function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, PBKDF2_ROUNDS, 32, 'sha256');
}

/**
 * Encrypts data using AES-256-GCM Envelope Encryption with a cryptographically
 * random per-record salt, random IV, and authentication tag.
 * Format: [MAGIC_HEADER (4B)][SALT (16B)][IV (12B)][AUTHTAG (16B)][CIPHERTEXT]
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return '';
  const secret = getMasterSecret();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([MAGIC_HEADER, salt, iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts AES-256-GCM ciphertext. Supports modern SPV2 payloads with dynamic salt
 * and automatically falls back to legacy v1 format for transparent data migration.
 */
function decrypt(ciphertextBase64) {
  if (!ciphertextBase64) return '';
  try {
    const secret = getMasterSecret();
    const data = Buffer.from(ciphertextBase64, 'base64');

    // Check for SPV2 Envelope
    if (data.length >= MAGIC_HEADER.length + SALT_LENGTH + IV_LENGTH + TAG_LENGTH &&
        data.subarray(0, 4).equals(MAGIC_HEADER)) {
      let offset = 4;
      const salt = data.subarray(offset, offset + SALT_LENGTH);
      offset += SALT_LENGTH;
      const iv = data.subarray(offset, offset + IV_LENGTH);
      offset += IV_LENGTH;
      const authTag = data.subarray(offset, offset + TAG_LENGTH);
      offset += TAG_LENGTH;
      const encrypted = data.subarray(offset);

      const key = deriveKey(secret, salt);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
      decipher.setAuthTag(authTag);

      return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
    }

    // Fallback: Legacy v1 payload handling [IV (12B)][TAG (16B)][CIPHERTEXT]
    if (data.length >= IV_LENGTH + TAG_LENGTH) {
      const legacyKey = crypto.pbkdf2Sync(secret, LEGACY_SALT, 100000, 32, 'sha256');
      const iv = data.subarray(0, IV_LENGTH);
      const authTag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

      const decipher = crypto.createDecipheriv(ALGORITHM, legacyKey, iv, { authTagLength: TAG_LENGTH });
      decipher.setAuthTag(authTag);

      return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
    }

    throw new Error('Invalid ciphertext payload length');
  } catch (err) {
    console.error('[Crypto Vault] Decryption failed or payload tampered:', err.message);
    return null;
  }
}

/**
 * Generates single-use approval token. Requires ENCRYPTION_SECRET.
 */
function generateApprovalToken() {
  const secret = getMasterSecret();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
  const expiresAt = Date.now() + 72 * 60 * 60 * 1000; // 72 hours
  return { rawToken, tokenHash, expiresAt };
}

/**
 * Validates approval token using timingSafeEqual
 */
function validateApprovalToken(rawToken, storedHash, expiresAt) {
  if (!rawToken || !storedHash) return false;
  if (expiresAt && Date.now() > expiresAt) return false;
  try {
    const secret = getMasterSecret();
    const computedHash = crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
    const computedBuf = Buffer.from(computedHash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (computedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  } catch {
    return false;
  }
}

/**
 * Enterprise Password Hashing using scrypt + 16-byte random salt
 */
function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Invalid password provided for hashing');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verifies a password against an scrypt hash with timing attack protection
 */
function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = parts[1];
    const key = Buffer.from(parts[2], 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    if (key.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(key, derivedKey);
  } catch {
    return false;
  }
}

module.exports = {
  encrypt,
  decrypt,
  generateApprovalToken,
  validateApprovalToken,
  hashPassword,
  verifyPassword
};
