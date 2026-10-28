/**
 * Application State, DOM Registry, and Shared Utility Primitives
 */

export const state = {
  selectedPlatforms: ['youtube', 'x', 'linkedin'],
  activeClientId: 1,
  editingPostId: null,
  clients: [],
  masterMedia: { file: null, url: null, type: null },
  platformMedia: {
    youtube: { file: null, url: null, type: null, mode: 'master' },
    x: { file: null, url: null, type: null, mode: 'master' },
    linkedin: { file: null, url: null, type: null, mode: 'master' },
    instagram: { file: null, url: null, type: null, mode: 'master' },
    threads: { file: null, url: null, type: null, mode: 'master' },
    facebook: { file: null, url: null, type: null, mode: 'master' }
  },
  activeLens: 'master',
  currentPreviewTab: 'youtube',
  posts: [],
  calendar: {
    currentDate: new Date(),
    view: 'month',
    selectedPost: null
  },
  nextQueueSlotIso: null
};

export const el = {
  navTabs: document.querySelectorAll('.nav-tab'),
  tabContents: document.querySelectorAll('.tab-content'),

  composerTitle: document.getElementById('composer-mode-title'),
  editingIndicator: document.getElementById('editing-indicator'),

  masterText: document.getElementById('master_text'),
  masterHashtags: document.getElementById('master_hashtags'),
  dropzoneMaster: document.getElementById('dropzone-master'),
  fileInputMaster: document.getElementById('media-master-input'),
  previewMaster: document.getElementById('media-preview-master'),
  btnRemoveMasterMedia: document.getElementById('btn-remove-master-media'),
  platformCards: document.querySelectorAll('.platform-card'),
  timingRadios: document.querySelectorAll('input[name="timing"]'),
  scheduleInputs: document.getElementById('schedule-inputs'),
  scheduleDate: document.getElementById('schedule_date'),
  scheduleTime: document.getElementById('schedule_time'),

  lensTabs: document.querySelectorAll('.lens-tab'),
  ytTitle: document.getElementById('youtube_title'),
  ytPrivacy: document.getElementById('youtube_privacy'),
  xOverride: document.getElementById('x_override'),
  liOverride: document.getElementById('linkedin_override'),
  igOverride: document.getElementById('instagram_override'),
  threadsOverride: document.getElementById('threads_override'),
  fbOverride: document.getElementById('facebook_override'),

  btnPublishFinal: document.getElementById('btn-publish-final'),
  btnSaveDraft: document.getElementById('btn-save-draft'),

  masterCharCount: document.getElementById('master-char-count'),
  ytCharCount: document.getElementById('yt-char-count'),
  xCharCount: document.getElementById('x-char-count'),
  liCharCount: document.getElementById('li-char-count'),
  threadsCharCount: document.getElementById('threads-char-count'),

  previewTabs: document.querySelectorAll('.preview-tab'),
  previewCards: document.querySelectorAll('.preview-card'),
  ytPreviewTitle: document.getElementById('yt-preview-title'),
  ytPreviewDesc: document.getElementById('yt-preview-desc'),
  ytPreviewPlayer: document.getElementById('yt-preview-player'),
  xPreviewText: document.getElementById('x-preview-text'),
  xPreviewMedia: document.getElementById('x-preview-media'),
  liPreviewText: document.getElementById('li-preview-text'),
  liPreviewMedia: document.getElementById('li-preview-media'),
  liPreviewMediaCard: document.getElementById('li-preview-media-card'),
  threadsPreviewText: document.getElementById('threads-preview-text'),
  threadsTopicPill: document.getElementById('threads-topic-pill'),
  threadsPreviewMedia: document.getElementById('threads-preview-media'),
  igPreviewCaption: document.getElementById('ig-preview-caption'),
  igPreviewPlayer: document.getElementById('ig-preview-player'),
  fbPreviewText: document.getElementById('fb-preview-text'),
  fbPreviewMedia: document.getElementById('fb-preview-media'),

  btnRefreshQueue: document.getElementById('btn-refresh-queue'),
  postsTableBody: document.getElementById('posts-table-body')
};

export function debounce(fn, delayMs = 75) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 250);
  }, 3500);
}

export function clearElement(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

export function formatDateToIsoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatPostTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function getPlatformIconSvg(platform) {
  const p = (platform || '').toLowerCase();
  if (p.includes('youtube')) {
    return `<svg viewBox="0 0 24 24" fill="#ff0033" width="11" height="11"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
  }
  if (p.includes('x') || p.includes('twitter')) {
    return `<svg viewBox="0 0 24 24" fill="#fafafa" width="10" height="10"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
  }
  if (p.includes('linkedin')) {
    return `<svg viewBox="0 0 24 24" fill="#0a66c2" width="10" height="10"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`;
  }
  if (p.includes('instagram')) {
    return `<svg viewBox="0 0 24 24" fill="#e1306c" width="10" height="10"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`;
  }
  if (p.includes('threads')) {
    return `<svg viewBox="0 0 24 24" fill="#fafafa" width="10" height="10"><path d="M12.186 24C5.584 24 0 18.647 0 12.045 0 5.444 5.584.09 12.186.09c6.353 0 11.512 4.908 11.795 11.205h-2.906c-.267-4.697-4.14-8.39-8.889-8.39-4.938 0-9.28 4.148-9.28 9.14 0 4.992 4.342 9.14 9.28 9.14 3.79 0 7.027-2.392 8.3-5.782-1.39.734-3.003 1.173-4.73 1.173-5.27 0-8.243-3.663-8.243-7.518 0-4.04 3.197-7.464 7.644-7.464 4.544 0 7.373 3.328 7.373 7.75 0 1.077-.107 2.12-.31 3.116C21.82 19.897 17.433 24 12.186 24zm-.429-15.748c-2.73 0-4.743 2.083-4.743 4.75 0 2.563 1.908 4.75 4.743 4.75 2.502 0 4.417-1.748 4.7-4.152-.222-3.14-2.148-5.348-4.7-5.348z"/></svg>`;
  }
  if (p.includes('facebook')) {
    return `<svg viewBox="0 0 24 24" fill="#1877f2" width="10" height="10"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;
  }
  return `<span style="font-size: 8.5px; font-weight: bold;">${platform.slice(0, 2).toUpperCase()}</span>`;
}

export function createPlatformSvgElement(platform) {
  const svgStr = getPlatformIconSvg(platform);
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgStr, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  return svg ? document.importNode(svg, true) : null;
}
