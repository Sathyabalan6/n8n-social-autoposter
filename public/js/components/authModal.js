/**
 * Authentication Modal Component
 */

export function mountAuthModal() {
  if (document.querySelector('#auth-modal')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'auth-modal';
  wrapper.className = 'modal-backdrop';
  wrapper.style.display = 'none';

  wrapper.innerHTML = `
    <div class="modal-card" style="max-width: 360px;">
      <div class="modal-header">
        <span class="modal-title">Sign In to SocialPulse</span>
        <button class="modal-close" id="btn-close-auth-modal">&times;</button>
      </div>
      <form id="form-auth-login" style="display: flex; flex-direction: column; gap: 12px; margin-top: 14px;">
        <div>
          <label style="display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Email</label>
          <input type="email" id="auth-input-email" required placeholder="admin@socialpulse.local" style="width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 13px; background: var(--bg-base); border: 1px solid var(--border-default); border-radius: 6px; color: var(--text-primary);">
        </div>
        <div>
          <label style="display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Password</label>
          <input type="password" id="auth-input-password" required placeholder="••••••••••••" style="width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 13px; background: var(--bg-base); border: 1px solid var(--border-default); border-radius: 6px; color: var(--text-primary);">
        </div>
        <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4;">
          Default admin: <span style="font-family: var(--font-mono); color: var(--text-primary);">admin@socialpulse.local</span> / <span style="font-family: var(--font-mono); color: var(--text-primary);">SocialPulseAdmin2026!</span>
        </div>
        <button type="submit" class="btn btn-primary" id="btn-submit-auth" style="margin-top: 6px; width: 100%;">Sign In</button>
      </form>
    </div>
  `;

  document.body.append(wrapper);

  const closeBtn = document.querySelector('#btn-close-auth-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      wrapper.style.display = 'none';
    });
  }
}
