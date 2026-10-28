/**
 * Actionable Community Engagement Inbox & Inline Social Replies
 */

import { state, showToast, clearElement } from './state.js';
import { api } from './api.js';

export function setupInboxUI() {
  const btnSync = document.getElementById('btn-sync-inbox');
  const btnUnreplied = document.getElementById('inbox-filter-unreplied');
  const btnAll = document.getElementById('inbox-filter-all');

  if (btnUnreplied && btnAll) {
    btnUnreplied.addEventListener('click', () => {
      btnUnreplied.classList.add('active');
      btnAll.classList.remove('active');
      fetchInboxTasks(state.activeClientId, 0);
    });

    btnAll.addEventListener('click', () => {
      btnAll.classList.add('active');
      btnUnreplied.classList.remove('active');
      fetchInboxTasks(state.activeClientId, null);
    });
  }

  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      btnSync.disabled = true;
      btnSync.textContent = 'Syncing...';
      try {
        const data = await api.post('/api/inbox/sync', { client_id: state.activeClientId });
        const count = data.syncRes?.newTasksCount || 0;
        showToast(`Synced ${count} new comments into inbox.`, 'success');
        const isReplied = btnUnreplied?.classList.contains('active') ? 0 : null;
        fetchInboxTasks(state.activeClientId, isReplied);
      } catch (err) {
        showToast(`Sync error: ${err.message}`, 'error');
      } finally {
        btnSync.disabled = false;
        btnSync.textContent = '🔄 Sync Comments';
      }
    });
  }
}

export async function fetchInboxTasks(clientId, isReplied = 0) {
  const container = document.getElementById('inbox-tasks-container');
  if (!container) return;

  try {
    const url = isReplied !== null ? `/api/clients/${clientId}/inbox?is_replied=${isReplied}` : `/api/clients/${clientId}/inbox`;
    const data = await api.get(url);
    clearElement(container);

    if (!data.success || !data.tasks || !data.tasks.length) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.textAlign = 'center';
      emptyDiv.style.color = 'var(--text-muted)';
      emptyDiv.style.padding = '40px';
      emptyDiv.style.fontSize = '13px';
      emptyDiv.textContent = isReplied === 0 ? '✓ All caught up! No unanswered comments in inbox.' : 'No comments recorded for this client.';
      container.appendChild(emptyDiv);
      return;
    }

    data.tasks.forEach((task) => {
      const card = document.createElement('div');
      card.style.background = 'var(--bg-base)';
      card.style.border = '1px solid var(--border-default)';
      card.style.borderRadius = '8px';
      card.style.padding = '14px 16px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '8px';

      const topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.justifyContent = 'space-between';
      topRow.style.alignItems = 'center';

      const authorSpan = document.createElement('div');
      authorSpan.style.display = 'flex';
      authorSpan.style.alignItems = 'center';
      authorSpan.style.gap = '8px';

      const nameEl = document.createElement('strong');
      nameEl.style.fontSize = '13px';
      nameEl.textContent = task.author_name;

      const pBadge = document.createElement('span');
      pBadge.className = 'badge badge-draft';
      pBadge.style.fontSize = '10.5px';
      pBadge.textContent = task.platform;

      authorSpan.appendChild(nameEl);
      authorSpan.appendChild(pBadge);
      topRow.appendChild(authorSpan);

      const timeSpan = document.createElement('span');
      timeSpan.style.fontSize = '11px';
      timeSpan.style.color = 'var(--text-muted)';
      timeSpan.style.fontFamily = 'var(--font-mono)';
      timeSpan.textContent = new Date(task.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      topRow.appendChild(timeSpan);

      card.appendChild(topRow);

      const commentBody = document.createElement('div');
      commentBody.style.fontSize = '13px';
      commentBody.style.lineHeight = '1.5';
      commentBody.style.color = 'var(--text-primary)';
      commentBody.textContent = task.comment_text;
      card.appendChild(commentBody);

      if (task.is_replied) {
        const repliedBox = document.createElement('div');
        repliedBox.style.background = 'rgba(34, 197, 94, 0.08)';
        repliedBox.style.border = '1px solid rgba(34, 197, 94, 0.2)';
        repliedBox.style.borderRadius = '6px';
        repliedBox.style.padding = '8px 10px';
        repliedBox.style.fontSize = '12px';
        repliedBox.style.marginTop = '4px';

        const repHeader = document.createElement('div');
        repHeader.style.color = 'var(--status-green)';
        repHeader.style.fontWeight = '600';
        repHeader.style.marginBottom = '2px';
        repHeader.textContent = '✓ Replied:';

        const repText = document.createElement('div');
        repText.textContent = task.reply_text || '';

        repliedBox.appendChild(repHeader);
        repliedBox.appendChild(repText);
        card.appendChild(repliedBox);
      } else {
        const replyArea = document.createElement('div');
        replyArea.style.display = 'flex';
        replyArea.style.gap = '8px';
        replyArea.style.marginTop = '6px';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = `Reply to ${task.author_name}...`;
        input.style.flex = '1';
        input.style.fontSize = '12px';

        const sendBtn = document.createElement('button');
        sendBtn.className = 'btn btn-primary';
        sendBtn.style.padding = '6px 14px';
        sendBtn.style.fontSize = '12px';
        sendBtn.textContent = 'Reply';

        sendBtn.onclick = async () => {
          const val = input.value.trim();
          if (!val) return;
          sendBtn.disabled = true;
          sendBtn.textContent = 'Sending...';

          try {
            const data = await api.post(`/api/inbox/${task.id}/reply`, {
              reply_text: val,
              client_id: clientId
            });

            if (data.success) {
              showToast('Reply dispatched.', 'success');
              fetchInboxTasks(clientId, isReplied);
            } else {
              showToast(`Reply error: ${data.error}`, 'error');
              sendBtn.disabled = false;
              sendBtn.textContent = 'Reply';
            }
          } catch (err) {
            showToast(`Failed: ${err.message}`, 'error');
            sendBtn.disabled = false;
            sendBtn.textContent = 'Reply';
          }
        };

        const dismissBtn = document.createElement('button');
        dismissBtn.className = 'btn btn-ghost';
        dismissBtn.style.padding = '6px 10px';
        dismissBtn.style.fontSize = '12px';
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.onclick = async () => {
          try {
            await api.delete(`/api/inbox/${task.id}`);
            showToast('Dismissed task.', 'info');
            fetchInboxTasks(clientId, isReplied);
          } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
          }
        };

        replyArea.appendChild(input);
        replyArea.appendChild(sendBtn);
        replyArea.appendChild(dismissBtn);
        card.appendChild(replyArea);
      }

      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error fetching inbox tasks:', err);
  }
}
