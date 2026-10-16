/**
 * Platform Compiler & Deterministic Schema Validation Gate
 * Incorporates exact 2026 enterprise mathematical constraints:
 * - UTF-8 Byte counting (YouTube 5000 bytes, < > stripping)
 * - Weighted URL calculation (X 280 chars, URLs = 23 chars)
 * - Intl.Segmenter for visible grapheme accuracy
 * - Threads single topic tag validation (no periods or ampersands)
 * - First-comment strategy detection
 */

function countGraphemes(text) {
  if (!text) return 0;
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  return [...segmenter.segment(text)].length;
}

function countUtf8Bytes(text) {
  if (!text) return 0;
  return new TextEncoder().encode(text).length;
}

function calculateWeightedXLength(text) {
  if (!text) return 0;
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlRegex) || [];
  let length = countGraphemes(text);

  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  for (const url of urls) {
    const urlGraphemes = [...segmenter.segment(url)].length;
    length = length - urlGraphemes + 23; // X counts any URL as exactly 23 weighted characters
  }
  return length;
}

function compilePost(input) {
  const baseText = (input.master_text || '').trim();
  const rawTags = (input.master_hashtags || '').trim();
  const platforms = Array.isArray(input.platforms) ? input.platforms : [];

  // --- 1. YOUTUBE VALIDATION & COMPILATION ---
  // Title: max 100 characters. Forbid < and >.
  let ytTitle = (input.youtube_title || baseText.slice(0, 70)).replace(/[<>]/g, '').trim().slice(0, 100);
  if (!ytTitle) {
    ytTitle = 'Untitled Video';
  }

  // Tags: comma-separated without '#', max 8 tags, max 500 chars total
  const ytTagArray = rawTags
    .split(/[\s,]+/)
    .map(t => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
  let ytTags = ytTagArray.join(', ').slice(0, 500);

  // Description: strictly <= 5,000 UTF-8 BYTES (Emojis count up to 4 bytes!)
  let ytDesc = baseText.replace(/[<>]/g, '').trim();
  while (countUtf8Bytes(ytDesc) > 5000) {
    ytDesc = ytDesc.slice(0, ytDesc.length - 10);
  }

  const ytPrivacy = ['unlisted', 'public', 'private'].includes(input.youtube_privacy)
    ? input.youtube_privacy
    : (process.env.YOUTUBE_DEFAULT_PRIVACY || 'unlisted');

  // --- 2. X (TWITTER) VALIDATION & COMPILATION ---
  // Weighted limit: 280 chars. URLs = 23 chars. Max 2 hashtags.
  const xRawTags = rawTags
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.startsWith('#') ? t : `#${t}`)
    .slice(0, 2)
    .join(' ');

  const xOverride = input.x_override && input.x_override.trim();
  let xBody = xOverride || baseText;
  const xTagsPart = xRawTags ? ` ${xRawTags}` : '';

  while (calculateWeightedXLength(`${xBody}${xTagsPart}`) > 280 && xBody.length > 0) {
    xBody = xBody.slice(0, xBody.length - 5).trim();
  }
  if (xBody !== (xOverride || baseText)) {
    xBody = `${xBody}...`;
  }
  const xPost = `${xBody}${xTagsPart}`.trim();

  // --- 3. LINKEDIN VALIDATION & COMPILATION ---
  // Limit: 3,000 chars. 3-5 camelCase alphanumeric hashtags.
  const liRawTags = rawTags
    .split(/[\s,]+/)
    .map(t => t.trim().replace(/^#/, ''))
    .filter(t => /^[a-zA-Z0-9]+$/.test(t))
    .slice(0, 5)
    .map(t => `#${t.charAt(0).toUpperCase()}${t.slice(1)}`)
    .join(' ');

  const liBody = (input.linkedin_override && input.linkedin_override.trim()) || baseText;
  const liTagsPart = liRawTags ? `\n\n${liRawTags}` : '';
  let liPost = `${liBody}${liTagsPart}`.trim();
  if (countGraphemes(liPost) > 3000) {
    liPost = liPost.slice(0, 2997) + '...';
  }

  // --- 4. THREADS VALIDATION & COMPILATION ---
  // Limit: 500 characters. Exactly 1 Topic Tag without '#' symbol, forbidding '.' and '&'.
  const rawTopic = rawTags
    .split(/[\s,]+/)
    .map(t => t.replace(/^#/, '').replace(/[.&]/g, '').trim())
    .find(Boolean) || '';
  const cleanTopicTag = rawTopic.slice(0, 50);

  let threadsBody = (input.threads_override && input.threads_override.trim()) || baseText;
  const threadsTagPart = cleanTopicTag ? `\n\n${cleanTopicTag}` : '';

  while (countGraphemes(`${threadsBody}${threadsTagPart}`) > 500 && threadsBody.length > 0) {
    threadsBody = threadsBody.slice(0, threadsBody.length - 5).trim();
  }
  if (threadsBody !== (input.threads_override || baseText)) {
    threadsBody = `${threadsBody}...`;
  }
  const threadsPost = `${threadsBody}${threadsTagPart}`.trim();

  // --- 5. INSTAGRAM VALIDATION & COMPILATION ---
  // Limit: 2,200 chars. 3-5 targeted hashtags.
  const igTags = rawTags
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.startsWith('#') ? t : `#${t}`)
    .slice(0, 5)
    .join(' ');
  const igBody = (input.instagram_override && input.instagram_override.trim()) || baseText;
  const igTagsPart = igTags ? `\n\n${igTags}` : '';
  let igCaption = `${igBody}${igTagsPart}`.trim();
  if (countGraphemes(igCaption) > 2200) {
    igCaption = igCaption.slice(0, 2197) + '...';
  }

  // --- 6. FACEBOOK VALIDATION & COMPILATION ---
  // Limit: 63,206 chars. 0-1 hashtag.
  const fbTag = rawTags
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.startsWith('#') ? t : `#${t}`)
    .slice(0, 1)
    .join(' ');
  const fbTagPart = fbTag ? `\n\n${fbTag}` : '';
  const fbPost = `${baseText}${fbTagPart}`.trim().slice(0, 60000);

  // --- FIRST-COMMENT LINK EXTRACTION (ALGORITHMIC PENALTY MITIGATION) ---
  const urlRegex = /https?:\/\/[^\s]+/g;
  const extractedUrls = baseText.match(urlRegex) || [];
  const firstCommentUrl = extractedUrls[0] || '';

  // --- SCHEDULE HANDLING ---
  const now = new Date();
  let scheduledAt = now.toISOString();
  let isScheduled = false;

  const rawDate = input.schedule_date;
  const rawTime = input.schedule_time;

  if (rawDate && String(rawDate).trim()) {
    let combinedStr = String(rawDate).trim();
    if (rawTime && /^\d{1,2}:\d{2}$/.test(rawTime.trim())) {
      combinedStr = `${combinedStr}T${rawTime.trim()}:00+05:30`;
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
    first_comment: firstCommentUrl,
    platforms,
    youtube_title: ytTitle,
    youtube_tags: ytTags,
    youtube_description: ytDesc,
    youtube_privacy: ytPrivacy,
    x_post: xPost,
    linkedin_post: liPost,
    threads_post: threadsPost,
    threads_topic_tag: cleanTopicTag,
    instagram_caption: igCaption,
    facebook_post: fbPost
  };
}

module.exports = {
  compilePost,
  countGraphemes,
  countUtf8Bytes,
  calculateWeightedXLength
};
