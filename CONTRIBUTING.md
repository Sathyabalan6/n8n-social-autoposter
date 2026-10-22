# Contributing to SocialPulse Studio

Thank you for your interest in contributing to SocialPulse Studio! We welcome bug fixes, documentation improvements, and platform adapter additions.

---

## 📋 Prerequisites

- **Node.js:** v24.0.0 or higher (required for native `node:sqlite`, global `fetch`, and modern web APIs).
- **Git:** Version 2.20+.
- **FFmpeg:** **Not required to install manually**. The project bundles static cross-platform binaries via `ffmpeg-static` and `ffprobe-static`.

---

## 🚀 Development Setup

1. Fork and Clone the Repository:

   ```bash
   git clone https://github.com/Sathyabalan6/n8n-social-autoposter.git
   cd n8n-social-autoposter
   ```

2. Install Dependencies:

   ```bash
   npm install
   ```

3. Configure Environment:

   ```bash
   cp .env.example .env
   ```

   *(Ensure `ENCRYPTION_SECRET` is set to a 64-character hexadecimal string).*

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

Also verify that all JavaScript source files pass syntax validation:

```bash
node -c src/server.js src/db.js src/compiler.js src/crypto.js src/scheduler.js src/platforms/index.js src/platforms/youtube.js src/platforms/x.js src/platforms/linkedin.js src/media/transcoder.js
```

---

## 📐 Architectural Invariants

When contributing, preserve the following architectural standards:

1. **Zero-Docker Promise:**
   - Do not introduce external database servers (Postgres, Redis) or Docker daemon requirements.
   - All state must reside in embedded `node:sqlite` with WAL mode.
2. **Strict Cryptography:**
   - Always use native `node:crypto` with AES-256-GCM for credential storage.
   - Use `crypto.timingSafeEqual()` when verifying any secret or approval token.
3. **Idempotency in Platform Adapters:**
   - Every platform adapter in `src/platforms/` must respect `post.results[platformKey]?.success` to prevent duplicate publishing on retry.
4. **Link Decoupling:**
   - Preserve the Two-Stage Anti-Penalty dispatch engine so external URLs in body copy are decoupled into `first_comment`.

---

## 📬 Pull Request Guidelines

1. Create a feature branch: `git checkout -b feat/your-feature-name`.
2. Commit with descriptive, conventional commit messages (`feat: ...`, `fix: ...`, `docs: ...`).
3. Ensure `npm test` passes cleanly.
4. Submit a Pull Request targeting the `main` branch.
