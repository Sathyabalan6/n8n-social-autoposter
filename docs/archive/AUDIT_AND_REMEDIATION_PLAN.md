# 🛠️ SocialPulse Studio — Codebase Audit & Comprehensive Remediation Plan

This document preserves the comprehensive architectural and security audit of **SocialPulse Studio v2.0**, detailing verified vulnerabilities, architectural discrepancies (claims vs. implementation), logic bugs, and an actionable, phased remediation plan.

---

## 📑 Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Audit Findings & Reality Check](#2-audit-findings--reality-check)
   - [A. Critical Security & Authorization Vulnerabilities](#a-critical-security--authorization-vulnerabilities)
   - [B. "Phantom Architecture" (Documentation vs. Code)](#b-phantom-architecture-documentation-vs-code)
   - [C. Code Bugs & Operational Flaws](#c-code-bugs--operational-flaws)
   - [D. Codebase Strengths to Retain](#d-codebase-strengths-to-retain)
3. [Phased Remediation Plan](#3-phased-remediation-plan)
   - [Phase 1: Critical Security Hardening](#phase-1-critical-security-hardening)
   - [Phase 2: Resolving the Persistence Strategy (Postgres vs. SQLite)](#phase-2-resolving-the-persistence-strategy-postgres-vs-sqlite)
   - [Phase 3: Live Implementations of Facebook & Threads](#phase-3-live-implementations-of-facebook--threads)
   - [Phase 4: Scheduler & Core Bug Fixes](#phase-4-scheduler--core-bug-fixes)
   - [Phase 5: Test Suite Expansion & Frontend Decoupling](#phase-5-test-suite-expansion--frontend-decoupling)
   - [Phase 6: Documentation Alignment](#phase-6-documentation-alignment)
4. [Implementation Checklist & Verification Matrix](#4-implementation-checklist--verification-matrix)

---

## 1. Executive Summary

A line-by-line review of the codebase revealed a significant divergence between **what the project claims to be in documentation** and **what is actually implemented in source code**:

* **Legitimate Strengths:** The social platform compiler (`src/compiler.js`), native X OAuth 1.0a signing and chunked uploads (`src/platforms/x.js`), LinkedIn REST asset uploading (`src/platforms/linkedin.js`), cryptographic vault (`src/crypto.js`), and worker-thread video transcoding (`src/media/worker.js`) are sophisticated, high-performance implementations.
* **Critical Deficits:** The core REST API has almost **no authentication protection** on mutating endpoints, allowing unauthenticated remote attackers to create, edit, reschedule, or delete posts and client workspaces. PostgreSQL and Redis are non-functional "phantom" dependencies. Facebook and Threads dispatches are simulated with stub functions.

---

## 2. Audit Findings & Reality Check

### A. Critical Security & Authorization Vulnerabilities

#### 1. Unauthenticated Core CRUD Endpoints (`src/server.js`)
* **Mechanism:** `app.use(authenticate)` parses the `Bearer` token if provided. If absent, it sets `req.user = null` and calls `next()`. It does **not** reject unauthenticated requests.
* **Vulnerable Routes:**
  - `POST /api/posts` (Create posts & upload files)
  - `GET /api/posts` (List all scheduled/draft/completed posts across clients)
  - `PUT /api/posts/:id` (Overwrite post content and media)
  - `PATCH /api/posts/:id/schedule` (Reschedule posts)
  - `DELETE /api/posts/:id` (Delete posts)
  - `GET /api/clients`, `POST /api/clients`, `DELETE /api/clients/:id` (Manage client workspaces)
  - `GET /api/accounts`, `DELETE /api/accounts/:id` (Delete social account credentials)
  - `POST /api/media/transcode/vertical`, `/api/media/thumbnail`, `/api/media/inspect` (Trigger unmetered CPU transcoding)
  - `GET /api/clients/:id/inbox`, `POST /api/inbox/:id/reply`, `POST /api/inbox/sync`, `DELETE /api/inbox/:id` (Manage engagement comments)

#### 2. Trivial IDOR Bypass on Post Updates (`src/server.js`)
* **Mechanism:** In `PUT /api/posts/:id`:
  ```javascript
  if (req.user && req.user.role !== ROLES.OWNER && existing.client_id !== req.user.client_id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  ```
* **Impact:** If an attacker omits the `Authorization` header, `req.user` is `null`. The condition `req.user && ...` short-circuits to `null`, completely bypassing tenant validation. Any anonymous actor can alter any client's posts.

#### 3. Insecure Host Header & DNS Rebinding Check (`src/server.js`)
* **Mechanism:**
  ```javascript
  const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  ```
* **Impact:** An attacker controlling `localhost.attacker.com` or `localhost:attacker.com` bypasses the host guard.

#### 4. Unprotected Public Static Uploads (`src/server.js`)
* **Mechanism:**
  ```javascript
  app.use(express.static(path.join(__dirname, '..', 'public')));
  ```
* **Impact:** Uploaded assets in `public/uploads/` are served without authentication or tenant isolation. Confidential social assets, PDF decks, or video thumbnails are publicly downloadable by guessing or brute-forcing timestamps.

---

### B. "Phantom Architecture" (Documentation vs. Code)

#### 1. PostgreSQL is 100% Dormant
* **Claim:** The README and `ARCHITECTURE.md` state: *"Dual-Mode Persistence: Embedded SQLite for local or PostgreSQL with Row-Level Security for enterprise cloud clusters."*
* **Reality:** `src/db/postgres.js` connects to PG, runs `postgres-schema.sql`, and exposes `checkPostgresHealth()` for `/readyz`. **It is never called anywhere else.** Every single database query in the entire application is hardcoded to `posts.sqlite` via `src/db.js`.

#### 2. Redis is a Phantom Container
* **Claim:** `docker-compose.yml` spins up a Redis 7 instance.
* **Reality:** Redis is not in `package.json`, nor is it imported or connected anywhere in `src/`.

#### 3. Facebook & Threads are Mocked
* **Claim:** Production publishing to Facebook and Threads.
* **Reality:** `publishThreads()` and `publishFacebook()` in `src/platforms/index.js` return `{ platform: '...', success: true, note: 'Simulated dispatch...' }` without dispatching HTTP requests to Meta's API endpoints.

---

### C. Code Bugs & Operational Flaws

1. **Circuit Breaker Casing Mismatch (`src/scheduler.js` vs `src/platforms/index.js`):**
   - In `scheduler.js`:
     ```javascript
     for (const p of platforms) {
       const res = results[p];
     ```
   - In `platforms/index.js`:
     ```javascript
     results[platformKey] = res; // platformKey is forced to lowercase: 'youtube', 'x', etc.
     ```
   - If `platforms` is `['YouTube', 'X']`, `results['YouTube']` is `undefined`. Circuit breaker success/failure counters are never updated by the background daemon.

2. **Threads Second-Stage Reply Deadlock:**
   - In `platforms/index.js`:
     ```javascript
     else if (key.includes('threads') && results.threads?.postId) {
       const fc = await postThreadsFirstReply(results.threads.postId, post.first_comment...);
     ```
   - `publishThreads` returns `{ platform: 'threads', text: ... }` with **no `postId`**. Even if Threads were live, decoupled first-replies would never fire.

3. **Monolithic Frontend Architecture (`public/app.js`):**
   - 2,500+ lines of unbundled vanilla JS combining DOM rendering, state management, calendar drag-and-drop, UI modals, and unauthenticated API calls.

4. **Test Suite Blind Spot (`test/verify.js`):**
   - Tests only internal helper functions (`crypto`, `compiler`, `db.js` prepared statements) in isolation.
   - It never invokes the Express HTTP server, meaning the massive auth gaps in `server.js` went completely undetected by CI.

---

### D. Codebase Strengths to Retain

* **`src/compiler.js`:** Native `Intl.Segmenter` grapheme calculation, X 23-char URL weighting, UTF-8 byte bounds for YouTube description limits, and automated outbound link decoupling.
* **`src/crypto.js`:** Real AES-256-GCM envelope encryption with random 16-byte salt, 310,000 PBKDF2 iterations, scrypt password hashing, and `crypto.timingSafeEqual`.
* **`src/platforms/x.js`:** Pure native OAuth 1.0a HMAC-SHA1 signer and Twitter chunked media upload (INIT/APPEND/FINALIZE/STATUS).
* **`src/platforms/linkedin.js`:** Modern 202401 REST Posts API with userinfo OpenID discovery and multi-format binary uploads (including PDF document carousels).
* **`src/platforms/youtube.js`:** Google OAuth2 flow with 5-minute proactive token refresh, thumbnail uploads, and metadata management.
* **`src/scheduler.js`:** Atomic job leasing via SQLite conditional updates (`status = 'claimed'`, `locked_until`, `worker_id`) and exponential backoff with jitter.

---

## 3. Phased Remediation Plan

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Security Hardening (Authentication, RBAC, Anti-IDOR, CORS)    │
│   • Close all open API routes with requireAuth & enforceTenantScope    │
│   • Fix Host header validation & protect static uploads                │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 2: Resolving the Persistence Architecture                        │
│   • Option A (Recommended): Pure SQLite WAL Focus (Purge PG/Redis)    │
│   • Option B: Implement Real Dual-Engine Repository Abstraction        │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 3: Implement Live Facebook & Threads Publishing                  │
│   • Meta Graph API for Facebook Pages & Threads Container API         │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 4: Core Bug Fixes & Scheduler Hardening                          │
│   • Platform casing normalization & circuit breaker metrics repair     │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 5: Test Suite Expansion & Frontend Decoupling                    │
│   • Supertest integration tests for all HTTP routes                    │
│   • Modularize public/app.js                                           │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 6: Documentation & Truth Alignment                               │
│   • Accurate README, ARCHITECTURE, and environment configs             │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Critical Security Hardening

#### 1.1 Secure All Mutating Endpoints with `requireAuth` & `enforceTenantScope`
Apply middleware guards across `src/server.js`:

```javascript
// Posts CRUD
app.post('/api/posts', requireAuth, enforceTenantScope, uploadFields, handleCreatePost);
app.get('/api/posts', requireAuth, handleListPosts);
app.put('/api/posts/:id', requireAuth, enforceTenantScope, uploadFields, handleUpdatePost);
app.patch('/api/posts/:id/schedule', requireAuth, enforceTenantScope, validateBody(reschedulePostSchema), handleSchedulePost);
app.delete('/api/posts/:id', requireAuth, enforceTenantScope, handleDeletePost);

// Workspaces & Clients
app.get('/api/clients', requireAuth, handleGetClients);
app.post('/api/clients', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), validateBody(createClientSchema), handleCreateClient);
app.delete('/api/clients/:id', requireAuth, requireRole(ROLES.OWNER), handleDeleteClient);

// Accounts
app.get('/api/accounts', requireAuth, handleGetAccounts);
app.delete('/api/accounts/:id', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), handleDeleteAccount);

// Media & CPU Endpoints
app.post('/api/media/presign-upload', requireAuth, enforceTenantScope, handlePresign);
app.post('/api/media/inspect', requireAuth, upload.single('media'), handleInspectMedia);
app.post('/api/media/transcode/vertical', requireAuth, upload.single('media'), handleTranscodeVertical);
app.post('/api/media/thumbnail', requireAuth, handleThumbnail);

// Inbox & Engagement
app.get('/api/clients/:id/inbox', requireAuth, enforceTenantScope, handleGetInbox);
app.post('/api/inbox/:id/reply', requireAuth, validateBody(replyInboxSchema), handleReplyInbox);
app.post('/api/inbox/sync', requireAuth, handleSyncInbox);
app.delete('/api/inbox/:id', requireAuth, handleDeleteInboxTask);
```

#### 1.2 Fix Host Header Validation
Update the Host Header check in `src/server.js`:
```javascript
// Replace fragile startsWith with strict hostname/port check
const host = req.headers.host || '';
const hostname = host.split(':')[0].toLowerCase();
const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
```

#### 1.3 Move Media Uploads Outside Public Directory
1. Move upload directory from `public/uploads` to `./uploads` (outside the web root).
2. Serve uploads through an authenticated, tenant-isolated route:
   ```javascript
   app.get('/media/:filename', requireAuth, (req, res) => {
     const safeFilename = path.basename(req.params.filename);
     const filePath = path.join(__dirname, '..', 'uploads', safeFilename);
     if (!fs.existsSync(filePath)) return res.status(404).send('Not Found');
     res.sendFile(filePath);
   });
   ```

---

### Phase 2: Resolving the Persistence Strategy (Postgres vs. SQLite)

You have two distinct architectural paths. **Option A is strongly recommended.**

#### Option A (Recommended): Double Down on Native SQLite (Zero-Docker / Low Overhead)
* **Rationale:** As proven in `FINDINGS.md`, SQLite in WAL mode handles thousands of writes per second with sub-millisecond latency. Social publishing engines run single-digit requests per second.
* **Actions:**
  1. Remove `pg` from `package.json`.
  2. Remove `src/db/postgres.js` and `src/db/postgres-schema.sql`.
  3. Remove the PostgreSQL and Redis services from `docker-compose.yml`.
  4. Update `README.md` and `ARCHITECTURE.md` to proudly showcase the lean, zero-external-dependency, zero-cost VPS architecture.

#### Option B: Implement Genuine Dual-Engine Repository Pattern
If horizontal multi-container clustering with PostgreSQL is genuinely required:
1. Create a Repository Interface (`src/db/repository.js`) defining:
   - `getPostById(id)`, `insertPost(post)`, `updatePostStatus(...)`, `claimNextJob(workerId, leaseMs)`, etc.
2. Implement `src/db/repositories/sqlite-repo.js` and `src/db/repositories/postgres-repo.js`.
3. In `postgres-repo.js`, implement `claimNextJob` using PostgreSQL's native atomic queue primitive:
   ```sql
   SELECT id FROM posts 
   WHERE (status = 'scheduled' AND scheduled_at <= NOW())
      OR (status = 'claimed' AND locked_until < NOW())
   ORDER BY id ASC 
   FOR UPDATE SKIP LOCKED 
   LIMIT 1;
   ```
4. Bind repository conditionally based on `process.env.DATABASE_URL`.

---

### Phase 3: Live Implementations of Facebook & Threads

#### 3.1 Live Facebook Page Publishing (`src/platforms/facebook.js`)
Replace the simulation with real Meta Graph API calls:
```javascript
async function publishFacebook(post) {
  const clientTokens = getClientPlatformTokens(post.client_id, 'facebook');
  const token = clientTokens?.accessToken || process.env.META_ACCESS_TOKEN;
  const pageId = clientTokens?.pageId || process.env.META_PAGE_ID;

  if (!token || !pageId) {
    return { platform: 'facebook', success: false, error: 'Facebook credentials missing' };
  }

  const mediaPath = post.media_overrides?.facebook?.path || post.media_path;
  const message = post.facebook_post || post.master_text;

  // Video or Photo vs Text post
  if (mediaPath && fs.existsSync(mediaPath)) {
    const ext = path.extname(mediaPath).toLowerCase();
    const isVideo = ['.mp4', '.mov'].includes(ext);
    const endpoint = isVideo 
      ? `https://graph.facebook.com/v20.0/${pageId}/videos`
      : `https://graph.facebook.com/v20.0/${pageId}/photos`;

    const formData = new FormData();
    formData.append('access_token', token);
    formData.append(isVideo ? 'description' : 'caption', message);
    const fileBytes = fs.readFileSync(mediaPath);
    formData.append('source', new Blob([fileBytes]));

    const res = await fetch(endpoint, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) return { platform: 'facebook', success: false, error: data.error?.message };
    return { platform: 'facebook', success: true, postId: data.id || data.post_id };
  }

  // Pure Text Post
  const res = await fetch(`https://graph.facebook.com/v20.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: token })
  });
  const data = await res.json();
  if (!res.ok) return { platform: 'facebook', success: false, error: data.error?.message };
  return { platform: 'facebook', success: true, postId: data.id };
}
```

#### 3.2 Live Threads Publishing (`src/platforms/threads.js`)
Implement Meta's two-step Threads Publishing API:
1. Step 1: Create Container `POST https://graph.threads.net/v1.0/me/threads` (`media_type=TEXT`, `text=...`).
2. Step 2: Publish Container `POST https://graph.threads.net/v1.0/me/threads_publish` (`creation_id=...`).
3. Return the real `postId: publishData.id` so `postThreadsFirstReply` can properly execute Stage 2 replies.

---

### Phase 4: Scheduler & Core Bug Fixes

#### 4.1 Normalize Platform Casing in Scheduler (`src/scheduler.js`)
```javascript
// Normalize platform keys to lowercase before checking circuit breakers
for (const p of platforms) {
  const key = String(p).toLowerCase();
  const res = results[key];
  if (res && res.success) {
    circuitBreaker.recordSuccess(key);
  } else if (res && !res.success) {
    circuitBreaker.recordFailure(key, new Error(res.error || 'Dispatch failed'));
  }
}
```

#### 4.2 Fix Circuit Breaker Key Matching
Ensure `circuitBreaker.isOpen(p.toLowerCase())` is checked in `allCircuitsOpen`.

---

### Phase 5: Test Suite Expansion & Frontend Decoupling

#### 5.1 Route-Level HTTP Integration Tests
Install `supertest` as a dev dependency and add `test/api.test.js`:
* Test unauthenticated requests to `/api/posts` -> Expect `401 Unauthorized`.
* Test cross-tenant access to `/api/clients/2/accounts` with User of `client_id: 1` -> Expect `403 Forbidden`.
* Test post creation, update, and scheduling with valid JWT -> Expect `200 OK`.

#### 5.2 Modularize `public/app.js`
Break down the 2,500-line script into ES Modules:
* `public/js/auth.js`: Token management, login modal, authenticated fetch wrapper.
* `public/js/composer.js`: Master text syncing, channel lenses, character counters.
* `public/js/calendar.js`: Month/Week views and drag-and-drop rescheduling.
* `public/js/queue.js`: Queue table, slot calculation, and filter controls.
* `public/js/inbox.js`: Actionable task poller and quick replies.

---

### Phase 6: Documentation Alignment

Update `README.md`, `ARCHITECTURE.md`, and `.env.example`:
1. **Clarify Database Reality:** Accurately document the SQLite WAL architecture or document the dual-repository setup if Phase 2 Option B is chosen.
2. **Remove Redis References:** Clean up `docker-compose.yml` and all marketing documentation.
3. **Accurately State Platform Support:** Either mark Facebook & Threads as fully implemented (post-Phase 3) or label them with an accurate "Beta / Direct Publishing" status.

---

## 4. Implementation Checklist & Verification Matrix

| Task | Priority | Target File | Verification Method |
| :--- | :---: | :--- | :--- |
| **Wrap all `/api/posts*` with `requireAuth`** | `P0` | `src/server.js` | `curl -X POST http://localhost:3000/api/posts` returns 401 |
| **Wrap `/api/clients*` and `/api/accounts*` with `requireAuth`** | `P0` | `src/server.js` | `curl -X GET http://localhost:3000/api/clients` returns 401 |
| **Fix IDOR guard in `PUT /api/posts/:id`** | `P0` | `src/server.js` | Modifying another client's post returns 403 even without token |
| **Fix Host Header validation** | `P0` | `src/server.js` | Requests with `Host: localhost.attacker.com` return 403 |
| **Protect media transcode endpoints** | `P1` | `src/server.js` | Unauthenticated transcode calls return 401 |
| **Normalize platform keys in scheduler** | `P1` | `src/scheduler.js` | Telemetry records properly on mixed-case platform names |
| **Remove / Implement Postgres & Redis** | `P1` | `docker-compose.yml`, `db/*` | Compose starts only active services; no dead containers |
| **Implement real Facebook & Threads dispatches** | `P2` | `src/platforms/index.js` | Real post IDs returned and verified in platform feeds |
| **Add Supertest API verification suite** | `P2` | `test/api.test.js` | `npm test` runs both unit and HTTP route suites |
| **Modularize `public/app.js`** | `P3` | `public/app.js` | SPA loads clean modules via `<script type="module">` |
