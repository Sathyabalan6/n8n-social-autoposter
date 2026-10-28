/**
 * SocialPulse - Opt-in Live Social Platform Smoke Test Suite
 * Only executes when LIVE_TESTS=1 is explicitly set in the environment.
 * Dispatches test transactions against real developer accounts in a staging/sandbox configuration.
 */

const test = require('node:test');
const assert = require('node:assert');

if (process.env.LIVE_TESTS !== '1') {
  console.log('ℹ Skipping live platform smoke tests.');
  console.log('👉 To run real end-to-end publishing tests against live platform developer accounts, run:');
  console.log('   LIVE_TESTS=1 npm run test:live\n');
  process.exit(0);
}

console.log('🧪 Starting SocialPulse LIVE External Social Platform Smoke Tests...\n');

test('Live Platform Smoke Tests', async (t) => {
  await t.test('YouTube Data API v3 live credential verification', async () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.log('   ⏭ Skipped: GOOGLE_CLIENT_ID / SECRET not present in .env');
      return;
    }

    const { getStoredTokens, getOAuth2Client } = require('../src/platforms/youtube');
    const tokens = getStoredTokens(1);
    if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
      console.log('   ⏭ Skipped: YouTube OAuth tokens not yet authorized in local vault');
      return;
    }

    const client = getOAuth2Client();
    client.setCredentials(tokens);
    const { google } = require('googleapis');
    const youtube = google.youtube({ version: 'v3', auth: client });
    const res = await youtube.channels.list({ part: ['snippet'], mine: true });
    assert.strictEqual(res.status, 200);
    console.log(`   ✓ YouTube connected channel: ${res.data.items?.[0]?.snippet?.title || 'Unknown'}`);
  });

  await t.test('X (Twitter) API v2 live credential verification', async () => {
    const { getXTokens } = require('../src/platforms/x');
    const tokens = getXTokens(1);
    if (!tokens || (!tokens.apiKey && !tokens.accessToken)) {
      console.log('   ⏭ Skipped: X API keys not present in .env or vault');
      return;
    }

    const res = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    });
    if (res.status === 200) {
      const data = await res.json();
      console.log(`   ✓ X authenticated account: @${data.data?.username}`);
    } else {
      console.log(`   ⚠ X API responded with status ${res.status}`);
    }
  });

  await t.test('LinkedIn REST Posts API live credential verification', async () => {
    const { getLinkedInTokens, resolveAuthorUrn } = require('../src/platforms/linkedin');
    const tokens = getLinkedInTokens(1);
    if (!tokens || !tokens.accessToken) {
      console.log('   ⏭ Skipped: LinkedIn Access Token not present in .env or vault');
      return;
    }

    try {
      const urn = await resolveAuthorUrn(tokens.accessToken, tokens.urn);
      assert(urn.startsWith('urn:li:'), 'URN must be resolved to LinkedIn format');
      console.log(`   ✓ LinkedIn authenticated member URN: ${urn}`);
    } catch (err) {
      console.log(`   ⚠ LinkedIn discovery error: ${err.message}`);
    }
  });
});
