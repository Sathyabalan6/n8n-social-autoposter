/**
 * Real-Time Feed Mockup Preview Engine & Dynamic Grapheme Counter
 * Features:
 * - 75ms debounce on live text updates to eliminate layout thrashing
 * - Platform-specific media embedding (16:9 player, X card, LinkedIn feed, IG/Threads, FB)
 * - Dynamic warning thresholds for social network character limits
 */

import { state, el, debounce, clearElement } from './state.js';

export function switchPreviewCard(platform) {
  state.currentPreviewTab = platform;

  el.previewTabs.forEach((t) => {
    t.classList.toggle('active', t.getAttribute('data-preview') === platform);
  });

  el.previewCards.forEach((c) => {
    c.style.display = 'none';
  });

  const targetCard = document.getElementById(`card-${platform}`);
  if (targetCard) {
    targetCard.style.display = 'block';
  }
}

export function getEffectiveMedia(platform) {
  const custom = state.platformMedia[platform];
  const mode = custom ? custom.mode : 'master';

  if (mode === 'none') {
    return { file: null, url: null, type: null };
  }
  if (mode === 'custom') {
    if (custom && custom.url) return custom;
    return { file: null, url: null, type: null };
  }
  return state.masterMedia;
}

export function renderPreviewMedia(platform) {
  const media = getEffectiveMedia(platform);

  if (platform === 'youtube') {
    clearElement(el.ytPreviewPlayer);
    const desktopPlayer = document.querySelector('.yt-desktop-player');
    if (media.url && media.type === 'video') {
      if (desktopPlayer) desktopPlayer.classList.add('has-video');
      const v = document.createElement('video');
      v.src = media.url;
      v.controls = true;
      v.style.width = '100%';
      v.style.height = '100%';
      v.style.objectFit = 'cover';
      el.ytPreviewPlayer.appendChild(v);
    } else if (media.url) {
      if (desktopPlayer) desktopPlayer.classList.remove('has-video');
      const img = document.createElement('img');
      img.src = media.url;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      el.ytPreviewPlayer.appendChild(img);
    } else {
      if (desktopPlayer) desktopPlayer.classList.remove('has-video');
      const s = document.createElement('span');
      s.textContent = '16:9 Video Canvas';
      el.ytPreviewPlayer.appendChild(s);
    }
  } else if (platform === 'x') {
    clearElement(el.xPreviewMedia);
    if (media.url) {
      el.xPreviewMedia.style.display = 'block';
      const elMedia = media.type === 'video' ? document.createElement('video') : document.createElement('img');
      elMedia.src = media.url;
      if (media.type === 'video') elMedia.controls = true;
      el.xPreviewMedia.appendChild(elMedia);
    } else {
      el.xPreviewMedia.style.display = 'none';
    }
  } else if (platform === 'linkedin') {
    clearElement(el.liPreviewMedia);
    if (media.url) {
      if (el.liPreviewMediaCard) el.liPreviewMediaCard.style.display = 'block';
      const elMedia = media.type === 'video' ? document.createElement('video') : document.createElement('img');
      elMedia.src = media.url;
      if (media.type === 'video') elMedia.controls = true;
      el.liPreviewMedia.appendChild(elMedia);
    } else {
      if (el.liPreviewMediaCard) el.liPreviewMediaCard.style.display = 'none';
    }
  } else if (platform === 'instagram') {
    clearElement(el.igPreviewPlayer);
    if (media.url) {
      const elMedia = media.type === 'video' ? document.createElement('video') : document.createElement('img');
      elMedia.src = media.url;
      if (media.type === 'video') elMedia.controls = true;
      el.igPreviewPlayer.appendChild(elMedia);
    } else {
      const s = document.createElement('span');
      s.textContent = '4:5 Media Canvas';
      el.igPreviewPlayer.appendChild(s);
    }
  } else if (platform === 'threads') {
    clearElement(el.threadsPreviewMedia);
    if (media.url) {
      el.threadsPreviewMedia.style.display = 'block';
      const elMedia = media.type === 'video' ? document.createElement('video') : document.createElement('img');
      elMedia.src = media.url;
      if (media.type === 'video') elMedia.controls = true;
      el.threadsPreviewMedia.appendChild(elMedia);
    } else {
      el.threadsPreviewMedia.style.display = 'none';
    }
  } else if (platform === 'facebook') {
    clearElement(el.fbPreviewMedia);
    if (media.url) {
      el.fbPreviewMedia.style.display = 'block';
      const elMedia = media.type === 'video' ? document.createElement('video') : document.createElement('img');
      elMedia.src = media.url;
      if (media.type === 'video') elMedia.controls = true;
      el.fbPreviewMedia.appendChild(elMedia);
    } else {
      el.fbPreviewMedia.style.display = 'none';
    }
  }
}

export function renderAllPreviewMedia() {
  ['youtube', 'x', 'linkedin', 'instagram', 'threads', 'facebook'].forEach(renderPreviewMedia);
}

export function updateLivePreviews() {
  if (!el.masterText) return;
  const master = el.masterText.value.trim();
  const rawTags = (el.masterHashtags?.value || '').trim();

  if (el.masterCharCount) {
    el.masterCharCount.textContent = `${master.length} chars`;
  }

  // 1. YouTube
  if (el.ytTitle && el.ytPreviewTitle && el.ytCharCount && el.ytPreviewDesc) {
    const ytTitle = el.ytTitle.value.trim() || master.slice(0, 70) || 'Untitled Video';
    el.ytPreviewTitle.textContent = ytTitle;
    el.ytCharCount.textContent = `${ytTitle.length}/100`;
    el.ytCharCount.className = `char-count ${ytTitle.length > 90 ? 'warning' : ''}`;
    el.ytPreviewDesc.textContent = master ? `${master}\n\n${rawTags}` : 'Description preview...';
  }

  // 2. X
  if (el.xPreviewText && el.xCharCount) {
    const xOverride = el.xOverride?.value.trim() || '';
    const xTags = rawTags.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    const xText = xOverride || (master ? `${master} ${xTags}`.trim() : 'Post text will render here...');
    el.xPreviewText.textContent = xText;
    el.xCharCount.textContent = `${xText.length}/280`;
    el.xCharCount.className = `char-count ${xText.length > 280 ? 'danger' : (xText.length > 250 ? 'warning' : '')}`;
  }

  // 3. LinkedIn
  if (el.liPreviewText && el.liCharCount) {
    const liOverride = el.liOverride?.value.trim() || '';
    const liTags = rawTags.split(/[\s,]+/).filter(Boolean).slice(0, 5).map((t) => `#${t.replace(/^#/, '')}`).join(' ');
    const liText = liOverride || (master ? `${master}\n\n${liTags}` : 'Post narrative will render here...');
    el.liPreviewText.textContent = liText;
    el.liCharCount.textContent = `${liText.length}/3000`;
  }

  // 4. Instagram
  if (el.igPreviewCaption) {
    const igOverride = el.igOverride?.value.trim() || '';
    const igCaption = igOverride || (master ? `${master}\n\n${rawTags}` : 'Caption preview...');
    el.igPreviewCaption.textContent = igCaption;
  }

  // 5. Threads
  if (el.threadsPreviewText) {
    const threadsOverride = el.threadsOverride?.value.trim() || '';
    const threadsText = threadsOverride || master || 'Threads post preview...';
    el.threadsPreviewText.textContent = threadsText;
    if (el.threadsCharCount) el.threadsCharCount.textContent = `${threadsText.length}/500`;
    const topicTag = rawTags.split(/[\s,]+/).find(Boolean) || '';
    if (el.threadsTopicPill) {
      el.threadsTopicPill.textContent = topicTag ? topicTag.replace(/^[#.&]+/, '') : 'topic';
    }
  }

  // 6. Facebook
  if (el.fbPreviewText) {
    const fbOverride = el.fbOverride ? el.fbOverride.value.trim() : '';
    el.fbPreviewText.textContent = fbOverride || master || 'Facebook post preview...';
  }
}

export const debouncedUpdateLivePreviews = debounce(updateLivePreviews, 75);

export function setupLiveSync() {
  const inputs = [
    el.masterText, el.masterHashtags, el.ytTitle,
    el.xOverride, el.liOverride, el.igOverride, el.threadsOverride, el.fbOverride
  ];

  inputs.forEach((input) => {
    if (input) input.addEventListener('input', debouncedUpdateLivePreviews);
  });
}
