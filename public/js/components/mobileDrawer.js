/**
 * Mobile Live Preview Drawer & FAB Component
 */

export function mountMobileDrawer() {
  if (document.querySelector('#mobile-preview-drawer')) return;

  const template = document.createElement('template');
  template.innerHTML = `
    <!-- MOBILE LIVE PREVIEW FAB & BOTTOM SHEET DRAWER -->
    <button class="mobile-preview-fab" id="btn-mobile-preview-fab" aria-label="Open Feed Preview">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      <span>Preview Feed</span>
    </button>

    <div id="mobile-preview-drawer" class="mobile-preview-drawer">
      <div class="mobile-preview-drawer-header">
        <span class="panel-title" style="font-size: 14px;">Live Feed Preview</span>
        <button class="btn btn-ghost" id="btn-close-mobile-preview" style="padding: 4px 8px; font-size: 14px;">✕</button>
      </div>
      <div class="mobile-preview-drawer-body">
        <div id="mobile-preview-content"></div>
      </div>
    </div>
  `;

  document.body.append(template.content.cloneNode(true));
}
