/**
 * Composer Platform-Specific Override Lenses Component (YouTube, X, LinkedIn, Instagram, Threads, Facebook)
 */

export function mountComposerLenses() {
  const container = document.querySelector('#composer-lenses-slot');
  if (!container || container.querySelector('.lens-pane')) return;

  const template = document.createElement('template');
  template.innerHTML = `
    <!-- LENS: YOUTUBE -->
    <div class="lens-pane platform-panel" id="panel-youtube" style="display: none;">
      <div class="field-row">
        <div class="field-header">
          <label class="form-label" for="youtube_title">Video / Short Title</label>
          <span class="char-count" id="yt-char-count">0/100</span>
        </div>
        <input type="text" id="youtube_title" placeholder="Inherits first 70 chars of Master Copy if left blank">
      </div>

      <div class="field-row">
        <label class="form-label" for="youtube_privacy">Visibility</label>
        <select id="youtube_privacy" style="margin-top: 6px;">
          <option value="unlisted" selected>Unlisted</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </div>

      <div class="field-row">
        <span class="section-label">Media Override</span>
        <div class="media-toggle-group">
          <label><input type="radio" name="media_source_youtube" value="master" checked> Master</label>
          <label><input type="radio" name="media_source_youtube" value="custom"> Custom Video</label>
          <label><input type="radio" name="media_source_youtube" value="none"> None</label>
        </div>
        <div id="custom-media-box-youtube" style="display: none;">
          <div class="dropzone" id="dropzone-youtube">
            <span class="dropzone-text">Select custom video for YouTube (.mp4, .mov)</span>
            <input type="file" id="media-youtube-input" style="display: none;" accept="video/*">
          </div>
          <div class="media-preview-container" id="media-preview-youtube" style="display: none;">
            <button class="btn-remove-media" id="btn-remove-youtube-media">Remove</button>
          </div>
        </div>
      </div>

      <!-- YOUTUBE ALGORITHM & REACH DRAWER -->
      <div class="reach-drawer" style="margin-top: 14px; background: var(--bg-base); border: 1px solid var(--border-default); border-radius: 6px; padding: 12px;">
        <span class="section-label" style="display: flex; align-items: center; gap: 6px; color: #ff0033;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2zm0 4.5l6.5 13.5h-13L12 6.5z"/></svg>
          YouTube Algorithm & Reach Knobs
        </span>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">
          <div class="field-row">
            <label class="form-label" for="yt_category">Category (SimClusters Group)</label>
            <select id="yt_category" style="margin-top: 4px;">
              <option value="28" selected>Science & Technology (28)</option>
              <option value="27">Education (27)</option>
              <option value="24">Entertainment (24)</option>
              <option value="20">Gaming (20)</option>
              <option value="26">Howto & Style (26)</option>
              <option value="22">People & Blogs (22)</option>
              <option value="25">News & Politics (25)</option>
              <option value="17">Sports (17)</option>
            </select>
          </div>
          <div class="field-row">
            <label class="form-label" for="yt_custom_thumb">Custom Thumbnail (Up to 2MB API Limit)</label>
            <input type="file" id="yt_custom_thumb" accept="image/jpeg,image/png" style="margin-top: 4px; font-size: 11px;">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; font-size: 12px; color: var(--text-secondary);">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" id="yt_synthetic_media"> AI / Altered Synthetic Media
          </label>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" id="yt_notify_subscribers" checked> Notify Subscribers Feed
          </label>
        </div>
        <div style="margin-top: 6px; font-size: 12px; color: var(--text-secondary);">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" id="yt_made_for_kids"> Made for Kids (COPPA - Disables comments & ads)
          </label>
        </div>
      </div>
    </div>

    <!-- LENS: X -->
    <div class="lens-pane platform-panel" id="panel-x" style="display: none;">
      <div class="field-row">
        <div class="field-header">
          <label class="form-label" for="x_override">X Post Override</label>
          <span class="char-count" id="x-char-count">0/280</span>
        </div>
        <textarea id="x_override" placeholder="Leave blank to auto-compile from Master Copy (capped at 280 chars)..."></textarea>
      </div>

      <div class="field-row">
        <span class="section-label">Media Override</span>
        <div class="media-toggle-group">
          <label><input type="radio" name="media_source_x" value="master" checked> Master</label>
          <label><input type="radio" name="media_source_x" value="custom"> Custom</label>
          <label><input type="radio" name="media_source_x" value="none"> None</label>
        </div>
        <div id="custom-media-box-x" style="display: none;">
          <div class="dropzone" id="dropzone-x">
            <span class="dropzone-text">Select custom image/video for X</span>
            <input type="file" id="media-x-input" style="display: none;" accept="video/*,image/*">
          </div>
          <div class="media-preview-container" id="media-preview-x" style="display: none;">
            <button class="btn-remove-media" id="btn-remove-x-media">Remove</button>
          </div>
        </div>
      </div>

      <!-- X HEAVY RANKER SETTINGS -->
      <div class="reach-drawer" style="margin-top: 14px; background: var(--bg-base); border: 1px solid var(--border-default); border-radius: 6px; padding: 12px;">
        <span class="section-label" style="display: flex; align-items: center; gap: 6px; color: var(--text-primary);">
          <span>⚡</span> X Heavy Ranker Settings
        </span>
        <div class="field-row" style="margin-top: 8px;">
          <label class="form-label" for="x_alt_text">Media Alt-Text (Indexed by Neural Semantic Search)</label>
          <input type="text" id="x_alt_text" placeholder="Descriptive image/video context for SEO and semantic ranking..." style="margin-top: 4px;">
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 11px; color: var(--status-green);">
          <span>✓ Reply settings locked to 'Everyone' (150x two-way multiplier enabled)</span>
        </div>
      </div>
    </div>

    <!-- LENS: LINKEDIN -->
    <div class="lens-pane platform-panel" id="panel-linkedin" style="display: none;">
      <div class="field-row">
        <div class="field-header">
          <label class="form-label" for="linkedin_override">LinkedIn Post Override</label>
          <span class="char-count" id="li-char-count">0/3000</span>
        </div>
        <textarea id="linkedin_override" placeholder="Leave blank to inherit Master Copy..."></textarea>
      </div>

      <div class="field-row">
        <span class="section-label">Media Override</span>
        <div class="media-toggle-group">
          <label><input type="radio" name="media_source_linkedin" value="master" checked> Master</label>
          <label><input type="radio" name="media_source_linkedin" value="custom"> Custom</label>
          <label><input type="radio" name="media_source_linkedin" value="none"> None</label>
        </div>
        <div id="custom-media-box-linkedin" style="display: none;">
          <div class="dropzone" id="dropzone-linkedin">
            <span class="dropzone-text">Select custom image, video, or PDF</span>
            <input type="file" id="media-linkedin-input" style="display: none;" accept="video/*,image/*,application/pdf">
          </div>
          <div class="media-preview-container" id="media-preview-linkedin" style="display: none;">
            <button class="btn-remove-media" id="btn-remove-linkedin-media">Remove</button>
          </div>
        </div>
      </div>

      <!-- LINKEDIN DWELL-TIME & VELOCITY DRAWER -->
      <div class="reach-drawer" style="margin-top: 14px; background: var(--bg-base); border: 1px solid var(--border-default); border-radius: 6px; padding: 12px;">
        <span class="section-label" style="display: flex; align-items: center; gap: 6px; color: #0a66c2;">
          <span>📈</span> LinkedIn Dwell-Time & Engagement Knobs
        </span>
        <div style="margin-top: 8px; font-size: 12px; color: var(--text-secondary);">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" id="li_disable_reshare"> Disable Native Reshares (Forces tagging & comments, driving 3x higher comment velocity)
          </label>
        </div>
      </div>
    </div>

    <!-- LENS: INSTAGRAM -->
    <div class="lens-pane platform-panel" id="panel-instagram" style="display: none;">
      <div class="field-row">
        <label class="form-label" for="instagram_override">Instagram Caption Override</label>
        <textarea id="instagram_override" style="margin-top: 6px;" placeholder="Leave blank to inherit Master Copy..."></textarea>
      </div>

      <div class="field-row">
        <span class="section-label">Media Override</span>
        <div class="media-toggle-group">
          <label><input type="radio" name="media_source_instagram" value="master" checked> Master</label>
          <label><input type="radio" name="media_source_instagram" value="custom"> Custom</label>
          <label><input type="radio" name="media_source_instagram" value="none"> None</label>
        </div>
        <div id="custom-media-box-instagram" style="display: none;">
          <div class="dropzone" id="dropzone-instagram">
            <span class="dropzone-text">Select 4:5 photo or 9:16 Reel</span>
            <input type="file" id="media-instagram-input" style="display: none;" accept="video/*,image/*">
          </div>
          <div class="media-preview-container" id="media-preview-instagram" style="display: none;">
            <button class="btn-remove-media" id="btn-remove-instagram-media">Remove</button>
          </div>
        </div>
      </div>

      <div class="local-meta-notice" style="margin-top: 10px; background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.25); border-radius: 6px; padding: 8px 12px; font-size: 11.5px; color: var(--text-secondary); line-height: 1.4;">
        💡 <strong style="color: var(--status-amber);">Localhost Tip:</strong> Meta's crawler requires a public HTTPS URL for photo and video ingestion. Run <code style="font-family: var(--font-mono); color: var(--text-primary); background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px;">npm run tunnel</code> in your terminal for a zero-config Cloudflare tunnel, or configure Cloudflare R2 / S3 in <code style="font-family: var(--font-mono);">.env</code>.
      </div>

      <!-- INSTAGRAM REELS & AUDIO BRANDING DRAWER -->
      <div class="reach-drawer" style="margin-top: 14px; background: var(--bg-base); border: 1px solid var(--border-default); border-radius: 6px; padding: 12px;">
        <span class="section-label" style="display: flex; align-items: center; gap: 6px; color: #e1306c;">
          <span>🎵</span> Instagram Reels & Audio Branding
        </span>
        <div class="field-row" style="margin-top: 8px;">
          <label class="form-label" for="ig_audio_name">Original Audio Title / Track Name</label>
          <input type="text" id="ig_audio_name" placeholder="e.g. Acme Studio Original" style="margin-top: 4px;">
        </div>
        <div style="margin-top: 8px; font-size: 12px; color: var(--text-secondary);">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" id="ig_is_trial"> Explore-Only Trial Reel (Tests distribution with non-followers on Explore/Reels first)
          </label>
        </div>
      </div>
    </div>

    <!-- LENS: THREADS -->
    <div class="lens-pane platform-panel" id="panel-threads" style="display: none;">
      <div class="field-row">
        <div class="field-header">
          <label class="form-label" for="threads_override">Threads Override</label>
          <span class="char-count" id="threads-char-count">0/500</span>
        </div>
        <textarea id="threads_override" placeholder="Leave blank to inherit Master Copy (1 topic tag auto-extracted)..."></textarea>
      </div>

      <div class="field-row">
        <span class="section-label">Media Override</span>
        <div class="media-toggle-group">
          <label><input type="radio" name="media_source_threads" value="master" checked> Master</label>
          <label><input type="radio" name="media_source_threads" value="custom"> Custom</label>
          <label><input type="radio" name="media_source_threads" value="none"> None</label>
        </div>
        <div id="custom-media-box-threads" style="display: none;">
          <div class="dropzone" id="dropzone-threads">
            <span class="dropzone-text">Select custom media for Threads</span>
            <input type="file" id="media-threads-input" style="display: none;" accept="video/*,image/*">
          </div>
          <div class="media-preview-container" id="media-preview-threads" style="display: none;">
            <button class="btn-remove-media" id="btn-remove-threads-media">Remove</button>
          </div>
        </div>
      </div>
    </div>

    <!-- LENS: FACEBOOK -->
    <div class="lens-pane platform-panel" id="panel-facebook" style="display: none;">
      <div class="field-row">
        <label class="form-label" for="facebook_override">Facebook Page Post Override</label>
        <textarea id="facebook_override" style="margin-top: 6px;" placeholder="Leave blank to inherit Master Copy..."></textarea>
      </div>

      <div class="field-row">
        <span class="section-label">Media Override</span>
        <div class="media-toggle-group">
          <label><input type="radio" name="media_source_facebook" value="master" checked> Master</label>
          <label><input type="radio" name="media_source_facebook" value="custom"> Custom</label>
          <label><input type="radio" name="media_source_facebook" value="none"> None</label>
        </div>
        <div id="custom-media-box-facebook" style="display: none;">
          <div class="dropzone" id="dropzone-facebook">
            <span class="dropzone-text">Select custom media for Facebook</span>
            <input type="file" id="media-facebook-input" style="display: none;" accept="video/*,image/*">
          </div>
          <div class="media-preview-container" id="media-preview-facebook" style="display: none;">
            <button class="btn-remove-media" id="btn-remove-facebook-media">Remove</button>
          </div>
        </div>
      </div>
    </div>
  `;

  container.append(template.content.cloneNode(true));
}
