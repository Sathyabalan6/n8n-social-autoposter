# 🚀 SocialPulse Studio — Evolution Roadmap & Future Improvement Backlog

This document tracks completed enterprise features and provides ready-to-execute engineering blueprints for pending improvements and production hardening.

---

## 🧭 Subsystem Implementation Matrix

| Subsystem / Pillar | Status | Core Capability |
| :--- | :---: | :--- |
| **Pillar 1: Meta Media Ingestion (R2/S3)** | 🟢 **COMPLETED** | Presigned S3/R2 upload bridge for Instagram Reels / Facebook crawler |
| **Pillar 2: Post Analytics Daemon** | 🟢 **COMPLETED** | T+24h and T+7d dual-snapshot metric tracker ($0.01/post on X) |
| **Pillar 3: Recurring Queue Slots** | 🟢 **COMPLETED** | Buffer-style auto-slotting using native `Intl` DST timezone math |
| **Pillar 4: Actionable Task Inbox** | 🟢 **COMPLETED** | Task-based comment reply queue bypassing 2/10 feasibility sync traps |
| **Pillar 5: Client Approval Magic Links** | 🟢 **COMPLETED** | Passwordless single-use HMAC-SHA256 client review portal (`/review/:id`) |
| **Pillar 6: FFmpeg Worker Thread Isolation** | 🟢 **COMPLETED** | Offload video transcoding from main event loop to worker threads |
| **Pillar 7: Open-Source Governance & CI** | 🟢 **COMPLETED** | GitHub Actions workflow, MIT license, `SECURITY.md`, `CONTRIBUTING.md` |

---

## 🟢 Completed Subsystems (Already Built & Verified)

### ✅ Pillar 1: Public Media Ingestion for Meta (Cloudflare R2 / S3 Presigned Bridge)

- [x] **1.1. Storage Adapter (`src/media/storage.js`):** Built `@aws-sdk/client-s3` bridge supporting Cloudflare R2 (zero egress fees), AWS S3, or MinIO.
- [x] **1.2. Upload URL Route:** Implemented `POST /api/media/presign-upload` generating 15-minute presigned PUT URLs for browser uploads.
- [x] **1.3. Ingestion Bridge:** In `src/platforms/index.js`, dynamically bridges local media via `uploadLocalFileToCloud()` and feeds the 24-hour presigned GET URL to Meta's `/media` container creator.
- [x] **1.4. Container Polling & Fallback:** Implemented container status polling (`status_code === 'FINISHED'`) and local URL fallback detection.

### ✅ Pillar 2: Post Performance Analytics & Sync Daemon (Dual-Snapshot)

- [x] **2.1. Snapshot Table:** Added `post_metrics_snapshots` in SQLite using `BEGIN IMMEDIATE` transactions to prevent write lock collisions.
- [x] **2.2. Metrics Daemon:** In `src/scheduler.js`, added a 15-minute background job finding published posts where `now - created_at >= 24h` that have not had their `T24H` snapshot.
- [x] **2.3. Platform Pollers:**
  - YouTube: `fetchYouTubeMetrics()` querying `youtube.videos.list({ part: ['statistics'] })`
  - X (Twitter): `fetchXMetrics()` querying `GET /2/tweets/:id?tweet.fields=public_metrics`
- [x] **2.4. Calendar & Modal Overlay:** Displays impression (`👁`) and like (`❤`) counts directly on completed calendar chips, with an on-demand "🔄 Sync Metrics" action inside the modal.
- [x] **2.5. REST Endpoints:** Exposed `GET /api/posts/:id/metrics` and `POST /api/posts/:id/sync-metrics`.

### ✅ Pillar 3: Smart Recurring Queue Slots ("Buffer-Style Scheduling")

- [x] **3.1. Schedule Rules Schema:** Added `queue_rules` table in SQLite (`client_id`, `timezone`, `iso_weekday`, `local_time`).
- [x] **3.2. Pure Node.js DST-Aware Algorithm:** Implemented `calculateNextAvailableSlot()` in `src/compiler.js` using native `Intl.DateTimeFormat`.
- [x] **3.3. REST Endpoints:** Exposed `GET/POST /api/clients/:id/queue-rules`, `DELETE /api/queue-rules/:id`, and `GET /api/clients/:id/next-slot`.
- [x] **3.4. UI Integration:** Added "Add to Queue" option in Composer with live slot preview, and an interactive Weekly Schedule manager in **Workspaces & APIs**.

### ✅ Pillar 4: Task-Based Actionable Inbox & Webhook Responder

- [x] **4.1. Task Table:** Added `engagement_tasks` table in SQLite (`client_id`, `platform`, `external_comment_id`, `parent_post_id`, `author_name`, `comment_text`, `is_replied`, `reply_text`).
- [x] **4.2. Inbound Comment Poller & Reply Dispatcher:** Implemented `syncInboundComments()` and `replyToEngagementTask()` in `src/platforms/index.js` supporting YouTube (`youtube.comments.insert`), X (`in_reply_to_tweet_id`), and LinkedIn.
- [x] **4.3. Unified Inbox Dashboard:** Built dedicated **Inbox** tab in UI with "Unanswered" vs "All History" toggles, and inline quick-reply input.
- [x] **4.4. REST Endpoints:** Exposed `GET /api/clients/:id/inbox`, `POST /api/inbox/:id/reply`, `POST /api/inbox/sync`, and `DELETE /api/inbox/:id`.

### ✅ Pillar 5: Multi-Tenant Team Workflows & Client Review Magic Links

- [x] **5.1. Cryptographic Nonce Engine (`src/crypto.js`):** Implemented `generateApprovalToken()` and `validateApprovalToken()` using HMAC-SHA256 and `crypto.timingSafeEqual()`.
- [x] **5.2. Single-Use Nonce Enforced:** The database nullifies `approval_token_hash` immediately upon client approval.
- [x] **5.3. Standalone Mobile Review Portal:** Created `GET /review/:id?token=...` allowing external clients to approve/reject posts without a password.
- [x] **5.4. Dashboard Link Generator:** One-click "⚡ Magic Approval Link" button in Calendar and Queue modals.

### ✅ Pillar 6: Process Isolation & Worker Threads for FFmpeg Transcoding

- [x] **6.1. Dedicated Background Worker:** Created `src/media/worker.js` running on `node:worker_threads` with CPU core capping (`-threads 2`).
- [x] **6.2. Non-Blocking Event Loop:** Express HTTP server and background scheduler remain 100% responsive during heavy 1080p/4K video transcoding.
- [x] **6.3. API Integration:** `POST /api/media/transcode/vertical` routes through `transcodeToVerticalInWorker()`.

### ✅ Pillar 7: Open-Source Governance & CI/CD Pipeline

- [x] **7.1. LICENSE File:** Added formal `LICENSE` file (MIT License).
- [x] **7.2. SECURITY.md:** Complete vulnerability reporting policy, threat model, and cryptographic invariants.
- [x] **7.3. CONTRIBUTING.md:** Contribution guidelines, Node 24 requirement, and PR standards.
- [x] **7.4. GitHub Actions CI:** Automated `.github/workflows/ci.yml` running syntax checks and test suite on every push.

---

## 🏆 All 7 Pillars Completed

All planned enterprise milestones have been implemented, tested, and pushed to production!
