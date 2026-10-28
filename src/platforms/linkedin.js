/**
 * Live Platform Adapter: LinkedIn REST Posts API & Media Engine
 * 
 * Implements:
 * 1. Automatic Author URN Discovery (/v2/userinfo and /v2/me)
 * 2. Modern LinkedIn REST API (LinkedIn-Version: 202401, X-Restli-Protocol-Version: 2.0.0)
 * 3. Registered Image & Video Binary Uploads (/rest/images & /rest/videos)
 * 4. Fallback to UGC Post API (/v2/ugcPosts) for legacy app permissions
 */

const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');

/**
 * Retrieves LinkedIn credentials for client workspace or falls back to .env
 */
function getLinkedInTokens(clientId = null) {
  if (clientId) {
    try {
      const accounts = db.getAccountsByClient(clientId);
      const acc = accounts.find((a) => a.platform.toLowerCase() === 'linkedin');
      if (acc && acc.tokens) return acc.tokens;
    } catch {
      // Fall through to env
    }
  }

  // Fallback to process.env
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN || process.env.LINKEDIN_TOKEN;
  const urn = process.env.LINKEDIN_URN || process.env.LINKEDIN_PERSON_URN || process.env.LINKEDIN_ORG_URN;

  if (accessToken) {
    return { accessToken, urn };
  }

  return null;
}

/**
 * Resolves the author URN (urn:li:person:... or urn:li:organization:...)
 * If not explicitly supplied, automatically discovers the authenticated member URN.
 */
async function resolveAuthorUrn(accessToken, explicitUrn = null) {
  if (explicitUrn && explicitUrn.trim()) {
    let cleaned = explicitUrn.trim();
    if (!cleaned.startsWith('urn:li:')) {
      cleaned = `urn:li:person:${cleaned}`;
    }
    return cleaned;
  }

  // Auto-discover via /v2/userinfo (OpenID Connect userinfo endpoint)
  try {
    const userinfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (userinfoRes.ok) {
      const info = await userinfoRes.json();
      if (info.sub) {
        return `urn:li:person:${info.sub}`;
      }
    }
  } catch (err) {
    console.error('[LinkedIn Adapter] /v2/userinfo query error:', err.message);
  }

  // Fallback to legacy /v2/me
  try {
    const meRes = await fetch('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (meRes.ok) {
      const meData = await meRes.json();
      if (meData.id) {
        return `urn:li:person:${meData.id}`;
      }
    }
  } catch (err) {
    console.error('[LinkedIn Adapter] /v2/me discovery error:', err.message);
  }

  throw new Error('Could not resolve LinkedIn Author URN. Please enter your Author URN (e.g. urn:li:person:... or urn:li:organization:...) under Workspaces & APIs.');
}

/**
 * Uploads image or video to LinkedIn via REST asset protocol
 */
async function uploadMediaToLinkedIn(filePath, authorUrn, accessToken) {
  const ext = path.extname(filePath).toLowerCase();
  const isVideo = ['.mp4', '.mov', '.m4v'].includes(ext);
  const isPdf = ext === '.pdf';
  const fileStats = fs.statSync(filePath);

  let mimeType = 'image/jpeg';
  if (ext === '.png') mimeType = 'image/png';
  if (ext === '.gif') mimeType = 'image/gif';
  if (ext === '.webp') mimeType = 'image/webp';
  if (isVideo) mimeType = 'video/mp4';
  if (isPdf) mimeType = 'application/pdf';

  const fileBlob = await fs.openAsBlob(filePath, { type: mimeType });

  const baseHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'LinkedIn-Version': '202401',
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json'
  };

  if (isPdf) {
    // --- 1. DOCUMENT (SWIPEABLE PDF CAROUSEL) INITIALIZE UPLOAD ---
    const initRes = await fetch('https://api.linkedin.com/rest/documents?action=initializeUpload', {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn
        }
      })
    });

    if (!initRes.ok) {
      const err = await initRes.text();
      throw new Error(`LinkedIn Document initializeUpload failed (${initRes.status}): ${err}`);
    }

    const initData = await initRes.json();
    const uploadUrl = initData.value?.uploadUrl;
    const documentUrn = initData.value?.document;

    if (!uploadUrl || !documentUrn) {
      throw new Error('LinkedIn Document initializeUpload missing uploadUrl or document URN.');
    }

    // --- 2. STREAMING BINARY PUT UPLOAD FOR DOCUMENT ---
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/pdf'
      },
      body: fileBlob
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`LinkedIn Document PUT upload failed (${putRes.status}): ${err}`);
    }

    return { mediaUrn: documentUrn, isDocument: true, isVideo: false };
  } else if (!isVideo) {
    // --- 1. IMAGE INITIALIZE UPLOAD ---
    const initRes = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn
        }
      })
    });

    if (!initRes.ok) {
      const err = await initRes.text();
      throw new Error(`LinkedIn Image initializeUpload failed (${initRes.status}): ${err}`);
    }

    const initData = await initRes.json();
    const uploadUrl = initData.value?.uploadUrl;
    const imageUrn = initData.value?.image;

    if (!uploadUrl || !imageUrn) {
      throw new Error('LinkedIn Image initializeUpload response did not contain uploadUrl or image URN.');
    }

    // --- 2. STREAMING BINARY PUT UPLOAD ---
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType
      },
      body: fileBlob
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`LinkedIn Image PUT binary upload failed (${putRes.status}): ${err}`);
    }

    return { mediaUrn: imageUrn, isVideo: false };
  } else {
    // --- 1. VIDEO INITIALIZE UPLOAD ---
    const initRes = await fetch('https://api.linkedin.com/rest/videos?action=initializeUpload', {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
          fileSizeBytes: fileStats.size,
          uploadCaptions: false,
          uploadThumbnail: false
        }
      })
    });

    if (!initRes.ok) {
      const err = await initRes.text();
      throw new Error(`LinkedIn Video initializeUpload failed (${initRes.status}): ${err}`);
    }

    const initData = await initRes.json();
    const uploadInstructions = initData.value?.uploadInstructions || [];
    const videoUrn = initData.value?.video;

    if (!uploadInstructions.length || !videoUrn) {
      throw new Error('LinkedIn Video initializeUpload missing uploadInstructions or video URN.');
    }

    // --- 2. STREAMING BINARY PUT UPLOAD FOR VIDEO ---
    const uploadUrl = uploadInstructions[0].uploadUrl;
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType
      },
      body: fileBlob
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`LinkedIn Video PUT binary upload failed (${putRes.status}): ${err}`);
    }

    return { mediaUrn: videoUrn, isVideo: true };
  }
}

/**
 * Publishes a post to LinkedIn via modern REST API with UGC fallback
 */
async function publishLinkedIn(post) {
  const creds = getLinkedInTokens(post.client_id);

  if (!creds || !creds.accessToken) {
    return {
      platform: 'linkedin',
      success: false,
      error: 'LinkedIn access token missing. Please add OAuth Access Token under Workspaces & APIs.'
    };
  }

  const accessToken = creds.accessToken;
  const commentary = (post.linkedin_post || post.master_text || '').trim();

  if (!commentary) {
    return {
      platform: 'linkedin',
      success: false,
      error: 'Cannot publish an empty post to LinkedIn.'
    };
  }

  let authorUrn;
  try {
    authorUrn = await resolveAuthorUrn(accessToken, creds.urn);
  } catch (urnErr) {
    return {
      platform: 'linkedin',
      success: false,
      error: urnErr.message
    };
  }

  // Resolve media: check platform overrides or dedicated doc first
  const docPath = post.linkedin_doc_path;
  const mediaPath = (docPath && fs.existsSync(docPath))
    ? docPath
    : (post.media_overrides?.linkedin?.path || post.media_path);
  let mediaInfo = null;

  if (mediaPath && fs.existsSync(mediaPath)) {
    try {
      mediaInfo = await uploadMediaToLinkedIn(mediaPath, authorUrn, accessToken);
    } catch (mediaErr) {
      return {
        platform: 'linkedin',
        success: false,
        error: `LinkedIn media upload failed: ${mediaErr.message}`
      };
    }
  }

  // Construct Modern REST Posts Payload with Comment Velocity Trigger
  const restPayload = {
    author: authorUrn,
    commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: Boolean(post.linkedin_disable_reshare)
  };

  if (mediaInfo) {
    restPayload.content = {
      media: {
        id: mediaInfo.mediaUrn,
        title: post.youtube_title || 'Update'
      }
    };
  }

  // Try 1: Modern REST Posts API (LinkedIn-Version: 202401)
  try {
    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(restPayload)
    });

    if (res.status === 201) {
      const postUrn = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || '';
      const updateUrl = postUrn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/` : 'https://www.linkedin.com/feed/';
      return {
        platform: 'linkedin',
        success: true,
        postUrn,
        url: updateUrl,
        author: authorUrn
      };
    }

    // If REST API fails with 400/403/404, capture body and attempt UGC fallback if applicable
    const errText = await res.text();
    console.error(`[LinkedIn Adapter] REST Posts API failed (${res.status}): ${errText}. Attempting UGC fallback...`);

    // Try 2: Legacy /v2/ugcPosts fallback
    const ugcPayload = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: commentary },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    };

    const ugcRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ugcPayload)
    });

    if (ugcRes.ok) {
      const ugcData = await ugcRes.json();
      const postUrn = ugcData.id;
      return {
        platform: 'linkedin',
        success: true,
        postUrn,
        url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`,
        note: 'Published via UGC Post compatibility gateway.'
      };
    }

    const ugcErr = await ugcRes.text();
    return {
      platform: 'linkedin',
      success: false,
      error: `LinkedIn dispatch failed. REST: ${errText} | UGC: ${ugcErr}`
    };
  } catch (networkErr) {
    return {
      platform: 'linkedin',
      success: false,
      error: `LinkedIn Network Error: ${networkErr.message}`
    };
  }
}

async function postLinkedInFirstComment(postUrn, commentText, clientId = null) {
  const creds = getLinkedInTokens(clientId);
  if (!creds || !creds.accessToken) {
    throw new Error('LinkedIn credentials missing for first comment.');
  }

  const authorUrn = await resolveAuthorUrn(creds.accessToken, creds.urn);
  const commentsUrl = `https://api.linkedin.com/rest/posts/${encodeURIComponent(postUrn)}/comments`;

  const res = await fetch(commentsUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'LinkedIn-Version': '202401',
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      actor: authorUrn,
      message: {
        text: commentText.trim()
      }
    })
  });

  if (res.status === 201 || res.ok) {
    const commentUrn = res.headers.get('x-restli-id') || '';
    return { success: true, commentUrn };
  }

  const err = await res.text();
  throw new Error(`LinkedIn first comment failed: ${err}`);
}

module.exports = {
  publishLinkedIn,
  uploadMediaToLinkedIn,
  resolveAuthorUrn,
  getLinkedInTokens,
  postLinkedInFirstComment
};
