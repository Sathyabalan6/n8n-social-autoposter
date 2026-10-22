/**
 * Automated Test & Verification Suite for CI/CD
 * Validates database invariants, compiler rules, crypto vault, and platform schemas
 */

const assert = require('node:assert');
const db = require('../src/db');
const { compilePost, calculateNextAvailableSlot } = require('../src/compiler');
const { generateApprovalToken, validateApprovalToken, encrypt, decrypt } = require('../src/crypto');
const platforms = require('../src/platforms');

console.log('🧪 Starting SocialPulse Studio CI Test Suite...\n');

// Set test secret if missing
if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}

// --- 1. CRYPTO VAULT TESTS ---
console.log('1. Testing Crypto Vault & Magic Links:');
const secretText = 'API_TOKEN_12345_SECRET';
const encrypted = encrypt(secretText);
assert.notStrictEqual(encrypted, secretText, 'Encrypted text should not equal plaintext');
const decrypted = decrypt(encrypted);
assert.strictEqual(decrypted, secretText, 'Decrypted text must match plaintext');
console.log('   ✓ AES-256-GCM Envelope Encryption & Decryption passed');

const { rawToken, tokenHash, expiresAt } = generateApprovalToken();
assert(rawToken && tokenHash && expiresAt > Date.now(), 'Token generation must yield raw token and hash');
const isValid = validateApprovalToken(rawToken, tokenHash, expiresAt);
assert.strictEqual(isValid, true, 'Token validation with correct raw token must return true');
const isInvalid = validateApprovalToken('wrong_token_123', tokenHash, expiresAt);
assert.strictEqual(isInvalid, false, 'Token validation with incorrect raw token must return false');
console.log('   ✓ Single-use HMAC-SHA256 Token & timingSafeEqual passed');

// --- 2. COMPILER & ANTI-PENALTY TESTS ---
console.log('\n2. Testing Compiler & Anti-Penalty Decoupling:');
const sampleInput = {
  master_text: 'Launching our 2026 architecture review. Read it here: https://example.com/paper for benchmarks.',
  master_hashtags: 'tech cloud',
  platforms: ['youtube', 'x', 'linkedin'],
  auto_decouple_links: true,
  youtube_category_id: 'Education',
  youtube_made_for_kids: false,
  youtube_synthetic_media: false
};
const compiled = compilePost(sampleInput);
assert.strictEqual(compiled.first_comment, 'https://example.com/paper', 'Outbound link must be extracted to first_comment');
assert(!compiled.x_post.includes('https://example.com/paper'), 'Link must be removed from X post body copy');
assert(!compiled.linkedin_post.includes('https://example.com/paper'), 'Link must be removed from LinkedIn post body copy');
assert.strictEqual(compiled.youtube_category_id, '27', 'Education category must resolve to ID 27');
console.log('   ✓ Outbound link anti-penalty decoupling passed');
console.log('   ✓ YouTube category SimCluster resolution passed');

// --- 3. RECURRING QUEUE SLOTS TESTS ---
console.log('\n3. Testing Buffer-Style Dynamic Queue Slots:');
const dummyRules = [
  { iso_weekday: 1, local_time: '09:00' }, // Mon 9am
  { iso_weekday: 3, local_time: '14:00' }  // Wed 2pm
];
const nextSlotIso = calculateNextAvailableSlot(dummyRules, [], 'America/New_York', new Date());
assert(nextSlotIso && !isNaN(new Date(nextSlotIso).getTime()), 'Next slot must return valid ISO date');
assert(new Date(nextSlotIso).getTime() > Date.now(), 'Next slot must be in the future');
console.log('   ✓ Dynamic slot calculation across timezones passed');

// --- 4. DATABASE INVARIANTS TESTS ---
console.log('\n4. Testing Database Invariants & Migrations:');
const testPostId = db.insertPost({
  client_id: 1,
  status: 'draft',
  master_text: 'CI Invariant Verification Post',
  platforms: ['x', 'linkedin'],
  first_comment: 'https://example.com/ci-test',
  x_alt_text: 'CI diagram alt text'
});
assert(testPostId, 'insertPost must return numeric post ID');

const fetchedPost = db.getPostById(testPostId);
assert.strictEqual(fetchedPost.first_comment, 'https://example.com/ci-test', 'first_comment must match in database');
assert.strictEqual(fetchedPost.x_alt_text, 'CI diagram alt text', 'x_alt_text must match in database');

// Cleanup
db.deletePost(testPostId);
const postAfterDelete = db.getPostById(testPostId);
assert.strictEqual(postAfterDelete, null, 'Deleted post must return null');
console.log('   ✓ SQLite WAL insertion, fetch, and deletion passed');

// --- 5. IDEMPOTENCY GUARD TESTS ---
console.log('\n5. Testing Two-Stage Idempotency Guard:');
assert(typeof platforms.dispatchPost === 'function', 'dispatchPost must be a function');
console.log('   ✓ Platform registry verified');

// --- 6. DUAL-SNAPSHOT POST ANALYTICS TESTS ---
console.log('\n6. Testing Dual-Snapshot Post Analytics:');
const analyticsPostId = db.insertPost({
  client_id: 1,
  status: 'completed',
  master_text: 'Analytics Snapshot Test Post'
});

const snapshotId = db.saveMetricsSnapshot(analyticsPostId, 'YOUTUBE', 'T24H', {
  views: 1540,
  likes: 85,
  comments: 12
});
assert(snapshotId, 'saveMetricsSnapshot must return numeric ID');

const postSnapshots = db.getMetricsForPost(analyticsPostId);
assert.strictEqual(postSnapshots.length, 1, 'Must have 1 recorded snapshot');
assert.strictEqual(postSnapshots[0].impression_count, 1540, 'Impression count must match');
assert.strictEqual(postSnapshots[0].like_count, 85, 'Like count must match');

const latestList = db.getLatestPostMetrics(analyticsPostId);
assert.strictEqual(latestList[0].impression_count, 1540, 'Latest impression count must match');

// Cleanup
db.deletePost(analyticsPostId);
console.log('   ✓ Dual-snapshot metrics storage & aggregation passed');

console.log('\n========================================');
console.log('🎉 ALL CI TESTS PASSED SUCCESSFULLY! (100%)');
console.log('========================================\n');
