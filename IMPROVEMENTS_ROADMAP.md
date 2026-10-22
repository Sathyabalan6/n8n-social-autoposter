# 🚀 SocialPulse Studio — Evolution Roadmap & Future Improvement Backlog

This document tracks completed enterprise features and provides ready-to-execute engineering blueprints for pending improvements and production hardening.

---

## 🧭 Subsystem Implementation Matrix

| Subsystem / Pillar | Status | Core Capability |
| :--- | :---: | :--- |
| **Pillar 1: Meta Media Ingestion (R2/S3)** | 🟢 **COMPLETED** | Presigned S3/R2 upload bridge for Instagram Reels / Facebook crawler |
| **Pillar 2: Post Analytics Daemon** | 🟡 **Pending** | T+24h and T+7d dual-snapshot metric tracker ($0.01/post on X) |
| **Pillar 3: Recurring Queue Slots** | 🟢 **COMPLETED** | Buffer-style auto-slotting using native `Intl` DST timezone math |
| **Pillar 4: Actionable Task Inbox** | 🟡 **Pending** | Task-based comment reply queue bypassing 2/10 feasibility sync traps |
| **Pillar 5: Client Approval Magic Links** | 🟢 **COMPLETED** | Passwordless single-use HMAC-SHA256 client review portal (`/review/:id`) |
| **Pillar 6: FFmpeg Worker Thread Isolation** | 🟡 **Pending** | Offload video transcoding from main event loop to worker threads |
| **Pillar 7: Open-Source Governance & CI** | 🟢 **COMPLETED** | GitHub Actions workflow, MIT license, `SECURITY.md`, `CONTRIBUTING.md` |

---

## 🟢 Completed Subsystems (Already Built & Verified)

### ✅ Pillar 1: Public Media Ingestion for Meta (Cloudflare R2 / S3 Presigned Bridge)

- [x] **1.1. Storage Adapter (`src/media/storage.js`):** Built `@aws-sdk/client-s3` bridge supporting Cloudflare R2 (zero egress fees), AWS S3, or MinIO.
- [x] **1.2. Upload URL Route:** Implemented `POST /api/media/presign-upload` generating 15-minute presigned PUT URLs for browser uploads.
- [x] **1.3. Ingestion Bridge:** In `src/platforms/index.js`, dynamically bridges local media via `uploadLocalFileToCloud()` and feeds the 24-hour presigned GET URL to Meta's `/media` container creator.
- [x] **1.4. Container Polling & Fallback:** Implemented container status polling (`status_code === 'FINISHED'`) and local URL fallback detection.

### ✅ Pillar 3: Smart Recurring Queue Slots ("Buffer-Style Scheduling")

- [x] **3.1. Schedule Rules Schema:** Added `queue_rules` table in SQLite (`client_id`, `timezone`, `iso_weekday`, `local_time`).
- [x] **3.2. Pure Node.js DST-Aware Algorithm:** Implemented `calculateNextAvailableSlot()` in `src/compiler.js` using native `Intl.DateTimeFormat`.
- [x] **3.3. REST Endpoints:** Exposed `GET/POST /api/clients/:id/queue-rules`, `DELETE /api/queue-rules/:id`, and `GET /api/clients/:id/next-slot`.
- [x] **3.4. UI Integration:** Added "Add to Queue" option in Composer with live slot preview, and an interactive Weekly Schedule manager in **Workspaces & APIs**.

### ✅ Pillar 5: Multi-Tenant Team Workflows & Client Review Magic Links

- [x] **5.1. Cryptographic Nonce Engine (`src/crypto.js`):** Implemented `generateApprovalToken()` and `validateApprovalToken()` using HMAC-SHA256 and `crypto.timingSafeEqual()`.
- [x] **5.2. Single-Use Nonce Enforced:** The database nullifies `approval_token_hash` immediately upon client approval.
- [x] **5.3. Standalone Mobile Review Portal:** Created `GET /review/:id?token=...` allowing external clients to approve/reject posts without a password.
- [x] **5.4. Dashboard Link Generator:** One-click "⚡ Magic Approval Link" button in Calendar and Queue modals.

### ✅ Pillar 7: Open-Source Governance & CI/CD Pipeline

- [x] **7.1. LICENSE File:** Added formal `LICENSE` file (MIT License).
- [x] **7.2. SECURITY.md:** Complete vulnerability reporting policy, threat model, and cryptographic invariants.
- [x] **7.3. CONTRIBUTING.md:** Contribution guidelines, Node 24 requirement, and PR standards.
- [x] **7.4. GitHub Actions CI:** Automated `.github/workflows/ci.yml` running syntax checks and test suite on every push.

---

## 🟡 Remaining Things to Be Fixed & Implemented (Future Backlog)

### 📌 Pillar 2: Post Performance Analytics & Sync Daemon

#### Key Technical Context

- **The X API Cost Trap:** X API charges ~$0.005 per read operation. Continuous polling of 1,000 tweets hourly burns **$3,600/month**.
- **The Dual-Snapshot Rule:** Polling metrics *strictly twice* (at **T+24h** for viral velocity and **T+7d** for cumulative reach) caps X read costs at **exactly $0.01 per post over its lifetime**.
- **Instagram Rate Limit Formula:** Calls in 24h = $4800 \times \text{Number of Impressions}$, capped at 200 calls/user/hour.
- **Database Concurrency:** In `node:sqlite`, bulk snapshot writes must use `BEGIN IMMEDIATE` to acquire write locks upfront without throwing `SQLITE_BUSY`.

#### Execution Tasks:

- [ ] **2.1. Snapshot Table:** Add `post_metrics_snapshots` in SQLite:
  ```sql
  CREATE TABLE IF NOT EXISTS post_metrics_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      snapshot_type TEXT NOT NULL, -- 'T24H' or 'T7D'
      snapshot_time INTEGER NOT NULL,
      impression_count INTEGER DEFAULT 0,
      reach_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      repost_count INTEGER DEFAULT 0,
      raw_metrics TEXT,
      FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
  );
  ```
- [ ] **2.2. Metrics Daemon:** In `src/scheduler.js`, run a 15-minute job finding published posts where `now - created_at >= 24h` (or 7d) that have not had their snapshot taken.
- [ ] **2.3. Platform Pollers:**
  - YouTube: `youtube.videos.list({ part: ['statistics'], id: videoId })`
  - X: `GET /2/tweets/:id?tweet.fields=public_metrics`
  - LinkedIn: `GET /rest/organizationalEntityShareStatistics?q=organizationalEntity`
  - Instagram: `GET /{media-id}/insights?metric=impressions,reach,saved`
- [ ] **2.4. Calendar Overlay:** Display impression and like badges directly on completed post chips in the Editorial Calendar.

---

### 📌 Pillar 4: Task-Based Actionable Inbox

#### Key Technical Context
- Full bi-directional inboxes (syncing comment deletions and deep nested trees) have a **2/10 feasibility score** due to LinkedIn Partner gates and Meta’s 20-day video review requirement.
- **Verdict:** An **Actionable Task Queue (8/10 feasibility)** logs inbound comments as discrete items. Users reply once, and the item is dismissed (`is_replied = 1`).

#### Execution Tasks:
- [ ] **4.1. Task Table:**
  ```sql
  CREATE TABLE IF NOT EXISTS engagement_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      external_comment_id TEXT NOT NULL,
      parent_post_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      comment_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_replied INTEGER DEFAULT 0,
      reply_text TEXT
  );
  ```
- [ ] **4.2. Inbound Webhook / Poller:** Receive Meta webhooks with `X-Hub-Signature-256` verification, or poll YouTube `commentThreads.list`.
- [ ] **4.3. Unified Reply Drawer:** Dashboard tab listing unanswered comments with a quick-reply input that dispatches through the existing platform adapters.

---

### 📌 Pillar 6: Process Isolation & Worker Threads for FFmpeg Transcoding

#### Key Technical Context
- When a user uploads a 4K/FHD video and converts it to 9:16 vertical with blur padding, FFmpeg consumes 100% of available CPU cores.
- Running FFmpeg directly in the main server process can momentarily delay HTTP responses or postpone the 60-second scheduler interval.

#### Execution Tasks:
- [ ] **6.1. Worker Thread Spawning:** Wrap `transcodeToVertical()` using Node’s `node:worker_threads` or dedicated child process fork with CPU affinity settings (`-threads 2`).
- [ ] **6.2. Background Job Queue:** Return an immediate HTTP 202 Accepted status with a `jobId` and query `/api/media/jobs/:id` for progress updates.
