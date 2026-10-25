# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| 1.x.x   | :x: (Deprecated)   |

---

## Reporting a Vulnerability

We take the security of SocialPulse Studio seriously. If you believe you have discovered a vulnerability, please do **NOT** open a public issue.

Please report vulnerabilities via:
- **Email:** `security@socialpulse.local` or through GitHub Private Vulnerability Reporting.
- Include a detailed description, reproduction steps, and potential impact.
- You will receive an acknowledgment within 24 hours.

---

## Enterprise Security Architecture & Invariants

SocialPulse Studio 2.0 incorporates defense-in-depth security controls:

### 1. AES-256-GCM Envelope Encryption (SPV2 Vault)
- **Dynamic Per-Record Salts:** Encryption keys are derived using PBKDF2-HMAC-SHA256 with 310,000 iterations (OWASP recommended minimum) and a unique, cryptographically random 16-byte salt (`crypto.randomBytes(16)`) per record.
- **Envelope Format:** Payload format `[SPV2 (4B)][SALT (16B)][IV (12B)][AUTHTAG (16B)][CIPHERTEXT]`.
- **Integrity Validation:** Every decryption validates the 128-bit authentication tag before releasing plaintext.
- **Fail-Fast Policy:** Cryptographic operations throw immediately if `ENCRYPTION_SECRET` is missing or below 16 characters.

### 2. Authentication & Role-Based Access Control (RBAC)
- **Password Hashing:** Passwords are hashed using native `scrypt` with a unique 16-byte salt and verified with `crypto.timingSafeEqual()`.
- **JWT Authentication:** Cryptographically signed tokens (HS256) with 24-hour expiration.
- **Role Hierarchy:**
  - `OWNER`: System configuration, user management, all workspaces.
  - `ADMIN`: Workspace accounts, post creation, publishing, approvals.
  - `EDITOR`: Post drafting, scheduling, approval requests, inbox management.
  - `VIEWER`: Read-only access to calendar and published metrics.
- **Tenant Isolation (Anti-IDOR):** Middleware enforces that non-owner requests are strictly restricted to their assigned `client_id`.

### 3. Rate Limiting & DoS Protection
- **Global Rate Limiter:** 300 requests/minute per IP across the REST API.
- **Authentication Limiter:** 15 login/registration attempts per 15 minutes per IP to block brute-force credential stuffing.
- **File Upload Guard:** 500MB hard limit with strict MIME-type whitelist (videos, images, PDFs only).

### 4. HTTP & Transport Security
- **Security Headers (Helmet):** HSTS, X-Content-Type-Options (`nosniff`), X-Frame-Options, DNS prefetch control, and referrer policies.
- **Host & Origin Validation:** Protects against DNS rebinding and cross-origin attacks by verifying incoming `Host` and `Origin` headers against the configured `BASE_URL`.

### 5. Database Row-Level Security (RLS)
- For enterprise PostgreSQL deployments, Row-Level Security policies isolate tenant data at the storage layer (`posts`, `social_accounts`, `engagement_tasks`, `audit_logs`).

### 6. Idempotency & Replay Protection
- API requests support the `Idempotency-Key` header, preventing duplicate post broadcasts during transient network retries.
- Client approval magic links use single-use HMAC-SHA256 tokens that are nullified immediately upon first approval.

### 7. External API Circuit Breakers
- Automated circuit breakers protect external platform adapters (X, YouTube, LinkedIn, Meta), tripping to `OPEN` after repeated failures or HTTP 429 rate limits to prevent cascading API lockouts.

### 8. Audit Logging & Compliance (GDPR)
- Append-only `audit_logs` record all critical state transitions (logins, post creation, edits, deletions).
- Built-in GDPR endpoints support Data Subject Access Requests (`GET /api/clients/:id/export`) and the Right to Erasure (`DELETE /api/clients/:id/erase`).
