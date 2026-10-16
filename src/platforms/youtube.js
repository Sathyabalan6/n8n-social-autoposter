const fs = require('node:fs');
const { google } = require('googleapis');
const db = require('../db');

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/youtube/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getStoredTokens(clientId = null) {
  // If clientId is provided, query client's specific account
  if (clientId) {
    const clientAccounts = db.getAccountsByClient(clientId);
    const ytAccount = clientAccounts.find((a) => a.platform === 'youtube');
    if (ytAccount && ytAccount.tokens) {
      return ytAccount.tokens;
    }
  }

  // Fallback to global vault tokens
  const tokensJson = db.getSetting('youtube_tokens');
  if (tokensJson) {
    try {
      return JSON.parse(tokensJson);
    } catch {
      return null;
    }
  }
  return null;
}

function saveTokens(tokens, clientId = null, accountName = 'YouTube Channel') {
  // 1. Save globally in encrypted settings
  db.setSetting('youtube_tokens', tokens, true);

  // 2. Save linked to client account if clientId provided
  if (clientId) {
    db.saveAccountTokens(clientId, 'youtube', accountName, '@channel', '', tokens);
  }
}

function getAuthUrl(clientId = null) {
  const oauth2Client = getOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: clientId ? String(clientId) : '1'
  });
}

async function handleAuthCallback(code, stateParam = null) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  const clientId = stateParam ? parseInt(stateParam, 10) : 1;
  saveTokens(tokens, clientId, 'YouTube Channel');
  return tokens;
}

async function publishYouTube(post) {
  const tokens = getStoredTokens(post.client_id);
  if (!tokens || (!tokens.refresh_token && !tokens.access_token)) {
    return {
      platform: 'youtube',
      success: false,
      error: 'YouTube is not connected for this client. Please connect YouTube via Settings.'
    };
  }

  // Support per-platform media override: check post.media_overrides?.youtube first
  const mediaPath = post.media_overrides?.youtube?.path || post.media_path;

  if (!mediaPath || !fs.existsSync(mediaPath)) {
    return {
      platform: 'youtube',
      success: false,
      error: 'YouTube upload requires a video file, but none was provided or the file is missing.'
    };
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);

  // Proactive Token Refresh: If token expires within 5 minutes, refresh proactively before upload
  if (tokens.refresh_token && tokens.expiry_date && (Date.now() + 300000 > tokens.expiry_date)) {
    try {
      console.log('[YouTube Adapter] Proactive token refresh (T-5 min window)...');
      const refreshed = await oauth2Client.refreshAccessToken();
      const newCreds = { ...tokens, ...refreshed.credentials };
      saveTokens(newCreds, post.client_id);
      oauth2Client.setCredentials(newCreds);
    } catch (refreshErr) {
      console.warn('[YouTube Adapter] Proactive refresh attempt error:', refreshErr.message);
    }
  }

  // Auto-listen for refreshed tokens during requests
  oauth2Client.on('tokens', (newTokens) => {
    const updated = { ...tokens, ...newTokens };
    saveTokens(updated, post.client_id);
  });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const tags = (post.youtube_tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const requestBody = {
    snippet: {
      title: post.youtube_title || post.master_text.slice(0, 70),
      description: post.master_text,
      tags
    },
    status: {
      privacyStatus: post.youtube_privacy || 'unlisted',
      selfDeclaredMadeForKids: false
    }
  };

  const media = {
    body: fs.createReadStream(mediaPath)
  };

  try {
    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody,
      media
    });

    const videoId = res.data.id;
    return {
      platform: 'youtube',
      success: true,
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      shortsUrl: `https://youtube.com/shorts/${videoId}`
    };
  } catch (err) {
    return {
      platform: 'youtube',
      success: false,
      error: err.response?.data?.error?.message || err.message
    };
  }
}

module.exports = {
  getAuthUrl,
  handleAuthCallback,
  getStoredTokens,
  saveTokens,
  publishYouTube
};
