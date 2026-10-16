/**
 * Platform Adapters Registry
 * Each adapter implements publish(post): Promise<{ platform, success, url, error }>
 * Looks up client-specific encrypted credentials in SQLite first!
 */

const db = require('../db');
const { publishYouTube } = require('./youtube');

function getClientPlatformTokens(clientId, platform) {
  if (!clientId) return null;
  try {
    const accounts = db.getAccountsByClient(clientId);
    const acc = accounts.find((a) => a.platform.toLowerCase() === platform.toLowerCase());
    return acc ? acc.tokens : null;
  } catch {
    return null;
  }
}

async function publishX(post) {
  const clientTokens = getClientPlatformTokens(post.client_id, 'x');
  const apiKey = clientTokens?.apiKey || process.env.X_API_KEY;

  if (!apiKey) {
    return {
      platform: 'x',
      success: false,
      error: 'X (Twitter) is not connected for this client. Please add API keys under Clients & Brands.'
    };
  }

  try {
    return {
      platform: 'x',
      success: true,
      text: post.x_post,
      note: 'Simulated dispatch with client credentials.'
    };
  } catch (err) {
    return {
      platform: 'x',
      success: false,
      error: err.message
    };
  }
}

async function publishLinkedIn(post) {
  const clientTokens = getClientPlatformTokens(post.client_id, 'linkedin');
  const token = clientTokens?.accessToken || process.env.LINKEDIN_ACCESS_TOKEN;

  if (!token) {
    return {
      platform: 'linkedin',
      success: false,
      error: 'LinkedIn is not connected for this client. Please add access token under Clients & Brands.'
    };
  }

  try {
    return {
      platform: 'linkedin',
      success: true,
      text: post.linkedin_post,
      note: 'Simulated dispatch with client credentials.'
    };
  } catch (err) {
    return {
      platform: 'linkedin',
      success: false,
      error: err.message
    };
  }
}

async function publishInstagram(post) {
  const clientTokens = getClientPlatformTokens(post.client_id, 'instagram');
  const token = clientTokens?.accessToken || process.env.META_ACCESS_TOKEN;
  const igAccountId = clientTokens?.accountId || process.env.INSTAGRAM_ACCOUNT_ID;

  if (!token || !igAccountId) {
    return {
      platform: 'instagram',
      success: false,
      error: 'Instagram is not connected for this client. Please add Meta Token & Account ID under Clients & Brands.'
    };
  }

  try {
    return {
      platform: 'instagram',
      success: true,
      caption: post.instagram_caption,
      note: 'Simulated dispatch with client credentials. Staging on public URL required for live Meta ingestion.'
    };
  } catch (err) {
    return {
      platform: 'instagram',
      success: false,
      error: err.message
    };
  }
}

async function publishThreads(post) {
  const clientTokens = getClientPlatformTokens(post.client_id, 'threads');
  const token = clientTokens?.accessToken || process.env.THREADS_ACCESS_TOKEN;

  if (!token) {
    return {
      platform: 'threads',
      success: false,
      error: 'Threads is not connected for this client. Please add Threads Token under Clients & Brands.'
    };
  }

  try {
    return {
      platform: 'threads',
      success: true,
      text: post.threads_post,
      note: 'Simulated dispatch with client credentials.'
    };
  } catch (err) {
    return {
      platform: 'threads',
      success: false,
      error: err.message
    };
  }
}

async function publishFacebook(post) {
  const clientTokens = getClientPlatformTokens(post.client_id, 'facebook');
  const token = clientTokens?.accessToken || process.env.META_ACCESS_TOKEN;
  const pageId = clientTokens?.pageId || process.env.META_PAGE_ID;

  if (!token || !pageId) {
    return {
      platform: 'facebook',
      success: false,
      error: 'Facebook is not connected for this client. Please add Page Access Token under Clients & Brands.'
    };
  }

  try {
    return {
      platform: 'facebook',
      success: true,
      post: post.facebook_post,
      note: 'Simulated dispatch with client credentials.'
    };
  } catch (err) {
    return {
      platform: 'facebook',
      success: false,
      error: err.message
    };
  }
}

async function dispatchPost(post) {
  const platforms = Array.isArray(post.platforms) ? post.platforms : [];
  const results = {};
  const errors = [];
  const successes = [];

  const dispatchPromises = platforms.map(async (p) => {
    const key = p.toLowerCase();
    try {
      let res;
      if (key.includes('youtube')) {
        res = await publishYouTube(post);
      } else if (key.includes('x') || key.includes('twitter')) {
        res = await publishX(post);
      } else if (key.includes('linkedin')) {
        res = await publishLinkedIn(post);
      } else if (key.includes('instagram')) {
        res = await publishInstagram(post);
      } else if (key.includes('threads')) {
        res = await publishThreads(post);
      } else if (key.includes('facebook')) {
        res = await publishFacebook(post);
      } else {
        res = { platform: p, success: false, error: `Unsupported platform: ${p}` };
      }
      return { platformKey: key, platformName: p, res };
    } catch (err) {
      return { platformKey: key, platformName: p, res: { platform: p, success: false, error: err.message } };
    }
  });

  const settled = await Promise.allSettled(dispatchPromises);

  for (const item of settled) {
    if (item.status === 'fulfilled') {
      const { platformKey, platformName, res } = item.value;
      results[platformKey] = res;
      if (res.success) {
        successes.push(platformName);
      } else {
        errors.push(`${platformName}: ${res.error}`);
      }
    } else {
      errors.push(`Unhandled rejection: ${item.reason?.message || item.reason}`);
    }
  }

  let finalStatus = 'completed';
  if (successes.length === 0 && errors.length > 0) {
    finalStatus = 'failed';
  } else if (successes.length > 0 && errors.length > 0) {
    finalStatus = 'partially_completed';
  }

  return {
    results,
    finalStatus,
    hasErrors: errors.length > 0,
    errorSummary: errors.join(' | ')
  };
}

module.exports = {
  dispatchPost,
  publishYouTube,
  publishX,
  publishLinkedIn,
  publishInstagram,
  publishThreads,
  publishFacebook,
  getClientPlatformTokens
};
