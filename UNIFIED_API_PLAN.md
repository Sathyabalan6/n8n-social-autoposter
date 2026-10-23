# 🏛️ SocialPulse Unified API — Architectural Plan & Trade-Offs (Path A)

This document provides a realistic, critical assessment of the downsides and limitations of the self-hosted architecture (Path A: Node.js 24 + embedded `node:sqlite` + static FFmpeg), followed by a phased engineering plan to transform SocialPulse Studio into your own **Private Unified Social Media API** (comparable to Late.dev or Ayrshare).

---

## ⚠️ Part 1: Honest Downsides & Structural Bottlenecks

While Path A gives you **100% code ownership** and **predictable $0–$5/month hosting**, you must be aware of the genuine technical constraints and liabilities:

### 1. Vertical Scaling Ceiling (The Single-Server Boundary)
* **The Reality:** Embedded `node:sqlite` in WAL mode handles hundreds of concurrent reads and serialized writes with ease. However, **SQLite cannot scale horizontally across multiple load-balanced servers**.
* **The Constraint:** You cannot run 5 different VPS instances sharing one `posts.sqlite` file over networked filesystems (NFS/EFS latency breaks SQLite lock leases). If your platform eventually scales to thousands of concurrent paying SaaS clients, you will be forced to migrate the storage layer from SQLite to PostgreSQL.
* **When it matters:** Not an issue for an agency managing 50–500 client accounts on a single VPS. It only becomes a bottleneck if you launch a public retail SaaS with 10,000+ simultaneous users.

### 2. Compute Saturation During 4K Video Transcoding
* **The Reality:** Even with our dedicated worker threads and CPU capping (`-threads 2`), video re-encoding is fundamentally CPU-bound.
* **The Constraint:** On a budget $5/month VPS (1 or 2 vCPUs), converting a 2-minute 4K video will drive CPU usage to 80–90% for 60 to 90 seconds. If multiple clients trigger video conversions at the exact same moment on a small VPS, jobs will queue up and take several minutes to complete.
* **The Workaround:** Limit input video resolution to 1080p, or upgrade the VPS to a 4-core instance ($15–$20/mo) once volume increases.

### 3. Master App Liability & "Shared Fate" Ban Risk (The Biggest Business Risk)
* **The Reality:** When you act as an aggregator, **YOU own the master developer apps** on Google, Meta, and LinkedIn.
* **The Risk:** If one of your clients or tenants posts spam, copyright-infringing content, or violates Meta/YouTube community standards, **the social network may suspend your master developer app**. If your master app is suspended, **publishing is disabled for ALL your connected clients simultaneously** until resolved.
* **The Mitigation:** Implement content filtering and offer a **BYOK (Bring Your Own Key)** option for high-risk or high-volume clients so they use their own developer keys.

### 4. Shared API Quota Limits
* **The Reality:** Platform developer quotas are allocated **per developer app**, not per user.
* **The Constraint:**
  - YouTube gives a default free quota of 10,000 units/day. Video upload costs 1,600 units. Your master app can only upload **~6 videos per day across all your clients combined** until Google approves your formal Quota Extension audit.
  - X (Twitter) limits reads/writes per app. High-volume posting across 20 clients can trigger app-level rate limits.

### 5. Network Uplink Latency for Meta Crawlers
* **The Reality:** Meta’s crawler (`facebookexternalhit/1.1`) requires fetching media from a public HTTPS URL.
* **The Constraint:** If you host the server on a home connection with slow upload speeds, Meta’s crawler will time out with error `-2 / 2207003`. Running on a cloud VPS with a 1Gbps uplink (or using Cloudflare R2) is required to guarantee smooth ingestion.

---

## 🗺️ Part 2: Phased Implementation Plan for the Unified API

This plan outlines the 4 engineering phases to add a multi-tenant API layer (`sk_live_...` keys, `/v1/posts`, and a Connect Screen) to your existing SocialPulse engine.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Multi-Tenant API Key Management & Ingress Middleware         │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 2: Centralized One-Click OAuth Connect Portal (`/connect`)       │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 3: Unified REST Endpoint (`POST /v1/posts`)                      │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 4: Compliance Endpoints & Platform Review Preparation            │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Multi-Tenant API Key Management & Ingress Middleware

Build the programmatic authentication layer that allows external scripts, clients, or agency tools to authenticate with your engine via a single bearer token.

- [ ] **1.1. API Keys Table (`src/db.js`):**
  ```sql
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    key_prefix TEXT NOT NULL, -- e.g. "sk_live_9a8b" for identification
    key_hash TEXT NOT NULL,   -- HMAC-SHA256 hash of the full secret
    name TEXT NOT NULL,       -- e.g. "Primary Agency Key"
    rate_limit_per_min INTEGER DEFAULT 60,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
  );
  ```
- [ ] **1.2. Cryptographic Key Issuer (`src/crypto.js`):**
  - Generate 32 bytes of secure entropy prefixed with `sk_live_`.
  - Store only the SHA-256 hash in SQLite. Return the raw secret key once upon creation.
- [ ] **1.3. API Key Authentication Middleware (`src/api/authMiddleware.js`):**
  - Intercept `Authorization: Bearer sk_live_...`.
  - Hash the incoming key, look up the active client workspace in SQLite, and attach `req.client` to the request pipeline.
  - Return HTTP 401 Unauthorized for invalid or revoked keys.

---

### Phase 2: Centralized One-Click OAuth Connect Portal (`/connect`)

Build the web portal where clients authenticate their social channels to your master developer apps without seeing API keys or developer consoles.

- [ ] **2.1. Branded Connect Route (`GET /connect?key={rawApiKey}`):**
  - Validates the tenant's API key.
  - Serves a mobile-friendly, clean page showing connection cards:
    - **Connect YouTube Channel**
    - **Connect X / Twitter Account**
    - **Connect LinkedIn Profile or Company Page**
    - **Connect Instagram Business / Facebook Page**
- [ ] **2.2. Master OAuth State Mapping:**
  - When a user clicks "Connect YouTube", encode a signed state parameter `{ clientId: req.client.id, timestamp }`.
  - The OAuth callback extracts the state, stores the encrypted access/refresh tokens in that specific client's vault in `social_accounts`, and redirects back to the portal with a green checkmark: *"YouTube Channel Connected Successfully!"*

---

### Phase 3: Unified REST Endpoint (`POST /v1/posts`)

Provide a single, normalized endpoint that abstracts all social network differences.

- [ ] **3.1. Unified Ingress Schema:**
  - Implement `POST /v1/posts` accepting:
    ```json
    {
      "content": "Announcement copy...",
      "platforms": ["youtube", "x", "linkedin", "instagram"],
      "media_url": "https://...",
      "schedule_at": "2026-11-01T14:00:00Z",
      "first_comment": "Outbound link: https://example.com",
      "auto_decouple_links": true,
      "options": {
        "youtube": { "title": "Custom Title", "category_id": "28", "privacy": "public" },
        "x": { "alt_text": "Image diagram description" },
        "linkedin": { "disable_reshare": true },
        "instagram": { "audio_name": "Original Audio", "is_trial": false }
      }
    }
    ```
- [ ] **3.2. Pipeline Bridge:**
  - The handler compiles content via existing `compiler.js` (running link decoupling and character math).
  - Routes into existing `db.insertPost()`.
  - Dispatches immediately or schedules via existing `scheduler.js` and `dispatchPost()`.
  - Returns unified JSON response with tracking IDs per platform:
    ```json
    {
      "success": true,
      "post_id": 105,
      "status": "scheduled",
      "scheduled_at": "2026-11-01T14:00:00Z",
      "platforms": ["youtube", "x", "linkedin", "instagram"]
    }
    ```

---

### Phase 4: Compliance Endpoints & App Review Preparation

Ensure your server is legally compliant and ready to pass official platform reviews.

- [ ] **4.1. Meta Data Deletion Callback (`POST /meta-data-deletion`):**
  - Decode Meta's `signed_request` using `META_APP_SECRET`.
  - Purge the requesting user's tokens from `social_accounts` and return the required JSON response with confirmation code.
- [ ] **4.2. Hosted Legal Pages:**
  - Serve public static `/privacy` and `/terms` pages outlining data retention and token storage policies.
- [ ] **4.3. BYOK (Bring Your Own Keys) Override:**
  - Allow enterprise clients in **Workspaces & APIs** to optionally input their own developer keys for X or YouTube to bypass shared master quota limits.
