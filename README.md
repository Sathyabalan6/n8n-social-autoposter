# 🚀 SocialPulse Studio — Enterprise Social Media Publishing & Scheduling Platform

SocialPulse Studio is an enterprise-grade, self-hosted multi-channel social media publishing engine and visual editorial workbench built for marketing teams and agencies. Publish and schedule content across **YouTube (Videos & Shorts), X (Twitter), LinkedIn, Instagram, Threads, and Facebook** with complete data ownership.

Built with an **architecture-first engineering philosophy**, SocialPulse Studio provides deterministic platform compilation, outbound link decoupling, media transcoding, granular Role-Based Access Control (RBAC) with Anti-IDOR tenant isolation, and a high-performance native embedded SQLite Write-Ahead Logging (WAL) engine with optional PostgreSQL enterprise schema migrations.

---

## 🌟 Enterprise Highlights

1. **Deterministic Multi-Platform Compilation (`compiler.js`):**
   - **Accurate Counting:** Native `Intl.Segmenter` grapheme counting and UTF-8 byte bounds prevent silent API rejections.
   - **Weighted Character Accounting:** Models X's 280-character limit with 23-character fixed URL weighting.
   - **Anti-Penalty Link Decoupling:** Automatically extracts outbound URLs and schedules them as an automated **First Comment / Threaded Reply**, preventing feed ranking visibility penalties on X and LinkedIn.
   - **Platform-Specific Gates:** YouTube Category ID resolution, COPPA compliance, AI synthetic media transparency flags, Instagram Reels trial mode, and LinkedIn PDF document carousels.

2. **Enterprise Security & Cryptographic Vault (`crypto.js`):**
   - **AES-256-GCM Envelope Encryption (SPV2):** All OAuth tokens and API secrets are encrypted at rest with random 16-byte salts generated per record and 310,000 PBKDF2-HMAC-SHA256 iterations (OWASP standard).
   - **Password Security:** User passwords hashed using `scrypt` with 16-byte random salts and timing-safe verification.
   - **Role-Based Access Control (RBAC):** 4-tier hierarchy (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`) with strict tenant data isolation (Anti-IDOR) preventing cross-workspace leakage.
   - **Transport & DoS Protection:** Security headers via `helmet`, global rate limiting (300 req/min), and strict authentication limits (15 attempts/15 min).

3. **High-Reliability Queue & Circuit Breakers (`scheduler.js`, `circuit-breaker.js`):**
   - **Circuit Breakers:** Automatically detects repeated 5xx errors or HTTP 429 rate limits on external platform APIs, transitioning to `OPEN` state to prevent cascading API lockouts.
   - **Exponential Backoff with Jitter:** Failed publishing attempts retry dynamically (`2^attempts * 60s + jitter`).
   - **Dead-Letter Protection:** Automatically marks jobs as `failed` with diagnostic summaries after 5 attempts.
   - **Graceful Shutdown:** Handles `SIGTERM`/`SIGINT`, draining active worker leases before terminating.

4. **High-Performance Embedded Engine & Enterprise Migrations:**
   - **Native Embedded Engine:** Embedded Node 24 `node:sqlite` running in WAL mode with 5-second busy timeouts and atomic worker lease locks. Zero external database or Redis required for standalone production.
   - **Enterprise Schema:** Production PostgreSQL 16 schema (`postgres-schema.sql`) with Row-Level Security (RLS) definitions, connection pooling (`pg.Pool`), and foreign key cascades.

5. **Compliance & Audit Logging:**
   - **Immutable Audit Trail:** Logs all critical actions (logins, post creation, edits, deletions) with actor IDs and IP addresses.
   - **GDPR Endpoints:** Built-in Data Subject Access Request (DSAR) export (`GET /api/clients/:id/export`) and Right to Erasure (`DELETE /api/clients/:id/erase`).

6. **Interactive Editorial Calendar & Transcoding:**
   - Drag-and-drop calendar planning (Month & Week views) with atomic rescheduling (`PATCH /api/posts/:id/schedule`).
   - Pure Node `Intl.DateTimeFormat` recurring slot calculation with automatic Daylight Saving Time (DST) awareness.
   - Embedded static FFmpeg/FFprobe binaries for aspect ratio probing, 16:9 to 9:16 vertical blur conversion, and thumbnail extraction on isolated worker threads.

---

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/Sathyabalan6/social-auto-post.git
cd social-auto-post
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set your configuration values:

```env
PORT=3000
HOST=127.0.0.1
BASE_URL=http://localhost:3000

# Required: Minimum 32-character encryption key for credential vault
ENCRYPTION_SECRET=your_super_secret_vault_encryption_key_here_min_32_chars
JWT_SECRET=your_jwt_signing_secret_here_min_32_chars

# Initial Administrator Seed
ADMIN_EMAIL=admin@socialpulse.local
ADMIN_PASSWORD=SocialPulseAdmin2026!
```

### 3. Run the Test Suite

```bash
npm test
```

### 4. Start the Application

```bash
# Production mode
npm start

# Development mode with auto-reload
npm run dev
```

Open your browser at:  
👉 **`http://localhost:3000`**

---

## 🐳 Docker Production Deployment

Run the production stack (SocialPulse Studio with persistent volumes and optional PostgreSQL 16):

```bash
docker compose up -d
```

Check service health:

```bash
# Liveness probe
curl http://localhost:3000/healthz

# Readiness probe
curl http://localhost:3000/readyz
```

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               SocialPulse Studio Frontend                              │
│   ┌────────────────────┬────────────────────┬─────────────────┬────────────────────┐   │
│   │ Unified Composer   │ Editorial Calendar │ Queue & History │ Workspaces & APIs  │   │
│   │ (Live Previews)    │ (Month/Week D&D)   │ (Status & Logs) │ (RBAC & Vault)     │   │
│   └─────────┬──────────┴─────────┬──────────┴────────┬────────┴────────────┬───────┘   │
└─────────────┼────────────────────┼───────────────────┼─────────────────────┼───────────┘
              │                    │                   │                     │
              ▼                    ▼                   ▼                     ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              Express Enterprise Gateway                                │
│  • Security Headers (Helmet)               • Rate Limiting (express-rate-limit)        │
│  • JWT Auth & RBAC (`auth.js`)             • Anti-IDOR Tenant Scope Guard              │
│  • Zod Request Validation                  • Idempotency Engine (`Idempotency-Key`)    │
└──────────────────────────┬─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼─────────────────────────┐
        ▼                  ▼                         ▼
┌───────────────┐  ┌───────────────────────┐  ┌──────────────────────────────────────────┐
│ Persistence   │  │ Media Engine          │  │ Reliable Background Scheduler Daemon     │
│ • SQLite (WAL)│  │ • FFmpeg / FFprobe    │  │ (`scheduler.js`)                         │
│ • PostgreSQL  │  │ • Worker Thread       │  │ • Atomic Worker Lease Locking            │
│   with RLS    │  │   Isolation           │  │ • Exponential Backoff with Jitter        │
│ • Audit Logs  │  │ • 16:9 -> 9:16 Blur   │  │ • Circuit Breakers (`circuit-breaker.js`)│
│ • Vault SPV2  │  │ • 24h Automated GC    │  │ • Dead-Letter Queue (Max 5 attempts)     │
└───────────────┘  └───────────────────────┘  └────────────────────┬─────────────────────┘
                                                                   │
                                                                   ▼
                                              ┌──────────────────────────────────────────┐
                                              │ Platform Adapters (`src/platforms`)      │
                                              ├──────────────────────────────────────────┤
                                              │ • YouTube Data API v3 (Proactive Refresh)│
                                              │ • X / Twitter API v2 (Chunked & Alt-Text)│
                                              │ • LinkedIn REST Posts (Doc Carousels)    │
                                              │ • Meta Instagram Graph & Reels Trial     │
                                              │ • Meta Threads Graph API                 │
                                              │ • Meta Facebook Pages Graph API          │
                                              └──────────────────────────────────────────┘
```

---

## 🧪 Testing & Verification

SocialPulse Studio includes an automated test suite verifying all 13 core subsystems:

```bash
npm test
```

Verification coverage includes:

1. AES-256-GCM Envelope Encryption (SPV2) with dynamic salt
2. Single-use HMAC-SHA256 tokens and timing-safe validation
3. Compiler anti-penalty outbound link decoupling and category resolution
4. Recurring dynamic queue slots projection across Daylight Saving Time shifts
5. Database migrations, indexes, and constraints
6. Platform dispatch registry and idempotency guards
7. Time-series metrics snapshots and dual-snapshot analytics
8. Actionable community inbox task states
9. Scrypt password hashing and timing-safe verification
10. JWT token signing, verification, and role hierarchy
11. Zod request schema validation
12. Immutable audit logging
13. GDPR DSAR export and cascade erasure
14. External API failure thresholds and circuit breaker tripping

---

## 📄 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.
