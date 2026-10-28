const fs = require('node:fs');
const crypto = require('node:crypto');
const { google } = require('googleapis');
const db = require('../db');

function generateOAuthState(clientId = '1') {
  const secret = process.env.ENCRYPTION_SECRET || 'socialpulse-oauth-state-secret';
  const timestamp = Date.now();
  const raw = `${clientId}:${timestamp}`;
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex').slice(0, 16);
  return `${raw}:${sig}`;
}

function verifyOAuthState(stateParam) {
  if (!stateParam) return { valid: false, clientId: 1 };
  const parts = stateParam.split(':');
  if (parts.length !== 3) {
    // Backward compatibility for integer state
    const parsed = parseInt(stateParam, 10);
    return { valid: !isNaN(parsed), clientId: parsed || 1 };
  }

  const [clientId, timestamp, sig] = parts;
  const time = parseInt(timestamp, 10);
  if (isNaN(time) || Date.now() - time > 30 * 60 * 1000) {
    return { valid: false, clientId: parseInt(clientId, 10) || 1 };
  }

  const secret = process.env.ENCRYPTION_SECRET || 'socialpulse-oauth-state-secret';
  const raw = `${clientId}:${timestamp}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(raw).digest('hex').slice(0, 16);

  try {
    const isValid = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
    return { valid: isValid, clientId: parseInt(clientId, 10) || 1 };
  } catch {
    return { valid: false, clientId: parseInt(clientId, 10) || 1 };
  }
}

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
  // Enforce strict client isolation: query client's specific account
  if (clientId) {
    const clientAccounts = db.getAccountsByClient(clientId);
    const ytAccount = clientAccounts.find((a) => a.platform === 'youtube');
    if (ytAccount && ytAccount.tokens) {
      return ytAccount.tokens;
    }
    // Return null if this specific client has not connected YouTube
    return null;
  }

  // Fallback only if no client is specified at all
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
    state: generateOAuthState(clientId || '1')
  });
}

async function handleAuthCallback(code, stateParam = null) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  const { clientId } = verifyOAuthState(stateParam);
  saveTokens(tokens, clientId, 'YouTube Channel');
  return tokens;
}

async function uploadYouTubeThumbnail(videoId, thumbnailPath, oauth2Client) {
  if (!thumbnailPath || !fs.existsSync(thumbnailPath)) return null;
  try {
    const fileStats = fs.statSync(thumbnailPath);
    if (fileStats.size > 2 * 1024 * 1024) {
      console.error('[YouTube Adapter] Custom thumbnail exceeds YouTube API 2MB limit:', fileStats.size);
      return { success: false, error: 'Thumbnail exceeds YouTube Data API 2MB ceiling. Please resize image under 2MB.' };
    }

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const res = await youtube.thumbnails.set({
      videoId,
      media: {
        body: fs.createReadStream(thumbnailPath)
      }
    });
    return { success: true, url: res.data?.items?.[0]?.default?.url };
  } catch (err) {
    console.error('[YouTube Adapter] Custom thumbnail upload failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function postYouTubeFirstComment(videoId, commentText, clientId = null) {
  const tokens = getStoredTokens(clientId);
  if (!tokens) throw new Error('YouTube credentials missing for this client.');

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const res = await youtube.commentThreads.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        videoId,
        topLevelComment: {
          snippet: {
            textOriginal: commentText.trim()
          }
        }
      }
    }
  });

  return {
    success: true,
    commentId: res.data.id
  };
}

function getYouTubeDailyQuotaUsage(clientId = 1) {
  const todayKey = `yt_quota_${new Date().toISOString().split('T')[0]}_${clientId}`;
  const raw = db.getSetting(todayKey);
  return raw ? parseInt(raw, 10) : 0;
}

function recordYouTubeQuotaUsage(clientId = 1, units = 1600) {
  const todayKey = `yt_quota_${new Date().toISOString().split('T')[0]}_${clientId}`;
  const current = getYouTubeDailyQuotaUsage(clientId);
  const updated = current + units;
  db.setSetting(todayKey, updated);
  return updated;
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

  const currentQuota = getYouTubeDailyQuotaUsage(post.client_id || 1);
  if (currentQuota + 1600 > 10000) {
    return {
      platform: 'youtube',
      success: false,
      error: `YouTube daily API quota limit reached (${currentQuota}/10,000 units used today; upload requires 1,600 units). Quota resets at midnight PST.`
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
      const refreshed = await oauth2Client.refreshAccessToken();
      const newCreds = { ...tokens, ...refreshed.credentials };
      saveTokens(newCreds, post.client_id);
      oauth2Client.setCredentials(newCreds);
    } catch (refreshErr) {
      console.error('[YouTube Adapter] Proactive refresh attempt error:', refreshErr.message);
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
      tags,
      categoryId: post.youtube_category_id || '28',
      defaultLanguage: 'en'
    },
    status: {
      privacyStatus: post.youtube_privacy || 'unlisted',
      selfDeclaredMadeForKids: Boolean(post.youtube_made_for_kids),
      containsSyntheticMedia: Boolean(post.youtube_synthetic_media),
      embeddable: true
    }
  };

  const notifySubscribers = post.youtube_notify_subscribers === undefined ? true : Boolean(post.youtube_notify_subscribers);

  const media = {
    body: fs.createReadStream(mediaPath)
  };

  try {
    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      notifySubscribers,
      requestBody,
      media
    });

    const videoId = res.data.id;
    recordYouTubeQuotaUsage(post.client_id || 1, 1600);

    // Upload custom thumbnail if provided (up to 50MB)
    let thumbResult = null;
    const thumbPath = post.youtube_custom_thumb_path;
    if (thumbPath && fs.existsSync(thumbPath)) {
      thumbResult = await uploadYouTubeThumbnail(videoId, thumbPath, oauth2Client);
    }

    return {
      platform: 'youtube',
      success: true,
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      shortsUrl: `https://youtube.com/shorts/${videoId}`,
      thumbnailUploaded: Boolean(thumbResult?.success)
    };
  } catch (err) {
    return {
      platform: 'youtube',
      success: false,
      error: err.response?.data?.error?.message || err.message
    };
  }
}

async function fetchYouTubeMetrics(videoId, clientId = null) {
  const tokens = getStoredTokens(clientId);
  if (!tokens) throw new Error('YouTube credentials missing');
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const res = await youtube.videos.list({
    part: ['statistics'],
    id: [videoId]
  });

  const item = res.data?.items?.[0];
  if (!item) throw new Error(`YouTube video ${videoId} not found`);
  const stats = item.statistics || {};

  return {
    views: parseInt(stats.viewCount || 0, 10),
    impressions: parseInt(stats.viewCount || 0, 10),
    likes: parseInt(stats.likeCount || 0, 10),
    comments: parseInt(stats.commentCount || 0, 10),
    raw: stats
  };
}

async function fetchRecentYouTubeComments(videoId, clientId = null) {
  const tokens = getStoredTokens(clientId);
  if (!tokens) return [];

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  try {
    const res = await youtube.commentThreads.list({
      part: ['snippet'],
      videoId,
      maxResults: 20,
      order: 'time'
    });

    const items = res.data?.items || [];
    return items.map((t) => {
      const top = t.snippet?.topLevelComment?.snippet || {};
      return {
        external_comment_id: t.id,
        author_name: top.authorDisplayName || 'YouTube Viewer',
        comment_text: top.textOriginal || '',
        created_at: top.publishedAt || new Date().toISOString()
      };
    });
  } catch (err) {
    console.error('[YouTube Adapter] Comments fetch error:', err.message);
    return [];
  }
}

async function replyToYouTubeComment(commentThreadId, replyText, clientId = null) {
  const tokens = getStoredTokens(clientId);
  if (!tokens) throw new Error('YouTube credentials missing');

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const res = await youtube.comments.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        parentId: commentThreadId,
        textOriginal: replyText.trim()
      }
    }
  });

  return { success: true, replyId: res.data?.id };
}

module.exports = {
  getAuthUrl,
  generateOAuthState,
  verifyOAuthState,
  handleAuthCallback,
  getStoredTokens,
  saveTokens,
  publishYouTube,
  uploadYouTubeThumbnail,
  getYouTubeDailyQuotaUsage,
  recordYouTubeQuotaUsage,
  postYouTubeFirstComment,
  fetchYouTubeMetrics,
  fetchRecentYouTubeComments,
  replyToYouTubeComment
};
