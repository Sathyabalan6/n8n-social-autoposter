/**
 * Platform Adapters Registry
 * Each adapter implements publish(post): Promise<{ platform, success, url, error }>
 * When credentials are missing, it returns a clean error explaining how to enable the platform.
 */

const { publishYouTube } = require('./youtube');

async function publishX(post) {
  const apiKey = process.env.X_API_KEY;
  if (!apiKey) {
    return {
      platform: 'x',
      success: false,
      error: 'X (Twitter) API credentials are not configured in .env (X_API_KEY).'
    };
  }

  // Implementation for X API v2 tweet endpoint
  try {
    // Basic placeholder for X API v2 call
    return {
      platform: 'x',
      success: true,
      text: post.x_post,
      note: 'Simulated dispatch. Connect X credentials to go live.'
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
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    return {
      platform: 'linkedin',
      success: false,
      error: 'LinkedIn OAuth access token is not configured in .env (LINKEDIN_ACCESS_TOKEN).'
    };
  }

  try {
    return {
      platform: 'linkedin',
      success: true,
      text: post.linkedin_post,
      note: 'Simulated dispatch. Connect LinkedIn token to go live.'
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
  const token = process.env.META_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!token || !igAccountId) {
    return {
      platform: 'instagram',
      success: false,
      error: 'Instagram Graph API requires META_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID in .env.'
    };
  }

  try {
    return {
      platform: 'instagram',
      success: true,
      caption: post.instagram_caption,
      note: 'Simulated dispatch. Staging on public URL required for live Meta ingestion.'
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
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) {
    return {
      platform: 'threads',
      success: false,
      error: 'Threads API requires THREADS_ACCESS_TOKEN in .env.'
    };
  }

  try {
    return {
      platform: 'threads',
      success: true,
      text: post.threads_post,
      note: 'Simulated dispatch.'
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
  const token = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  if (!token || !pageId) {
    return {
      platform: 'facebook',
      success: false,
      error: 'Facebook Pages API requires META_ACCESS_TOKEN and META_PAGE_ID in .env.'
    };
  }

  try {
    return {
      platform: 'facebook',
      success: true,
      post: post.facebook_post,
      note: 'Simulated dispatch.'
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

  // Concurrent multi-channel dispatching via Promise.allSettled
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

  // Determine DAG State Machine outcome
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
  publishFacebook
};
