/**
 * Platform Compiler & Deterministic Algorithmic Validation Gate
 * 
 * Incorporates:
 * 1. Outbound link detection & anti-penalty decoupling (X 150x reply weights, LinkedIn dwell hooks)
 * 2. YouTube Data API v3 SimCluster category taxonomy & COPPA/Synthetic media compliance
 * 3. Instagram Reels trial testing, audio branding & error subcode gates (36004, 2207010)
 * 4. Exact grapheme segmenter, weighted URLs, and byte-level bounds
 */

const YOUTUBE_CATEGORIES = {
  '1': 'Film & Animation',
  '2': 'Autos & Vehicles',
  '10': 'Music',
  '15': 'Pets & Animals',
  '17': 'Sports',
  '20': 'Gaming',
  '22': 'People & Blogs',
  '23': 'Comedy',
  '24': 'Entertainment',
  '25': 'News & Politics',
  '26': 'Howto & Style',
  '27': 'Education',
  '28': 'Science & Technology',
  '29': 'Nonprofits & Activism'
};

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

function resolveYouTubeCategory(raw) {
  if (!raw) return { id: '28', name: YOUTUBE_CATEGORIES['28'] };
  const str = String(raw).trim();
  if (YOUTUBE_CATEGORIES[str]) {
    return { id: str, name: YOUTUBE_CATEGORIES[str] };
  }
  const foundEntry = Object.entries(YOUTUBE_CATEGORIES).find(
    ([, name]) => name.toLowerCase() === str.toLowerCase()
  );
  if (foundEntry) {
    return { id: foundEntry[0], name: foundEntry[1] };
  }
  return { id: '28', name: YOUTUBE_CATEGORIES['28'] };
}

function parseBoolean(val, fallback = false) {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase().trim();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function compilePost(input) {
  const baseText = (input.master_text || '').trim();
  const rawTags = (input.master_hashtags || '').trim();
  const platforms = Array.isArray(input.platforms) ? input.platforms : [];
  const warnings = [];

  // --- OUTBOUND LINK DETECTION & FIRST-COMMENT ANTI-PENALTY STRATEGY ---
  const urlRegex = /https?:\/\/[^\s]+/g;
  const detectedUrls = baseText.match(urlRegex) || [];
  let firstComment = (input.first_comment || '').trim();
  let hasDecoupledLinks = false;

  const autoDecouple = parseBoolean(input.auto_decouple_links, false);
  if (!firstComment && detectedUrls.length > 0) {
    if (autoDecouple) {
      firstComment = detectedUrls[0];
      hasDecoupledLinks = true;
    } else {
      warnings.push('External link detected in post copy. Moving links to the First Comment avoids an ~80% reach penalty on X and ~40% penalty on LinkedIn.');
    }
  }

  // --- 1. YOUTUBE VALIDATION & COMPILATION ---
  // Title: max 100 characters. Forbid < and >.
  let ytTitle = (input.youtube_title || baseText.slice(0, 70)).replace(/[<>]/g, '').trim().slice(0, 100);
  if (!ytTitle) {
    ytTitle = 'Untitled Video';
  }

  // Tags: comma-separated without '#', max 8 tags, max 500 chars total
  const ytTagArray = rawTags
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
  const ytTags = ytTagArray.join(', ').slice(0, 500);

  // Description: strictly <= 5,000 UTF-8 BYTES (Emojis count up to 4 bytes!)
  let ytDesc = baseText.replace(/[<>]/g, '').trim();
  while (countUtf8Bytes(ytDesc) > 5000) {
    ytDesc = ytDesc.slice(0, ytDesc.length - 10);
  }

  const ytPrivacy = ['unlisted', 'public', 'private'].includes(input.youtube_privacy)
    ? input.youtube_privacy
    : (process.env.YOUTUBE_DEFAULT_PRIVACY || 'unlisted');

  const ytCategory = resolveYouTubeCategory(input.youtube_category_id);
  const ytMadeForKids = parseBoolean(input.youtube_made_for_kids, false);
  const ytSyntheticMedia = parseBoolean(input.youtube_synthetic_media, false);
  const ytNotifySubscribers = parseBoolean(input.youtube_notify_subscribers, true);
  const ytCustomThumbPath = (input.youtube_custom_thumb_path || '').trim();

  if (ytMadeForKids) {
    warnings.push('YouTube COPPA Made for Kids is enabled: Comments, notifications, and personalized ads will be disabled.');
  }

  // --- 2. X (TWITTER) VALIDATION & COMPILATION ---
  // Limit: 280 weighted chars. URLs = 23 chars. Max 2 hashtags.
  const xRawTags = rawTags
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .slice(0, 2)
    .join(' ');

  let xBody = (input.x_override && input.x_override.trim()) || baseText;
  if (autoDecouple && detectedUrls.length > 0) {
    xBody = xBody.replace(urlRegex, '').trim();
  }

  const xTagsPart = xRawTags ? ` ${xRawTags}` : '';
  while (calculateWeightedXLength(`${xBody}${xTagsPart}`) > 280 && xBody.length > 0) {
    xBody = xBody.slice(0, xBody.length - 5).trim();
  }
  if (xBody !== (input.x_override || baseText) && !autoDecouple) {
    xBody = `${xBody}...`;
  }
  const xPost = `${xBody}${xTagsPart}`.trim();
  const xAltText = (input.x_alt_text || '').trim().slice(0, 1000);

  // --- 3. LINKEDIN VALIDATION & COMPILATION ---
  // Limit: 3,000 chars. 3-5 camelCase alphanumeric hashtags.
  const liRawTags = rawTags
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#/, ''))
    .filter((t) => /^[a-zA-Z0-9]+$/.test(t))
    .slice(0, 5)
    .map((t) => `#${t.charAt(0).toUpperCase()}${t.slice(1)}`)
    .join(' ');

  let liBody = (input.linkedin_override && input.linkedin_override.trim()) || baseText;
  if (autoDecouple && detectedUrls.length > 0) {
    liBody = liBody.replace(urlRegex, '').trim();
  }

  const liTagsPart = liRawTags ? `\n\n${liRawTags}` : '';
  let liPost = `${liBody}${liTagsPart}`.trim();
  if (countGraphemes(liPost) > 3000) {
    liPost = liPost.slice(0, 2997) + '...';
  }

  const liDisableReshare = parseBoolean(input.linkedin_disable_reshare, false);
  const liDocPath = (input.linkedin_doc_path || '').trim();

  // --- 4. THREADS VALIDATION & COMPILATION ---
  // Limit: 500 characters. Exactly 1 Topic Tag without '#' symbol, forbidding '.' and '&'.
  const rawTopic = rawTags
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, '').replace(/[.&]/g, '').trim())
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
  // Limits: 2,200 chars (error 36004), max 30 hashtags (error 2207010).
  const igTagsArray = rawTags
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));

  if (igTagsArray.length > 30) {
    warnings.push('Instagram allows maximum 30 hashtags (exceeding triggers API error 2207010). Truncating to top 30.');
  }

  const igTags = igTagsArray.slice(0, 30).join(' ');
  const igBody = (input.instagram_override && input.instagram_override.trim()) || baseText;
  const igTagsPart = igTags ? `\n\n${igTags}` : '';
  let igCaption = `${igBody}${igTagsPart}`.trim();

  if (countGraphemes(igCaption) > 2200) {
    warnings.push('Instagram caption exceeds 2,200 chars (exceeding triggers API error 36004). Truncating to limit.');
    igCaption = igCaption.slice(0, 2197) + '...';
  }

  const igAudioName = (input.instagram_audio_name || '').trim().slice(0, 100);
  const igIsTrial = parseBoolean(input.instagram_is_trial, false);

  // --- 6. FACEBOOK VALIDATION & COMPILATION ---
  // Limit: 63,206 chars. 0-1 hashtag.
  const fbTag = rawTags
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
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
      combinedStr = `${combinedStr}T${rawTime.trim()}:00`;
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
    first_comment: firstComment,
    has_decoupled_links: hasDecoupledLinks,
    warnings,
    platforms,

    // YouTube Algorithmic Fields
    youtube_title: ytTitle,
    youtube_tags: ytTags,
    youtube_description: ytDesc,
    youtube_privacy: ytPrivacy,
    youtube_category_id: ytCategory.id,
    youtube_category_name: ytCategory.name,
    youtube_made_for_kids: ytMadeForKids ? 1 : 0,
    youtube_synthetic_media: ytSyntheticMedia ? 1 : 0,
    youtube_notify_subscribers: ytNotifySubscribers ? 1 : 0,
    youtube_custom_thumb_path: ytCustomThumbPath,

    // X (Twitter) Algorithmic Fields
    x_post: xPost,
    x_alt_text: xAltText,
    x_reply_settings: 'everyone',

    // LinkedIn Algorithmic Fields
    linkedin_post: liPost,
    linkedin_disable_reshare: liDisableReshare ? 1 : 0,
    linkedin_doc_path: liDocPath,

    // Threads Algorithmic Fields
    threads_post: threadsPost,
    threads_topic_tag: cleanTopicTag,

    // Instagram Algorithmic Fields
    instagram_caption: igCaption,
    instagram_audio_name: igAudioName,
    instagram_is_trial: igIsTrial ? 1 : 0,

    // Facebook
    facebook_post: fbPost
  };
}

function getTzOffsetMs(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const p = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    parseInt(p.year, 10),
    parseInt(p.month, 10) - 1,
    parseInt(p.day, 10),
    p.hour === '24' ? 0 : parseInt(p.hour, 10),
    parseInt(p.minute, 10),
    parseInt(p.second, 10)
  );
  return asUtc - date.getTime();
}

function createUtcFromTz(year, month, day, hour, minute, second, timeZone) {
  const initialUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = getTzOffsetMs(new Date(initialUtc), timeZone);
  const correctedUtc = initialUtc - offsetMs;
  const refinedOffsetMs = getTzOffsetMs(new Date(correctedUtc), timeZone);
  return new Date(initialUtc - refinedOffsetMs);
}

function calculateNextAvailableSlot(queueRules, occupiedIsoSlots = [], targetTimezone = 'UTC', now = new Date()) {
  if (!queueRules || !queueRules.length) {
    const fallback = new Date(now.getTime() + 86400000);
    fallback.setMinutes(0, 0, 0);
    fallback.setHours(9);
    return fallback.toISOString();
  }

  for (let dayOffset = 0; dayOffset <= 28; dayOffset++) {
    const candidateDate = new Date(now.getTime() + dayOffset * 86400000);
    const tzDateStr = candidateDate.toLocaleDateString('en-CA', { timeZone: targetTimezone });
    const [tzYear, tzMonth, tzDay] = tzDateStr.split('-').map(Number);
    const tzDateObj = new Date(Date.UTC(tzYear, tzMonth - 1, tzDay));
    const dayOfWeek = tzDateObj.getUTCDay();
    const isoWeekday = dayOfWeek === 0 ? 7 : dayOfWeek; // 1 (Mon) to 7 (Sun)

    const dayRules = queueRules.filter((r) => r.iso_weekday === isoWeekday);

    for (const rule of dayRules) {
      const [hours, minutes] = rule.local_time.split(':').map(Number);
      const slotDate = createUtcFromTz(tzYear, tzMonth, tzDay, hours, minutes, 0, targetTimezone);
      const slotUtcEpoch = slotDate.getTime();

      // Must be strictly in the future (> now + 2 minutes)
      if (slotUtcEpoch > now.getTime() + 120000) {
        const slotIso = slotDate.toISOString();
        const isOccupied = occupiedIsoSlots.some((occ) => {
          const occEpoch = new Date(occ).getTime();
          return Math.abs(occEpoch - slotUtcEpoch) < 60000;
        });

        if (!isOccupied) {
          return slotIso;
        }
      }
    }
  }

  return new Date(now.getTime() + 86400000 * 28).toISOString();
}

module.exports = {
  compilePost,
  countGraphemes,
  countUtf8Bytes,
  calculateWeightedXLength,
  resolveYouTubeCategory,
  YOUTUBE_CATEGORIES,
  createUtcFromTz,
  calculateNextAvailableSlot
};
