# SocialPulse

> A lightweight, self-hosted social media auto-poster and scheduling calendar for creators, marketers, and agencies.

Publish and schedule content simultaneously to **YouTube, X (Twitter), LinkedIn, Instagram, Threads, and Facebook** with complete privacy and zero monthly subscription fees.

---

## Highlights

* **Multi-Platform Publishing in One Click:** Author once in the Master Composer, customize per-channel copy with live feed previews, and dispatch across all 6 networks simultaneously.
* **Reach Shield (Anti-Penalty Link Decoupling):** Automatically extracts outbound URLs and schedules them as an automated first-comment or threaded reply, avoiding the organic reach penalty on X and LinkedIn.
* **Drag-and-Drop Editorial Calendar:** Visually organize posts on an interactive monthly calendar. Reschedule posts simply by dragging chips to new dates.
* **Recurring Queue Slots (Buffer-style):** Define posting schedules per day of the week (e.g. Mon & Wed at 9:30 AM). Choosing "Add to Queue" automatically reserves the next open slot.
* **In-App Video Transcoding:** Automatically inspects uploaded media and converts horizontal 16:9 videos into 9:16 vertical shorts with blurred background padding using background worker threads.
* **Zero-Build, Modern Architecture:** Pure Node.js and browser-native ES modules. No Webpack, no Vite, no heavy ORMs. Runs on an embedded SQLite database in WAL mode with zero external service dependencies.
* **Client Workspaces & Encrypted Vault:** Manage multiple brand profiles with distinct color codes. All social API tokens are encrypted at rest using AES-256-GCM.
* **Passwordless Client Approvals:** Generate single-use HMAC-SHA256 magic review links for clients to approve or reject scheduled drafts on mobile without needing an account.

---

## Supported Networks

| Platform | Capabilities | Auth Method |
| :--- | :--- | :--- |
| **YouTube** | Videos & Shorts, Custom Thumbnails, Categories, COPPA flags, Comments | Google OAuth 2.0 |
| **X (Twitter)** | Tweets, Chunked Media (4MB segments), Alt-text, Threaded Replies | OAuth 1.0a / Bearer |
| **LinkedIn** | Posts, Images, Video, PDF Document Carousels, Comments | REST 202401 & UGC |
| **Instagram** | Single Photo, Reels Video, Audio Branding, Trial Reels | Meta Graph API |
| **Threads** | Text, Images, Video, Quote Posts, First Reply | Threads Graph API |
| **Facebook** | Page Feed Posts, Direct Photo & Video Uploads, Comments | Meta Graph API |

---

## Quick Start (3 Steps)

### 1. Clone & Install
```bash
git clone https://github.com/Sathyabalan6/social-auto-post.git
cd social-auto-post
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Generate an encryption secret (minimum 32 characters) for your local token vault:
```env
PORT=3000
BASE_URL=http://localhost:3000
ENCRYPTION_SECRET=your_32_character_random_secret_here_12345
JWT_SECRET=your_32_character_jwt_secret_here_12345
ADMIN_EMAIL=admin@socialpulse.local
ADMIN_PASSWORD=SocialPulseAdmin2026!
```

### 3. Run the App
```bash
# Start server
npm start

# Or start with auto-reload during development:
npm run dev
```
Open **`http://localhost:3000`** in your browser. Pre-seeded demo posts and calendar slots are loaded on first launch so you can explore immediately.

---

## Testing Meta on Localhost (Free Cloudflare Tunnel)

Meta's Graph API (Instagram & Facebook) requires a public HTTPS URL for image and video crawlers. You don't need to buy a domain or configure port forwarding:

```bash
# In a separate terminal, start a zero-config Cloudflare tunnel:
npm run tunnel
```
Copy the generated `https://*.trycloudflare.com` URL into `BASE_URL` in your `.env` file, and local media uploads will ingest seamlessly.

---

## Docker Deployment

To run with persistent volumes using Docker:

```bash
docker compose up -d
```
The container runs an unprivileged non-root Node user with system FFmpeg and healthcheck monitoring enabled on `/healthz`.

---

## Test Suite

Run the full automated test suite (32 unit, integration, and platform adapter contract checks):

```bash
npm test
```

---

## Documentation

* [API Reference](docs/api-reference.md) — REST endpoint documentation and payload schemas.
* [Deployment Guide](DEPLOYMENT_GUIDE.md) — Production setup for Ubuntu/VPS, PM2, Docker, and Nginx.
* [Security Policy](SECURITY.md) — Vulnerability reporting, token encryption, and session boundaries.
* [Architecture Notes](docs/architecture.md) — Design decisions, SQLite WAL concurrency, and queue mechanics.
* [Contributing](CONTRIBUTING.md) — Development guidelines and pull request instructions.

---

## License

Released under the [MIT License](LICENSE).
