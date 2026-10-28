/**
 * Keyboard Shortcuts Manager for Pro-Grade Editorial Workflows
 * Supports:
 * - Cmd/Ctrl + Enter : Dispatch / Schedule active draft
 * - Escape : Close open modals and drawers
 * - Alt + 1..7 : Quick switch between editor channel lenses
 */

import { switchEditorLens, submitPost } from './composer.js';
import { closeCalPostModal } from './calendar.js';
import { hideChannelModal } from './workspaces.js';

const LENS_MAP = {
  '1': 'master',
  '2': 'youtube',
  '3': 'x',
  '4': 'linkedin',
  '5': 'instagram',
  '6': 'threads',
  '7': 'facebook'
};

export function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // 1. Cmd/Ctrl + Enter to Submit or Save Post
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      const activeTab = document.querySelector('.nav-tab.active')?.getAttribute('data-target');
      if (activeTab === 'tab-wizard') {
        e.preventDefault();
        submitPost('publish');
      }
      return;
    }

    // 2. Escape to Dismiss Modals & Drawers
    if (e.key === 'Escape') {
      closeCalPostModal();
      hideChannelModal();

      const mobileDrawer = document.getElementById('mobile-preview-drawer');
      if (mobileDrawer && mobileDrawer.classList.contains('open')) {
        mobileDrawer.classList.remove('open');
      }
      return;
    }

    // 3. Alt + 1..7 Lens Switching
    if (e.altKey && LENS_MAP[e.key]) {
      const activeTab = document.querySelector('.nav-tab.active')?.getAttribute('data-target');
      if (activeTab === 'tab-wizard') {
        e.preventDefault();
        switchEditorLens(LENS_MAP[e.key]);
      }
    }
  });
}
