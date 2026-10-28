/**
 * Interactive Editorial Calendar, Month Grid Engine, and Drag-and-Drop Rescheduler
 */

import { state, el, showToast, clearElement, formatDateToIsoDay, formatPostTime, createPlatformSvgElement } from './state.js';
import { api } from './api.js';
import { loadPostIntoWizard, deletePost, fetchQueue } from './composer.js';

function getCalStatusBadgeClass(status) {
  if (status === 'completed') return 'badge-success';
  if (status === 'scheduled') return 'badge-warning';
  if (status === 'draft') return 'badge-draft';
  return 'badge-danger';
}

export function setupCalendar() {
  const btnPrev = document.getElementById('cal-btn-prev');
  const btnNext = document.getElementById('cal-btn-next');
  const btnToday = document.getElementById('cal-btn-today');

  const modal = document.getElementById('cal-post-modal');
  const modalClose = document.getElementById('cal-modal-close');
  const modalEdit = document.getElementById('cal-modal-btn-edit');
  const modalDelete = document.getElementById('cal-modal-btn-delete');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      const d = new Date(state.calendar.currentDate);
      d.setMonth(d.getMonth() - 1);
      state.calendar.currentDate = d;
      renderCalendar();
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const d = new Date(state.calendar.currentDate);
      d.setMonth(d.getMonth() + 1);
      state.calendar.currentDate = d;
      renderCalendar();
    });
  }

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      state.calendar.currentDate = new Date();
      renderCalendar();
    });
  }

  if (modalClose) modalClose.addEventListener('click', closeCalPostModal);

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

export function scheduleNewPostForDate(dateStr) {
  if (el.scheduleDate) el.scheduleDate.value = dateStr;
  if (el.scheduleTime && !el.scheduleTime.value) el.scheduleTime.value = '10:00';

  const radioSchedule = document.querySelector('input[name="timing"][value="scheduled"]');
  if (radioSchedule) {
    radioSchedule.checked = true;
    radioSchedule.dispatchEvent(new Event('change'));
  }

  const tabWizard = document.querySelector('[data-target="tab-wizard"]');
  if (tabWizard) tabWizard.click();
  if (el.masterText) el.masterText.focus();
  showToast(`Scheduling new post for ${dateStr}`, 'info');
}

export function openCalPostModal(post) {
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
    const statusClass = getCalStatusBadgeClass(post.status);
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

  const magicBtn = document.getElementById('cal-modal-btn-magic-link');
  if (magicBtn) {
    magicBtn.onclick = async () => {
      try {
        const data = await api.post(`/api/posts/${post.id}/request-approval`);
        if (data.success && data.magicLink) {
          await navigator.clipboard.writeText(data.magicLink);
          showToast('Single-use client approval link copied to clipboard!', 'success');
        } else {
          showToast(`Error: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Failed: ${err.message}`, 'error');
      }
    };
  }

  // --- POST PERFORMANCE METRICS IN MODAL ---
  const metricsBox = document.getElementById('cal-modal-metrics-box');
  const metricsContent = document.getElementById('cal-modal-metrics-content');
  const syncBtn = document.getElementById('cal-modal-btn-sync-metrics');

  if (metricsBox && metricsContent) {
    if (post.status === 'completed') {
      metricsBox.style.display = 'block';
      clearElement(metricsContent);
      metricsContent.textContent = 'Loading metrics...';

      const loadMetrics = async () => {
        try {
          const data = await api.get(`/api/posts/${post.id}/metrics`);
          clearElement(metricsContent);

          if (data.success && data.latest && data.latest.length > 0) {
            let totalImpr = 0;
            let totalLikes = 0;
            let totalReplies = 0;
            data.latest.forEach((m) => {
              totalImpr += m.impression_count || 0;
              totalLikes += m.like_count || 0;
              totalReplies += m.reply_count || 0;
            });
            const vSpan = document.createElement('span');
            vSpan.textContent = `👁 Views: ${totalImpr}`;
            const lSpan = document.createElement('span');
            lSpan.textContent = `❤ Likes: ${totalLikes}`;
            const rSpan = document.createElement('span');
            rSpan.textContent = `💬 Replies: ${totalReplies}`;
            metricsContent.appendChild(vSpan);
            metricsContent.appendChild(lSpan);
            metricsContent.appendChild(rSpan);
          } else {
            metricsContent.textContent = 'No snapshots recorded yet (dual-snapshot poller scheduled at T+24h).';
          }
        } catch {
          metricsContent.textContent = 'Failed to load metrics.';
        }
      };

      loadMetrics();

      if (syncBtn) {
        syncBtn.onclick = async () => {
          syncBtn.disabled = true;
          syncBtn.textContent = 'Syncing...';
          try {
            await api.post(`/api/posts/${post.id}/sync-metrics`);
            showToast('Metrics synced from live platform API.', 'success');
            await loadMetrics();
            fetchQueue();
          } catch (err) {
            showToast(`Sync failed: ${err.message}`, 'error');
          } finally {
            syncBtn.disabled = false;
            syncBtn.textContent = '🔄 Sync Metrics';
          }
        };
      }
    } else {
      metricsBox.style.display = 'none';
    }
  }

  modal.style.display = 'flex';
}

export function closeCalPostModal() {
  const modal = document.getElementById('cal-post-modal');
  if (modal) modal.style.display = 'none';
  state.calendar.selectedPost = null;
}

export async function handleDropReschedule(postId, targetDateStr) {
  const post = state.posts.find((p) => String(p.id) === String(postId));
  if (!post) return;

  let timePart = '10:00:00';
  if (post.scheduled_at && post.scheduled_at.includes('T')) {
    timePart = post.scheduled_at.split('T')[1].slice(0, 8);
  } else if (post.scheduled_at && post.scheduled_at.includes(' ')) {
    timePart = post.scheduled_at.split(' ')[1].slice(0, 8);
  }

  const newScheduledAt = `${targetDateStr}T${timePart}`;

  try {
    const data = await api.patch(`/api/posts/${postId}/schedule`, { scheduled_at: newScheduledAt });
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

export function renderCalendar() {
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
        const dayNum = daysInPrevMonth - (startDayOfWeek - 1 - i);
        cellDate = new Date(year, month - 1, dayNum);
        cell.classList.add('other-month');
      } else if (i >= startDayOfWeek + daysInCurrentMonth) {
        const dayNum = i - (startDayOfWeek + daysInCurrentMonth) + 1;
        cellDate = new Date(year, month + 1, dayNum);
        cell.classList.add('other-month');
      } else {
        const dayNum = i - startDayOfWeek + 1;
        cellDate = new Date(year, month, dayNum);
      }

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

        if (post.status === 'completed' && post.metrics) {
          const mBadge = document.createElement('div');
          mBadge.style.fontSize = '9px';
          mBadge.style.fontFamily = 'var(--font-mono)';
          mBadge.style.color = 'var(--text-secondary)';
          mBadge.style.marginTop = '2px';
          mBadge.textContent = `👁 ${post.metrics.total_impressions || 0} • ❤ ${post.metrics.total_likes || 0}`;
          chip.appendChild(mBadge);
        }

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
