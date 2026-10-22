# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.1.0 | :x:                |

---

## Reporting a Vulnerability

We take the security of SocialPulse Studio seriously. If you believe you have found a security vulnerability, please do **NOT** open a public issue.

Please report vulnerabilities directly via:
- **Email:** `security@socialpulse.local` (or create a private GitHub Security Advisory).
- Include detailed steps to reproduce the issue and an assessment of its impact.
- You will receive an acknowledgment within 48 hours and regular updates until a fix is released.

---

## Security Model & Invariants

SocialPulse Studio is engineered with defensive security defaults:

1. **Localhost Loopback Isolation:**
   - The Express HTTP server binds strictly to `127.0.0.1` by default, preventing unintended exposure across local Wi-Fi or LAN networks.
2. **DNS Rebinding & CSRF Protection:**
   - An Origin and Host header validation middleware enforces that requests originate only from the verified local host or configured `BASE_URL`.
3. **AES-256-GCM Credential Vault:**
   - All social API keys, OAuth access tokens, and refresh tokens are encrypted at rest using AES-256-GCM with PBKDF2 key derivation (100,000 iterations) and 128-bit authentication tags.
4. **Timing-Safe Cryptographic Nonces:**
   - Client approval tokens use 32 bytes of cryptographic entropy (`crypto.randomBytes(32)`).
   - Token validation uses `crypto.timingSafeEqual()` to eliminate side-channel timing attacks.
   - Tokens act as single-use nonces: the database nullifies the token hash immediately upon approval.
5. **Path Traversal Defense:**
   - All file operations sanitize incoming file paths using `path.basename()` before resolving paths within `/uploads/`.
