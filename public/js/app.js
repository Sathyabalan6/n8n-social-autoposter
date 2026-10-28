/**
 * SocialPulse Studio — Application Root & Module Orchestrator
 * Uses browser-native ES modules (Zero-Build, No Webpack/Babel needed)
 */

import { state, clearElement } from './state.js';
import {
  setupNavigation,
  setupLensSwitcher,
  setupMasterMediaUpload,
  setupPlatformCustomMedia,
  setupComposerActions,
  setupQueueRulesUI,
  fetchQueue,
  fetchQueueRules,
  registerPostActionListener
} from './composer.js';
import { setupLiveSync } from './preview.js';
import { setupClientsManager, fetchClients, registerWorkspaceChangeHandler } from './workspaces.js';
import { setupInboxUI, fetchInboxTasks } from './inbox.js';
import { setupCalendar, renderCalendar } from './calendar.js';
import { setupKeyboardShortcuts } from './shortcuts.js';

// Setup Mobile Preview Floating Drawer
function setupMobilePreviewDrawer() {
  const fab = document.querySelector('#btn-mobile-preview-fab');
  const drawer = document.querySelector('#mobile-preview-drawer');
  const closeBtn = document.querySelector('#btn-close-mobile-preview');
  const content = document.querySelector('#mobile-preview-content');

  if (fab && drawer && content) {
    fab.addEventListener('click', () => {
      clearElement(content);
      const activeCard = document.querySelector(`.mockup-stage #card-${state.currentPreviewTab}`);
      if (activeCard) {
        const clone = activeCard.cloneNode(true);
        clone.style.display = 'block';
        content.append(clone);
      }
      drawer.classList.add('open');
    });
  }

  if (closeBtn && drawer) {
    closeBtn.addEventListener('click', () => {
      drawer.classList.remove('open');
    });
  }
}

// Coordinate events across modules
registerWorkspaceChangeHandler((clientId) => {
  fetchQueue();
  fetchQueueRules(clientId);
  fetchInboxTasks(clientId, 0);
  renderCalendar();
});

registerPostActionListener((targetTabId) => {
  if (targetTabId === 'tab-calendar') renderCalendar();
  if (targetTabId === 'tab-queue') fetchQueue();
  if (targetTabId === 'tab-inbox') fetchInboxTasks(state.activeClientId, 0);
  if (targetTabId === 'tab-clients') {
    fetchClients();
    fetchQueueRules(state.activeClientId);
  }
});

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupLensSwitcher();
  setupMasterMediaUpload();
  setupPlatformCustomMedia();
  setupLiveSync();
  setupComposerActions();
  setupClientsManager();
  setupQueueRulesUI();
  setupInboxUI();
  setupCalendar();
  setupKeyboardShortcuts();
  setupMobilePreviewDrawer();

  // Initial data fetches
  fetchClients();
  fetchQueue();
  fetchQueueRules(state.activeClientId);
});
