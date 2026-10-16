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
  currentPreviewTab: 'youtube'
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
  } else {
    const img = document.createElement('img');
    img.src = state.masterMedia.url;
    img.alt = 'Master media preview';
    el.previewMaster.appendChild(img);
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
          apiKey: document.getElementById('cred-x-apikey').value.trim(),
          accessToken: document.getElementById('cred-x-token').value.trim()
        };
      } else if (platform === 'linkedin') {
        tokens = {
          accessToken: document.getElementById('cred-li-token').value.trim(),
          urn: document.getElementById('cred-li-urn').value.trim()
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
