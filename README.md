# 🚀 SocialPulse Studio — Multi-Platform Social Media Auto-Poster & Growth Engine

A modern, self-hosted multi-channel social media publishing engine and visual editorial workbench for teams and agencies. Publish and schedule content across **YouTube (Videos & Shorts), X (Twitter), LinkedIn, Instagram, Threads, and Facebook** with **ZERO Docker**, **ZERO external database servers**, and **ZERO recurring monthly fees**.

Unlike traditional social media schedulers that act as "dumb pipes" (stripping reach parameters and triggering algorithmic down-ranking), **SocialPulse Studio is built algorithm-first**, implementing deep reach knobs, automatic link decoupling, and neural-network engagement multipliers.

---

## 🌟 Key Capabilities

1. **Anti-Penalty Link Decoupling (The First-Comment Engine):**
   - External links in main post copy cut organic reach by up to **80% on X** and **40% on LinkedIn**.
   - SocialPulse automatically detects external URLs in body copy and decouples them into an automated **First Comment / Threaded Reply**, dispatched 5 seconds after publication.
2. **Deep Algorithmic Reach Knobs:**
   - **YouTube:** Custom 50MB thumbnails (`thumbnails.set`), SimClusters Category taxonomy (`snippet.categoryId`), COPPA compliance (`selfDeclaredMadeForKids`), AI disclosure (`containsSyntheticMedia`), and notification shielding (`notifySubscribers=false`).
   - **X (Twitter):** Media Alt-Text injection (`metadata/create.json`), universal reply opening (`reply_settings: "everyone"` to preserve 150x reply weights), and threaded replies (`in_reply_to_tweet_id`).
   - **LinkedIn:** Swipeable PDF document carousels (`urn:li:document`), forced comment velocity (`isReshareDisabledByAuthor: true`), and comment-edge links.
   - **Instagram:** Reels format routing (`media_type: "REELS"`), custom audio indexing (`audio_name`), and Explore-only distribution testing (`trial_params`).
   - **Meta Threads:** Relational quote chains (`quote_post_id`) and asymmetric quota exploitation (1,000 replies/day).
3. **Interactive Editorial Calendar (Month & Week Views):**
   - Full drag-and-drop calendar planning. Drag a post to any day to reschedule it instantly while preserving its scheduled time.
   - Quick-schedule `+` button on any day cell pre-fills the composer with that date.
   - Post detail modal to preview copy, media, status, and channels.
4. **Embedded FFmpeg Media & Transcoding Engine:**
   - Bundles cross-platform `ffmpeg-static` and `ffprobe-static` binaries directly.
   - **Automatic Inspection:** Real-time aspect ratio, resolution, duration, and codec probing.
   - **Smart Vertical Conversion:** One-click conversion of 16:9 horizontal videos to 9:16 vertical videos with blurred background padding for YouTube Shorts and Instagram Reels.
   - **Poster Frame Generator:** Automatic high-resolution thumbnail extraction.
5. **Zero-Docker, Native Embedded Operations:**
   - Powered by Node.js 24 and embedded **`node:sqlite`** running in enterprise **WAL (Write-Ahead Logging)** mode with 5-second busy timeout and atomic worker lease locks.
   - All state, queues, and AES-256-GCM encrypted credentials live in a single local `posts.sqlite` file.
6. **Client Workspace Isolation & Vault:**
   - Multi-tenant client workspace partitioning with encrypted credential storage.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (`.env`)

Copy `.env.example` to `.env` and configure your credentials:

```bash
cp .env.example .env
```

Key environment settings:

```env
PORT=3000
ENCRYPTION_SECRET=your_super_secret_vault_encryption_key_here

# YouTube OAuth
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/youtube/callback

# X (Twitter) API v2
X_API_KEY=your_x_api_key
X_API_SECRET=your_x_api_secret
X_ACCESS_TOKEN=your_x_access_token
X_ACCESS_SECRET=your_x_access_token_secret

# LinkedIn REST API
LINKEDIN_ACCESS_TOKEN=your_linkedin_access_token
LINKEDIN_PERSON_URN=urn:li:person:your_urn_here
```

*(Note: Credentials can also be configured per-client directly inside the web UI under **Workspaces & APIs**!)*

### 3. Start the Server

```bash
npm start
```

For auto-reloading development mode:

```bash
npm run dev
```

Open your browser at:  
👉 **`http://localhost:3000`**

---

## 🖥️ Workbench Views

1. **Composer & Algorithm Studio:**
   - Left side: Multi-channel composer with platform override lenses.
   - Master First-Comment & Outbound Link Anti-Penalty box.
   - Deep reach drawers: YouTube Category/COPPA/AI knobs, X Alt-Text, LinkedIn Reshare Blocker, Instagram Reels Trial testing.
   - Real-time video inspector and one-click `⚡ Auto-Convert 9:16` button.
   - Right side: Authentic, pixel-perfect social mockup previews for each selected network.
2. **Editorial Calendar:**
   - Month and Week views showing all scheduled, published, and draft posts.
   - HTML5 Drag-and-drop to reschedule posts across days while preserving the scheduled time.
   - Click `+` on any date cell to schedule a post for that day.
   - Click any post chip to view formatted copy, media attachments, or trigger quick editing.
3. **Queue & History:**
   - Searchable, client-scoped tabular view of all pending, published, and failed posts.
   - Direct links to live published posts on YouTube, X, and LinkedIn.
4. **Workspaces & APIs:**
   - Multi-tenant client workspace switcher.
   - Encrypted credential vault for YouTube OAuth, X API v2 keys, LinkedIn tokens, and Meta credentials.

---

## 📁 Project Structure & Documentation

```text
├── public/
│   ├── index.html        # Unified studio workbench UI (Composer, Calendar, Queue, Vault)
│   ├── app.js            # Reactive frontend controller & drag-and-drop calendar
│   ├── styles.css        # High-contrast dark theme & responsive layouts
│   └── uploads/          # Local media storage directory (24h auto-GC)
├── src/
│   ├── server.js         # Express HTTP server & REST API endpoints
│   ├── db.js             # Native node:sqlite database operations & atomic job leases
│   ├── compiler.js       # Deterministic platform validation & anti-penalty link decoupling
│   ├── scheduler.js      # Background scheduler timer & media cleanup daemon
│   ├── crypto.js         # AES-256-GCM encryption & PBKDF2 key derivation
│   ├── media/
│   │   └── transcoder.js # Embedded FFmpeg & FFprobe video engine (16:9 -> 9:16)
│   └── platforms/
│       ├── index.js      # Multi-platform Two-Stage dispatcher registry
│       ├── youtube.js    # YouTube Data API v3, 50MB thumbnails & comment threads
│       ├── x.js          # X API v2 (Tweets), alt-text & threaded replies
│       └── linkedin.js   # LinkedIn REST Posts API, PDF carousels & comment edge
├── ARCHITECTURE.md       # Deep-dive architectural review & failure modes
├── API_REFERENCE.md      # Complete REST API documentation & payload schemas
├── DEPLOYMENT_GUIDE.md   # Production deployment & API developer portal setup
├── IMPROVEMENTS_ROADMAP.md # Enterprise V2 execution blueprints & technical findings
├── plan.md               # Phased implementation plan & completion status
├── package.json
└── social_auto_poster_workflow.json # Optional n8n workflow integration
```

---

## 📚 Detailed Documentation

- **[Architecture Review & System Design](ARCHITECTURE.md)**: Concurrency models, optimistic locking, security posture, and failure modes.
- **[REST API Reference](API_REFERENCE.md)**: Full endpoint list, query parameters, request/response JSON schemas.
- **[Production & Developer Setup Guide](DEPLOYMENT_GUIDE.md)**: How to configure developer apps for Google, Twitter, LinkedIn, and Meta, plus VPS deployment.
- **[Enterprise Improvements Roadmap (V2)](IMPROVEMENTS_ROADMAP.md)**: Technical findings and execution blueprints for Cloudflare R2, Dual-Snapshot Analytics, Dynamic Queue Slots, and Client Magic Links.
- **[Engineering Implementation Plan](plan.md)**: Complete tracking of all 6 architectural phases.

---

## ⚖️ Buffer vs. SocialPulse Studio

| Feature | Buffer (Commercial SaaS) | SocialPulse Studio |
| :--- | :--- | :--- |
| **Cost** | $6 to $12 / channel / mo | **$0 / Free forever** |
| **Data Privacy** | Cloud SaaS (Third-party servers) | **100% On-Premise & Encrypted** |
| **Infrastructure** | Proprietary Cloud | **Native Node.js 24 + Embedded SQLite** |
| **Link Anti-Penalty (First Comment)** | Paid Add-on (limited channels) | **Native Automated Decoupling (X, LinkedIn, IG, YT)** |
| **YouTube Reach Knobs** | Basic Title/Desc only | **Categories, 50MB thumbs, COPPA, AI flags, Notify shield** |
| **X Heavy Ranker Knobs** | Basic text | **Alt-text injection, 150x reply settings locked** |
| **LinkedIn Engagement Knobs** | Basic post | **PDF carousels, Disable-Reshare comment trigger** |
| **Editorial Calendar** | Interactive drag-and-drop | **Interactive HTML5 drag-and-drop** |
| **Media Transcoding** | Cloud transcoding queue | **Embedded FFmpeg blur-padding engine** |

---

## 📄 License

ISC License. Open-source and free for personal, team, or commercial use.
