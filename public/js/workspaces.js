/**
 * Agency Client Workspaces & Encrypted API Credential Manager
 */

import { state, showToast, clearElement, createPlatformSvgElement } from './state.js';
import { api } from './api.js';

let onWorkspaceChanged = null;

export function registerWorkspaceChangeHandler(fn) {
  onWorkspaceChanged = fn;
}

export function openChannelModal(clientId, clientName) {
  const modal = document.getElementById('add-channel-modal');
  const title = document.getElementById('modal-client-name-title');
  const idInput = document.getElementById('modal-client-id');
  const oauthBtn = document.getElementById('btn-oauth-youtube');

  if (!modal) return;

  idInput.value = clientId;
  title.textContent = `Connect Channel — ${clientName}`;
  if (oauthBtn) {
    oauthBtn.href = `/auth/youtube?clientId=${clientId}`;
  }

  const accInput = document.getElementById('modal-account-name');
  if (accInput) accInput.value = '';

  const platSelect = document.getElementById('modal-platform-select');
  if (platSelect) platSelect.value = 'youtube';

  document.querySelectorAll('.cred-fields-block').forEach((b) => {
    b.style.display = 'none';
  });
  const ytBlock = document.getElementById('cred-fields-youtube');
  if (ytBlock) ytBlock.style.display = 'block';

  modal.style.display = 'block';
  modal.scrollIntoView({ behavior: 'smooth' });
}

export function hideChannelModal() {
  const modal = document.getElementById('add-channel-modal');
  if (modal) modal.style.display = 'none';
}

export async function fetchClients() {
  try {
    const data = await api.get('/api/clients');
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
        let accounts = [];
        try {
          const accData = await api.get(`/api/clients/${client.id}/accounts`);
          accounts = accData.accounts || [];
        } catch {
          accounts = [];
        }

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
            await api.delete(`/api/clients/${client.id}`);
            showToast('Workspace deleted.', 'info');
            await fetchClients();
            if (onWorkspaceChanged) onWorkspaceChanged(state.activeClientId);
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

        if (!accounts.length) {
          const noAcc = document.createElement('span');
          noAcc.style.fontSize = '12px';
          noAcc.style.color = 'var(--text-muted)';
          noAcc.textContent = 'No channels connected for this workspace.';
          accountsRow.appendChild(noAcc);
        } else {
          accounts.forEach((acc) => {
            const pill = document.createElement('div');
            pill.className = 'badge badge-draft';
            pill.style.display = 'inline-flex';
            pill.style.alignItems = 'center';
            pill.style.gap = '6px';
            pill.style.padding = '5px 10px';
            pill.style.fontSize = '12px';

            const icon = createPlatformSvgElement(acc.platform);
            if (icon) pill.appendChild(icon);

            const nameSpan = document.createElement('span');
            nameSpan.textContent = acc.account_name;
            pill.appendChild(nameSpan);

            const delAccBtn = document.createElement('button');
            delAccBtn.textContent = '×';
            delAccBtn.style.background = 'transparent';
            delAccBtn.style.border = 'none';
            delAccBtn.style.color = 'var(--text-muted)';
            delAccBtn.style.cursor = 'pointer';
            delAccBtn.style.fontSize = '14px';
            delAccBtn.title = 'Disconnect account';
            delAccBtn.addEventListener('click', async () => {
              if (!confirm(`Disconnect ${acc.account_name}?`)) return;
              await api.delete(`/api/accounts/${acc.id}`);
              showToast('Account disconnected.', 'info');
              await fetchClients();
            });
            pill.appendChild(delAccBtn);

            accountsRow.appendChild(pill);
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

export function setupClientsManager() {
  const headerSelect = document.getElementById('header-client-select');
  const wizardSelect = document.getElementById('wizard-client-select');
  const btnAddClient = document.getElementById('btn-add-client');
  const addClientForm = document.getElementById('add-client-form');
  const btnSaveClient = document.getElementById('btn-save-new-client');
  const btnCancelClient = document.getElementById('btn-cancel-new-client');
  const newClientName = document.getElementById('new-client-name');
  const newClientColor = document.getElementById('new-client-color');

  const modalPlatformSelect = document.getElementById('modal-platform-select');
  const btnCloseModal = document.getElementById('btn-close-channel-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const btnSaveCreds = document.getElementById('btn-save-channel-creds');

  if (headerSelect) {
    headerSelect.addEventListener('change', () => {
      state.activeClientId = parseInt(headerSelect.value, 10);
      if (wizardSelect) wizardSelect.value = state.activeClientId;
      showToast('Switched client workspace.', 'info');
      if (onWorkspaceChanged) onWorkspaceChanged(state.activeClientId);
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
        const data = await api.post('/api/clients', { name, color_code: color });
        if (data.success) {
          showToast(`Workspace "${name}" created.`, 'success');
          addClientForm.style.display = 'none';
          newClientName.value = '';
          await fetchClients();
          if (onWorkspaceChanged) onWorkspaceChanged(state.activeClientId);
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
          apiKey: document.getElementById('cred-x-key').value.trim(),
          apiSecret: document.getElementById('cred-x-secret').value.trim(),
          accessToken: document.getElementById('cred-x-token').value.trim(),
          accessSecret: document.getElementById('cred-x-token-secret').value.trim()
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
        const data = await api.post(`/api/clients/${clientId}/accounts`, {
          platform,
          account_name: accountName,
          account_handle: accountName,
          tokens
        });
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
