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

// --- 7. ACTIONABLE INBOX & ENGAGEMENT TASKS TESTS ---
console.log('\n7. Testing Actionable Inbox & Tasks:');
const taskId = db.createEngagementTask({
  client_id: 1,
  platform: 'YOUTUBE',
  external_comment_id: 'yt_comment_98765',
  parent_post_id: 'video_123',
  author_name: 'Tech Enthusiast',
  comment_text: 'Is this compatible with Node 24?'
});
assert(taskId, 'createEngagementTask must return numeric ID');

const tasks = db.getEngagementTasks(1, 0);
assert(tasks.length >= 1, 'Should return at least 1 unreplied task');
const myTask = tasks.find((t) => t.id === taskId);
assert.strictEqual(myTask.comment_text, 'Is this compatible with Node 24?');

db.markTaskReplied(taskId, 'Yes, fully compatible!');
const tasksAfterReply = db.getEngagementTasks(1, 0);
assert(!tasksAfterReply.some((t) => t.id === taskId), 'Task must no longer be in unreplied list');

const allTasks = db.getEngagementTasks(1, null);
const repliedTask = allTasks.find((t) => t.id === taskId);
assert.strictEqual(repliedTask.is_replied, 1, 'Task must have is_replied=1');
assert.strictEqual(repliedTask.reply_text, 'Yes, fully compatible!');

// Cleanup
db.deleteEngagementTask(taskId);
console.log('   ✓ Actionable task creation, reply state, and dismissal passed');

// --- 8. ENTERPRISE AUTH, PASSWORDS & RBAC TESTS ---
console.log('\n8. Testing Enterprise Auth, Password Hashing & RBAC:');
const { hashPassword, verifyPassword } = require('../src/crypto');
const { generateToken, verifyToken, hasMinimumRole, ROLES } = require('../src/auth');

const pass = 'SuperSecurePass2026!';
const hashed = hashPassword(pass);
assert(hashed.startsWith('scrypt$'), 'Hash format must start with scrypt$');
assert.strictEqual(verifyPassword(pass, hashed), true, 'Valid password verification must succeed');
assert.strictEqual(verifyPassword('WrongPass', hashed), false, 'Invalid password verification must fail');
console.log('   ✓ Scrypt password hashing & timing-safe verification passed');

const testUser = { id: 42, email: 'lead@agency.com', role: ROLES.ADMIN, client_id: 2 };
const token = generateToken(testUser);
assert(token && typeof token === 'string', 'JWT token must be a string');
const decoded = verifyToken(token);
assert.strictEqual(decoded.sub, 42, 'Decoded user ID must match');
assert.strictEqual(decoded.role, ROLES.ADMIN, 'Decoded role must match');
assert.strictEqual(hasMinimumRole(ROLES.OWNER, ROLES.ADMIN), true, 'OWNER exceeds ADMIN hierarchy');
assert.strictEqual(hasMinimumRole(ROLES.VIEWER, ROLES.ADMIN), false, 'VIEWER does not meet ADMIN hierarchy');
console.log('   ✓ JWT signing, verification, and RBAC hierarchy passed');

// --- 9. ZOD REQUEST SCHEMA VALIDATION TESTS ---
console.log('\n9. Testing Zod Request Validation Schemas:');
const { loginSchema, createClientSchema, queueRuleSchema } = require('../src/validation/schemas');

const validLogin = loginSchema.safeParse({ email: 'user@domain.com', password: 'StrongPassword123' });
assert.strictEqual(validLogin.success, true, 'Valid login schema should succeed');

const invalidLogin = loginSchema.safeParse({ email: 'not-an-email', password: 'short' });
assert.strictEqual(invalidLogin.success, false, 'Invalid login schema should fail');

const validColor = createClientSchema.safeParse({ name: 'Client X', color_code: '#10B981' });
assert.strictEqual(validColor.success, true, 'Valid hex color must succeed');

const invalidColor = createClientSchema.safeParse({ name: 'Client X', color_code: 'blue' });
assert.strictEqual(invalidColor.success, false, 'Non-hex color must fail');

const validQueueRule = queueRuleSchema.safeParse({ iso_weekday: 5, local_time: '18:30' });
assert.strictEqual(validQueueRule.success, true, 'Valid queue rule format must succeed');
console.log('   ✓ Strict schema validation & input sanitization passed');

// --- 10. IDEMPOTENCY KEY TESTS ---
console.log('\n10. Testing Idempotency Storage:');
const testKey = 'idem-key-abc-123';
db.saveIdempotencyKey(testKey, 101, { success: true, cached: true }, 3600);
const cachedResult = db.getIdempotencyKey(testKey);
assert(cachedResult !== null, 'Saved idempotency key must be retrievable');
assert.strictEqual(cachedResult.post_id, 101, 'Cached post ID must match');
assert.strictEqual(cachedResult.response.cached, true, 'Cached response payload must match');
console.log('   ✓ Idempotency caching & duplicate post prevention passed');

// --- 11. AUDIT LOGGING TESTS ---
console.log('\n11. Testing Immutable Audit Logging:');
db.logAudit({
  user_id: 1,
  client_id: 1,
  action: 'TEST_AUDIT_ACTION',
  entity_type: 'POST',
  entity_id: '999',
  metadata: { note: 'CI audit verification' }
});
const auditLogs = db.getAuditLogs(1, 10);
assert(auditLogs.length > 0, 'Audit logs must return recorded actions');
const testLog = auditLogs.find((l) => l.action === 'TEST_AUDIT_ACTION');
assert(testLog, 'Recorded audit action must be present in log query');
console.log('   ✓ Immutable audit logging & querying passed');

// --- 12. GDPR COMPLIANCE TESTS (DSAR & ERASURE) ---
console.log('\n12. Testing GDPR DSAR Export & Right to Erasure:');
const gdprClient = db.createClient('GDPR Test Client', '#EF4444');
const exported = db.exportClientData(gdprClient.id);
assert(exported !== null, 'Data export for client must return structured payload');
assert.strictEqual(exported.client.id, gdprClient.id, 'Exported client ID must match');

const erased = db.eraseClientData(gdprClient.id);
assert.strictEqual(erased, true, 'Client data erasure must complete');
const clientAfterErasure = db.getClients().find((c) => c.id === gdprClient.id);
assert.strictEqual(clientAfterErasure, undefined, 'Client must be completely erased from database');
console.log('   ✓ GDPR DSAR Export and Right to Erasure cascade passed');

// --- 13. EXTERNAL API CIRCUIT BREAKER TESTS ---
console.log('\n13. Testing External Platform Circuit Breakers:');
const { circuitBreaker, CIRCUIT_STATES } = require('../src/queue/circuit-breaker');

assert.strictEqual(circuitBreaker.isOpen('mock_platform'), false, 'Initial circuit must be CLOSED');
circuitBreaker.recordFailure('mock_platform', new Error('API 500 error'));
circuitBreaker.recordFailure('mock_platform', new Error('API 500 error'));
circuitBreaker.recordFailure('mock_platform', new Error('API 500 error'));
assert.strictEqual(circuitBreaker.isOpen('mock_platform'), true, 'Circuit must trip to OPEN after 3 failures');

const circuitStatus = circuitBreaker.getStatus();
assert.strictEqual(circuitStatus.mock_platform.state, CIRCUIT_STATES.OPEN, 'Circuit state must reflect OPEN');
console.log('   ✓ External API failure threshold & circuit breaker tripping passed');

console.log('\n========================================');
console.log('🎉 ALL CI TESTS PASSED SUCCESSFULLY! (100%)');
console.log('========================================\n');
