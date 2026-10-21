// --- STATE MANAGEMENT ---
const state = {
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
  }
};

// --- DOM ELEMENTS ---
const el = {
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

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupLensSwitcher();
  setupMasterMediaUpload();
  setupPlatformCustomMedia();
  setupLiveSync();
  setupComposerActions();
  setupClientsManager();
  setupCalendar();
  fetchClients();
  fetchQueue();
});

// --- NAVIGATION ---
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

      if (targetId === 'tab-calendar') renderCalendar();
      if (targetId === 'tab-queue') fetchQueue();
      if (targetId === 'tab-clients') fetchClients();
    });
  });

  el.previewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchPreviewCard(tab.getAttribute('data-preview'));
    });
  });

  el.timingRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.value === 'scheduled') {
        el.scheduleInputs.style.display = 'flex';
        if (!el.scheduleDate.value) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          el.scheduleDate.value = tomorrow.toISOString().split('T')[0];
        }
        el.btnPublishFinal.textContent = 'Schedule Post';
      } else {
        el.scheduleInputs.style.display = 'none';
        el.btnPublishFinal.textContent = state.editingPostId ? 'Update Post' : 'Publish Post';
      }
    });
  });

  el.platformCards.forEach((card) => {
    card.addEventListener('click', () => {
      const p = card.getAttribute('data-platform');
      card.classList.toggle('selected');
      if (card.classList.contains('selected')) {
        if (!state.selectedPlatforms.includes(p)) state.selectedPlatforms.push(p);
      } else {
        state.selectedPlatforms = state.selectedPlatforms.filter((x) => x !== p);
      }
    });
  });
}

// --- UNIFIED LENS SWITCHER (AUTO-SYNCS PREVIEW) ---
function setupLensSwitcher() {
  el.lensTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const lens = tab.getAttribute('data-lens');
      switchEditorLens(lens);
    });
  });
}

function switchEditorLens(lens) {
  state.activeLens = lens;

  el.lensTabs.forEach((t) => {
    t.classList.toggle('active', t.getAttribute('data-lens') === lens);
  });

  document.querySelectorAll('.lens-pane').forEach((pane) => {
    pane.style.display = 'none';
  });

  const targetPane = document.getElementById(`panel-${lens}`);
  if (targetPane) targetPane.style.display = 'block';

  // Auto-sync right-side preview card when clicking a specific platform lens
  if (lens !== 'master') {
    switchPreviewCard(lens);
  }
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

    const box = document.getElementById('media-transcode-box');
    if (box) box.style.display = 'none';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-media';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => el.btnRemoveMasterMedia.click());
    el.previewMaster.appendChild(removeBtn);

    el.previewMaster.style.display = 'none';
    el.dropzoneMaster.style.display = 'flex';

    renderAllPreviewMedia();
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
    inspectMasterVideo(file);
  } else {
    const img = document.createElement('img');
    img.src = state.masterMedia.url;
    img.alt = 'Master media preview';
    el.previewMaster.appendChild(img);
    const box = document.getElementById('media-transcode-box');
    if (box) box.style.display = 'none';
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove-media';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.btnRemoveMasterMedia.click();
  });
  el.previewMaster.appendChild(removeBtn);

  renderAllPreviewMedia();
}

async function inspectMasterVideo(file) {
  const box = document.getElementById('media-transcode-box');
  const badge = document.getElementById('media-meta-badge');
  const btnTranscode = document.getElementById('btn-transcode-vertical');
  const warningsEl = document.getElementById('media-transcode-warnings');

  if (!box || !badge) return;

  box.style.display = 'block';
  badge.textContent = 'Inspecting video codecs & aspect ratio with FFprobe...';
  if (btnTranscode) btnTranscode.style.display = 'none';
  if (warningsEl) clearElement(warningsEl);

  try {
    const formData = new FormData();
    formData.append('media', file);

    const res = await fetch('/api/media/inspect', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!data.success || !data.info) {
      badge.textContent = 'Video attached.';
      return;
    }

    const info = data.info;
    const aspectLabel = info.isVertical ? '9:16 Vertical' : (info.isSquare ? '1:1 Square' : '16:9 Horizontal');
    badge.textContent = `${info.width}×${info.height} (${aspectLabel}) • ${info.duration}s • ${info.videoCodec.toUpperCase()}`;

    if (warningsEl && info.warnings?.length) {
      clearElement(warningsEl);
      info.warnings.forEach((w) => {
        const div = document.createElement('div');
        div.style.marginTop = '2px';
        div.textContent = `• ${w}`;
        warningsEl.appendChild(div);
      });
    }

    if (info.isHorizontal && btnTranscode) {
      btnTranscode.style.display = 'inline-block';
      btnTranscode.textContent = '⚡ Auto-Convert 9:16 (Shorts/Reels)';
      btnTranscode.disabled = false;

      btnTranscode.onclick = async () => {
        btnTranscode.disabled = true;
        btnTranscode.textContent = 'Transcoding with FFmpeg blur padding...';
        showToast('Transcoding video to 9:16 vertical...', 'info');

        try {
          const transcodeForm = new FormData();
          transcodeForm.append('media', file);

          const tRes = await fetch('/api/media/transcode/vertical', {
            method: 'POST',
            body: transcodeForm
          });
          const tData = await tRes.json();

          if (tData.success && tData.url) {
            btnTranscode.textContent = '✓ Converted to 9:16';
            badge.textContent = `1080×1920 (9:16 Vertical) • ${tData.info?.duration || info.duration}s • Transcoded`;
            if (warningsEl) clearElement(warningsEl);

            const blobRes = await fetch(tData.url);
            const blob = await blobRes.blob();
            const convertedFile = new File([blob], tData.filename, { type: 'video/mp4' });

            state.platformMedia.youtube = {
              file: convertedFile,
              url: tData.url,
              type: 'video',
              mode: 'custom'
            };
            state.platformMedia.instagram = {
              file: convertedFile,
              url: tData.url,
              type: 'video',
              mode: 'custom'
            };

            showToast('9:16 vertical video ready! Applied to YouTube Shorts and Instagram.', 'success');
            renderAllPreviewMedia();
          } else {
            btnTranscode.disabled = false;
            btnTranscode.textContent = '⚡ Auto-Convert 9:16 (Shorts/Reels)';
            showToast(`Transcoding failed: ${tData.error}`, 'error');
          }
        } catch (tErr) {
          btnTranscode.disabled = false;
          btnTranscode.textContent = '⚡ Auto-Convert 9:16 (Shorts/Reels)';
          showToast(`Transcode error: ${tErr.message}`, 'error');
        }
      };
    }
  } catch (_err) {
    badge.textContent = 'Video attached.';
  }
}

// --- PLATFORM CUSTOM MEDIA OVERRIDES ---
function setupPlatformCustomMedia() {
  const platforms = ['youtube', 'x', 'linkedin', 'instagram', 'threads', 'facebook'];

  platforms.forEach((p) => {
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
          state.platformMedia[p].mode = 'custom';
        } else if (r.value === 'none') {
          customBox.style.display = 'none';
          state.platformMedia[p].mode = 'none';
        } else {
          customBox.style.display = 'none';
          state.platformMedia[p].mode = 'master';
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
          rem.textContent = 'Remove';
          rem.addEventListener('click', (ev) => {
            ev.stopPropagation();
            removeBtn.click();
          });
          previewContainer.appendChild(rem);

          renderPreviewMedia(p);
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
        rem.textContent = 'Remove';
        rem.addEventListener('click', () => removeBtn.click());
        previewContainer.appendChild(rem);

        previewContainer.style.display = 'none';
        dropzone.style.display = 'flex';
        renderPreviewMedia(p);
      });
    }
  });
}

function getEffectiveMedia(platform) {
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

function renderPreviewMedia(platform) {
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

function renderAllPreviewMedia() {
  ['youtube', 'x', 'linkedin', 'instagram', 'threads', 'facebook'].forEach(renderPreviewMedia);
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

  el.masterCharCount.textContent = `${master.length} chars`;

  // 1. YouTube
  const ytTitle = el.ytTitle.value.trim() || master.slice(0, 70) || 'Untitled Video';
  el.ytPreviewTitle.textContent = ytTitle;
  el.ytCharCount.textContent = `${ytTitle.length}/100`;
  el.ytCharCount.className = `char-count ${ytTitle.length > 90 ? 'warning' : ''}`;
  el.ytPreviewDesc.textContent = master ? `${master}\n\n${rawTags}` : 'Description preview...';

  // 2. X
  const xOverride = el.xOverride.value.trim();
  const xTags = rawTags.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
  const xText = xOverride || (master ? `${master} ${xTags}`.trim() : 'Post text will render here...');
  el.xPreviewText.textContent = xText;
  el.xCharCount.textContent = `${xText.length}/280`;
  el.xCharCount.className = `char-count ${xText.length > 280 ? 'danger' : (xText.length > 250 ? 'warning' : '')}`;

  // 3. LinkedIn
  const liOverride = el.liOverride.value.trim();
  const liTags = rawTags.split(/[\s,]+/).filter(Boolean).slice(0, 5).map((t) => `#${t.replace(/^#/, '')}`).join(' ');
  const liText = liOverride || (master ? `${master}\n\n${liTags}` : 'Post narrative will render here...');
  el.liPreviewText.textContent = liText;
  el.liCharCount.textContent = `${liText.length}/3000`;

  // 4. Instagram
  const igOverride = el.igOverride.value.trim();
  const igCaption = igOverride || (master ? `${master}\n\n${rawTags}` : 'Caption preview...');
  el.igPreviewCaption.textContent = igCaption;

  // 5. Threads
  const threadsOverride = el.threadsOverride.value.trim();
  const threadsText = threadsOverride || master || 'Threads post preview...';
  el.threadsPreviewText.textContent = threadsText;
  if (el.threadsCharCount) el.threadsCharCount.textContent = `${threadsText.length}/500`;
  const topicTag = rawTags.split(/[\s,]+/).find(Boolean) || '';
  el.threadsTopicPill.textContent = topicTag ? topicTag.replace(/^[#.&]+/, '') : 'topic';

  // 6. Facebook
  const fbOverride = el.fbOverride ? el.fbOverride.value.trim() : '';
  el.fbPreviewText.textContent = fbOverride || master || 'Facebook post preview...';
}

// --- COMPOSER ACTIONS ---
function setupComposerActions() {
  el.btnPublishFinal.addEventListener('click', () => submitPost('publish'));
  if (el.btnSaveDraft) {
    el.btnSaveDraft.addEventListener('click', () => submitPost('draft'));
  }
  el.btnRefreshQueue.addEventListener('click', fetchQueue);
}

async function submitPost(action = 'publish') {
  if (!el.masterText.value.trim()) {
    showToast('Post copy cannot be empty.', 'warning');
    switchEditorLens('master');
    el.masterText.focus();
    return;
  }
  if (!state.selectedPlatforms.length) {
    showToast('Select at least one target channel.', 'warning');
    return;
  }

  const isEditing = Boolean(state.editingPostId);
  const submitBtn = action === 'draft' ? el.btnSaveDraft : el.btnPublishFinal;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = action === 'draft' ? 'Saving...' : 'Dispatching...';
  }

  const formData = new FormData();
  formData.append('client_id', state.activeClientId);
  formData.append('master_text', el.masterText.value.trim());
  formData.append('master_hashtags', el.masterHashtags.value.trim());
  formData.append('platforms', JSON.stringify(state.selectedPlatforms));
  formData.append('action', action);

  const isSched = document.querySelector('input[name="timing"]:checked').value === 'scheduled';
  if (isSched && action !== 'draft') {
    formData.append('schedule_date', el.scheduleDate.value);
    formData.append('schedule_time', el.scheduleTime.value);
  }

  if (state.masterMedia.file) {
    formData.append('media', state.masterMedia.file);
  }

  if (el.ytTitle.value.trim()) formData.append('youtube_title', el.ytTitle.value.trim());
  formData.append('youtube_privacy', el.ytPrivacy.value);
  if (state.platformMedia.youtube.mode === 'custom' && state.platformMedia.youtube.file) {
    formData.append('media_youtube', state.platformMedia.youtube.file);
  }

  if (el.xOverride.value.trim()) formData.append('x_override', el.xOverride.value.trim());
  if (state.platformMedia.x.mode === 'custom' && state.platformMedia.x.file) {
    formData.append('media_x', state.platformMedia.x.file);
  }

  if (el.liOverride.value.trim()) formData.append('linkedin_override', el.liOverride.value.trim());
  if (state.platformMedia.linkedin.mode === 'custom' && state.platformMedia.linkedin.file) {
    formData.append('media_linkedin', state.platformMedia.linkedin.file);
  }

  if (el.igOverride.value.trim()) formData.append('instagram_override', el.igOverride.value.trim());
  if (state.platformMedia.instagram.mode === 'custom' && state.platformMedia.instagram.file) {
    formData.append('media_instagram', state.platformMedia.instagram.file);
  }

  if (el.threadsOverride.value.trim()) formData.append('threads_override', el.threadsOverride.value.trim());
  if (state.platformMedia.threads.mode === 'custom' && state.platformMedia.threads.file) {
    formData.append('media_threads', state.platformMedia.threads.file);
  }

  if (el.fbOverride && el.fbOverride.value.trim()) formData.append('facebook_override', el.fbOverride.value.trim());
  if (state.platformMedia.facebook.mode === 'custom' && state.platformMedia.facebook.file) {
    formData.append('media_facebook', state.platformMedia.facebook.file);
  }

  // --- ALGORITHMIC & REACH OPTIMIZATION PARAMETERS ---
  const firstComment = document.getElementById('first_comment')?.value.trim();
  if (firstComment) formData.append('first_comment', firstComment);
  const autoDecouple = document.getElementById('auto_decouple_links')?.checked;
  formData.append('auto_decouple_links', autoDecouple ? 'true' : 'false');

  // YouTube Reach Parameters
  const ytCategory = document.getElementById('yt_category')?.value;
  if (ytCategory) formData.append('youtube_category_id', ytCategory);
  const ytMadeForKids = document.getElementById('yt_made_for_kids')?.checked;
  formData.append('youtube_made_for_kids', ytMadeForKids ? '1' : '0');
  const ytSynthetic = document.getElementById('yt_synthetic_media')?.checked;
  formData.append('youtube_synthetic_media', ytSynthetic ? '1' : '0');
  const ytNotify = document.getElementById('yt_notify_subscribers')?.checked;
  formData.append('youtube_notify_subscribers', ytNotify ? '1' : '0');
  const ytThumbInput = document.getElementById('yt_custom_thumb');
  if (ytThumbInput && ytThumbInput.files[0]) {
    formData.append('youtube_custom_thumb', ytThumbInput.files[0]);
  }

  // X Parameters
  const xAltText = document.getElementById('x_alt_text')?.value.trim();
  if (xAltText) formData.append('x_alt_text', xAltText);

  // LinkedIn Parameters
  const liDisableReshare = document.getElementById('li_disable_reshare')?.checked;
  formData.append('linkedin_disable_reshare', liDisableReshare ? '1' : '0');

  // Instagram Parameters
  const igAudioName = document.getElementById('ig_audio_name')?.value.trim();
  if (igAudioName) formData.append('instagram_audio_name', igAudioName);
  const igIsTrial = document.getElementById('ig_is_trial')?.checked;
  formData.append('instagram_is_trial', igIsTrial ? '1' : '0');

  try {
    const endpoint = isEditing ? `/api/posts/${state.editingPostId}` : '/api/posts';
    const method = isEditing ? 'PUT' : 'POST';

    const res = await fetch(endpoint, { method, body: formData });
    const data = await res.json();

    if (data.success) {
      const msg = action === 'draft' ? 'saved as draft' : (isSched ? 'scheduled' : 'dispatched');
      showToast(`Post #${data.postId} ${msg}.`, 'success');

      resetComposerForm();
      document.querySelector('[data-target="tab-queue"]').click();
    } else {
      showToast(`Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Network error: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = action === 'draft' ? 'Save Draft' : (isSched ? 'Schedule Post' : 'Publish Post');
    }
  }
}

function resetComposerForm() {
  state.editingPostId = null;
  if (el.composerTitle) el.composerTitle.textContent = 'New Post';
  if (el.editingIndicator) el.editingIndicator.textContent = '';

  el.masterText.value = '';
  el.masterHashtags.value = '';
  el.ytTitle.value = '';
  el.xOverride.value = '';
  el.liOverride.value = '';
  el.igOverride.value = '';
  el.threadsOverride.value = '';
  if (el.fbOverride) el.fbOverride.value = '';

  const fcEl = document.getElementById('first_comment');
  if (fcEl) fcEl.value = '';
  const ytCatEl = document.getElementById('yt_category');
  if (ytCatEl) ytCatEl.value = '28';
  const ytKidsEl = document.getElementById('yt_made_for_kids');
  if (ytKidsEl) ytKidsEl.checked = false;
  const ytSynEl = document.getElementById('yt_synthetic_media');
  if (ytSynEl) ytSynEl.checked = false;
  const ytNotifyEl = document.getElementById('yt_notify_subscribers');
  if (ytNotifyEl) ytNotifyEl.checked = true;
  const ytThumbInput = document.getElementById('yt_custom_thumb');
  if (ytThumbInput) ytThumbInput.value = '';
  const xAltEl = document.getElementById('x_alt_text');
  if (xAltEl) xAltEl.value = '';
  const liReshareEl = document.getElementById('li_disable_reshare');
  if (liReshareEl) liReshareEl.checked = false;
  const igAudioEl = document.getElementById('ig_audio_name');
  if (igAudioEl) igAudioEl.value = '';
  const igTrialEl = document.getElementById('ig_is_trial');
  if (igTrialEl) igTrialEl.checked = false;

  el.btnRemoveMasterMedia.click();
  switchEditorLens('master');
  updateLivePreviews();
}

// --- QUEUE & HISTORY ---
async function fetchQueue() {
  try {
    const url = state.activeClientId ? `/api/posts?clientId=${state.activeClientId}` : '/api/posts';
    const res = await fetch(url);
    const data = await res.json();
    clearElement(el.postsTableBody);

    state.posts = data.posts || [];

    const calTab = document.getElementById('tab-calendar');
    if (calTab && calTab.style.display !== 'none') {
      renderCalendar();
    }

    if (!data.success || !data.posts.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.style.textAlign = 'center';
      td.style.color = 'var(--text-muted)';
      td.style.padding = '32px';
      td.textContent = 'No posts in queue for this client workspace.';
      tr.appendChild(td);
      el.postsTableBody.appendChild(tr);
      return;
    }

    data.posts.forEach((post) => {
      const tr = document.createElement('tr');

      const tdId = document.createElement('td');
      tdId.style.fontFamily = 'var(--font-mono)';
      tdId.style.color = 'var(--text-muted)';
      tdId.textContent = `#${post.id}`;
      tr.appendChild(tdId);

      const tdContent = document.createElement('td');
      tdContent.style.maxWidth = '340px';
      const divTitle = document.createElement('div');
      divTitle.style.fontWeight = '500';
      divTitle.style.whiteSpace = 'nowrap';
      divTitle.style.overflow = 'hidden';
      divTitle.style.textOverflow = 'ellipsis';
      divTitle.textContent = post.youtube_title || post.master_text.slice(0, 48);
      const divText = document.createElement('div');
      divText.style.fontSize = '12px';
      divText.style.color = 'var(--text-muted)';
      divText.style.whiteSpace = 'nowrap';
      divText.style.overflow = 'hidden';
      divText.style.textOverflow = 'ellipsis';
      divText.textContent = post.master_text;
      tdContent.appendChild(divTitle);
      tdContent.appendChild(divText);
      tr.appendChild(tdContent);

      const tdChannels = document.createElement('td');
      (post.platforms || []).forEach((p) => {
        const span = document.createElement('span');
        span.className = 'badge badge-draft';
        span.style.marginRight = '4px';
        span.textContent = p;
        tdChannels.appendChild(span);
      });
      tr.appendChild(tdChannels);

      const tdSched = document.createElement('td');
      tdSched.style.fontFamily = 'var(--font-mono)';
      tdSched.style.fontSize = '12px';
      tdSched.style.color = 'var(--text-secondary)';
      tdSched.textContent = new Date(post.scheduled_at).toLocaleString();
      tr.appendChild(tdSched);

      const tdStatus = document.createElement('td');
      const spanStatus = document.createElement('span');
      const statusClass = post.status === 'completed'
        ? 'badge-success'
        : (post.status === 'scheduled' ? 'badge-warning' : (post.status === 'draft' ? 'badge-draft' : 'badge-danger'));
      spanStatus.className = `badge ${statusClass}`;
      spanStatus.textContent = post.status;
      tdStatus.appendChild(spanStatus);
      tr.appendChild(tdStatus);

      const tdActions = document.createElement('td');
      tdActions.style.textAlign = 'right';

      if (post.results?.youtube?.url) {
        const aYt = document.createElement('a');
        aYt.href = post.results.youtube.url;
        aYt.target = '_blank';
        aYt.className = 'btn btn-ghost';
        aYt.style.padding = '4px 8px';
        aYt.style.fontSize = '12px';
        aYt.style.marginRight = '4px';
        aYt.textContent = 'View YouTube ↗';
        tdActions.appendChild(aYt);
      }

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-secondary';
      btnEdit.style.padding = '4px 10px';
      btnEdit.style.fontSize = '12px';
      btnEdit.style.marginRight = '4px';
      btnEdit.textContent = 'Edit';
      btnEdit.addEventListener('click', () => loadPostIntoWizard(post));
      tdActions.appendChild(btnEdit);

      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-danger-ghost';
      btnDel.style.fontSize = '12px';
      btnDel.textContent = 'Delete';
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
    td.style.color = 'var(--status-red)';
    td.style.textAlign = 'center';
    td.textContent = `Failed to load queue: ${err.message}`;
    tr.appendChild(td);
    el.postsTableBody.appendChild(tr);
  }
}

async function deletePost(id) {
  if (!confirm(`Delete Post #${id}?`)) return;
  try {
    await fetch(`/api/posts/${id}`, { method: 'DELETE' });
    showToast(`Post #${id} deleted.`, 'success');
    fetchQueue();
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

function loadPostIntoWizard(post) {
  state.editingPostId = post.id;
  state.activeClientId = post.client_id || 1;
  state.selectedPlatforms = post.platforms || ['youtube'];

  if (el.composerTitle) el.composerTitle.textContent = `Editing Post #${post.id}`;
  if (el.editingIndicator) el.editingIndicator.textContent = `Status: ${post.status}`;

  const headerSelect = document.getElementById('header-client-select');
  const wizardSelect = document.getElementById('wizard-client-select');
  if (headerSelect) headerSelect.value = String(state.activeClientId);
  if (wizardSelect) wizardSelect.value = String(state.activeClientId);

  el.masterText.value = post.master_text || '';
  el.masterHashtags.value = post.master_hashtags || '';
  el.ytTitle.value = post.youtube_title || '';
  el.ytPrivacy.value = post.youtube_privacy || 'unlisted';
  el.xOverride.value = post.x_post || '';
  el.liOverride.value = post.linkedin_post || '';
  el.igOverride.value = post.instagram_caption || '';
  el.threadsOverride.value = post.threads_post || '';
  if (el.fbOverride) el.fbOverride.value = post.facebook_post || '';

  const fcEl = document.getElementById('first_comment');
  if (fcEl) fcEl.value = post.first_comment || '';
  const ytCatEl = document.getElementById('yt_category');
  if (ytCatEl && post.youtube_category_id) ytCatEl.value = String(post.youtube_category_id);
  const ytKidsEl = document.getElementById('yt_made_for_kids');
  if (ytKidsEl) ytKidsEl.checked = Boolean(post.youtube_made_for_kids);
  const ytSynEl = document.getElementById('yt_synthetic_media');
  if (ytSynEl) ytSynEl.checked = Boolean(post.youtube_synthetic_media);
  const ytNotifyEl = document.getElementById('yt_notify_subscribers');
  if (ytNotifyEl) ytNotifyEl.checked = post.youtube_notify_subscribers !== undefined ? Boolean(post.youtube_notify_subscribers) : true;
  const xAltEl = document.getElementById('x_alt_text');
  if (xAltEl) xAltEl.value = post.x_alt_text || '';
  const liReshareEl = document.getElementById('li_disable_reshare');
  if (liReshareEl) liReshareEl.checked = Boolean(post.linkedin_disable_reshare);
  const igAudioEl = document.getElementById('ig_audio_name');
  if (igAudioEl) igAudioEl.value = post.instagram_audio_name || '';
  const igTrialEl = document.getElementById('ig_is_trial');
  if (igTrialEl) igTrialEl.checked = Boolean(post.instagram_is_trial);

  if (post.status === 'scheduled' && post.scheduled_at) {
    const rSched = document.querySelector('input[name="timing"][value="scheduled"]');
    if (rSched) rSched.checked = true;
    el.scheduleInputs.style.display = 'flex';
    const dt = new Date(post.scheduled_at);
    el.scheduleDate.value = dt.toISOString().split('T')[0];
    const hrs = String(dt.getHours()).padStart(2, '0');
    const mins = String(dt.getMinutes()).padStart(2, '0');
    el.scheduleTime.value = `${hrs}:${mins}`;
    el.btnPublishFinal.textContent = 'Update Schedule';
  } else {
    const rNow = document.querySelector('input[name="timing"][value="now"]');
    if (rNow) rNow.checked = true;
    el.scheduleInputs.style.display = 'none';
    el.btnPublishFinal.textContent = 'Update & Publish';
  }

  el.platformCards.forEach((c) => {
    const p = c.getAttribute('data-platform');
    c.classList.toggle('selected', state.selectedPlatforms.includes(p));
  });

  updateLivePreviews();
  switchEditorLens('master');

  const tabWizard = document.querySelector('[data-target="tab-wizard"]');
  if (tabWizard) tabWizard.click();

  showToast(`Loaded Post #${post.id} into composer.`, 'info');
}

// --- WORKSPACES & CLIENT APIS ---
function setupClientsManager() {
  const headerSelect = document.getElementById('header-client-select');
  const wizardSelect = document.getElementById('wizard-client-select');
  const btnAddClient = document.getElementById('btn-add-client');
  const addClientForm = document.getElementById('add-client-form');
  const btnSaveClient = document.getElementById('btn-save-new-client');
  const btnCancelClient = document.getElementById('btn-cancel-new-client');
  const newClientName = document.getElementById('new-client-name');
  const newClientColor = document.getElementById('new-client-color');

  const channelModal = document.getElementById('add-channel-modal');
  const modalPlatformSelect = document.getElementById('modal-platform-select');
  const btnCloseModal = document.getElementById('btn-close-channel-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const btnSaveCreds = document.getElementById('btn-save-channel-creds');

  if (headerSelect) {
    headerSelect.addEventListener('change', () => {
      state.activeClientId = parseInt(headerSelect.value, 10);
      if (wizardSelect) wizardSelect.value = state.activeClientId;
      showToast('Switched client workspace.', 'info');
      fetchQueue();
    });
  }

  if (btnAddClient) {
    btnAddClient.addEventListener('click', () => {
      addClientForm.style.display = 'block';
      newClientName.focus();
    });
  }

  if (btnCancelClient) {
    btnCancelClient.addEventListener('click', () => {
      addClientForm.style.display = 'none';
      newClientName.value = '';
    });
  }

  if (btnSaveClient) {
    btnSaveClient.addEventListener('click', async () => {
      const name = newClientName.value.trim();
      const color = newClientColor.value;
      if (!name) {
        showToast('Enter a client name.', 'warning');
        return;
      }
      try {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color_code: color })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Workspace "${name}" created.`, 'success');
          addClientForm.style.display = 'none';
          newClientName.value = '';
          await fetchClients();
          fetchQueue();
        } else {
          showToast(`Error: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Network error: ${err.message}`, 'error');
      }
    });
  }

  if (modalPlatformSelect) {
    modalPlatformSelect.addEventListener('change', () => {
      const p = modalPlatformSelect.value;
      document.querySelectorAll('.cred-fields-block').forEach((b) => {
        b.style.display = 'none';
      });
      const activeBlock = document.getElementById(`cred-fields-${p}`);
      if (activeBlock) activeBlock.style.display = 'block';
    });
  }

  const hideChannelModal = () => {
    if (channelModal) channelModal.style.display = 'none';
  };

  if (btnCloseModal) btnCloseModal.addEventListener('click', hideChannelModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', hideChannelModal);

  if (btnSaveCreds) {
    btnSaveCreds.addEventListener('click', async () => {
      const clientId = document.getElementById('modal-client-id').value;
      const platform = modalPlatformSelect.value;
      const accountName = document.getElementById('modal-account-name').value.trim() || `${platform} Account`;

      let tokens = {};
      if (platform === 'x') {
        tokens = {
          apiKey: (document.getElementById('cred-x-apikey')?.value || '').trim(),
          apiSecret: (document.getElementById('cred-x-apisecret')?.value || '').trim(),
          accessToken: (document.getElementById('cred-x-token')?.value || '').trim(),
          accessSecret: (document.getElementById('cred-x-secret')?.value || '').trim()
        };
      } else if (platform === 'linkedin') {
        tokens = {
          accessToken: (document.getElementById('cred-li-token')?.value || '').trim(),
          urn: (document.getElementById('cred-li-urn')?.value || '').trim()
        };
      } else if (platform === 'instagram') {
        tokens = {
          accessToken: document.getElementById('cred-ig-token').value.trim(),
          accountId: document.getElementById('cred-ig-id').value.trim()
        };
      } else if (platform === 'threads') {
        tokens = {
          accessToken: document.getElementById('cred-threads-token').value.trim()
        };
      } else if (platform === 'facebook') {
        tokens = {
          accessToken: document.getElementById('cred-fb-token').value.trim(),
          pageId: document.getElementById('cred-fb-pageid').value.trim()
        };
      }

      try {
        const res = await fetch(`/api/clients/${clientId}/accounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform,
            account_name: accountName,
            account_handle: accountName,
            tokens
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Saved encrypted ${platform} credentials.`, 'success');
          hideChannelModal();
          await fetchClients();
        } else {
          showToast(`Error: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Network error: ${err.message}`, 'error');
      }
    });
  }
}

async function fetchClients() {
  try {
    const res = await fetch('/api/clients');
    const data = await res.json();
    if (!data.success) return;

    state.clients = data.clients;
    const headerSelect = document.getElementById('header-client-select');
    const wizardSelect = document.getElementById('wizard-client-select');
    const container = document.getElementById('clients-list-container');

    if (headerSelect && wizardSelect) {
      clearElement(headerSelect);
      state.clients.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = String(c.id);
        opt.textContent = c.name;
        headerSelect.appendChild(opt);
      });
      headerSelect.value = String(state.activeClientId);
      wizardSelect.value = String(state.activeClientId);
    }

    if (container) {
      clearElement(container);
      for (const client of state.clients) {
        const accRes = await fetch(`/api/clients/${client.id}/accounts`);
        const accData = await accRes.json();
        const accounts = accData.accounts || [];

        const card = document.createElement('div');
        card.className = 'client-row-card';
        card.style.borderLeft = `3px solid ${client.color_code || '#fafafa'}`;

        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';

        const infoDiv = document.createElement('div');
        const h3 = document.createElement('div');
        h3.style.fontWeight = '600';
        h3.style.fontSize = '14px';
        h3.textContent = client.name;

        const sub = document.createElement('div');
        sub.style.fontSize = '12px';
        sub.style.color = 'var(--text-muted)';
        sub.style.fontFamily = 'var(--font-mono)';
        sub.textContent = `ID #${client.id} · Created ${new Date(client.created_at).toLocaleDateString()}`;

        infoDiv.appendChild(h3);
        infoDiv.appendChild(sub);

        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '6px';

        const btnAddChan = document.createElement('button');
        btnAddChan.className = 'btn btn-secondary';
        btnAddChan.style.padding = '5px 12px';
        btnAddChan.style.fontSize = '12px';
        btnAddChan.textContent = '+ Connect Channel';
        btnAddChan.addEventListener('click', () => {
          openChannelModal(client.id, client.name);
        });
        actionsDiv.appendChild(btnAddChan);

        if (client.id !== 1) {
          const btnDel = document.createElement('button');
          btnDel.className = 'btn btn-danger-ghost';
          btnDel.style.fontSize = '12px';
          btnDel.textContent = 'Delete';
          btnDel.addEventListener('click', async () => {
            if (!confirm(`Delete workspace "${client.name}"?`)) return;
            await fetch(`/api/clients/${client.id}`, { method: 'DELETE' });
            showToast('Workspace deleted.', 'info');
            await fetchClients();
            fetchQueue();
          });
          actionsDiv.appendChild(btnDel);
        }

        headerRow.appendChild(infoDiv);
        headerRow.appendChild(actionsDiv);
        card.appendChild(headerRow);

        const accountsRow = document.createElement('div');
        accountsRow.style.display = 'flex';
        accountsRow.style.flexWrap = 'wrap';
        accountsRow.style.gap = '6px';
        accountsRow.style.alignItems = 'center';
        accountsRow.style.paddingTop = '10px';
        accountsRow.style.borderTop = '1px solid var(--border-subtle)';

        if (accounts.length === 0) {
          const noAcc = document.createElement('span');
          noAcc.style.fontSize = '12px';
          noAcc.style.color = 'var(--text-muted)';
          noAcc.textContent = 'No channels linked. Click "+ Connect Channel" to add API credentials.';
          accountsRow.appendChild(noAcc);
        } else {
          accounts.forEach((acc) => {
            const badge = document.createElement('div');
            badge.className = 'account-pill';

            const pSpan = document.createElement('span');
            pSpan.className = 'account-pill-platform';
            pSpan.textContent = acc.platform;
            badge.appendChild(pSpan);

            const textSpan = document.createElement('span');
            textSpan.textContent = acc.account_name;
            badge.appendChild(textSpan);

            const btnUnlink = document.createElement('button');
            btnUnlink.textContent = '×';
            btnUnlink.style.background = 'transparent';
            btnUnlink.style.border = 'none';
            btnUnlink.style.color = 'var(--text-muted)';
            btnUnlink.style.cursor = 'pointer';
            btnUnlink.style.fontSize = '14px';
            btnUnlink.style.marginLeft = '4px';
            btnUnlink.title = 'Unlink Account';
            btnUnlink.addEventListener('click', async (e) => {
              e.stopPropagation();
              if (!confirm(`Unlink ${acc.platform} for ${client.name}?`)) return;
              await fetch(`/api/accounts/${acc.id}`, { method: 'DELETE' });
              showToast(`Unlinked ${acc.platform}.`, 'info');
              await fetchClients();
            });
            badge.appendChild(btnUnlink);

            accountsRow.appendChild(badge);
          });
        }

        card.appendChild(accountsRow);
        container.appendChild(card);
      }
    }
  } catch (err) {
    console.error('Error fetching clients:', err);
  }
}

function openChannelModal(clientId, clientName) {
  const modal = document.getElementById('add-channel-modal');
  const title = document.getElementById('modal-client-title');
  const inputId = document.getElementById('modal-client-id');
  const oauthBtn = document.getElementById('modal-yt-oauth-btn');

  if (!modal) return;
  inputId.value = String(clientId);
  title.textContent = `Connect Channel — ${clientName}`;
  if (oauthBtn) {
    oauthBtn.href = `/auth/youtube?clientId=${clientId}`;
  }

  document.getElementById('modal-account-name').value = '';
  document.getElementById('modal-platform-select').value = 'youtube';
  document.querySelectorAll('.cred-fields-block').forEach((b) => {
    b.style.display = 'none';
  });
  const ytBlock = document.getElementById('cred-fields-youtube');
  if (ytBlock) ytBlock.style.display = 'block';

  modal.style.display = 'block';
  modal.scrollIntoView({ behavior: 'smooth' });
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
    }, 250);
  }, 3500);
}

function clearElement(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

// --- INTERACTIVE EDITORIAL CALENDAR SYSTEM ---

function getPlatformIconSvg(platform) {
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

function createPlatformSvgElement(platform) {
  const svgStr = getPlatformIconSvg(platform);
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgStr, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  return svg ? document.importNode(svg, true) : null;
}

function formatDateToIsoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatPostTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function setupCalendar() {
  const calPrev = document.getElementById('cal-prev');
  const calNext = document.getElementById('cal-next');
  const calToday = document.getElementById('cal-today');
  const btnViewMonth = document.getElementById('btn-view-month');
  const btnViewWeek = document.getElementById('btn-view-week');
  const btnCalNewPost = document.getElementById('btn-cal-new-post');

  const modalClose = document.getElementById('cal-modal-close');
  const modalDone = document.getElementById('cal-modal-btn-done');
  const modalEdit = document.getElementById('cal-modal-btn-edit');
  const modalDelete = document.getElementById('cal-modal-btn-delete');
  const modal = document.getElementById('cal-post-modal');

  if (calPrev) {
    calPrev.addEventListener('click', () => {
      if (state.calendar.view === 'month') {
        state.calendar.currentDate.setMonth(state.calendar.currentDate.getMonth() - 1);
      } else {
        state.calendar.currentDate.setDate(state.calendar.currentDate.getDate() - 7);
      }
      renderCalendar();
    });
  }

  if (calNext) {
    calNext.addEventListener('click', () => {
      if (state.calendar.view === 'month') {
        state.calendar.currentDate.setMonth(state.calendar.currentDate.getMonth() + 1);
      } else {
        state.calendar.currentDate.setDate(state.calendar.currentDate.getDate() + 7);
      }
      renderCalendar();
    });
  }

  if (calToday) {
    calToday.addEventListener('click', () => {
      state.calendar.currentDate = new Date();
      renderCalendar();
    });
  }

  if (btnViewMonth && btnViewWeek) {
    btnViewMonth.addEventListener('click', () => {
      state.calendar.view = 'month';
      btnViewMonth.classList.add('active');
      btnViewWeek.classList.remove('active');
      renderCalendar();
    });

    btnViewWeek.addEventListener('click', () => {
      state.calendar.view = 'week';
      btnViewWeek.classList.add('active');
      btnViewMonth.classList.remove('active');
      renderCalendar();
    });
  }

  if (btnCalNewPost) {
    btnCalNewPost.addEventListener('click', () => {
      scheduleNewPostForDate(formatDateToIsoDay(new Date()));
    });
  }

  if (modalClose) modalClose.addEventListener('click', closeCalPostModal);
  if (modalDone) modalDone.addEventListener('click', closeCalPostModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCalPostModal();
    });
  }

  if (modalEdit) {
    modalEdit.addEventListener('click', () => {
      if (state.calendar.selectedPost) {
        const post = state.calendar.selectedPost;
        closeCalPostModal();
        loadPostIntoWizard(post);
        const tabWizard = document.querySelector('[data-target="tab-wizard"]');
        if (tabWizard) tabWizard.click();
      }
    });
  }

  if (modalDelete) {
    modalDelete.addEventListener('click', async () => {
      if (state.calendar.selectedPost) {
        const postId = state.calendar.selectedPost.id;
        closeCalPostModal();
        await deletePost(postId);
        renderCalendar();
      }
    });
  }
}

function scheduleNewPostForDate(dateStr) {
  if (el.scheduleDate) el.scheduleDate.value = dateStr;
  if (el.scheduleTime && !el.scheduleTime.value) el.scheduleTime.value = '10:00';

  const radioSchedule = document.querySelector('input[name="timing"][value="schedule"]');
  if (radioSchedule) {
    radioSchedule.checked = true;
    radioSchedule.dispatchEvent(new Event('change'));
  }

  const tabWizard = document.querySelector('[data-target="tab-wizard"]');
  if (tabWizard) tabWizard.click();
  if (el.masterText) el.masterText.focus();
  showToast(`Scheduling new post for ${dateStr}`, 'info');
}

function openCalPostModal(post) {
  state.calendar.selectedPost = post;
  const modal = document.getElementById('cal-post-modal');
  const title = document.getElementById('cal-modal-title');
  const badge = document.getElementById('cal-modal-status-badge');
  const body = document.getElementById('cal-modal-body');
  const time = document.getElementById('cal-modal-scheduled-time');
  const channels = document.getElementById('cal-modal-channels');
  const mediaPreview = document.getElementById('cal-modal-media-preview');

  if (!modal) return;

  if (title) title.textContent = `Post #${post.id}`;
  if (badge) {
    clearElement(badge);
    const statusClass = post.status === 'completed'
      ? 'badge-success'
      : (post.status === 'scheduled' ? 'badge-warning' : (post.status === 'draft' ? 'badge-draft' : 'badge-danger'));
    const statusSpan = document.createElement('span');
    statusSpan.className = `badge ${statusClass}`;
    statusSpan.textContent = post.status;
    badge.appendChild(statusSpan);
  }

  if (body) body.textContent = post.master_text || 'No description';
  if (time) time.textContent = new Date(post.scheduled_at).toLocaleString();

  if (channels) {
    clearElement(channels);
    (post.platforms || []).forEach((p) => {
      const chip = document.createElement('span');
      chip.className = 'badge badge-draft';
      chip.style.display = 'inline-flex';
      chip.style.alignItems = 'center';
      chip.style.gap = '4px';
      const svgIcon = createPlatformSvgElement(p);
      if (svgIcon) chip.appendChild(svgIcon);
      const textSpan = document.createElement('span');
      textSpan.textContent = p;
      chip.appendChild(textSpan);
      channels.appendChild(chip);
    });
  }

  if (mediaPreview) {
    clearElement(mediaPreview);
    if (post.media_filename) {
      mediaPreview.style.display = 'block';
      const div = document.createElement('div');
      div.style.background = 'var(--bg-base)';
      div.style.padding = '8px 10px';
      div.style.borderRadius = '6px';
      div.style.fontSize = '12px';
      div.style.color = 'var(--text-secondary)';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.gap = '6px';
      const clipSpan = document.createElement('span');
      clipSpan.textContent = '📎';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = post.media_filename;
      div.appendChild(clipSpan);
      div.appendChild(nameSpan);
      mediaPreview.appendChild(div);
    } else {
      mediaPreview.style.display = 'none';
    }
  }

  modal.style.display = 'flex';
}

function closeCalPostModal() {
  const modal = document.getElementById('cal-post-modal');
  if (modal) modal.style.display = 'none';
  state.calendar.selectedPost = null;
}

async function handleDropReschedule(postId, targetDateStr) {
  const post = state.posts.find((p) => String(p.id) === String(postId));
  if (!post) return;

  // Extract time portion of existing scheduled date
  let timePart = '10:00:00';
  if (post.scheduled_at && post.scheduled_at.includes('T')) {
    timePart = post.scheduled_at.split('T')[1].slice(0, 8);
  } else if (post.scheduled_at && post.scheduled_at.includes(' ')) {
    timePart = post.scheduled_at.split(' ')[1].slice(0, 8);
  }

  const newScheduledAt = `${targetDateStr}T${timePart}`;

  try {
    const res = await fetch(`/api/posts/${postId}/schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: newScheduledAt })
    });

    const data = await res.json();
    if (data.success) {
      post.scheduled_at = newScheduledAt;
      post.status = data.status || 'scheduled';
      showToast(`Rescheduled Post #${postId} to ${targetDateStr}`, 'success');
      renderCalendar();
      fetchQueue();
    } else {
      showToast(`Reschedule failed: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Network error rescheduling post: ${err.message}`, 'error');
  }
}

function renderCalendar() {
  const calTitle = document.getElementById('cal-month-title');
  const calBadge = document.getElementById('cal-client-badge');
  const grid = document.getElementById('calendar-grid');

  if (!grid) return;
  clearElement(grid);

  const curr = new Date(state.calendar.currentDate);
  const year = curr.getFullYear();
  const month = curr.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Set Client Badge
  const activeClient = state.clients.find((c) => c.id === state.activeClientId);
  if (calBadge) {
    calBadge.textContent = activeClient ? `• ${activeClient.name}` : '';
  }

  const todayStr = formatDateToIsoDay(new Date());

  if (state.calendar.view === 'month') {
    if (calTitle) calTitle.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 is Sunday
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const totalCells = (startDayOfWeek + daysInCurrentMonth) > 35 ? 42 : 35;

    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-day';

      let cellDate;

      if (i < startDayOfWeek) {
        // Days from previous month
        const dayNum = daysInPrevMonth - (startDayOfWeek - 1 - i);
        cellDate = new Date(year, month - 1, dayNum);
        cell.classList.add('other-month');
      } else if (i >= startDayOfWeek + daysInCurrentMonth) {
        // Days from next month
        const dayNum = i - (startDayOfWeek + daysInCurrentMonth) + 1;
        cellDate = new Date(year, month + 1, dayNum);
        cell.classList.add('other-month');
      } else {
        // Days in current month
        const dayNum = i - startDayOfWeek + 1;
        cellDate = new Date(year, month, dayNum);
      }

      const dateStr = formatDateToIsoDay(cellDate);
      cell.dataset.date = dateStr;

      if (dateStr === todayStr) {
        cell.classList.add('today');
      }

      // Day Header with Day Number and Add (+) Button
      const header = document.createElement('div');
      header.className = 'calendar-day-header';

      const numSpan = document.createElement('span');
      numSpan.className = 'calendar-day-num';
      numSpan.textContent = cellDate.getDate();
      header.appendChild(numSpan);

      const addBtn = document.createElement('button');
      addBtn.className = 'calendar-day-add';
      addBtn.title = `Add post on ${dateStr}`;
      addBtn.textContent = '+';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        scheduleNewPostForDate(dateStr);
      });
      header.appendChild(addBtn);

      cell.appendChild(header);

      // Posts Container for this Day
      const postsContainer = document.createElement('div');
      postsContainer.className = 'calendar-day-posts';

      // Match posts for this day
      const dayPosts = state.posts.filter((p) => {
        if (!p.scheduled_at) return false;
        return p.scheduled_at.startsWith(dateStr);
      });

      dayPosts.forEach((post) => {
        const chip = document.createElement('div');
        chip.className = 'cal-chip';
        chip.draggable = true;
        chip.dataset.postId = String(post.id);

        const top = document.createElement('div');
        top.className = 'cal-chip-top';

        const time = document.createElement('span');
        time.className = 'cal-chip-time';
        time.textContent = formatPostTime(post.scheduled_at);
        top.appendChild(time);

        const statusDot = document.createElement('span');
        statusDot.className = `cal-chip-status ${post.status || 'scheduled'}`;
        top.appendChild(statusDot);

        chip.appendChild(top);

        const title = document.createElement('div');
        title.className = 'cal-chip-title';
        title.textContent = post.youtube_title || post.master_text.slice(0, 32);
        chip.appendChild(title);

        const icons = document.createElement('div');
        icons.className = 'cal-chip-icons';
        (post.platforms || []).forEach((p) => {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'cal-chip-icon';
          const svgEl = createPlatformSvgElement(p);
          if (svgEl) iconSpan.appendChild(svgEl);
          icons.appendChild(iconSpan);
        });
        chip.appendChild(icons);

        // Drag events on chip
        chip.addEventListener('dragstart', (e) => {
          chip.classList.add('dragging');
          e.dataTransfer.setData('text/plain', String(post.id));
          e.dataTransfer.effectAllowed = 'move';
        });

        chip.addEventListener('dragend', () => {
          chip.classList.remove('dragging');
        });

        // Click to open modal
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          openCalPostModal(post);
        });

        postsContainer.appendChild(chip);
      });

      cell.appendChild(postsContainer);

      // Drag and Drop listeners on Cell
      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('drag-over');
      });

      cell.addEventListener('dragleave', () => {
        cell.classList.remove('drag-over');
      });

      cell.addEventListener('drop', async (e) => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        const postId = e.dataTransfer.getData('text/plain');
        if (!postId) return;
        await handleDropReschedule(postId, dateStr);
      });

      grid.appendChild(cell);
    }
  } else {
    // --- WEEK VIEW ---
    const currDay = curr.getDay();
    const startOfWeek = new Date(curr);
    startOfWeek.setDate(curr.getDate() - currDay);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    if (calTitle) {
      calTitle.textContent = `${monthNames[startOfWeek.getMonth()].slice(0, 3)} ${startOfWeek.getDate()} – ${monthNames[endOfWeek.getMonth()].slice(0, 3)} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
    }

    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(startOfWeek);
      cellDate.setDate(startOfWeek.getDate() + d);

      const cell = document.createElement('div');
      cell.className = 'calendar-day';
      cell.style.minHeight = '380px';

      const dateStr = formatDateToIsoDay(cellDate);
      cell.dataset.date = dateStr;

      if (dateStr === todayStr) {
        cell.classList.add('today');
      }

      const header = document.createElement('div');
      header.className = 'calendar-day-header';

      const numSpan = document.createElement('span');
      numSpan.className = 'calendar-day-num';
      numSpan.textContent = cellDate.getDate();
      header.appendChild(numSpan);

      const addBtn = document.createElement('button');
      addBtn.className = 'calendar-day-add';
      addBtn.title = `Add post on ${dateStr}`;
      addBtn.textContent = '+';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        scheduleNewPostForDate(dateStr);
      });
      header.appendChild(addBtn);

      cell.appendChild(header);

      const postsContainer = document.createElement('div');
      postsContainer.className = 'calendar-day-posts';
      postsContainer.style.maxHeight = '320px';

      const dayPosts = state.posts.filter((p) => {
        if (!p.scheduled_at) return false;
        return p.scheduled_at.startsWith(dateStr);
      });

      dayPosts.forEach((post) => {
        const chip = document.createElement('div');
        chip.className = 'cal-chip';
        chip.draggable = true;
        chip.dataset.postId = String(post.id);

        const top = document.createElement('div');
        top.className = 'cal-chip-top';

        const time = document.createElement('span');
        time.className = 'cal-chip-time';
        time.textContent = formatPostTime(post.scheduled_at);
        top.appendChild(time);

        const statusDot = document.createElement('span');
        statusDot.className = `cal-chip-status ${post.status || 'scheduled'}`;
        top.appendChild(statusDot);

        chip.appendChild(top);

        const title = document.createElement('div');
        title.className = 'cal-chip-title';
        title.textContent = post.youtube_title || post.master_text.slice(0, 36);
        chip.appendChild(title);

        const icons = document.createElement('div');
        icons.className = 'cal-chip-icons';
        (post.platforms || []).forEach((p) => {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'cal-chip-icon';
          const svgEl = createPlatformSvgElement(p);
          if (svgEl) iconSpan.appendChild(svgEl);
          icons.appendChild(iconSpan);
        });
        chip.appendChild(icons);

        chip.addEventListener('dragstart', (e) => {
          chip.classList.add('dragging');
          e.dataTransfer.setData('text/plain', String(post.id));
          e.dataTransfer.effectAllowed = 'move';
        });

        chip.addEventListener('dragend', () => {
          chip.classList.remove('dragging');
        });

        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          openCalPostModal(post);
        });

        postsContainer.appendChild(chip);
      });

      cell.appendChild(postsContainer);

      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('drag-over');
      });

      cell.addEventListener('dragleave', () => {
        cell.classList.remove('drag-over');
      });

      cell.addEventListener('drop', async (e) => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        const postId = e.dataTransfer.getData('text/plain');
        if (!postId) return;
        await handleDropReschedule(postId, dateStr);
      });

      grid.appendChild(cell);
    }
  }
}
