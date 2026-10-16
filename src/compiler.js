/**
 * Platform Compiler & Deterministic Schema Validation Gate
 * Enforces the exact 2026 technical constraints and algorithmic reach rules for:
 * YouTube, X (Twitter), LinkedIn, Threads, Instagram, and Facebook.
 */

function compilePost(input) {
  const baseText = (input.master_text || '').trim();
  const rawTags = (input.master_hashtags || '').trim();
  const platforms = Array.isArray(input.platforms) ? input.platforms : [];

  // --- 1. YOUTUBE VALIDATION & COMPILATION ---
  // Title: max 100 chars (optimal 50-70). Strip illegal characters (< and >).
  let ytTitle = (input.youtube_title || baseText.slice(0, 70)).replace(/[<>]/g, '').trim().slice(0, 100);
  if (!ytTitle) {
    ytTitle = 'Untitled Video';
  }

  // Tags: comma-separated without '#', max 8 tags, max 500 chars total length
  const ytTagArray = rawTags
    .split(/[\s,]+/)
    .map(t => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 8); // Max 8 tags to avoid algorithm dilution
  let ytTags = ytTagArray.join(', ').slice(0, 500);

  // Privacy: unlisted, public, or private
  const ytPrivacy = ['unlisted', 'public', 'private'].includes(input.youtube_privacy)
    ? input.youtube_privacy
    : (process.env.YOUTUBE_DEFAULT_PRIVACY || 'unlisted');

  // --- 2. X (TWITTER) VALIDATION & COMPILATION ---
  // Hard limit: 280 characters. Max 2 hashtags to avoid spam throttle.
  const xRawTags = rawTags
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.startsWith('#') ? t : `#${t}`)
    .slice(0, 2)
    .join(' ');

  const xOverride = input.x_override && input.x_override.trim();
  let xBody = xOverride || baseText;
  const xAvailable = 280 - (xRawTags ? (xRawTags.length + 1) : 0);
  if (xBody.length > xAvailable) {
    xBody = xBody.slice(0, Math.max(0, xAvailable - 3));
    const sp = xBody.lastIndexOf(' ');
    if (sp > 0) {
      xBody = xBody.slice(0, sp);
    }
    xBody = `${xBody}...`;
  }
  const xTagsPart = xRawTags ? ` ${xRawTags}` : '';
  const xPost = `${xBody}${xTagsPart}`.trim().slice(0, 280);

  // --- 3. LINKEDIN VALIDATION & COMPILATION ---
  // Hard limit: 3,000 characters. 3-5 camelCase alphanumeric hashtags.
  const liRawTags = rawTags
    .split(/[\s,]+/)
    .map(t => t.trim().replace(/^#/, ''))
    .filter(t => /^[a-zA-Z0-9]+$/.test(t))
    .slice(0, 5)
    .map(t => `#${t.charAt(0).toUpperCase()}${t.slice(1)}`)
    .join(' ');

  const liBody = (input.linkedin_override && input.linkedin_override.trim()) || baseText;
  const liTagsPart = liRawTags ? `\n\n${liRawTags}` : '';
  const liPost = `${liBody.slice(0, 2800)}${liTagsPart}`.trim().slice(0, 3000);

  // --- 4. THREADS VALIDATION & COMPILATION ---
  // Hard limit: 500 characters. Exactly 1 Topic Tag without '#' symbol (max 50 chars).
  const threadsTag = rawTags
    .split(/[\s,]+/)
    .map(t => t.replace(/^#/, '').trim())
    .find(Boolean) || '';
  const cleanTopicTag = threadsTag.slice(0, 50);
  let threadsBody = (input.threads_override && input.threads_override.trim()) || baseText;
  const threadsAvail = 500 - (cleanTopicTag ? (cleanTopicTag.length + 2) : 0);
  if (threadsBody.length > threadsAvail) {
    threadsBody = `${threadsBody.slice(0, Math.max(0, threadsAvail - 3))}...`;
  }
  const threadsTagPart = cleanTopicTag ? `\n\n${cleanTopicTag}` : '';
  const threadsPost = `${threadsBody}${threadsTagPart}`.trim().slice(0, 500);

  // --- 5. INSTAGRAM VALIDATION & COMPILATION ---
  // Hard limit: 2,200 characters. 3-5 targeted hashtags.
  const igTags = rawTags
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.startsWith('#') ? t : `#${t}`)
    .slice(0, 5)
    .join(' ');
  const igBody = (input.instagram_override && input.instagram_override.trim()) || baseText;
  const igTagsPart = igTags ? `\n\n${igTags}` : '';
  const igCaption = `${igBody.slice(0, 2000)}${igTagsPart}`.trim().slice(0, 2200);

  // --- 6. FACEBOOK VALIDATION & COMPILATION ---
  // Hard limit: 63,206 characters. 0-1 hashtag.
  const fbTag = rawTags
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.startsWith('#') ? t : `#${t}`)
    .slice(0, 1)
    .join(' ');
  const fbTagPart = fbTag ? `\n\n${fbTag}` : '';
  const fbPost = `${baseText}${fbTagPart}`.trim().slice(0, 60000);

  // --- SCHEDULE HANDLING ---
  const now = new Date();
  let scheduledAt = now.toISOString();
  let isScheduled = false;

  const rawDate = input.schedule_date;
  const rawTime = input.schedule_time;

  if (rawDate && String(rawDate).trim()) {
    let combinedStr = String(rawDate).trim();
    if (rawTime && /^\d{1,2}:\d{2}$/.test(rawTime.trim())) {
      combinedStr = `${combinedStr}T${rawTime.trim()}:00+05:30`; // Default IST offset
    }
    const parsedDate = new Date(combinedStr);
    if (!isNaN(parsedDate.getTime()) && parsedDate.getTime() > now.getTime()) {
      scheduledAt = parsedDate.toISOString();
      isScheduled = true;
    }
  }

  return {
    status: isScheduled ? 'scheduled' : 'completed',
    scheduled_at: scheduledAt,
    is_scheduled: isScheduled,
    master_text: baseText,
    master_hashtags: rawTags,
    platforms,
    youtube_title: ytTitle,
    youtube_tags: ytTags,
    youtube_privacy: ytPrivacy,
    x_post: xPost,
    linkedin_post: liPost,
    threads_post: threadsPost,
    threads_topic_tag: cleanTopicTag,
    instagram_caption: igCaption,
    facebook_post: fbPost
  };
}

module.exports = { compilePost };
