// --- STATE MANAGEMENT ---
const state = {
  selectedPlatforms: ['youtube', 'x', 'linkedin'],
  mediaFile: null,
  mediaUrl: null,
  mediaType: null, // 'video' | 'image' | null
  currentStep: 1,
  currentPreviewTab: 'youtube'
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
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('media-file-input'),
  previewContainer: document.getElementById('media-preview-container'),
  btnRemoveMedia: document.getElementById('btn-remove-media'),
  platformCards: document.querySelectorAll('.platform-card'),
  timingRadios: document.querySelectorAll('input[name="timing"]'),
  scheduleInputs: document.getElementById('schedule-inputs'),
  scheduleDate: document.getElementById('schedule_date'),
  scheduleTime: document.getElementById('schedule_time'),
  btnGotoStep2: document.getElementById('btn-goto-step-2'),

  // Step 2 Inputs
  ytTitle: document.getElementById('youtube_title'),
  ytPrivacy: document.getElementById('youtube_privacy'),
  xOverride: document.getElementById('x_override'),
  liOverride: document.getElementById('linkedin_override'),
  igOverride: document.getElementById('instagram_override'),
  threadsOverride: document.getElementById('threads_override'),
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
  igPreviewCaption: document.getElementById('ig-preview-caption'),
  igPreviewPlayer: document.getElementById('ig-preview-player'),

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
  setupMediaUpload();
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

      if (targetId === 'tab-queue') {
        fetchQueue();
      }
      if (targetId === 'tab-settings') {
        fetchStatus();
      }
    });
  });

  // Preview Tabs
  el.previewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      el.previewTabs.forEach((t) => t.classList.remove('active'));
      el.previewCards.forEach((c) => {
        c.style.display = 'none';
      });

      tab.classList.add('active');
      const p = tab.getAttribute('data-preview');
      state.currentPreviewTab = p;
      document.getElementById(`card-${p}`).style.display = 'block';
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

  // Platform Cards
  el.platformCards.forEach((card) => {
    card.addEventListener('click', () => {
      const p = card.getAttribute('data-platform');
      card.classList.toggle('selected');
      if (card.classList.contains('selected')) {
        if (!state.selectedPlatforms.includes(p)) {
          state.selectedPlatforms.push(p);
        }
      } else {
        state.selectedPlatforms = state.selectedPlatforms.filter((x) => x !== p);
      }
      updateReviewSummary();
    });
  });
}

// --- MEDIA DRAG & DROP ---
function setupMediaUpload() {
  el.dropzone.addEventListener('click', () => el.fileInput.click());

  ['dragenter', 'dragover'].forEach((name) => {
    el.dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      el.dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((name) => {
    el.dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      el.dropzone.classList.remove('dragover');
    });
  });

  el.dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  });

  el.fileInput.addEventListener('change', () => {
    const file = el.fileInput.files[0];
    if (file) {
      handleFile(file);
    }
  });

  el.btnRemoveMedia.addEventListener('click', (e) => {
    e.stopPropagation();
    state.mediaFile = null;
    state.mediaUrl = null;
    state.mediaType = null;

    clearElement(el.previewContainer);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-media';
    removeBtn.id = 'btn-remove-media';
    removeBtn.textContent = '✕ Remove';
    removeBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      el.btnRemoveMedia.click();
    });
    el.previewContainer.appendChild(removeBtn);
    el.previewContainer.style.display = 'none';
    el.dropzone.style.display = 'block';

    // Reset preview elements safely
    clearElement(el.ytPreviewPlayer);
    const ytSpan = document.createElement('span');
    ytSpan.textContent = '▶ Video Preview';
    el.ytPreviewPlayer.appendChild(ytSpan);

    el.xPreviewMedia.style.display = 'none';
    clearElement(el.xPreviewMedia);

    el.liPreviewMedia.style.display = 'none';
    clearElement(el.liPreviewMedia);

    clearElement(el.igPreviewPlayer);
    const igSpan = document.createElement('span');
    igSpan.textContent = 'Photo / Reel Preview';
    el.igPreviewPlayer.appendChild(igSpan);

    updateReviewSummary();
  });
}

function handleFile(file) {
  state.mediaFile = file;
  state.mediaType = file.type.startsWith('video') ? 'video' : 'image';
  state.mediaUrl = URL.createObjectURL(file);

  el.dropzone.style.display = 'none';
  el.previewContainer.style.display = 'flex';

  clearElement(el.previewContainer);
  clearElement(el.ytPreviewPlayer);
  clearElement(el.xPreviewMedia);
  clearElement(el.liPreviewMedia);
  clearElement(el.igPreviewPlayer);

  if (state.mediaType === 'video') {
    const mainVid = document.createElement('video');
    mainVid.src = state.mediaUrl;
    mainVid.controls = true;
    el.previewContainer.appendChild(mainVid);

    const ytVid = document.createElement('video');
    ytVid.src = state.mediaUrl;
    ytVid.controls = true;
    ytVid.style.width = '100%';
    ytVid.style.height = '100%';
    ytVid.style.objectFit = 'cover';
    el.ytPreviewPlayer.appendChild(ytVid);

    el.xPreviewMedia.style.display = 'block';
    const xVid = document.createElement('video');
    xVid.src = state.mediaUrl;
    xVid.controls = true;
    xVid.style.width = '100%';
    xVid.style.height = 'auto';
    xVid.style.maxHeight = '250px';
    el.xPreviewMedia.appendChild(xVid);

    el.liPreviewMedia.style.display = 'block';
    const liVid = document.createElement('video');
    liVid.src = state.mediaUrl;
    liVid.controls = true;
    liVid.style.width = '100%';
    liVid.style.height = 'auto';
    liVid.style.maxHeight = '250px';
    el.liPreviewMedia.appendChild(liVid);

    const igVid = document.createElement('video');
    igVid.src = state.mediaUrl;
    igVid.controls = true;
    igVid.style.width = '100%';
    igVid.style.height = '100%';
    igVid.style.objectFit = 'cover';
    el.igPreviewPlayer.appendChild(igVid);
  } else {
    const mainImg = document.createElement('img');
    mainImg.src = state.mediaUrl;
    mainImg.alt = 'Upload preview';
    el.previewContainer.appendChild(mainImg);

    const ytImg = document.createElement('img');
    ytImg.src = state.mediaUrl;
    ytImg.alt = 'YouTube thumbnail';
    ytImg.style.width = '100%';
    ytImg.style.height = '100%';
    ytImg.style.objectFit = 'cover';
    el.ytPreviewPlayer.appendChild(ytImg);

    el.xPreviewMedia.style.display = 'block';
    const xImg = document.createElement('img');
    xImg.src = state.mediaUrl;
    xImg.alt = 'X preview';
    xImg.style.width = '100%';
    xImg.style.height = 'auto';
    xImg.style.maxHeight = '250px';
    xImg.style.objectFit = 'cover';
    el.xPreviewMedia.appendChild(xImg);

    el.liPreviewMedia.style.display = 'block';
    const liImg = document.createElement('img');
    liImg.src = state.mediaUrl;
    liImg.alt = 'LinkedIn preview';
    liImg.style.width = '100%';
    liImg.style.height = 'auto';
    liImg.style.maxHeight = '250px';
    liImg.style.objectFit = 'cover';
    el.liPreviewMedia.appendChild(liImg);

    const igImg = document.createElement('img');
    igImg.src = state.mediaUrl;
    igImg.alt = 'Instagram preview';
    igImg.style.width = '100%';
    igImg.style.height = '100%';
    igImg.style.objectFit = 'cover';
    el.igPreviewPlayer.appendChild(igImg);
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove-media';
  removeBtn.textContent = '✕ Remove';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el.btnRemoveMedia.click();
  });
  el.previewContainer.appendChild(removeBtn);

  updateReviewSummary();
}

// --- LIVE TEXT SYNC & PREVIEWS ---
function setupLiveSync() {
  const inputs = [
    el.masterText, el.masterHashtags, el.ytTitle,
    el.xOverride, el.liOverride, el.igOverride, el.threadsOverride
  ];

  inputs.forEach((input) => {
    input.addEventListener('input', updateLivePreviews);
  });
}

function updateLivePreviews() {
  const master = el.masterText.value.trim();
  const rawTags = el.masterHashtags.value.trim();

  // Char count for master
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

  // 4. Threads Preview
  const threadsOverride = el.threadsOverride.value.trim();
  const threadsText = threadsOverride || master || 'Threads update preview...';
  el.threadsPreviewText.textContent = threadsText;
  const topicTag = rawTags.split(/[\s,]+/).find(Boolean) || '';
  el.threadsTopicPill.textContent = topicTag ? `#${topicTag.replace(/^#/, '')}` : '#topic';

  // 5. Instagram Preview
  const igOverride = el.igOverride.value.trim();
  const igCaption = igOverride || (master ? `${master}\n\n${rawTags}` : 'Instagram caption...');
  el.igPreviewCaption.textContent = igCaption;
}

// --- WIZARD NAVIGATION ---
function setupWizardNavigation() {
  el.btnGotoStep2.addEventListener('click', () => {
    if (!el.masterText.value.trim()) {
      alert('Please enter your Master Post Content before proceeding.');
      el.masterText.focus();
      return;
    }
    el.step1.style.display = 'none';
    el.step2.style.display = 'block';
    state.currentStep = 2;
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
    if (p === 'youtube') return 'YouTube 🔴';
    if (p === 'x') return 'X 🐦';
    if (p === 'linkedin') return 'LinkedIn 💼';
    if (p === 'instagram') return 'Instagram 📸';
    if (p === 'threads') return 'Threads 🧵';
    if (p === 'facebook') return 'Facebook 📘';
    return p;
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
  if (state.mediaFile) {
    appendBoldLabel(el.sumMedia, '📁 Media: ', `${state.mediaFile.name} (${(state.mediaFile.size / (1024 * 1024)).toFixed(2)} MB)`);
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

  if (el.ytTitle.value.trim()) formData.append('youtube_title', el.ytTitle.value.trim());
  formData.append('youtube_privacy', el.ytPrivacy.value);
  if (el.xOverride.value.trim()) formData.append('x_override', el.xOverride.value.trim());
  if (el.liOverride.value.trim()) formData.append('linkedin_override', el.liOverride.value.trim());
  if (el.igOverride.value.trim()) formData.append('instagram_override', el.igOverride.value.trim());
  if (el.threadsOverride.value.trim()) formData.append('threads_override', el.threadsOverride.value.trim());

  if (state.mediaFile) {
    formData.append('media', state.mediaFile);
  }

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      alert(`🎉 Post #${data.postId} ${data.post.status === 'scheduled' ? 'Scheduled Successfully!' : 'Published Successfully!'}`);

      el.masterText.value = '';
      el.masterHashtags.value = '';
      el.ytTitle.value = '';
      el.xOverride.value = '';
      el.liOverride.value = '';
      el.btnRemoveMedia.click();
      el.approvalCheckbox.checked = false;

      el.step3.style.display = 'none';
      el.step1.style.display = 'block';
      state.currentStep = 1;

      document.querySelector('[data-target="tab-queue"]').click();
    } else {
      alert(`Error publishing post: ${data.error}`);
    }
  } catch (err) {
    alert(`Network error submitting post: ${err.message}`);
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
    fetchQueue();
  } catch (err) {
    alert(`Failed to delete: ${err.message}`);
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
