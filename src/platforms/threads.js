/**
 * Live Platform Adapter: Meta Threads API
 * 
 * Implements:
 * 1. Two-step container publishing:
 *    - POST https://graph.threads.net/v1.0/me/threads (TEXT, IMAGE, or VIDEO)
 *    - Status polling for media/video containers until FINISHED
 *    - POST https://graph.threads.net/v1.0/me/threads_publish
 * 2. Inbound first reply / thread continuation (anti-penalty link placement)
 * 3. Media resolution: Cloudflare R2 / S3 public URL bridge or BASE_URL hosting
 * 4. Metrics fetching (views, likes, replies, reposts, quotes)
 */

const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const { isCloudStorageConfigured, uploadLocalFileToCloud } = require('../media/storage');

function getThreadsTokens(clientId = null) {
  if (clientId) {
    try {
      const accounts = db.getAccountsByClient(clientId);
      const acc = accounts.find((a) => a.platform.toLowerCase() === 'threads');
      if (acc && acc.tokens) return acc.tokens;
    } catch {
      // Fall through to env
    }
  }

  const accessToken = process.env.THREADS_ACCESS_TOKEN || process.env.THREADS_TOKEN;
  const userId = process.env.THREADS_USER_ID;

  if (accessToken) {
    return { accessToken, userId };
  }

  return null;
}

/**
 * Resolves public HTTPS URL for Threads media ingestion
 */
async function resolvePublicMediaUrl(mediaPath) {
  if (isCloudStorageConfigured()) {
    const uploadRes = await uploadLocalFileToCloud(mediaPath);
    return uploadRes.publicUrl;
  }

  const baseUrl = process.env.BASE_URL;
  if (baseUrl && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
    return `${baseUrl.replace(/\/$/, '')}/uploads/${path.basename(mediaPath)}`;
  }

  throw new Error('Threads media publishing requires a public HTTPS URL. Please configure Cloudflare R2 / S3 storage in .env (or configure a public BASE_URL).');
}

/**
 * Publishes a post to Meta Threads
 */
async function publishThreads(post) {
  const creds = getThreadsTokens(post.client_id);
  const token = creds?.accessToken;

  if (!token) {
    return {
      platform: 'threads',
      success: false,
      error: 'Threads is not connected for this client. Please add Threads Token under Workspaces & APIs or set THREADS_ACCESS_TOKEN in .env.'
    };
  }

  const text = (post.threads_post || post.master_text || '').trim();

  // Resolve media: check platform overrides first
  const mediaPath = post.media_overrides?.threads?.path || post.media_path;
  const hasMedia = mediaPath && fs.existsSync(mediaPath);

  try {
    const containerPayload = {
      access_token: token
    };

    if (text) {
      containerPayload.text = text;
    }

    if (post.threads_quote_post_id) {
      containerPayload.quote_post_id = post.threads_quote_post_id;
    }

    if (hasMedia) {
      const ext = path.extname(mediaPath).toLowerCase();
      const isVideo = ['.mp4', '.mov', '.m4v'].includes(ext);
      const publicMediaUrl = await resolvePublicMediaUrl(mediaPath);

      if (isVideo) {
        containerPayload.media_type = 'VIDEO';
        containerPayload.video_url = publicMediaUrl;
      } else {
        containerPayload.media_type = 'IMAGE';
        containerPayload.image_url = publicMediaUrl;
      }
    } else {
      containerPayload.media_type = 'TEXT';
      if (!text) {
        return {
          platform: 'threads',
          success: false,
          error: 'Cannot publish an empty post without text or media to Threads.'
        };
      }
    }

    // Step 1: Create container
    const containerRes = await fetch('https://graph.threads.net/v1.0/me/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerPayload)
    });

    const containerData = await containerRes.json();
    if (!containerRes.ok) {
      const errMsg = containerData.error?.message || `HTTP ${containerRes.status}`;
      return { platform: 'threads', success: false, error: errMsg };
    }

    const creationId = containerData.id;
    if (!creationId) {
      return { platform: 'threads', success: false, error: 'Threads API did not return container ID.' };
    }

    // If media was provided, poll container status until FINISHED
    if (hasMedia) {
      let statusCode = 'IN_PROGRESS';
      let attempts = 0;
      while (statusCode !== 'FINISHED' && attempts < 30) {
        await new Promise((r) => setTimeout(r, 3000));
        attempts++;

        const statusRes = await fetch(`https://graph.threads.net/v1.0/${encodeURIComponent(creationId)}?fields=status,error_message&access_token=${token}`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          statusCode = statusData.status;

          if (statusCode === 'ERROR') {
            return {
              platform: 'threads',
              success: false,
              error: `Threads media processing failed: ${statusData.error_message || 'Transcoding error on Meta servers'}`
            };
          }
        }
      }

      if (statusCode !== 'FINISHED') {
        return {
          platform: 'threads',
          success: false,
          error: 'Threads media processing timed out after 90 seconds.'
        };
      }
    }

    // Step 2: Publish container
    const publishRes = await fetch('https://graph.threads.net/v1.0/me/threads_publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: token
      })
    });

    const pubData = await publishRes.json();
    if (!publishRes.ok) {
      return {
        platform: 'threads',
        success: false,
        error: pubData.error?.message || `Threads publish failed (HTTP ${publishRes.status})`
      };
    }

    const postId = pubData.id;
    return {
      platform: 'threads',
      success: true,
      postId,
      url: `https://www.threads.net/post/${postId}`,
      hasMedia: Boolean(hasMedia)
    };
  } catch (err) {
    return {
      platform: 'threads',
      success: false,
      error: err.message
    };
  }
}

/**
 * Publishes first reply (anti-penalty link or follow-up note)
 */
async function postThreadsFirstReply(replyToId, replyText, clientId = null) {
  const creds = getThreadsTokens(clientId);
  const token = creds?.accessToken;
  if (!token) throw new Error('Threads access token missing for first reply.');

  const containerRes = await fetch('https://graph.threads.net/v1.0/me/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'TEXT',
      text: replyText.trim(),
      reply_to_id: replyToId,
      access_token: token
    })
  });

  const containerData = await containerRes.json();
  if (!containerRes.ok) throw new Error(containerData.error?.message || 'Threads reply container creation failed');

  const publishRes = await fetch('https://graph.threads.net/v1.0/me/threads_publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerData.id,
      access_token: token
    })
  });

  const pubData = await publishRes.json();
  if (!publishRes.ok) throw new Error(pubData.error?.message || 'Threads reply publish failed');
  return { success: true, id: pubData.id };
}

/**
 * Fetches metrics for a published thread
 */
async function fetchThreadsMetrics(postId, clientId = null) {
  const creds = getThreadsTokens(clientId);
  const token = creds?.accessToken;
  if (!token) throw new Error('Threads token missing for metrics query.');

  const url = `https://graph.threads.net/v1.0/${encodeURIComponent(postId)}/insights?metric=views,likes,replies,reposts,quotes&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }

  const metrics = {};
  if (Array.isArray(data.data)) {
    for (const m of data.data) {
      const val = m.values?.[0]?.value || 0;
      metrics[m.name] = val;
    }
  }

  return {
    views: metrics.views || 0,
    impressions: metrics.views || 0,
    likes: metrics.likes || 0,
    replies: metrics.replies || 0,
    reposts: (metrics.reposts || 0) + (metrics.quotes || 0),
    raw: data
  };
}

module.exports = {
  getThreadsTokens,
  publishThreads,
  postThreadsFirstReply,
  fetchThreadsMetrics
};
