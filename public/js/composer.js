/**
 * Single-Screen Multi-Channel Composer, Media Drag-and-Drop, and Queue Manager
 */

import { state, el, showToast, clearElement } from './state.js';
import { api } from './api.js';
import { renderPreviewMedia, renderAllPreviewMedia, updateLivePreviews, switchPreviewCard } from './preview.js';

function getStatusBadgeClass(status) {
  if (status === 'completed') return 'badge-success';
  if (status === 'scheduled') return 'badge-warning';
  if (status === 'draft') return 'badge-draft';
  return 'badge-danger';
}

function getSubmitButtonText(action, isSched) {
  if (action === 'draft') return 'Save Draft';
  if (isSched) return 'Schedule Post';
  return 'Publish Post';
}

function getPostSuccessMessage(action, isSched) {
  if (action === 'draft') return 'saved as draft';
  if (isSched) return 'scheduled';
  return 'dispatched';
}

export function registerPostActionListener(fn) {
  onPostActionCompleted = fn;
}

export function switchEditorLens(lens) {
  state.activeLens = lens;

  el.lensTabs.forEach((t) => {
    t.classList.toggle('active', t.getAttribute('data-lens') === lens);
  });

  document.querySelectorAll('.lens-pane').forEach((pane) => {
    pane.style.display = 'none';
  });

  const targetPane = document.getElementById(`panel-${lens}`);
  if (targetPane) targetPane.style.display = 'block';

  // Auto-sync preview card when switching lens
  if (lens !== 'master') {
    switchPreviewCard(lens);
  }
}

export function setupNavigation() {
  el.navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      el.navTabs.forEach((t) => t.classList.remove('active'));
      el.tabContents.forEach((tc) => {
        tc.style.display = 'none';
      });

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.style.display = 'block';

      if (onPostActionCompleted) onPostActionCompleted(targetId);
    });
  });

  el.previewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchPreviewCard(tab.getAttribute('data-preview'));
    });
  });

  const queueBadge = document.getElementById('queue-slot-badge');
  const queueTimeText = document.getElementById('queue-slot-time-text');

  el.timingRadios.forEach((radio) => {
    radio.addEventListener('change', async () => {
      if (radio.value === 'queue') {
        el.scheduleInputs.style.display = 'none';
        if (queueBadge) queueBadge.style.display = 'inline-flex';
        el.btnPublishFinal.textContent = 'Add to Queue';
        if (queueTimeText) {
          queueTimeText.textContent = 'Calculating next slot...';
          try {
            const data = await api.get(`/api/clients/${state.activeClientId}/next-slot`);
            if (data.success && data.nextSlotIso) {
              const dt = new Date(data.nextSlotIso);
              queueTimeText.textContent = `${dt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} (${data.timezone})`;
              state.nextQueueSlotIso = data.nextSlotIso;
            } else {
              queueTimeText.textContent = 'Calculated automatically on submit';
            }
          } catch {
            queueTimeText.textContent = 'Calculated automatically on submit';
          }
        }
      } else if (radio.value === 'scheduled') {
        if (queueBadge) queueBadge.style.display = 'none';
        el.scheduleInputs.style.display = 'flex';
        if (!el.scheduleDate.value) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          el.scheduleDate.value = tomorrow.toISOString().split('T')[0];
        }
        el.btnPublishFinal.textContent = 'Schedule Post';
      } else {
        if (queueBadge) queueBadge.style.display = 'none';
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

export function setupLensSwitcher() {
  el.lensTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const lens = tab.getAttribute('data-lens');
      switchEditorLens(lens);
    });
  });
}

export function setupMasterMediaUpload() {
  if (!el.dropzoneMaster || !el.fileInputMaster) return;

  el.dropzoneMaster.addEventListener('click', () => el.fileInputMaster.click());

  el.dropzoneMaster.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.dropzoneMaster.classList.add('drag-over');
  });

  el.dropzoneMaster.addEventListener('dragleave', () => {
    el.dropzoneMaster.classList.remove('drag-over');
  });

  el.dropzoneMaster.addEventListener('drop', (e) => {
    e.preventDefault();
    el.dropzoneMaster.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
      handleDroppedFile(e.dataTransfer.files[0]);
    }
  });

  el.fileInputMaster.addEventListener('change', () => {
    if (el.fileInputMaster.files.length) {
      handleDroppedFile(el.fileInputMaster.files[0]);
    }
  });

  if (el.btnRemoveMasterMedia) {
    el.btnRemoveMasterMedia.addEventListener('click', (e) => {
      e.stopPropagation();
      state.masterMedia.file = null;
      state.masterMedia.url = null;
      state.masterMedia.type = null;

      el.fileInputMaster.value = '';
      el.previewMaster.style.display = 'none';
      el.dropzoneMaster.style.display = 'flex';

      const transcodeBox = document.getElementById('media-transcode-box');
      if (transcodeBox) transcodeBox.style.display = 'none';

      renderAllPreviewMedia();
    });
  }
}

async function handleDroppedFile(file) {
  state.masterMedia.file = file;
  state.masterMedia.type = file.type.startsWith('video') ? 'video' : 'image';
  state.masterMedia.url = URL.createObjectURL(file);

  el.dropzoneMaster.style.display = 'none';
  el.previewMaster.style.display = 'flex';
  clearElement(el.previewMaster);

  if (state.masterMedia.type === 'video') {
    const v = document.createElement('video');
    v.src = state.masterMedia.url;
    v.controls = true;
    el.previewMaster.appendChild(v);
  } else {
    const im = document.createElement('img');
    im.src = state.masterMedia.url;
    im.alt = 'Master Media Preview';
    el.previewMaster.appendChild(im);
  }

  const remBtn = document.createElement('button');
  remBtn.className = 'btn-remove-media';
  remBtn.textContent = 'Remove';
  remBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (el.btnRemoveMasterMedia) el.btnRemoveMasterMedia.click();
  });
  el.previewMaster.appendChild(remBtn);

  renderAllPreviewMedia();

  if (state.masterMedia.type === 'video') {
    await inspectMasterMedia(file);
  }
}

async function inspectMasterMedia(file) {
  const transcodeBox = document.getElementById('media-transcode-box');
  const badge = document.getElementById('media-meta-badge');
  const warningsEl = document.getElementById('media-transcode-warnings');
  const btnTranscode = document.getElementById('btn-transcode-vertical');

  if (!transcodeBox || !badge) return;

  transcodeBox.style.display = 'block';
  badge.textContent = 'Analyzing video specifications...';
  if (warningsEl) clearElement(warningsEl);
  if (btnTranscode) btnTranscode.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('media', file);

    const data = await api.post('/api/media/inspect', formData);
    if (!data.success) {
      badge.textContent = 'Media inspection unavailable.';
      return;
    }

    const info = data.info;
    const dur = info.duration ? `${info.duration}s` : 'Unknown';
    const dim = (info.width && info.height) ? `${info.width}×${info.height}` : '';
    const ratio = info.aspectRatio ? `(${info.aspectRatio})` : '';

    badge.textContent = `${dim} ${ratio} • ${dur} • ${info.sizeMb}MB`;

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

          const tData = await api.post('/api/media/transcode/vertical', transcodeForm);
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
  } catch {
    badge.textContent = 'Video attached.';
  }
}

export function setupPlatformCustomMedia() {
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
          if (customBox) customBox.style.display = 'block';
          state.platformMedia[p].mode = 'custom';
        } else if (r.value === 'none') {
          if (customBox) customBox.style.display = 'none';
          state.platformMedia[p].mode = 'none';
        } else {
          if (customBox) customBox.style.display = 'none';
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
            if (removeBtn) removeBtn.click();
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
        if (dropzone) dropzone.style.display = 'flex';
        renderPreviewMedia(p);
      });
    }
  });
}

export function setupComposerActions() {
  if (el.btnPublishFinal) el.btnPublishFinal.addEventListener('click', () => submitPost('publish'));
  if (el.btnSaveDraft) el.btnSaveDraft.addEventListener('click', () => submitPost('draft'));
  if (el.btnRefreshQueue) el.btnRefreshQueue.addEventListener('click', fetchQueue);
}

export async function submitPost(action = 'publish') {
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
  formData.append('master_hashtags', (el.masterHashtags?.value || '').trim());
  formData.append('platforms', JSON.stringify(state.selectedPlatforms));
  formData.append('action', action);

  const timingRadio = document.querySelector('input[name="timing"]:checked');
  const timingMode = timingRadio ? timingRadio.value : 'now';
  const isSched = timingMode === 'scheduled' || timingMode === 'queue';

  if (timingMode === 'queue' && action !== 'draft') {
    if (state.nextQueueSlotIso) {
      const dt = new Date(state.nextQueueSlotIso);
      formData.append('schedule_date', dt.toISOString().split('T')[0]);
      const hrs = String(dt.getHours()).padStart(2, '0');
      const mins = String(dt.getMinutes()).padStart(2, '0');
      formData.append('schedule_time', `${hrs}:${mins}`);
    } else {
      const tomorrow = new Date(Date.now() + 86400000);
      formData.append('schedule_date', tomorrow.toISOString().split('T')[0]);
      formData.append('schedule_time', '09:30');
    }
  } else if (timingMode === 'scheduled' && action !== 'draft') {
    formData.append('schedule_date', el.scheduleDate.value);
    formData.append('schedule_time', el.scheduleTime.value);
  }

  if (state.masterMedia.file) {
    formData.append('media', state.masterMedia.file);
  }

  if (el.ytTitle?.value.trim()) formData.append('youtube_title', el.ytTitle.value.trim());
  if (el.ytPrivacy) formData.append('youtube_privacy', el.ytPrivacy.value);
  if (state.platformMedia.youtube.mode === 'custom' && state.platformMedia.youtube.file) {
    formData.append('media_youtube', state.platformMedia.youtube.file);
  }

  if (el.xOverride?.value.trim()) formData.append('x_override', el.xOverride.value.trim());
  if (state.platformMedia.x.mode === 'custom' && state.platformMedia.x.file) {
    formData.append('media_x', state.platformMedia.x.file);
  }

  if (el.liOverride?.value.trim()) formData.append('linkedin_override', el.liOverride.value.trim());
  if (state.platformMedia.linkedin.mode === 'custom' && state.platformMedia.linkedin.file) {
    formData.append('media_linkedin', state.platformMedia.linkedin.file);
  }

  if (el.igOverride?.value.trim()) formData.append('instagram_override', el.igOverride.value.trim());
  if (state.platformMedia.instagram.mode === 'custom' && state.platformMedia.instagram.file) {
    formData.append('media_instagram', state.platformMedia.instagram.file);
  }

  if (el.threadsOverride?.value.trim()) formData.append('threads_override', el.threadsOverride.value.trim());
  if (state.platformMedia.threads.mode === 'custom' && state.platformMedia.threads.file) {
    formData.append('media_threads', state.platformMedia.threads.file);
  }

  if (el.fbOverride && el.fbOverride.value.trim()) formData.append('facebook_override', el.fbOverride.value.trim());
  if (state.platformMedia.facebook.mode === 'custom' && state.platformMedia.facebook.file) {
    formData.append('media_facebook', state.platformMedia.facebook.file);
  }

  const firstComment = document.getElementById('first_comment')?.value.trim();
  if (firstComment) formData.append('first_comment', firstComment);
  const autoDecouple = document.getElementById('auto_decouple_links')?.checked;
  formData.append('auto_decouple_links', autoDecouple ? 'true' : 'false');

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

  const xAltText = document.getElementById('x_alt_text')?.value.trim();
  if (xAltText) formData.append('x_alt_text', xAltText);

  const liDisableReshare = document.getElementById('li_disable_reshare')?.checked;
  formData.append('linkedin_disable_reshare', liDisableReshare ? '1' : '0');

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
      const msg = getPostSuccessMessage(action, isSched);
      showToast(`Post #${data.postId} ${msg}.`, 'success');

      resetComposerForm();
      const tabQueue = document.querySelector('[data-target="tab-queue"]');
      if (tabQueue) tabQueue.click();
    } else {
      showToast(`Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Network error: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = getSubmitButtonText(action, isSched);
    }
  }
}

export function resetComposerForm() {
  state.editingPostId = null;
  if (el.composerTitle) el.composerTitle.textContent = 'New Post';
  if (el.editingIndicator) el.editingIndicator.textContent = '';

  el.masterText.value = '';
  if (el.masterHashtags) el.masterHashtags.value = '';
  if (el.ytTitle) el.ytTitle.value = '';
  if (el.xOverride) el.xOverride.value = '';
  if (el.liOverride) el.liOverride.value = '';
  if (el.igOverride) el.igOverride.value = '';
  if (el.threadsOverride) el.threadsOverride.value = '';
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

  if (el.btnRemoveMasterMedia) el.btnRemoveMasterMedia.click();
  switchEditorLens('master');
  updateLivePreviews();
}

export async function fetchQueue() {
  try {
    const url = state.activeClientId ? `/api/posts?clientId=${state.activeClientId}` : '/api/posts';
    const data = await api.get(url);
    clearElement(el.postsTableBody);

    state.posts = data.posts || [];

    const calTab = document.getElementById('tab-calendar');
    if (calTab && calTab.style.display !== 'none' && onPostActionCompleted) {
      onPostActionCompleted('tab-calendar');
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
      if (post.error_summary) {
        const divErr = document.createElement('div');
        divErr.style.fontSize = '11px';
        divErr.style.color = 'var(--status-red)';
        divErr.style.marginTop = '3px';
        divErr.textContent = `⚠️ Error: ${post.error_summary}`;
        tdContent.appendChild(divErr);
      }
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
      const statusClass = getStatusBadgeClass(post.status);
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

      if (post.status === 'failed' || post.status === 'partially_completed') {
        const btnRetry = document.createElement('button');
        btnRetry.className = 'btn btn-secondary';
        btnRetry.style.padding = '4px 10px';
        btnRetry.style.fontSize = '12px';
        btnRetry.style.marginRight = '4px';
        btnRetry.style.color = 'var(--status-amber)';
        btnRetry.textContent = '🔄 Retry';
        btnRetry.addEventListener('click', async () => {
          btnRetry.disabled = true;
          btnRetry.textContent = 'Retrying...';
          try {
            const data = await api.post(`/api/posts/${post.id}/retry`);
            if (data.success) {
              showToast(`Post #${post.id} retry resolved: ${data.status}`, 'success');
              fetchQueue();
            } else {
              showToast(`Retry failed: ${data.error}`, 'error');
            }
          } catch (err) {
            showToast(`Retry error: ${err.message}`, 'error');
          } finally {
            btnRetry.disabled = false;
            btnRetry.textContent = '🔄 Retry';
          }
        });
        tdActions.appendChild(btnRetry);
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

export async function deletePost(id) {
  if (!confirm(`Delete Post #${id}?`)) return;
  try {
    await api.delete(`/api/posts/${id}`);
    showToast(`Post #${id} deleted.`, 'success');
    fetchQueue();
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

export function loadPostIntoWizard(post) {
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
  if (el.masterHashtags) el.masterHashtags.value = post.master_hashtags || '';
  if (el.ytTitle) el.ytTitle.value = post.youtube_title || '';
  if (el.ytPrivacy) el.ytPrivacy.value = post.youtube_privacy || 'unlisted';
  if (el.xOverride) el.xOverride.value = post.x_post || '';
  if (el.liOverride) el.liOverride.value = post.linkedin_post || '';
  if (el.igOverride) el.igOverride.value = post.instagram_caption || '';
  if (el.threadsOverride) el.threadsOverride.value = post.threads_post || '';
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

export function setupQueueRulesUI() {
  const btnAdd = document.getElementById('btn-add-queue-slot');
  const form = document.getElementById('add-queue-slot-form');
  const btnCancel = document.getElementById('btn-cancel-slot');
  const btnSave = document.getElementById('btn-save-slot');

  const weekdaySelect = document.getElementById('new-slot-weekday');
  const timeInput = document.getElementById('new-slot-time');
  const tzInput = document.getElementById('new-slot-tz');

  if (tzInput && (!tzInput.value || tzInput.value === 'UTC')) {
    try {
      tzInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      tzInput.value = 'UTC';
    }
  }

  if (btnAdd && form) {
    btnAdd.addEventListener('click', () => {
      form.style.display = 'block';
    });
  }

  if (btnCancel && form) {
    btnCancel.addEventListener('click', () => {
      form.style.display = 'none';
    });
  }

  if (btnSave && form) {
    btnSave.addEventListener('click', async () => {
      const weekday = weekdaySelect.value;
      const time = timeInput.value;
      const tz = tzInput.value.trim() || 'UTC';

      try {
        const data = await api.post(`/api/clients/${state.activeClientId}/queue-rules`, {
          iso_weekday: weekday,
          local_time: time,
          timezone: tz
        });

        if (data.success) {
          showToast('Added queue slot.', 'success');
          form.style.display = 'none';
          fetchQueueRules(state.activeClientId);
        } else {
          showToast(`Error: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Network error: ${err.message}`, 'error');
      }
    });
  }
}

export async function fetchQueueRules(clientId) {
  const container = document.getElementById('queue-rules-list');
  if (!container) return;

  try {
    const data = await api.get(`/api/clients/${clientId}/queue-rules`);
    clearElement(container);

    if (!data.success || !data.rules || !data.rules.length) {
      const emptySpan = document.createElement('span');
      emptySpan.style.fontSize = '12px';
      emptySpan.style.color = 'var(--text-muted)';
      emptySpan.textContent = 'No recurring slots configured. Posts scheduled to "Queue" will default to next morning 9am.';
      container.appendChild(emptySpan);
      return;
    }

    const weekdays = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    data.rules.forEach((rule) => {
      const pill = document.createElement('div');
      pill.className = 'badge badge-draft';
      pill.style.display = 'inline-flex';
      pill.style.alignItems = 'center';
      pill.style.gap = '6px';
      pill.style.padding = '5px 10px';
      pill.style.fontSize = '12px';

      const label = document.createElement('span');
      label.textContent = `${weekdays[rule.iso_weekday]} at ${rule.local_time} (${rule.timezone})`;
      pill.appendChild(label);

      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.style.background = 'transparent';
      delBtn.style.border = 'none';
      delBtn.style.color = 'var(--text-muted)';
      delBtn.style.cursor = 'pointer';
      delBtn.style.fontSize = '14px';
      delBtn.title = 'Delete slot';
      delBtn.addEventListener('click', async () => {
        try {
          await api.delete(`/api/queue-rules/${rule.id}`);
          showToast('Removed slot.', 'info');
          fetchQueueRules(clientId);
        } catch (err) {
          showToast(`Error: ${err.message}`, 'error');
        }
      });
      pill.appendChild(delBtn);

      container.appendChild(pill);
    });
  } catch (err) {
    console.error('Error fetching queue rules:', err);
  }
}
