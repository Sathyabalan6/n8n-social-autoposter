/**
 * Channel Credentials & OAuth Modal Component
 */

export function mountChannelModal() {
  if (document.getElementById('add-channel-modal')) return;

  const container = document.getElementById('channel-modal-slot');
  if (!container) return;

  const template = document.createElement('template');
  template.innerHTML = `
    <div id="add-channel-modal" style="display: none; background: var(--bg-base); border: 1px solid var(--border-focus); padding: 18px; border-radius: 8px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <span class="panel-title" id="modal-client-title">Connect Channel</span>
        <button class="btn btn-ghost" id="btn-close-channel-modal" style="padding: 4px 8px; font-size: 12px;">Close</button>
      </div>
      
      <input type="hidden" id="modal-client-id">

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
        <div>
          <label class="form-label" for="modal-platform-select">Platform</label>
          <select id="modal-platform-select" style="margin-top: 4px;">
            <option value="youtube">YouTube (OAuth 2.0)</option>
            <option value="x">X / Twitter (API v2)</option>
            <option value="linkedin">LinkedIn (Posts API)</option>
            <option value="instagram">Instagram (Graph API)</option>
            <option value="threads">Threads (Graph API)</option>
            <option value="facebook">Facebook (Page API)</option>
          </select>
        </div>
        <div>
          <label class="form-label" for="modal-account-name">Account Handle / Label</label>
          <input type="text" id="modal-account-name" style="margin-top: 4px;" placeholder="e.g. @brandhandle">
        </div>
      </div>

      <div id="cred-fields-youtube" class="cred-fields-block" style="background: var(--bg-panel); padding: 14px; border-radius: 6px; border: 1px solid var(--border-subtle); margin-bottom: 14px;">
        <p style="font-size: 12.5px; color: var(--text-secondary); margin-bottom: 10px;">Authenticate this client's YouTube channel via Google OAuth 2.0:</p>
        <a href="#" id="modal-yt-oauth-btn" class="btn btn-primary">Authorize Google Account</a>
      </div>

      <div id="cred-fields-x" class="cred-fields-block" style="display: none; background: var(--bg-panel); padding: 14px; border-radius: 6px; border: 1px solid var(--border-subtle); margin-bottom: 14px;">
        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">Supports OAuth 1.0a (Full media upload & posting) or OAuth 2.0 User Bearer Token:</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
          <div class="field-row">
            <label class="form-label" for="cred-x-apikey">Consumer API Key</label>
            <input type="text" id="cred-x-apikey" style="margin-top: 4px;" placeholder="API Key">
          </div>
          <div class="field-row">
            <label class="form-label" for="cred-x-apisecret">Consumer API Secret</label>
            <input type="password" id="cred-x-apisecret" style="margin-top: 4px;" placeholder="API Secret">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="field-row">
            <label class="form-label" for="cred-x-token">Access Token / Bearer</label>
            <input type="text" id="cred-x-token" style="margin-top: 4px;" placeholder="Access Token">
          </div>
          <div class="field-row">
            <label class="form-label" for="cred-x-secret">Access Token Secret</label>
            <input type="password" id="cred-x-secret" style="margin-top: 4px;" placeholder="Access Token Secret">
          </div>
        </div>
      </div>

      <div id="cred-fields-linkedin" class="cred-fields-block" style="display: none; background: var(--bg-panel); padding: 14px; border-radius: 6px; border: 1px solid var(--border-subtle); margin-bottom: 14px;">
        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">Authenticate with a Member or Company page OAuth token:</p>
        <div class="field-row" style="margin-bottom: 8px;">
          <label class="form-label" for="cred-li-token">OAuth Access Token</label>
          <input type="password" id="cred-li-token" style="margin-top: 4px;" placeholder="AQV...">
        </div>
        <div class="field-row">
          <label class="form-label" for="cred-li-urn">Author URN (Optional — auto-detected if empty)</label>
          <input type="text" id="cred-li-urn" style="margin-top: 4px;" placeholder="e.g. urn:li:organization:12345678 or leave blank for user profile">
        </div>
      </div>

      <div id="cred-fields-instagram" class="cred-fields-block" style="display: none; background: var(--bg-panel); padding: 14px; border-radius: 6px; border: 1px solid var(--border-subtle); margin-bottom: 14px;">
        <div class="field-row">
          <label class="form-label" for="cred-ig-token">Meta Graph Access Token</label>
          <input type="text" id="cred-ig-token" style="margin-top: 4px;" placeholder="Long-lived token">
        </div>
        <div class="field-row">
          <label class="form-label" for="cred-ig-id">Instagram Business Account ID</label>
          <input type="text" id="cred-ig-id" style="margin-top: 4px;" placeholder="178414000...">
        </div>
      </div>

      <div id="cred-fields-threads" class="cred-fields-block" style="display: none; background: var(--bg-panel); padding: 14px; border-radius: 6px; border: 1px solid var(--border-subtle); margin-bottom: 14px;">
        <div class="field-row">
          <label class="form-label" for="cred-threads-token">Threads User Access Token</label>
          <input type="text" id="cred-threads-token" style="margin-top: 4px;" placeholder="Threads Access Token">
        </div>
      </div>

      <div id="cred-fields-facebook" class="cred-fields-block" style="display: none; background: var(--bg-panel); padding: 14px; border-radius: 6px; border: 1px solid var(--border-subtle); margin-bottom: 14px;">
        <div class="field-row">
          <label class="form-label" for="cred-fb-token">Page Access Token</label>
          <input type="text" id="cred-fb-token" style="margin-top: 4px;" placeholder="Permanent Page Token">
        </div>
        <div class="field-row">
          <label class="form-label" for="cred-fb-pageid">Page ID</label>
          <input type="text" id="cred-fb-pageid" style="margin-top: 4px;" placeholder="Numeric Page ID">
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button class="btn btn-ghost" id="btn-cancel-modal">Cancel</button>
        <button class="btn btn-primary" id="btn-save-channel-creds">Save to Encrypted Vault</button>
      </div>
    </div>
  `;

  container.append(template.content.cloneNode(true));
}
