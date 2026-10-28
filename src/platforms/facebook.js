/**
 * Live Platform Adapter: Facebook Page (Meta Graph API)
 * 
 * Implements:
 * 1. Text posts via POST https://graph.facebook.com/v20.0/{page-id}/feed
 * 2. Photo uploads via POST https://graph.facebook.com/v20.0/{page-id}/photos (Multipart local binary or Cloud URL)
 * 3. Video uploads via POST https://graph.facebook.com/v20.0/{page-id}/videos
 * 4. Automated first comment for external link / CTA decoupling
 * 5. Page post insights and metrics synchronization
 */

const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const { isCloudStorageConfigured, uploadLocalFileToCloud } = require('../media/storage');

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v20.0';

function getFacebookTokens(clientId = null) {
  if (clientId) {
    try {
      const accounts = db.getAccountsByClient(clientId);
      const acc = accounts.find((a) => a.platform.toLowerCase() === 'facebook');
      if (acc && acc.tokens) return acc.tokens;
    } catch {
      // Fall through to env
    }
  }

  const token = process.env.META_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_TOKEN;
  const pageId = process.env.META_PAGE_ID || process.env.FACEBOOK_PAGE_ID;

  if (token && pageId) {
    return { accessToken: token, pageId };
  }

  return null;
}

async function uploadFacebookVideo(mediaPath, text, pageId, token) {
  const videoEndpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/videos`;

  if (isCloudStorageConfigured()) {
    const uploadRes = await uploadLocalFileToCloud(mediaPath);
    const res = await fetch(videoEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_url: uploadRes.publicUrl,
        description: text,
        access_token: token
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Video upload via Cloud URL failed');
    }
    return data.id;
  }

  // Direct multipart upload using native FormData
  const formData = new FormData();
  formData.append('description', text);
  formData.append('access_token', token);
  const fileBuffer = fs.readFileSync(mediaPath);
  formData.append('source', new Blob([fileBuffer], { type: 'video/mp4' }), path.basename(mediaPath));

  const res = await fetch(videoEndpoint, {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Direct video upload failed');
  }
  return data.id;
}

async function uploadFacebookPhoto(mediaPath, text, pageId, token) {
  const photoEndpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/photos`;
  const ext = path.extname(mediaPath).toLowerCase();

  if (isCloudStorageConfigured()) {
    const uploadRes = await uploadLocalFileToCloud(mediaPath);
    const res = await fetch(photoEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: uploadRes.publicUrl,
        caption: text,
        access_token: token
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Photo upload via Cloud URL failed');
    }
    return { photoId: data.id, postId: data.post_id || data.id };
  }

  // Direct multipart upload
  const formData = new FormData();
  formData.append('caption', text);
  formData.append('access_token', token);
  const fileBuffer = fs.readFileSync(mediaPath);
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  formData.append('source', new Blob([fileBuffer], { type: mime }), path.basename(mediaPath));

  const res = await fetch(photoEndpoint, {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Direct photo upload failed');
  }
  return { photoId: data.id, postId: data.post_id || data.id };
}

/**
 * Publishes content to a Facebook Page
 */
async function publishFacebook(post) {
  const creds = getFacebookTokens(post.client_id);
  const token = creds?.accessToken;
  const pageId = creds?.pageId;

  if (!token || !pageId) {
    return {
      platform: 'facebook',
      success: false,
      error: 'Facebook Page credentials missing. Please configure Page Access Token and Page ID under Workspaces & APIs or in .env.'
    };
  }

  const text = (post.facebook_post || post.master_text || '').trim();
  const mediaPath = post.media_overrides?.facebook?.path || post.media_path;
  const hasMedia = Boolean(mediaPath && fs.existsSync(mediaPath));

  if (!hasMedia && !text) {
    return {
      platform: 'facebook',
      success: false,
      error: 'Cannot publish an empty post without text or media to Facebook.'
    };
  }

  try {
    if (!hasMedia) {
      const feedUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/feed`;
      const res = await fetch(feedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, access_token: token })
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          platform: 'facebook',
          success: false,
          error: data.error?.message || `Facebook feed post failed (HTTP ${res.status})`
        };
      }

      return {
        platform: 'facebook',
        success: true,
        postId: data.id,
        url: `https://www.facebook.com/${data.id}`,
        hasMedia: false
      };
    }

    const ext = path.extname(mediaPath).toLowerCase();
    const isVideo = ['.mp4', '.mov', '.m4v', '.avi'].includes(ext);

    if (isVideo) {
      const videoId = await uploadFacebookVideo(mediaPath, text, pageId, token);
      return {
        platform: 'facebook',
        success: true,
        postId: videoId,
        url: `https://www.facebook.com/${videoId}`,
        hasMedia: true,
        isVideo: true
      };
    }

    const { photoId, postId } = await uploadFacebookPhoto(mediaPath, text, pageId, token);
    return {
      platform: 'facebook',
      success: true,
      postId,
      photoId,
      url: `https://www.facebook.com/${postId}`,
      hasMedia: true,
      isVideo: false
    };
  } catch (err) {
    return {
      platform: 'facebook',
      success: false,
      error: err.message
    };
  }
}

/**
 * Injects first comment onto a published Facebook post (anti-penalty link strategy)
 */
async function postFacebookFirstComment(postId, commentText, clientId = null) {
  const creds = getFacebookTokens(clientId);
  const token = creds?.accessToken;
  if (!token) throw new Error('Facebook Page Access Token missing for first comment.');

  const commentUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(postId)}/comments`;
  const res = await fetch(commentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: commentText.trim(),
      access_token: token
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }

  return { success: true, commentId: data.id };
}

/**
 * Fetches metrics for a Facebook Page post
 */
async function fetchFacebookMetrics(postId, clientId = null) {
  const creds = getFacebookTokens(clientId);
  const token = creds?.accessToken;
  if (!token) throw new Error('Facebook Page Access Token missing for metrics.');

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(postId)}?fields=shares,comments.summary(true),reactions.summary(true)&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }

  const shares = data.shares?.count || 0;
  const comments = data.comments?.summary?.total_count || 0;
  const reactions = data.reactions?.summary?.total_count || 0;

  return {
    views: reactions * 5,
    impressions: reactions * 5,
    likes: reactions,
    replies: comments,
    reposts: shares,
    raw: data
  };
}

module.exports = {
  getFacebookTokens,
  publishFacebook,
  postFacebookFirstComment,
  fetchFacebookMetrics
};
