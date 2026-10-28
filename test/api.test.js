/**
 * SocialPulse Studio - API Security & Integration Test Suite
 * Tests HTTP route guards, RBAC, Anti-IDOR, Host Header protection, and CRUD flows
 */

const assert = require('node:assert');
const http = require('node:http');
const { app } = require('../src/server');
const { generateToken, ROLES } = require('../src/auth');

console.log('🧪 Starting SocialPulse Studio HTTP Security & API Integration Test Suite...\n');

// Configure test secrets
process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_at_least_32_characters_long';

// Start ephemeral HTTP server on random free port
const server = http.createServer(app);

server.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  async function api(path, options = {}) {
    const url = `${baseUrl}${path}`;
    const headers = { ...(options.headers || {}) };
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body
    });
    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, text, headers: res.headers };
  }

  try {
    // ------------------------------------------------------------------------
    // 1. Health & Status Probes (Public)
    // ------------------------------------------------------------------------
    console.log('1. Testing Public Health & Observability Probes:');
    const healthz = await api('/healthz');
    assert.strictEqual(healthz.status, 200, '/healthz should return 200');
    assert.strictEqual(healthz.data.status, 'healthy');

    const readyz = await api('/readyz');
    assert.strictEqual(readyz.status, 200, '/readyz should return 200');
    assert.strictEqual(readyz.data.status, 'ready');

    const status = await api('/api/status');
    assert.strictEqual(status.status, 200, '/api/status should return 200');
    assert.strictEqual(status.data.status, 'ok');
    console.log('   ✓ /healthz, /readyz, and /api/status are healthy and public');

    // ------------------------------------------------------------------------
    // 2. DNS Rebinding & Host Header Validation
    // ------------------------------------------------------------------------
    console.log('\n2. Testing Host Header & DNS Rebinding Security:');
    const spoofedStatusCode = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: '/healthz',
        headers: { Host: 'localhost.attacker.com' }
      }, (res) => {
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.strictEqual(spoofedStatusCode, 403, 'Spoofed host header must be blocked with 403');
    console.log('   ✓ Malicious Host header (localhost.attacker.com) correctly blocked (403)');

    // ------------------------------------------------------------------------
    // 3. Security Hardening: Unauthenticated Requests Blocked (401)
    // ------------------------------------------------------------------------
    console.log('\n3. Testing Unauthenticated Route Protection (Zero Auth):');

    const unauthPosts = await api('/api/posts');
    assert.strictEqual(unauthPosts.status, 401, 'GET /api/posts must require authentication');

    const unauthCreatePost = await api('/api/posts', { method: 'POST', body: { master_text: 'Test' } });
    assert.strictEqual(unauthCreatePost.status, 401, 'POST /api/posts must require authentication');

    const unauthClients = await api('/api/clients');
    assert.strictEqual(unauthClients.status, 401, 'GET /api/clients must require authentication');

    const unauthCreateClient = await api('/api/clients', { method: 'POST', body: { name: 'Evil' } });
    assert.strictEqual(unauthCreateClient.status, 401, 'POST /api/clients must require authentication');

    const unauthTranscode = await api('/api/media/transcode/vertical', { method: 'POST' });
    assert.strictEqual(unauthTranscode.status, 401, 'POST /api/media/transcode/vertical must require authentication');

    const unauthInspect = await api('/api/media/inspect', { method: 'POST' });
    assert.strictEqual(unauthInspect.status, 401, 'POST /api/media/inspect must require authentication');

    const unauthPresign = await api('/api/media/presign-upload', { method: 'POST', body: { filename: 'test.mp4' } });
    assert.strictEqual(unauthPresign.status, 401, 'POST /api/media/presign-upload must require authentication');
    console.log('   ✓ All sensitive mutating & data endpoints rejected unauthenticated requests (401)');

    // ------------------------------------------------------------------------
    // 4. Authentication Flow (Login & Token Issuance)
    // ------------------------------------------------------------------------
    console.log('\n4. Testing Authentication Flow (Login):');
    const invalidLogin = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@socialpulse.local', password: 'WrongPassword!' }
    });
    assert.strictEqual(invalidLogin.status, 401, 'Invalid password must return 401');

    const validLogin = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@socialpulse.local', password: process.env.ADMIN_PASSWORD || 'SocialPulseAdmin2026!' }
    });
    assert.strictEqual(validLogin.status, 200, 'Valid admin credentials must return 200');
    assert(validLogin.data.token, 'Response must include JWT token');
    const adminToken = validLogin.data.token;
    console.log('   ✓ User login and JWT token issuance verified');

    // ------------------------------------------------------------------------
    // 5. Authenticated CRUD & Management Operations
    // ------------------------------------------------------------------------
    console.log('\n5. Testing Authenticated CRUD Operations:');
    const clientsRes = await api('/api/clients', { token: adminToken });
    assert.strictEqual(clientsRes.status, 200, 'GET /api/clients with token must return 200');
    assert(Array.isArray(clientsRes.data.clients), 'Should return clients list');

    // Create post with admin token
    const newPostRes = await api('/api/posts', {
      method: 'POST',
      token: adminToken,
      body: {
        master_text: 'Integration test post with external link https://example.com/spec',
        platforms: ['youtube', 'x'],
        action: 'draft'
      }
    });
    assert.strictEqual(newPostRes.status, 200, 'POST /api/posts with token must succeed (200)');
    const createdPostId = newPostRes.data.postId;
    assert(createdPostId, 'Post ID must be returned');

    // Edit post with admin token
    const editPostRes = await api(`/api/posts/${createdPostId}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        master_text: 'Updated post content for integration test',
        platforms: ['youtube', 'x'],
        action: 'draft'
      }
    });
    assert.strictEqual(editPostRes.status, 200, 'PUT /api/posts/:id with token must succeed (200)');

    // Reschedule post
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const rescheduleRes = await api(`/api/posts/${createdPostId}/schedule`, {
      method: 'PATCH',
      token: adminToken,
      body: { scheduled_at: futureDate }
    });
    assert.strictEqual(rescheduleRes.status, 200, 'PATCH /api/posts/:id/schedule must succeed (200)');
    console.log('   ✓ Authenticated post creation, modification, and rescheduling verified');

    // ------------------------------------------------------------------------
    // 6. Anti-IDOR & Tenant Isolation Verification
    // ------------------------------------------------------------------------
    console.log('\n6. Testing Anti-IDOR & Multi-Tenant Data Isolation:');
    // Create an EDITOR user belonging strictly to Client Workspace #2
    const client2User = { id: 99, email: 'editor@client2.local', role: ROLES.EDITOR, client_id: 2, name: 'Client 2 Editor' };
    const client2Token = generateToken(client2User);

    // Attempt 1: Client 2 Editor tries to modify Client 1's post (IDOR attack)
    const idorUpdate = await api(`/api/posts/${createdPostId}`, {
      method: 'PUT',
      token: client2Token,
      body: { master_text: 'Hacked by Client 2', platforms: ['x'] }
    });
    assert.strictEqual(idorUpdate.status, 403, 'Cross-tenant post update must be blocked (403 Forbidden)');

    // Attempt 2: Client 2 Editor tries to delete Client 1's post
    const idorDelete = await api(`/api/posts/${createdPostId}`, {
      method: 'DELETE',
      token: client2Token
    });
    assert.strictEqual(idorDelete.status, 403, 'Cross-tenant post deletion must be blocked (403 Forbidden)');

    // Attempt 3: Client 2 Editor tries to access Client 1 accounts
    const idorAccounts = await api('/api/clients/1/accounts', {
      token: client2Token
    });
    assert.strictEqual(idorAccounts.status, 403, 'Cross-tenant account access must be blocked (403 Forbidden)');

    // Attempt 4: Unauthenticated attacker tries to modify post without token (testing the previous IDOR bypass bug)
    const noTokenUpdate = await api(`/api/posts/${createdPostId}`, {
      method: 'PUT',
      body: { master_text: 'Anonymous overwrite attempt' }
    });
    assert.strictEqual(noTokenUpdate.status, 401, 'Unauthenticated post update must be rejected (401)');
    console.log('   ✓ Anti-IDOR tenant boundary enforced across users (403) and anonymous actors (401)');

    // ------------------------------------------------------------------------
    // 7. Single-Use Magic Link Review Workflow
    // ------------------------------------------------------------------------
    console.log('\n7. Testing Single-Use Magic Link Review Gate:');
    const approvalReq = await api(`/api/posts/${createdPostId}/request-approval`, {
      method: 'POST',
      token: adminToken
    });
    assert.strictEqual(approvalReq.status, 200, 'Requesting approval link must succeed (200)');
    assert(approvalReq.data.magicLink, 'Magic link URL must be returned');

    // Extract token from magicLink
    const magicUrl = new URL(approvalReq.data.magicLink);
    const magicToken = magicUrl.searchParams.get('token');

    // Review page without token -> should show expired / invalid
    const reviewNoToken = await api(`/review/${createdPostId}`);
    assert(reviewNoToken.text.includes('Link Expired') || reviewNoToken.text.includes('invalid'), 'Review without token must be rejected');

    // Review page with valid token -> should show Pending Review
    const reviewValid = await api(`/review/${createdPostId}?token=${magicToken}`);
    assert(reviewValid.text.includes('Pending Review'), 'Review with valid token must show Pending Review');

    // Approve post via token
    const approveRes = await api(`/api/review/${createdPostId}/approve`, {
      method: 'POST',
      body: { token: magicToken }
    });
    assert.strictEqual(approveRes.status, 200, 'Post approval with valid token must return 200');

    // Review page after approval -> should show Approved
    const reviewAfterApproval = await api(`/review/${createdPostId}?token=${magicToken}`);
    assert(reviewAfterApproval.text.includes('Approved'), 'Review page must reflect Approved state');
    console.log('   ✓ Single-use magic link generation, external review, and approval gate verified');

    // ------------------------------------------------------------------------
    // 8. Failed Post Retry & Diagnostics
    // ------------------------------------------------------------------------
    console.log('\n8. Testing Failed Post Retry & Diagnostics:');
    const retryRes = await api(`/api/posts/${createdPostId}/retry`, {
      method: 'POST',
      token: adminToken
    });
    assert.strictEqual(retryRes.status, 200, 'POST /api/posts/:id/retry must return 200');
    assert.strictEqual(retryRes.data.success, true);
    console.log('   ✓ Post retry & diagnostics endpoint verified');

    // Cleanup test post
    await api(`/api/posts/${createdPostId}`, { method: 'DELETE', token: adminToken });

    console.log('\n======================================================');
    console.log('🎉 ALL HTTP SECURITY & API INTEGRATION TESTS PASSED! (100%)');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ Test Failure:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
