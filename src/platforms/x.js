/**
 * Live Platform Adapter: X (Twitter) API v2 & Media Upload Engine
 * 
 * Implements:
 * 1. OAuth 1.0a HMAC-SHA1 deterministic request signing (Native node:crypto)
 * 2. OAuth 2.0 Bearer User-Context fallback
 * 3. Chunked Media Upload Pipeline (INIT -> APPEND -> FINALIZE -> STATUS polling)
 * 4. Tweet creation via POST https://api.twitter.com/2/tweets
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../db');

function percentEncode(str) {
  if (typeof str !== 'string' && typeof str !== 'number') return '';
  return encodeURIComponent(String(str))
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Builds standard OAuth 1.0a Authorization header
 */
function buildOAuth1Header({ method, url, queryParams = {}, bodyParams = {}, consumerKey, consumerSecret, token, tokenSecret }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0'
  };

  const allParams = { ...queryParams, ...bodyParams, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    percentEncode(url.split('?')[0]),
    percentEncode(paramString)
  ].join('&');

  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret || '')}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`);

  return `OAuth ${headerParts.join(', ')}`;
}

/**
 * Retrieves X credentials for client workspace or falls back to .env
 */
function getXTokens(clientId = null) {
  if (clientId) {
    try {
      const accounts = db.getAccountsByClient(clientId);
      const acc = accounts.find((a) => a.platform.toLowerCase() === 'x' || a.platform.toLowerCase() === 'twitter');
      if (acc && acc.tokens) return acc.tokens;
    } catch {
      // Fall through to env
    }
  }

  // Fallback to process.env
  const apiKey = process.env.X_API_KEY || process.env.X_CONSUMER_KEY;
  const apiSecret = process.env.X_API_SECRET || process.env.X_CONSUMER_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN || process.env.X_BEARER_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET || process.env.X_TOKEN_SECRET;

  if (apiKey || accessToken) {
    return { apiKey, apiSecret, accessToken, accessSecret };
  }

  return null;
}

/**
 * Detects MIME type and Twitter media category
 */
function getMediaDetails(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let mimeType = 'application/octet-stream';
  let category = 'tweet_image';

  if (['.jpg', '.jpeg'].includes(ext)) {
    mimeType = 'image/jpeg';
    category = 'tweet_image';
  } else if (ext === '.png') {
    mimeType = 'image/png';
    category = 'tweet_image';
  } else if (ext === '.gif') {
    mimeType = 'image/gif';
    category = 'tweet_gif';
  } else if (ext === '.webp') {
    mimeType = 'image/webp';
    category = 'tweet_image';
  } else if (['.mp4', '.mov', '.m4v'].includes(ext)) {
    mimeType = 'video/mp4';
    category = 'tweet_video';
  }

  return { mimeType, category };
}

/**
 * Uploads media using chunked Twitter upload protocol
 */
async function uploadMediaToX(filePath, creds, altText = '') {
  const hasOAuth1 = Boolean(creds.apiKey && creds.apiSecret && creds.accessToken && creds.accessSecret);
  const bearerToken = creds.accessToken || creds.bearerToken;

  if (!hasOAuth1 && !bearerToken) {
    throw new Error('Media upload to X requires OAuth 1.0a credentials (API Key, Secret, Access Token, Token Secret) or Bearer Token.');
  }

  const fileStats = fs.statSync(filePath);
  const totalBytes = fileStats.size;
  const { mimeType, category } = getMediaDetails(filePath);

  const getAuthHeader = (method, url, queryParams = {}, bodyParams = {}) => {
    if (hasOAuth1) {
      return buildOAuth1Header({
        method,
        url,
        queryParams,
        bodyParams,
        consumerKey: creds.apiKey,
        consumerSecret: creds.apiSecret,
        token: creds.accessToken,
        tokenSecret: creds.accessSecret
      });
    }
    return `Bearer ${bearerToken}`;
  };

  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';

  // --- STEP 1: INIT ---
  const initBody = new URLSearchParams({
    command: 'INIT',
    total_bytes: String(totalBytes),
    media_type: mimeType,
    media_category: category
  });

  const initAuth = getAuthHeader('POST', uploadUrl, {}, Object.fromEntries(initBody));
  const initRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: initAuth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: initBody.toString()
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`X Media Upload INIT failed (${initRes.status}): ${errText}`);
  }

  const initData = await initRes.json();
  const mediaId = initData.media_id_string;
  if (!mediaId) {
    throw new Error('X Media Upload INIT did not return media_id_string.');
  }

  // --- STEP 2: APPEND (Chunked in 4MB segments) ---
  const chunkSize = 4 * 1024 * 1024;
  const fileDescriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(chunkSize);
  let bytesRead = 0;
  let segmentIndex = 0;

  try {
    while ((bytesRead = fs.readSync(fileDescriptor, buffer, 0, chunkSize, null)) > 0) {
      const chunk = buffer.subarray(0, bytesRead);
      const formData = new FormData();
      formData.append('command', 'APPEND');
      formData.append('media_id', mediaId);
      formData.append('segment_index', String(segmentIndex));
      formData.append('media', new Blob([chunk], { type: mimeType }));

      const appendAuth = hasOAuth1
        ? buildOAuth1Header({
            method: 'POST',
            url: uploadUrl,
            consumerKey: creds.apiKey,
            consumerSecret: creds.apiSecret,
            token: creds.accessToken,
            tokenSecret: creds.accessSecret
          })
        : `Bearer ${bearerToken}`;

      const appendRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: appendAuth },
        body: formData
      });

      if (!appendRes.ok) {
        const errText = await appendRes.text();
        throw new Error(`X Media Upload APPEND segment ${segmentIndex} failed: ${errText}`);
      }

      segmentIndex++;
    }
  } finally {
    fs.closeSync(fileDescriptor);
  }

  // --- STEP 3: FINALIZE ---
  const finalizeBody = new URLSearchParams({
    command: 'FINALIZE',
    media_id: mediaId
  });

  const finalizeAuth = getAuthHeader('POST', uploadUrl, {}, Object.fromEntries(finalizeBody));
  const finalizeRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: finalizeAuth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: finalizeBody.toString()
  });

  if (!finalizeRes.ok) {
    const errText = await finalizeRes.text();
    throw new Error(`X Media Upload FINALIZE failed: ${errText}`);
  }

  const finalizeData = await finalizeRes.json();

  // --- STEP 4: STATUS POLLING (For async processing e.g. videos) ---
  if (finalizeData.processing_info) {
    let state = finalizeData.processing_info.state;
    let checkAfter = (finalizeData.processing_info.check_after_secs || 2) * 1000;

    while (state === 'pending' || state === 'in_progress') {
      await new Promise((r) => setTimeout(r, checkAfter));

      const statusUrl = `${uploadUrl}?command=STATUS&media_id=${mediaId}`;
      const statusAuth = hasOAuth1
        ? buildOAuth1Header({
            method: 'GET',
            url: uploadUrl,
            queryParams: { command: 'STATUS', media_id: mediaId },
            consumerKey: creds.apiKey,
            consumerSecret: creds.apiSecret,
            token: creds.accessToken,
            tokenSecret: creds.accessSecret
          })
        : `Bearer ${bearerToken}`;

      const statusRes = await fetch(statusUrl, {
        method: 'GET',
        headers: { Authorization: statusAuth }
      });

      if (!statusRes.ok) break;

      const statusData = await statusRes.json();
      state = statusData.processing_info?.state || 'failed';
      checkAfter = (statusData.processing_info?.check_after_secs || 2) * 1000;

      if (state === 'failed') {
        throw new Error(`X Media processing failed: ${statusData.processing_info?.error?.message || 'Unknown processing error'}`);
      }
    }
  }

  // --- STEP 5: SEMANTIC ALT-TEXT INJECTION (Heavy Ranker Quality & SEO) ---
  if (altText && altText.trim()) {
    try {
      const metaUrl = 'https://upload.twitter.com/1.1/media/metadata/create.json';
      const metaBody = JSON.stringify({
        media_id: mediaId,
        alt_text: { text: altText.trim().slice(0, 1000) }
      });

      const metaAuth = hasOAuth1
        ? buildOAuth1Header({
            method: 'POST',
            url: metaUrl,
            consumerKey: creds.apiKey,
            consumerSecret: creds.apiSecret,
            token: creds.accessToken,
            tokenSecret: creds.accessSecret
          })
        : `Bearer ${bearerToken}`;

      await fetch(metaUrl, {
        method: 'POST',
        headers: {
          Authorization: metaAuth,
          'Content-Type': 'application/json'
        },
        body: metaBody
      });
    } catch (metaErr) {
      console.error('[X Adapter] Failed to attach alt_text to media:', metaErr.message);
    }
  }

  return mediaId;
}

/**
 * Publishes a tweet via Twitter API v2
 */
async function publishX(post) {
  const creds = getXTokens(post.client_id);

  if (!creds || (!creds.accessToken && !creds.apiKey)) {
    return {
      platform: 'x',
      success: false,
      error: 'X (Twitter) credentials missing. Please configure Access Token and API Keys in Workspaces & APIs.'
    };
  }

  const hasOAuth1 = Boolean(creds.apiKey && creds.apiSecret && creds.accessToken && creds.accessSecret);
  const bearerToken = creds.accessToken || creds.bearerToken;

  // Resolve content: check dedicated override or fallback to master_text
  const text = (post.x_post || post.master_text || '').trim();
  if (!text) {
    return {
      platform: 'x',
      success: false,
      error: 'Cannot publish an empty post to X.'
    };
  }

  // Resolve media: check platform overrides first
  const mediaPath = post.media_overrides?.x?.path || post.media_path;
  let mediaId = null;

  if (mediaPath && fs.existsSync(mediaPath)) {
    try {
      mediaId = await uploadMediaToX(mediaPath, creds, post.x_alt_text || '');
    } catch (mediaErr) {
      return {
        platform: 'x',
        success: false,
        error: `Media upload to X failed: ${mediaErr.message}`
      };
    }
  }

  // Construct Tweet Payload with Heavy Ranker Multiplier Settings
  const tweetPayload = {
    text,
    reply_settings: 'everyone'
  };
  if (mediaId) {
    tweetPayload.media = { media_ids: [mediaId] };
  }

  const tweetsUrl = 'https://api.twitter.com/2/tweets';
  const jsonBody = JSON.stringify(tweetPayload);

  let authHeader;
  if (hasOAuth1) {
    authHeader = buildOAuth1Header({
      method: 'POST',
      url: tweetsUrl,
      consumerKey: creds.apiKey,
      consumerSecret: creds.apiSecret,
      token: creds.accessToken,
      tokenSecret: creds.accessSecret
    });
  } else {
    authHeader = `Bearer ${bearerToken}`;
  }

  try {
    const res = await fetch(tweetsUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      body: jsonBody
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data.detail || data.title || data.errors?.[0]?.message || `HTTP ${res.status}`;
      return {
        platform: 'x',
        success: false,
        status: res.status,
        error: errMsg
      };
    }

    const tweetId = data.data?.id;
    return {
      platform: 'x',
      success: true,
      tweetId,
      url: tweetId ? `https://x.com/i/web/status/${tweetId}` : null,
      text: data.data?.text || text
    };
  } catch (err) {
    return {
      platform: 'x',
      success: false,
      error: `X Network Dispatch Error: ${err.message}`
    };
  }
}

async function postXFirstReply(tweetId, replyText, clientId = null) {
  const creds = getXTokens(clientId);
  if (!creds || (!creds.accessToken && !creds.apiKey)) {
    throw new Error('X credentials missing for first-comment reply.');
  }

  const hasOAuth1 = Boolean(creds.apiKey && creds.apiSecret && creds.accessToken && creds.accessSecret);
  const bearerToken = creds.accessToken || creds.bearerToken;

  const tweetsUrl = 'https://api.twitter.com/2/tweets';
  const payload = {
    text: replyText.trim(),
    reply: { in_reply_to_tweet_id: tweetId }
  };

  const jsonBody = JSON.stringify(payload);
  const authHeader = hasOAuth1
    ? buildOAuth1Header({
        method: 'POST',
        url: tweetsUrl,
        consumerKey: creds.apiKey,
        consumerSecret: creds.apiSecret,
        token: creds.accessToken,
        tokenSecret: creds.accessSecret
      })
    : `Bearer ${bearerToken}`;

  const res = await fetch(tweetsUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json'
    },
    body: jsonBody
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data.detail || data.title || data.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(`X First-Reply failed: ${errMsg}`);
  }

  return {
    success: true,
    replyId: data.data?.id,
    url: data.data?.id ? `https://x.com/i/web/status/${data.data.id}` : null,
    text: data.data?.text || replyText
  };
}

module.exports = {
  publishX,
  uploadMediaToX,
  getXTokens,
  postXFirstReply
};
