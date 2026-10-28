/**
 * Calendar Post Quick-View & Diagnostics Modal Component
 */

export function mountCalendarModal() {
  if (document.querySelector('#cal-post-modal')) return;

  const template = document.createElement('template');
  template.innerHTML = `
    <div id="cal-post-modal" class="modal-backdrop" style="display: none;">
      <div class="modal-content" style="max-width: 480px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <span class="panel-title" id="cal-modal-title">Post Details</span>
            <div id="cal-modal-status-badge" style="margin-top: 4px;"></div>
          </div>
          <button class="btn btn-ghost" id="cal-modal-close" style="padding: 4px 8px; font-size: 14px;">✕</button>
        </div>

        <div id="cal-modal-body" style="font-size: 13px; line-height: 1.5; color: var(--text-primary); margin-bottom: 14px; background: var(--bg-base); padding: 12px; border-radius: 6px; border: 1px solid var(--border-subtle); max-height: 150px; overflow-y: auto; white-space: pre-wrap;"></div>

        <div id="cal-modal-media-preview" style="margin-bottom: 14px; display: none;"></div>

        <!-- Post Engagement Analytics Box -->
        <div id="cal-modal-metrics-box" style="display: none; background: var(--bg-base); border: 1px solid var(--border-default); border-radius: 6px; padding: 10px 12px; margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Engagement Analytics</span>
            <button class="btn btn-ghost" id="cal-modal-btn-sync-metrics" style="padding: 2px 6px; font-size: 11px; cursor: pointer;">🔄 Sync Metrics</button>
          </div>
          <div id="cal-modal-metrics-content" style="display: flex; gap: 14px; font-family: var(--font-mono); font-size: 12px; color: var(--text-primary);"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; font-size: 12px;">
          <div>
            <span style="display: block; margin-bottom: 2px; color: var(--text-muted);">Scheduled For</span>
            <span id="cal-modal-scheduled-time" style="font-family: var(--font-mono); font-weight: 500;"></span>
          </div>
          <div>
            <span style="display: block; margin-bottom: 2px; color: var(--text-muted);">Channels</span>
            <div id="cal-modal-channels" style="display: flex; gap: 6px; margin-top: 2px; align-items: center;"></div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 14px;">
          <button class="btn btn-danger" id="cal-modal-btn-delete" style="font-size: 12px; padding: 6px 12px;">Delete</button>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" id="cal-modal-btn-magic-link" style="font-size: 12px; color: var(--status-amber);">⚡ Magic Approval Link</button>
            <button class="btn btn-secondary" id="cal-modal-btn-edit" style="font-size: 12px;">Edit in Composer</button>
            <button class="btn btn-primary" id="cal-modal-btn-done" style="font-size: 12px;">Done</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.append(template.content.cloneNode(true));
}
