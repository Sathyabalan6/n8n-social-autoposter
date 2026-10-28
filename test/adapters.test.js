/**
 * Automated Mock Network Test Suite for Social Media Platform Adapters & Auth
 * Uses native node:test and global fetch mocking without requiring live external API credentials.
 */

const test = require('node:test');
const assert = require('node:assert');
const { apiKeyAuth } = require('../src/middleware/auth');
const { publishThreads, postThreadsFirstReply } = require('../src/platforms/threads');
const { publishFacebook, postFacebookFirstComment } = require('../src/platforms/facebook');

test('Security Middleware: apiKeyAuth', async (t) => {
  await t.test('passes when API_KEY is not configured', () => {
    delete process.env.API_KEY;
    delete process.env.ADMIN_API_KEY;

    let nextCalled = false;
    const req = { path: '/api/posts', headers: {}, query: {} };
    const res = { status: () => res, json: () => {} };
    apiKeyAuth(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'Next should be called when no API_KEY configured');
  });

  await t.test('blocks requests when API_KEY is configured and no key is provided', () => {
    process.env.API_KEY = 'secret-test-key-123';

    let statusCode = null;
    let jsonBody = null;
    const req = { path: '/api/posts', headers: {}, query: {} };
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; }
    };

    let nextCalled = false;
    apiKeyAuth(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, 'Next should not be called');
    assert.strictEqual(statusCode, 401, 'Should return 401 status code');
    assert.strictEqual(jsonBody.success, false);

    delete process.env.API_KEY;
  });

  await t.test('allows requests when valid key is provided in x-api-key header', () => {
    process.env.API_KEY = 'secret-test-key-123';

    let nextCalled = false;
    const req = { path: '/api/posts', headers: { 'x-api-key': 'secret-test-key-123' }, query: {} };
    const res = { status: () => res, json: () => {} };
    apiKeyAuth(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'Next should be called with valid key');

    delete process.env.API_KEY;
  });

  await t.test('allows requests when valid key is provided as Bearer token', () => {
    process.env.API_KEY = 'secret-test-key-123';

    let nextCalled = false;
    const req = { path: '/api/posts', headers: { authorization: 'Bearer secret-test-key-123' }, query: {} };
    const res = { status: () => res, json: () => {} };
    apiKeyAuth(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'Next should be called with Bearer key');

    delete process.env.API_KEY;
  });

  await t.test('exempts client review endpoints from API_KEY check', () => {
    process.env.API_KEY = 'secret-test-key-123';

    let nextCalled = false;
    const req = { path: '/review/42', headers: {}, query: { token: 'hmac-token' } };
    const res = { status: () => res, json: () => {} };
    apiKeyAuth(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'Review portal must be exempt');

    delete process.env.API_KEY;
  });
});

test('Platform Adapter: Threads Live API Dispatch', async (t) => {
  const originalFetch = global.fetch;

  await t.test('returns error when credentials missing', async () => {
    delete process.env.THREADS_ACCESS_TOKEN;
    const res = await publishThreads({ client_id: 9999, master_text: 'Test thread' });
    assert.strictEqual(res.success, false);
    assert(res.error.includes('Threads is not connected'));
  });

  await t.test('executes two-step container and publish flow', async () => {
    process.env.THREADS_ACCESS_TOKEN = 'mock-threads-token-123';

    const recordedRequests = [];
    global.fetch = async (url, options = {}) => {
      recordedRequests.push({ url, options });

      if (url.includes('/me/threads') && !url.includes('/me/threads_publish')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'mock-container-999' })
        };
      }
      if (url.includes('/me/threads_publish')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'mock-published-post-888' })
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: { message: 'Not found' } }) };
    };

    const res = await publishThreads({
      client_id: 9999,
      master_text: 'Hello Threads from SocialPulse!'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.postId, 'mock-published-post-888');
    assert.strictEqual(recordedRequests.length, 2, 'Must execute container creation and publish call');

    const containerReq = JSON.parse(recordedRequests[0].options.body);
    assert.strictEqual(containerReq.media_type, 'TEXT');
    assert.strictEqual(containerReq.text, 'Hello Threads from SocialPulse!');

    const publishReq = JSON.parse(recordedRequests[1].options.body);
    assert.strictEqual(publishReq.creation_id, 'mock-container-999');

    // Test first reply
    const replyRes = await postThreadsFirstReply('mock-published-post-888', 'https://example.com/link', 9999);
    assert.strictEqual(replyRes.success, true);
    assert.strictEqual(replyRes.id, 'mock-published-post-888');

    delete process.env.THREADS_ACCESS_TOKEN;
    global.fetch = originalFetch;
  });
});

test('Platform Adapter: Facebook Page Live API Dispatch', async (t) => {
  const originalFetch = global.fetch;

  await t.test('returns error when credentials missing', async () => {
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.META_PAGE_ID;
    const res = await publishFacebook({ client_id: 9999, master_text: 'Test FB' });
    assert.strictEqual(res.success, false);
    assert(res.error.includes('Facebook Page credentials missing'));
  });

  await t.test('executes feed post for text content', async () => {
    process.env.META_ACCESS_TOKEN = 'mock-page-token-123';
    process.env.META_PAGE_ID = '1000123456';

    const recordedRequests = [];
    global.fetch = async (url, options = {}) => {
      recordedRequests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: '1000123456_987654321' })
      };
    };

    const res = await publishFacebook({
      client_id: 9999,
      master_text: 'Broadcast message to Facebook Page'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.postId, '1000123456_987654321');
    assert.strictEqual(recordedRequests.length, 1);
    assert(recordedRequests[0].url.includes('/1000123456/feed'));

    const parsedBody = JSON.parse(recordedRequests[0].options.body);
    assert.strictEqual(parsedBody.message, 'Broadcast message to Facebook Page');
    assert.strictEqual(parsedBody.access_token, 'mock-page-token-123');

    // Test first comment
    const commentRes = await postFacebookFirstComment('1000123456_987654321', 'Read more at https://example.com', 9999);
    assert.strictEqual(commentRes.success, true);

    delete process.env.META_ACCESS_TOKEN;
    delete process.env.META_PAGE_ID;
    global.fetch = originalFetch;
  });
});
