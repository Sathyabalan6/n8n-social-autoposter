# Contributing to SocialPulse

Thank you for your interest in contributing to SocialPulse! We welcome bug fixes, documentation improvements, and platform adapter additions.

---

## 📋 Prerequisites

- **Node.js:** v24.0.0 or higher (for native `node:sqlite`, global `fetch`, and modern web APIs).
- **Git:** Version 2.20+.
- **FFmpeg:** **Not required to install manually**. The project bundles static cross-platform binaries via `ffmpeg-static` and `ffprobe-static`.

---

## 🚀 Development Setup

1. Fork and Clone the Repository:

   ```bash
   git clone https://github.com/Sathyabalan6/social-auto-post.git
   cd social-auto-post
   ```

2. Install Dependencies:

   ```bash
   npm install
   ```

3. Configure Environment:

   ```bash
   cp .env.example .env
   ```

   *(Ensure `ENCRYPTION_SECRET` is set to a 32+ character string).*

4. Run the Development Server:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000` in your browser.

---

## 🧪 Running Tests

Before submitting any code changes or pull requests, verify that the automated test suite passes:

```bash
npm test
```

---

## 📐 Architectural Principles

When contributing, please preserve the following core standards:

1. **Self-Contained by Default (Docker & Postgres Optional):**
   - The default mode runs standalone with embedded `node:sqlite` (WAL mode) and bundled FFmpeg binaries.
   - Users should never be forced to run Docker or an external database just to test or deploy locally, though both Docker Compose and PostgreSQL remain fully supported for production.
2. **Zero-Build Frontend Architecture:**
   - The dashboard runs on browser-native ES modules (`public/js/*.js`) without Webpack, Vite, or npm bundlers.
   - This ensures instant startup, zero build pipeline lag, and zero client-side supply chain vulnerabilities.
   - Any new UI contributions should adhere to modular ES conventions (`import`/`export`) without introducing heavy bundlers.
3. **Strict Cryptography:**
   - Always use native `node:crypto` with AES-256-GCM for credential storage.
   - Use `crypto.timingSafeEqual()` when verifying secrets or approval tokens.
4. **Idempotency in Platform Adapters:**
   - Every platform adapter in `src/platforms/` must respect `post.results[platformKey]?.success` to prevent duplicate publishing on retries.
5. **Anti-Penalty Link Decoupling:**
   - Preserve the Two-Stage Anti-Penalty dispatch engine so external URLs in body copy are automatically scheduled into the `first_comment` payload.

---

## 📬 Pull Request Guidelines

1. Create a feature branch: `git checkout -b feat/your-feature-name`.
2. Commit with descriptive, conventional commit messages (`feat: ...`, `fix: ...`, `docs: ...`).
3. Ensure `npm test` passes cleanly (33/33 tests).
4. Submit a Pull Request targeting the `main` branch.
