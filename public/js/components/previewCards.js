/**
 * Social Media Feed Mockup Cards Component (YouTube, X, LinkedIn, Instagram, Threads, Facebook)
 */

export function mountPreviewCards() {
  const container = document.querySelector('#mockup-stage-container');
  if (!container || container.querySelector('.preview-card')) return;

  const template = document.createElement('template');
  template.innerHTML = `
    <!-- YouTube Preview Card -->
    <div class="social-card yt-mockup preview-card" id="card-youtube">
      <div class="yt-desktop-player">
        <div class="yt-media-layer" id="yt-preview-player">
          <span id="yt-player-placeholder">16:9 Video Canvas</span>
        </div>
        <div class="yt-player-chrome">
          <div class="yt-progress-bar">
            <div class="yt-progress-fill"></div>
          </div>
          <div class="yt-controls-row">
            <div class="yt-controls-left">
              <svg class="yt-icon" viewBox="0 0 24 24"><path fill="#fff" d="M8 5v14l11-7z"/></svg>
              <svg class="yt-icon" viewBox="0 0 24 24"><path fill="#fff" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
              <span class="yt-timestamp">0:14 / 0:58</span>
            </div>
            <div class="yt-controls-right">
              <svg class="yt-icon" viewBox="0 0 24 24"><path fill="#fff" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
            </div>
          </div>
        </div>
      </div>
      <div class="yt-title" id="yt-preview-title">Untitled Video</div>
      <div class="yt-channel-row">
        <div class="yt-avatar">S</div>
        <div>
          <div style="font-weight: 600; font-size: 13px;">Sathya Balan</div>
          <div style="font-size: 11.5px; color: #aaa;">Just now</div>
        </div>
      </div>
      <div class="yt-desc-box" id="yt-preview-desc">Description preview...</div>
    </div>

    <!-- X Preview Card -->
    <div class="social-card x-mockup preview-card" id="card-x" style="display: none;">
      <div class="x-card">
        <div class="x-avatar">S</div>
        <div class="x-content-col">
          <div class="x-header">
            <div class="x-author-info">
              <span class="x-name">Sathya Balan</span>
              <svg class="x-badge" viewBox="0 0 24 24"><path d="M10.5213 2.62368C11.3147 1.75255 12.6853 1.75255 13.4787 2.62368L14.7335 4.00164C15.0116 4.30722 15.4227 4.47547 15.8451 4.45638L17.7011 4.37262C18.8845 4.31919 19.8654 5.21043 19.9825 6.38612L20.1678 8.24822C20.2088 8.66068 20.4037 9.0436 20.7139 9.32454L22.0759 10.5583C22.9439 11.3444 22.9439 12.6556 22.0759 13.4417L20.7139 14.6755C20.4037 14.9564 20.2088 15.3393 20.1678 15.7518L19.9825 17.6139C19.8654 18.7896 18.8845 19.6808 17.7011 19.6274L15.8451 19.5436C15.4227 19.5245 15.0116 19.6928 14.7335 19.9984L13.4787 21.3763C12.6853 22.2475 11.3147 22.2475 10.5213 21.3763L9.26652 19.9984C8.98842 19.6928 8.57726 19.5245 8.15486 19.5436L6.29891 19.6274C5.11545 19.6808 4.1346 18.7896 4.01748 17.6139L3.8322 15.7518C3.79116 15.3393 3.59627 14.9564 3.28612 14.6755L1.92408 13.4417C1.05608 12.6556 1.05608 11.3444 1.92408 10.5583L3.28612 9.32454C3.59627 9.0436 3.79116 8.66068 3.8322 8.24822L4.01748 6.38612C4.1346 5.21043 5.11545 4.31919 6.29891 4.37262L8.15486 4.45638C8.57726 4.47547 8.98842 4.30722 9.26652 4.00164L10.5213 2.62368ZM11.0827 15.0592L16.7453 9.39659L15.3311 7.98238L10.3756 12.9379L8.25439 10.8167L6.84018 12.2309L9.66838 15.0592L10.3756 15.7663L11.0827 15.0592Z"/></svg>
              <span class="x-handle">@sathyabalan · now</span>
            </div>
          </div>
          <div class="x-body" id="x-preview-text">Post text will render here...</div>
          <div class="x-media-box" id="x-preview-media" style="display: none;"></div>
          <div class="x-actions">
            <div class="x-action"><svg viewBox="0 0 24 24"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/></svg><span>12</span></div>
            <div class="x-action"><svg viewBox="0 0 24 24"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg><span>48</span></div>
            <div class="x-action"><svg viewBox="0 0 24 24"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/></svg><span>256</span></div>
            <div class="x-action"><svg viewBox="0 0 24 24"><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"/></svg><span>8</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- LinkedIn Preview Card -->
    <div class="social-card li-mockup preview-card" id="card-linkedin" style="display: none;">
      <div class="in-card">
        <div class="in-header">
          <div class="in-avatar">S</div>
          <div class="in-author-meta">
            <div class="in-name-row">
              <span class="in-name">Sathya Balan</span>
              <svg class="in-verified" viewBox="0 0 24 24" width="14" height="14"><path fill="#0a66c2" d="M12 2L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-3zm-2 14l-4-4 1.41-1.41L10 13.17l6.59-6.59L18 8l-8 8z"/></svg>
            </div>
            <div class="in-headline">Engineering & Automation</div>
            <div class="in-timestamp">Just now</div>
          </div>
        </div>
        <div class="in-body">
          <div class="in-text-clamped" id="li-preview-text">Post narrative will render here...</div>
          <span class="in-see-more">...see more</span>
        </div>
        <div class="in-media-card" id="li-preview-media-card" style="display: none;">
          <div class="in-media-img" id="li-preview-media"></div>
        </div>
        <div class="in-engagement-counts">
          <span>142 reactions</span>
          <span>18 comments</span>
        </div>
        <div class="in-action-bar">
          <button class="in-action-btn">Like</button>
          <button class="in-action-btn">Comment</button>
          <button class="in-action-btn">Repost</button>
          <button class="in-action-btn">Send</button>
        </div>
      </div>
    </div>

    <!-- Instagram Preview Card -->
    <div class="social-card preview-card" id="card-instagram" style="display: none;">
      <div class="ig-feed-container">
        <div class="ig-feed-header">
          <div class="ig-feed-avatar">S</div>
          <div class="ig-feed-author">
            <span class="ig-feed-username">sathyabalan</span>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="#0095f6"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z"/></svg>
          </div>
        </div>
        <div class="ig-feed-media" id="ig-preview-player">
          <span>4:5 Media Canvas</span>
        </div>
        <div class="ig-feed-actions">
          <div class="ig-action-group-left">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </div>
        </div>
        <div class="ig-feed-caption-area">
          <span class="ig-feed-username">sathyabalan</span>
          <span id="ig-preview-caption" style="margin-left: 6px; color: #d4d4d8;">Caption preview...</span>
        </div>
      </div>
    </div>

    <!-- Threads Preview Card -->
    <div class="social-card threads-mockup preview-card" id="card-threads" style="display: none;">
      <div class="th-card">
        <div class="th-grid">
          <div class="th-avatar-col">
            <div class="th-avatar">S</div>
            <div class="th-threadline"></div>
          </div>
          <div class="th-content-col">
            <div class="th-header">
              <span class="th-username">sathyabalan</span>
              <span style="color:#777; font-size:12px;">now</span>
            </div>
            <div class="th-body" id="threads-preview-text">Threads post preview...</div>
            <div class="th-media" id="threads-preview-media" style="display: none;"></div>
            <div><span class="th-tag-pill" id="threads-topic-pill">topic</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Facebook Preview Card -->
    <div class="social-card fb-mockup preview-card" id="card-facebook" style="display: none;">
      <div class="fb-card">
        <div class="fb-header">
          <div class="fb-avatar">S</div>
          <div>
            <div class="fb-name">Sathya Balan</div>
            <div class="fb-timestamp">Just now</div>
          </div>
        </div>
        <div class="fb-body" id="fb-preview-text">Facebook post preview...</div>
        <div class="fb-media" id="fb-preview-media" style="display: none;"></div>
        <div class="fb-action-bar">
          <button class="fb-action-btn">Like</button>
          <button class="fb-action-btn">Comment</button>
          <button class="fb-action-btn">Share</button>
        </div>
      </div>
    </div>
  `;

  container.append(template.content.cloneNode(true));
}
