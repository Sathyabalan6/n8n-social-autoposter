// --- STATE MANAGEMENT ---
const state = {
  selectedPlatforms: ['youtube', 'x', 'linkedin'],
  masterMedia: { file: null, url: null, type: null },
  platformMedia: {
    youtube: { file: null, url: null, type: null, custom: false },
    x: { file: null, url: null, type: null, custom: false },
    linkedin: { file: null, url: null, type: null, custom: false },
    instagram: { file: null, url: null, type: null, custom: false },
    threads: { file: null, url: null, type: null, custom: false },
    facebook: { file: null, url: null, type: null, custom: false }
  },
  currentStep: 1,
  activeStudioPlatform: 'youtube',
  currentPreviewTab: 'youtube'
};

const PLATFORMS_META = {
  youtube: { name: 'YouTube', icon: '🔴', panelId: 'panel-youtube' },
  x: { name: 'X (Twitter)', icon: '🐦', panelId: 'panel-x' },
  linkedin: { name: 'LinkedIn', icon: '💼', panelId: 'panel-linkedin' },
  instagram: { name: 'Instagram', icon: '📸', panelId: 'panel-instagram' },
  threads: { name: 'Threads', icon: '🧵', panelId: 'panel-threads' },
  facebook: { name: 'Facebook', icon: '📘', panelId: 'panel-facebook' }
};

// --- DOM ELEMENTS ---
const el = {
  // Tabs
  navTabs: document.querySelectorAll('.nav-tab'),
  tabContents: document.querySelectorAll('.tab-content'),

  // Wizard Steps
  step1: document.getElementById('step-1'),
  step2: document.getElementById('step-2'),
  step3: document.getElementById('step-3'),

  // Step 1 Inputs
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
  btnGotoStep2: document.getElementById('btn-goto-step-2'),

  // Step 2 Studio Controls
  studioNavBar: document.getElementById('studio-nav-bar'),
  ytTitle: document.getElementById('youtube_title'),
  ytPrivacy: document.getElementById('youtube_privacy'),
  xOverride: document.getElementById('x_override'),
  liOverride: document.getElementById('linkedin_override'),
  igOverride: document.getElementById('instagram_override'),
  threadsOverride: document.getElementById('threads_override'),
  fbOverride: document.getElementById('facebook_override'),
  btnBacktoStep1: document.getElementById('btn-backto-step-1'),
  btnGotoStep3: document.getElementById('btn-goto-step-3'),

  // Step 3
  sumChannels: document.getElementById('sum-channels'),
  sumTiming: document.getElementById('sum-timing'),
  sumMedia: document.getElementById('sum-media'),
  approvalCheckbox: document.getElementById('approval-checkbox'),
  btnBacktoStep2: document.getElementById('btn-backto-step-2'),
  btnPublishFinal: document.getElementById('btn-publish-final'),

  // Char Counts
  masterCharCount: document.getElementById('master-char-count'),
  ytCharCount: document.getElementById('yt-char-count'),
  xCharCount: document.getElementById('x-char-count'),
  liCharCount: document.getElementById('li-char-count'),

  // Previews
  previewTabs: document.querySelectorAll('.preview-tab'),
  previewCards: document.querySelectorAll('.preview-card'),
  ytPreviewTitle: document.getElementById('yt-preview-title'),
  ytPreviewDesc: document.getElementById('yt-preview-desc'),
  ytPreviewPlayer: document.getElementById('yt-preview-player'),
  xPreviewText: document.getElementById('x-preview-text'),
  xPreviewMedia: document.getElementById('x-preview-media'),
  liPreviewText: document.getElementById('li-preview-text'),
  liPreviewMedia: document.getElementById('li-preview-media'),
  threadsPreviewText: document.getElementById('threads-preview-text'),
  threadsTopicPill: document.getElementById('threads-topic-pill'),
  threadsPreviewMedia: document.getElementById('threads-preview-media'),
  igPreviewCaption: document.getElementById('ig-preview-caption'),
  igPreviewPlayer: document.getElementById('ig-preview-player'),
  fbPreviewText: document.getElementById('fb-preview-text'),
  fbPreviewMedia: document.getElementById('fb-preview-media'),

  // Queue Tab
  btnRefreshQueue: document.getElementById('btn-refresh-queue'),
  postsTableBody: document.getElementById('posts-table-body'),

  // Status & Auth
  dotYouTube: document.getElementById('dot-youtube'),
  ytAuthStatus: document.getElementById('yt-auth-status')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupMasterMediaUpload();
  setupPlatformCustomMedia();
  setupLiveSync();
  setupWizardNavigation();
  fetchStatus();
  fetchQueue();
});

// --- NAVIGATION TABS ---
function setupNavigation() {
  el.navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      el.navTabs.forEach((t) => t.classList.remove('active'));
      el.tabContents.forEach((tc) => {
        tc.style.display = 'none';
      });

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      document.getElementById(targetId).style.display = 'block';

      if (targetId === 'tab-queue') fetchQueue();
      if (targetId === 'tab-settings') fetchStatus();
    });
  });

  // Preview Tabs click
  el.previewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchPreviewCard(tab.getAttribute('data-preview'));
    });
  });

  // Timing Radios
  el.timingRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.value === 'scheduled') {
        el.scheduleInputs.style.display = 'flex';
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        el.scheduleDate.value = tomorrow.toISOString().split('T')[0];
      } else {
        el.scheduleInputs.style.display = 'none';
      }
      updateReviewSummary();
    });
  });

  // Step 1 Platform Checklist Cards
  el.platformCards.forEach((card) => {
    card.addEventListener('click', () => {
      const p = card.getAttribute('data-platform');
      card.classList.toggle('selected');
      if (card.classList.contains('selected')) {
        if (!state.selectedPlatforms.includes(p)) state.selectedPlatforms.push(p);
      } else {
        state.selectedPlatforms = state.selectedPlatforms.filter((x) => x !== p);
      }
      updateReviewSummary();
    });
  });
}

function switchPreviewCard(platform) {
  state.currentPreviewTab = platform;
  el.previewTabs.forEach((t) => {
    t.classList.toggle('active', t.getAttribute('data-preview') === platform);
  });
  el.previewCards.forEach((c) => {
    c.style.display = 'none';
  });
  const targetCard = document.getElementById(`card-${platform}`);
  if (targetCard) targetCard.style.display = 'block';
  renderPreviewMedia(platform);
}

// --- MASTER MEDIA UPLOAD ---
function setupMasterMediaUpload() {
  el.dropzoneMaster.addEventListener('click', () => el.fileInputMaster.click());

  ['dragenter', 'dragover'].forEach((name) => {
    el.dropzoneMaster.addEventListener(name, (e) => {
      e.preventDefault();
      el.dropzoneMaster.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((name) => {
    el.dropzoneMaster.addEventListener(name, (e) => {
      e.preventDefault();
      el.dropzoneMaster.classList.remove('dragover');
    });
  });

  el.dropzoneMaster.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleMasterFile(file);
  });

  el.fileInputMaster.addEventListener('change', () => {
    const file = el.fileInputMaster.files[0];
    if (file) handleMasterFile(file);
  });

  el.btnRemoveMasterMedia.addEventListener('click', (e) => {
    e.stopPropagation();
    state.masterMedia = { file: null, url: null, type: null };
    clearElement(el.previewMaster);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-media';
    removeBtn.textContent = '✕ Remove';
    removeBtn.addEventListener('click', () => el.btnRemoveMasterMedia.click());
    el.previewMaster.appendChild(removeBtn);

    el.previewMaster.style.display = 'none';
    el.dropzoneMaster.style.display = 'block';

    renderAllPreviewMedia();
    updateReviewSummary();
  });
}

function handleMasterFile(file) {
  state.masterMedia.file = file;
  state.masterMedia.type = file.type.startsWith('video') ? 'video' : 'image';
  state.masterMedia.url = URL.createObjectURL(file);

  el.dropzoneMaster.style.display = 'none';
  el.previewMaster.style.display = 'flex';
  clearElement(el.previewMaster);

  if (state.masterMedia.type === 'video') {
    const vid = document.createElement('video');
    vid.src = state.masterMedia.url;
    vid.controls = true;
    el.previewMaster.appendChild(vid);
  } else {
    const img = document.createElement('img');
    img.src = state.masterMedia.url;
    img.alt = 'Master media preview';
    el.previewMaster.appendChild(img);
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove-media';
  removeBtn.textContent = '✕ Remove';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.btnRemoveMasterMedia.click();
  });
  el.previewMaster.appendChild(removeBtn);

  renderAllPreviewMedia();
  updateReviewSummary();
}

// --- PLATFORM CUSTOM MEDIA HANDLERS ---
function setupPlatformCustomMedia() {
  const platforms = ['youtube', 'x', 'linkedin', 'instagram', 'threads', 'facebook'];

  platforms.forEach((p) => {
    // Radio toggle
    const radios = document.querySelectorAll(`input[name="media_source_${p}"]`);
    const customBox = document.getElementById(`custom-media-box-${p}`);
    const dropzone = document.getElementById(`dropzone-${p}`);
    const fileInput = document.getElementById(`media-${p}-input`);
    const previewContainer = document.getElementById(`media-preview-${p}`);
    const removeBtn = document.getElementById(`btn-remove-${p}-media`);

    if (!radios.length) return;

    radios.forEach((r) => {
      r.addEventListener('change', () => {
        if (r.value === 'custom') {
          customBox.style.display = 'block';
          state.platformMedia[p].custom = true;
        } else {
          customBox.style.display = 'none';
          state.platformMedia[p].custom = false;
        }
        renderPreviewMedia(p);
      });
    });

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file) {
          state.platformMedia[p].file = file;
          state.platformMedia[p].type = file.type.startsWith('video') ? 'video' : 'image';
          state.platformMedia[p].url = URL.createObjectURL(file);

          dropzone.style.display = 'none';
          previewContainer.style.display = 'flex';
          clearElement(previewContainer);

          if (state.platformMedia[p].type === 'video') {
            const v = document.createElement('video');
            v.src = state.platformMedia[p].url;
            v.controls = true;
            previewContainer.appendChild(v);
          } else {
            const im = document.createElement('img');
            im.src = state.platformMedia[p].url;
            im.alt = `${p} custom media`;
            previewContainer.appendChild(im);
          }

          const rem = document.createElement('button');
          rem.className = 'btn-remove-media';
          rem.textContent = '✕ Remove';
          rem.addEventListener('click', (ev) => {
            ev.stopPropagation();
            removeBtn.click();
          });
          previewContainer.appendChild(rem);

          renderPreviewMedia(p);
          updateReviewSummary();
        }
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.platformMedia[p].file = null;
        state.platformMedia[p].url = null;
        state.platformMedia[p].type = null;

        clearElement(previewContainer);
        const rem = document.createElement('button');
        rem.className = 'btn-remove-media';
        rem.textContent = '✕ Remove';
        rem.addEventListener('click', () => removeBtn.click());
        previewContainer.appendChild(rem);

        previewContainer.style.display = 'none';
        dropzone.style.display = 'block';
        renderPreviewMedia(p);
        updateReviewSummary();
      });
    }
  });
}

// Get the active media object for a platform (Custom overrides Master)
function getEffectiveMedia(platform) {
  const custom = state.platformMedia[platform];
  if (custom && custom.custom && custom.url) {
    return custom;
  }
  return state.masterMedia;
}

// Render media inside social cards
function renderPreviewMedia(platform) {
  const media = getEffectiveMedia(platform);

  if (platform === 'youtube') {
    clearElement(el.ytPreviewPlayer);
    if (media.url && media.type === 'video') {
      const v = document.createElement('video');
      v.src = media.url;
      v.controls = true;
      v.style.width = '100%';
      v.style.height = '100%';
      v.style.objectFit = 'cover';
      el.ytPreviewPlayer.appendChild(v);
    } else if (media.url) {
      const img = document.createElement('img');
      img.src = media.url;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      el.ytPreviewPlayer.appendChild(img);
    } else {
      const s = document.createElement('span');
      s.textContent = '▶ Video Preview';
      el.ytPreviewPlayer.appendChild(s);
    }
  } else if (platform === 'x') {
    clearElement(el.xPreviewMedia);
    if (media.url) {
      el.xPreviewMedia.style.display = 'block';
      const elMedia = media.type === 'video' ? document.createElement('video') : document.createElement('img');
      elMedia.src = media.url;
      if (media.type === 'video') elMedia.controls = true;
      elMedia.style.width = '100%';
      elMedia.style.maxHeight = '250px';
      elMedia.style.objectFit = 'cover';
      el.xPreviewMedia.appendChild(elMedia);
    } else {
      el.xPreviewMedia.style.display = 'none';
    }
  } else if (platform === 'linkedin') {
    clearElement(el.liPreviewMedia);
    if (media.url) {
      el.liPreviewMedia.style.display = 'block';
      const elMedia = media.type === 'video' ? document.createElement('video') : document.createElement('img');
      elMedia.src = media.url;
      if (media.type === 'video') elMedia.controls = true;
      elMedia.style.width = '100%';
      elMedia.style.maxHeight = '250px';
      elMedia.style.objectFit = 'cover';
      el.liPreviewMedia.appendChild(elMedia);
    } else {
      el.liPreviewMedia.style.display = 'none';
    }
  } else if (platform === 'instagram') {
    clearElement(el.igPreviewPlayer);
    if (media.url) {
      const elMedia = media.type === 'video' ? document.createElement('video') : document.createElement('img');
      elMedia.src = media.url;
      if (media.type === 'video') elMedia.controls = true;
      elMedia.style.width = '100%';
      elMedia.style.height = '100%';
      elMedia.style.objectFit = 'cover';
      el.igPreviewPlayer.appendChild(elMedia);
    } else {
      const s = document.createElement('span');
      s.textContent = 'Photo / Reel Preview';
      el.igPreviewPlayer.appendChild(s);
    }
  } else if (platform === 'threads') {
    clearElement(el.threadsPreviewMedia);
    if (media.url) {
      el.threadsPreviewMedia.style.display = 'block';
      const elMedia = media.type === 'video' ? document.createElement('video') : document.createElement('img');
      elMedia.src = media.url;
      if (media.type === 'video') elMedia.controls = true;
      elMedia.style.width = '100%';
      elMedia.style.maxHeight = '220px';
      elMedia.style.objectFit = 'cover';
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
      elMedia.style.width = '100%';
      elMedia.style.maxHeight = '220px';
      elMedia.style.objectFit = 'cover';
      el.fbPreviewMedia.appendChild(elMedia);
    } else {
      el.fbPreviewMedia.style.display = 'none';
    }
  }
}

function renderAllPreviewMedia() {
  ['youtube', 'x', 'linkedin', 'instagram', 'threads', 'facebook'].forEach(renderPreviewMedia);
}

// --- DYNAMIC STEP 2 STUDIO TABS ---
function buildStudioNavBar() {
  clearElement(el.studioNavBar);

  const activePlatforms = state.selectedPlatforms.filter((p) => PLATFORMS_META[p]);
  if (!activePlatforms.length) {
    const notice = document.createElement('div');
    notice.style.padding = '8px 12px';
    notice.style.color = 'var(--warning)';
    notice.textContent = 'No channels selected. Please select at least one channel in Step 1.';
    el.studioNavBar.appendChild(notice);
    return;
  }

  // Ensure activeStudioPlatform is among selected
  if (!activePlatforms.includes(state.activeStudioPlatform)) {
    state.activeStudioPlatform = activePlatforms[0];
  }

  activePlatforms.forEach((p) => {
    const meta = PLATFORMS_META[p];
    const btn = document.createElement('button');
    btn.className = `studio-tab-btn ${state.activeStudioPlatform === p ? 'active' : ''}`;
    btn.textContent = `${meta.icon} ${meta.name} Studio`;

    btn.addEventListener('click', () => {
      switchStudioPlatform(p);
    });

    el.studioNavBar.appendChild(btn);
  });

  switchStudioPlatform(state.activeStudioPlatform);
}

function switchStudioPlatform(platform) {
  state.activeStudioPlatform = platform;

  // Highlight studio button
  document.querySelectorAll('.studio-tab-btn').forEach((b) => {
    b.classList.toggle('active', b.textContent.includes(PLATFORMS_META[platform].name));
  });

  // Show only this platform's panel
  document.querySelectorAll('.platform-panel').forEach((p) => {
    p.style.display = 'none';
  });
  const targetPanel = document.getElementById(PLATFORMS_META[platform].panelId);
  if (targetPanel) targetPanel.style.display = 'block';

  // AUTO-SYNC RIGHT PANE PREVIEW CARD!
  switchPreviewCard(platform);
}

// --- LIVE TEXT SYNC & PREVIEWS ---
function setupLiveSync() {
  const inputs = [
    el.masterText, el.masterHashtags, el.ytTitle,
    el.xOverride, el.liOverride, el.igOverride, el.threadsOverride, el.fbOverride
  ];

  inputs.forEach((input) => {
    if (input) input.addEventListener('input', updateLivePreviews);
  });
}

function updateLivePreviews() {
  const master = el.masterText.value.trim();
  const rawTags = el.masterHashtags.value.trim();

  el.masterCharCount.textContent = `${master.length} characters`;

  // 1. YouTube Preview
  const ytTitle = el.ytTitle.value.trim() || master.slice(0, 70) || 'Your Video Title Here';
  el.ytPreviewTitle.textContent = ytTitle;
  el.ytCharCount.textContent = `${ytTitle.length}/100`;
  el.ytCharCount.className = `char-count ${ytTitle.length > 90 ? 'warning' : ''}`;
  el.ytPreviewDesc.textContent = master ? `${master}\n\n${rawTags}` : 'Video description will appear here...';

  // 2. X Preview
  const xOverride = el.xOverride.value.trim();
  const xTags = rawTags.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
  const xText = xOverride || (master ? `${master} ${xTags}`.trim() : "What's happening? Type in the editor to see live tweet preview...");
  el.xPreviewText.textContent = xText;
  el.xCharCount.textContent = `${xText.length}/280`;
  el.xCharCount.className = `char-count ${xText.length > 280 ? 'danger' : (xText.length > 250 ? 'warning' : '')}`;

  // 3. LinkedIn Preview
  const liOverride = el.liOverride.value.trim();
  const liTags = rawTags.split(/[\s,]+/).filter(Boolean).slice(0, 5).map((t) => `#${t.replace(/^#/, '')}`).join(' ');
  const liText = liOverride || (master ? `${master}\n\n${liTags}` : 'LinkedIn post narrative will appear here...');
  el.liPreviewText.textContent = liText;
  el.liCharCount.textContent = `${liText.length}/3000`;

  // 4. Instagram Preview
  const igOverride = el.igOverride.value.trim();
  const igCaption = igOverride || (master ? `${master}\n\n${rawTags}` : 'Instagram caption...');
  el.igPreviewCaption.textContent = igCaption;

  // 5. Threads Preview
  const threadsOverride = el.threadsOverride.value.trim();
  const threadsText = threadsOverride || master || 'Threads update preview...';
  el.threadsPreviewText.textContent = threadsText;
  const topicTag = rawTags.split(/[\s,]+/).find(Boolean) || '';
  el.threadsTopicPill.textContent = topicTag ? `#${topicTag.replace(/^[#.&]+/, '')}` : '#topic';

  // 6. Facebook Preview
  const fbOverride = el.fbOverride ? el.fbOverride.value.trim() : '';
  el.fbPreviewText.textContent = fbOverride || master || 'Facebook post copy...';
}

// --- WIZARD NAVIGATION ---
function setupWizardNavigation() {
  el.btnGotoStep2.addEventListener('click', () => {
    if (!el.masterText.value.trim()) {
      alert('Please enter your Master Post Content before proceeding.');
      el.masterText.focus();
      return;
    }
    if (!state.selectedPlatforms.length) {
      alert('Please select at least one channel to publish to.');
      return;
    }

    el.step1.style.display = 'none';
    el.step2.style.display = 'block';
    state.currentStep = 2;

    buildStudioNavBar();
  });

  el.btnBacktoStep1.addEventListener('click', () => {
    el.step2.style.display = 'none';
    el.step1.style.display = 'block';
    state.currentStep = 1;
  });

  el.btnGotoStep3.addEventListener('click', () => {
    el.step2.style.display = 'none';
    el.step3.style.display = 'block';
    state.currentStep = 3;
    updateReviewSummary();
  });

  el.btnBacktoStep2.addEventListener('click', () => {
    el.step3.style.display = 'none';
    el.step2.style.display = 'block';
    state.currentStep = 2;
  });

  el.approvalCheckbox.addEventListener('change', () => {
    el.btnPublishFinal.disabled = !el.approvalCheckbox.checked;
  });

  el.btnPublishFinal.addEventListener('click', submitPost);
  el.btnRefreshQueue.addEventListener('click', fetchQueue);
}

function updateReviewSummary() {
  const names = state.selectedPlatforms.map((p) => {
    const meta = PLATFORMS_META[p];
    return meta ? `${meta.icon} ${meta.name}` : p;
  });

  clearElement(el.sumChannels);
  appendBoldLabel(el.sumChannels, '📡 Channels: ', names.join(', ') || 'None selected');

  clearElement(el.sumTiming);
  const isSched = document.querySelector('input[name="timing"]:checked').value === 'scheduled';
  if (isSched) {
    appendBoldLabel(el.sumTiming, '⏰ Timing: ', `Scheduled for ${el.scheduleDate.value || 'tomorrow'} at ${el.scheduleTime.value || '14:30'} IST`);
  } else {
    appendBoldLabel(el.sumTiming, '⏰ Timing: ', 'Immediate Publish 🚀');
  }

  clearElement(el.sumMedia);
  const mediaDetails = [];
  if (state.masterMedia.file) {
    mediaDetails.push(`Master: ${state.masterMedia.file.name}`);
  }
  Object.keys(state.platformMedia).forEach((p) => {
    const pm = state.platformMedia[p];
    if (pm.custom && pm.file) {
      mediaDetails.push(`${PLATFORMS_META[p].name} Custom: ${pm.file.name}`);
    }
  });

  if (mediaDetails.length) {
    appendBoldLabel(el.sumMedia, '📁 Media: ', mediaDetails.join(' | '));
  } else {
    appendBoldLabel(el.sumMedia, '📁 Media: ', 'Text only (No media)');
  }
}

// --- SUBMIT POST ---
async function submitPost() {
  el.btnPublishFinal.disabled = true;
  el.btnPublishFinal.textContent = '⏳ Processing & Publishing...';

  const formData = new FormData();
  formData.append('master_text', el.masterText.value.trim());
  formData.append('master_hashtags', el.masterHashtags.value.trim());
  formData.append('platforms', JSON.stringify(state.selectedPlatforms));

  const isSched = document.querySelector('input[name="timing"]:checked').value === 'scheduled';
  if (isSched) {
    formData.append('schedule_date', el.scheduleDate.value);
    formData.append('schedule_time', el.scheduleTime.value);
  }

  // Master media
  if (state.masterMedia.file) {
    formData.append('media', state.masterMedia.file);
  }

  // Overrides & Custom per-platform media
  if (el.ytTitle.value.trim()) formData.append('youtube_title', el.ytTitle.value.trim());
  formData.append('youtube_privacy', el.ytPrivacy.value);
  if (state.platformMedia.youtube.custom && state.platformMedia.youtube.file) {
    formData.append('media_youtube', state.platformMedia.youtube.file);
  }

  if (el.xOverride.value.trim()) formData.append('x_override', el.xOverride.value.trim());
  if (state.platformMedia.x.custom && state.platformMedia.x.file) {
    formData.append('media_x', state.platformMedia.x.file);
  }

  if (el.liOverride.value.trim()) formData.append('linkedin_override', el.liOverride.value.trim());
  if (state.platformMedia.linkedin.custom && state.platformMedia.linkedin.file) {
    formData.append('media_linkedin', state.platformMedia.linkedin.file);
  }

  if (el.igOverride.value.trim()) formData.append('instagram_override', el.igOverride.value.trim());
  if (state.platformMedia.instagram.custom && state.platformMedia.instagram.file) {
    formData.append('media_instagram', state.platformMedia.instagram.file);
  }

  if (el.threadsOverride.value.trim()) formData.append('threads_override', el.threadsOverride.value.trim());
  if (state.platformMedia.threads.custom && state.platformMedia.threads.file) {
    formData.append('media_threads', state.platformMedia.threads.file);
  }

  if (el.fbOverride && el.fbOverride.value.trim()) formData.append('facebook_override', el.fbOverride.value.trim());
  if (state.platformMedia.facebook.custom && state.platformMedia.facebook.file) {
    formData.append('media_facebook', state.platformMedia.facebook.file);
  }

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast(`🎉 Post #${data.postId} ${data.post.status === 'scheduled' ? 'Scheduled Successfully!' : 'Published Successfully!'}`, 'success');

      // Reset Form
      el.masterText.value = '';
      el.masterHashtags.value = '';
      el.ytTitle.value = '';
      el.xOverride.value = '';
      el.liOverride.value = '';
      el.igOverride.value = '';
      el.threadsOverride.value = '';
      if (el.fbOverride) el.fbOverride.value = '';

      el.btnRemoveMasterMedia.click();
      el.approvalCheckbox.checked = false;

      // Return to Step 1 & open queue
      el.step3.style.display = 'none';
      el.step1.style.display = 'block';
      state.currentStep = 1;

      document.querySelector('[data-target="tab-queue"]').click();
    } else {
      showToast(`Error publishing post: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Network error submitting post: ${err.message}`, 'error');
  } finally {
    el.btnPublishFinal.disabled = false;
    el.btnPublishFinal.textContent = '🚀 Approve & Publish Now';
  }
}

// --- QUEUE & HISTORY ---
async function fetchQueue() {
  try {
    const res = await fetch('/api/posts');
    const data = await res.json();
    clearElement(el.postsTableBody);

    if (!data.success || !data.posts.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.style.textAlign = 'center';
      td.style.color = 'var(--text-muted)';
      td.style.padding = '24px';
      td.textContent = 'No posts in history or queue yet.';
      tr.appendChild(td);
      el.postsTableBody.appendChild(tr);
      return;
    }

    data.posts.forEach((post) => {
      const tr = document.createElement('tr');

      // ID
      const tdId = document.createElement('td');
      const boldId = document.createElement('strong');
      boldId.textContent = `#${post.id}`;
      tdId.appendChild(boldId);
      tr.appendChild(tdId);

      // Content Preview
      const tdContent = document.createElement('td');
      tdContent.style.maxWidth = '320px';
      const divTitle = document.createElement('div');
      divTitle.style.fontWeight = '600';
      divTitle.style.whiteSpace = 'nowrap';
      divTitle.style.overflow = 'hidden';
      divTitle.style.textOverflow = 'ellipsis';
      divTitle.textContent = post.youtube_title || post.master_text.slice(0, 40);
      const divText = document.createElement('div');
      divText.style.fontSize = '0.8rem';
      divText.style.color = 'var(--text-muted)';
      divText.style.whiteSpace = 'nowrap';
      divText.style.overflow = 'hidden';
      divText.style.textOverflow = 'ellipsis';
      divText.textContent = post.master_text;
      tdContent.appendChild(divTitle);
      tdContent.appendChild(divText);
      tr.appendChild(tdContent);

      // Channels
      const tdChannels = document.createElement('td');
      (post.platforms || []).forEach((p) => {
        const span = document.createElement('span');
        span.className = 'badge';
        span.style.background = '#334155';
        span.style.marginRight = '4px';
        span.textContent = p;
        tdChannels.appendChild(span);
      });
      tr.appendChild(tdChannels);

      // Scheduled At
      const tdSched = document.createElement('td');
      tdSched.textContent = new Date(post.scheduled_at).toLocaleString();
      tr.appendChild(tdSched);

      // Status
      const tdStatus = document.createElement('td');
      const spanStatus = document.createElement('span');
      const statusClass = post.status === 'completed' ? 'badge-success' : (post.status === 'scheduled' ? 'badge-warning' : 'badge-danger');
      spanStatus.className = `badge ${statusClass}`;
      spanStatus.textContent = post.status;
      tdStatus.appendChild(spanStatus);
      tr.appendChild(tdStatus);

      // Actions
      const tdActions = document.createElement('td');
      if (post.results?.youtube?.url) {
        const aYt = document.createElement('a');
        aYt.href = post.results.youtube.url;
        aYt.target = '_blank';
        aYt.style.color = 'var(--accent)';
        aYt.style.textDecoration = 'none';
        aYt.style.marginRight = '8px';
        aYt.textContent = '▶ YouTube';
        tdActions.appendChild(aYt);
      }
      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-secondary';
      btnDel.style.padding = '4px 8px';
      btnDel.style.fontSize = '0.75rem';
      btnDel.textContent = '🗑️';
      btnDel.addEventListener('click', () => deletePost(post.id));
      tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);

      el.postsTableBody.appendChild(tr);
    });
  } catch (err) {
    clearElement(el.postsTableBody);
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.style.color = 'var(--danger)';
    td.style.textAlign = 'center';
    td.textContent = `Failed to load posts: ${err.message}`;
    tr.appendChild(td);
    el.postsTableBody.appendChild(tr);
  }
}

async function deletePost(id) {
  if (!confirm(`Delete Post #${id}?`)) return;
  try {
    await fetch(`/api/posts/${id}`, { method: 'DELETE' });
    showToast(`Post #${id} deleted successfully.`, 'success');
    fetchQueue();
  } catch (err) {
    showToast(`Failed to delete: ${err.message}`, 'error');
  }
}

// --- STATUS & SETTINGS ---
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const yt = data.platforms.youtube;

    if (yt.connected) {
      el.dotYouTube.classList.add('active');
      el.ytAuthStatus.textContent = '✅ Connected and Authorized with Google OAuth';
      el.ytAuthStatus.style.color = 'var(--success)';
    } else if (yt.configured) {
      el.dotYouTube.classList.remove('active');
      el.ytAuthStatus.textContent = '⚠️ Configured in .env, but needs Authorization click';
      el.ytAuthStatus.style.color = 'var(--warning)';
    } else {
      el.dotYouTube.classList.remove('active');
      el.ytAuthStatus.textContent = '❌ Credentials missing in .env';
      el.ytAuthStatus.style.color = 'var(--danger)';
    }
  } catch (err) {
    console.error('Error fetching status:', err);
  }
}

// Toast Notification System
function showToast(message, type = 'info') {
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
    }, 300);
  }, 4000);
}

// Helper utility to safely clear child nodes
function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

// Helper utility to append strong label + text
function appendBoldLabel(container, labelText, valueText) {
  const strong = document.createElement('strong');
  strong.textContent = labelText;
  container.appendChild(strong);
  const span = document.createElement('span');
  span.textContent = valueText;
  container.appendChild(span);
}
