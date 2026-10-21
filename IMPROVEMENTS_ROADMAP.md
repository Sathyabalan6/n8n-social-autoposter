# 🚀 SocialPulse Studio — Future Evolution & Improvements Roadmap (V2)

This execution plan documents the technical findings, architectural trade-offs, and phased blueprints for the 5 Pillars of Enterprise Evolution. **Keep this document as a ready-to-execute specification for future development.**

---

## 🧭 Executive Architecture Strategy

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    Enterprise Evolution (5 Pillars)                     │
├────────────────────┬────────────────────┬───────────────────────────────┤
│ Pillar 1: R2 S3    │ Pillar 2: Dual     │ Pillar 3: Dynamic             │
│ Media Ingestion    │ Snapshot Analytics │ Recurring Queue Slots         │
│ (Zero-egress Presign)│ (T+24h & T+7d)   │ (Intl DST Timezone Math)      │
├────────────────────┴────────────────────┼───────────────────────────────┤
│ Pillar 4: Task-Based Actionable Inbox   │ Pillar 5: Single-Use Client   │
│ (8/10 Feasibility Quick Responder)      │ Magic Links (HMAC-SHA256)     │
└─────────────────────────────────────────┴───────────────────────────────┘
```

---

## 📌 Pillar 1: Public Media Ingestion for Meta (Cloudflare R2 / S3 Presigned Bridge)

### Key Technical Findings
- Meta Graph API strictly requires a public HTTP/HTTPS URL (`video_url` or `image_url`) fetched by user-agent `facebookexternalhit/1.1`.
- Local paths and localhost are rejected; tunnels occasionally suffer from timeout errors (`-2 / 2207003`).
- **Verdict:** Cloudflare R2 has **zero egress fees**, provides a 10GB free tier, and offloads heavy media uploads from the self-hosted Node.js server.
- Presigned PUT URL: 15-minute validity for browser uploads.
- Presigned GET URL: 24-hour validity to match Meta's container expiration window.

### Phase 1 Execution Blueprint
- [ ] **1.1. Storage Adapter:** Create `src/media/storage.js` using `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
- [ ] **1.2. Upload URL Route:** Implement `POST /api/media/presign-upload` returning `{ uploadUrl, objectKey }`.
- [ ] **1.3. Ingestion Bridge:** In `src/platforms/index.js` (for Instagram and Facebook), if S3/R2 is configured, pass the presigned GET URL to Meta’s `/media` container creation.
- [ ] **1.4. Fallback:** Retain local `/uploads` serving via signed URL for single-tenant local testing.

---

## 📌 Pillar 2: Post Performance Analytics & Sync Daemon

### Key Technical Findings
- **The X API Cost Trap:** X API charges ~$0.005 per read operation. Continuous polling of 1,000 tweets hourly burns **$3,600/month**.
- **The Dual-Snapshot Rule:** Polling metrics *strictly twice* (at **T+24h** for viral velocity and **T+7d** for cumulative reach) caps X read costs at **exactly $0.01 per post over its lifetime**.
- **Instagram Rate Limit Formula:** Calls in 24h = $4800 \times \text{Number of Impressions}$, capped at 200 calls/user/hour.
- **Database Concurrency:** In `node:sqlite`, bulk snapshot writes must use `BEGIN IMMEDIATE` to acquire write locks upfront without throwing `SQLITE_BUSY`.

### Phase 2 Execution Blueprint
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

## 📌 Pillar 3: Smart Recurring Queue Slots ("Buffer-Style Scheduling")

### Key Technical Findings
- Pre-generating future slots into SQL tables is brittle; editing a slot requires cascading deletes.
- **Verdict:** Dynamic calculation on post insertion using Node's native `Intl.DateTimeFormat` guarantees 100% Daylight Saving Time (DST) accuracy with zero external dependencies.

### Phase 3 Execution Blueprint
- [ ] **3.1. Schedule Rules Schema:**
  ```sql
  CREATE TABLE IF NOT EXISTS queue_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC', -- e.g. 'America/New_York'
      iso_weekday INTEGER NOT NULL, -- 1 (Monday) to 7 (Sunday)
      local_time TEXT NOT NULL, -- '09:00'
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
  );
  ```
- [ ] **3.2. Next-Available Slot Algorithm:**
  - Given a client's timezone and weekly rules, calculate the next chronological UTC epoch that is not currently occupied by a pending post in `posts`.
- [ ] **3.3. Composer Integration:** Add **"Add to Queue"** button alongside "Publish Now" and "Schedule".
- [ ] **3.4. Settings UI:** Provide a visual weekly grid in **Workspaces & APIs** to add/remove posting slots (e.g., Mon/Wed/Fri 10:00 AM).

---

## 📌 Pillar 4: Task-Based Actionable Inbox

### Key Technical Findings
- Full bi-directional inboxes (syncing comment deletions and deep nested trees) have a **2/10 feasibility score** due to LinkedIn Partner gates and Meta’s 20-day video review requirement.
- **Verdict:** An **Actionable Task Queue (8/10 feasibility)** logs inbound comments as discrete items. Users reply once, and the item is dismissed (`is_replied = 1`).

### Phase 4 Execution Blueprint
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
- [ ] **4.2. Inbound Webhook / Poller:** Receive Meta webhooks or poll YouTube `commentThreads.list`.
- [ ] **4.3. Unified Reply Drawer:** Dashboard tab listing unanswered comments with a quick-reply input that dispatches through the existing platform adapters.

---

## 📌 Pillar 5: Multi-Tenant Team Workflows & Client Review Gates

### Key Technical Findings
- Forcing agency clients to create accounts and log into third-party dashboards introduces high friction, delaying post approvals.
- **Verdict:** Single-use **HMAC-SHA256 Tokenized Magic Links** with 72-hour validity and `crypto.timingSafeEqual` verification allow clients to approve post batches via mobile in one tap.

### Phase 5 Execution Blueprint
- [ ] **5.1. Workflow State Machine:**
  - Add `workflow_status` to `posts` table: `'draft'` ➔ `'pending_approval'` ➔ `'approved'` ➔ `'scheduled'`.
  - Add `approval_token_hash TEXT` and `token_expires_at INTEGER`.
- [ ] **5.2. Magic Link Generator:**
  - Generate 32 bytes of cryptographic entropy (`crypto.randomBytes(32)`).
  - Store HMAC-SHA256 hash in SQLite.
  - Send link to client via Email, Slack, or copy-to-clipboard:
    `https://yourdomain.com/review/:postId?token={rawToken}`
- [ ] **5.3. Standalone Review Page:**
  - Lightweight, branded page displaying post mockups and copy.
  - One-click buttons: **"Approve & Schedule"** or **"Request Revisions"**.
  - Upon approval, verify token using `crypto.timingSafeEqual()`, update post status to `'scheduled'`, and immediately nullify the hash (single-use nonce).

---

## 🗂️ Verification Checklist When Ready to Implement

When you are ready to begin Phase A:
1. Verify S3/R2 credentials in `.env`.
2. Run database migration adding `queue_rules` and `post_metrics_snapshots`.
3. Test dynamic slot calculation across Daylight Saving boundaries.
4. Test HMAC-SHA256 timing-attack resistance with `crypto.timingSafeEqual`.
