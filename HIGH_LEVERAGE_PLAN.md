# 📋 SocialPulse Studio — High-Leverage Implementation Plan (80/20 Roadmap)

This implementation plan organizes the 12 high-leverage features into 3 actionable sprints. Each capability requires under 60–75 minutes, fewer than 100 lines of code, and operates with zero external dependencies on Node.js 24 and embedded `node:sqlite`.

---

## 🧭 Sprint Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Sprint 1: Agency High-Value Multipliers (Immediate Client ROI)         │
│ • Task 1.1: Outbound Slack & Discord State-Change Webhooks             │
│ • Task 1.2: Read-Only RFC 5545 .ics Calendar Feed (Google/Apple Sync)  │
│ • Task 1.3: Client-Side CSV Bulk Scheduling with SQLite Transactions   │
├────────────────────────────────────────────────────────────────────────┤
│ Sprint 2: Pre-Flight Intelligence & Fast UX                            │
│ • Task 2.1: Pre-Publish Sanity Linter (TODO brackets, Threads 1-tag)   │
│ • Task 2.2: Client-Side HTML5 Media Telemetry & Aspect Ratio Fit       │
│ • Task 2.3: Keyboard Shortcuts (Cmd+K Palette, Cmd+Shift+L Link Mover) │
├────────────────────────────────────────────────────────────────────────┤
│ Sprint 3: Content Growth & Lifecycle Multipliers                       │
│ • Task 3.1: Cross-Platform Multiplier & Sentence Thread Splitter       │
│ • Task 3.2: Evergreen Content Recycling Queue                          │
│ • Task 3.3: T+30m "Golden Hour" Native Mobile Deep-Link Alerts         │
│ • Task 3.4: Dynamic Variable Snippets & Hashtag Presets                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Sprint 1: Agency High-Value Multipliers

### Task 1.1: Outbound Slack & Discord State-Change Webhooks
* **User Value:** Instant notifications in agency chat channels when posts go live, fail, or when an external client clicks their Magic Approval Link.
* **Architecture:**
  - Create `webhooks` table in SQLite (`workspace_id`, `target_url`, `event_mask`, `is_active`).
  - Add non-blocking `fetch()` dispatcher in `src/scheduler.js` and `src/server.js`.
  - Format native Slack Block Kit and Discord Embed JSON cards automatically based on target URL hostname (`hooks.slack.com` or `discord.com/api/webhooks`).
* **Checklist:**
  - [ ] Add `webhooks` table to `src/db.js` with migrations.
  - [ ] Implement `dispatchWebhookAlert(event, payload)` helper.
  - [ ] Trigger on `post.published`, `post.failed`, `post.client_approved`, `post.client_rejected`.
  - [ ] Add Webhook URL input in **Workspaces & APIs** tab.

---

### Task 1.2: Read-Only RFC 5545 `.ics` Calendar Feed (Google & Apple Calendar Sync)
* **User Value:** Agency clients and executives subscribe to their social media schedule directly inside Apple Calendar, Google Calendar, or Outlook with zero OAuth permissions.
* **Architecture:**
  - Derive a stateless feed token per client workspace: `crypto.createHmac('sha256', SECRET).update(String(clientId)).digest('hex').slice(0, 16)`.
  - Endpoint `GET /api/feeds/:clientId/:token/calendar.ics` streaming `Content-Type: text/calendar; charset=utf-8`.
  - Generate RFC 5545 compliant lines with CRLF (`\r\n`), UTC Z timestamps, character escaping, and 75-octet line folding.
* **Checklist:**
  - [ ] Implement pure Node.js `buildIcsFeed(posts, workspaceName)` helper.
  - [ ] Expose `GET /api/feeds/:clientId/:token/calendar.ics` in `src/server.js`.
  - [ ] Add "Subscribe via Apple/Google Calendar" button in the Editorial Calendar UI.

---

### Task 1.3: Client-Side CSV Bulk Scheduling with Atomic SQLite Transactions
* **User Value:** Marketing teams upload an entire month of content (50–100 posts) drafted in Google Sheets or Airtable in 3 seconds.
* **Architecture:**
  - Client-side vanilla JS reads `.csv` in memory via `FileReader`, validates columns, and renders a pre-flight preview table.
  - Omitted `scheduled_at` timestamps auto-assign to the client's next open recurring queue slots.
  - Endpoint `POST /api/posts/bulk` executes all inserts inside a single synchronous `BEGIN IMMEDIATE` transaction, committing 100 rows in < 4 milliseconds.
* **Checklist:**
  - [ ] Implement RFC 4180 client-side CSV parser in `public/app.js`.
  - [ ] Expose `POST /api/posts/bulk` in `src/server.js` using atomic SQLite transactions.
  - [ ] Add "📂 Import CSV" button in Composer and Queue views with drag-and-drop dropzone.

---

## ⚡ Sprint 2: Pre-Flight Intelligence & Fast UX

### Task 2.1: Pre-Publish Sanity Guardrails & Linter
* **User Value:** Prevents embarrassing mistakes (e.g. leaving `[INSERT LINK]` or `[TODO]` in copy, exceeding Threads 1-topic-tag limit, or leaving body links un-decoupled).
* **Architecture:**
  - Shared function `lintPostPayload(post)` evaluating hard blocks (prevents save) and soft warnings (amber indicator).
* **Checklist:**
  - [ ] Implement `lintPostPayload()` in `src/compiler.js`.
  - [ ] Enforce server-side in `POST /api/posts` and `PUT /api/posts/:id`.
  - [ ] Render live pre-flight warning pills in Composer UI.

---

### Task 2.2: Client-Side HTML5 Media Telemetry & Zero-CPU Aspect Fit
* **User Value:** Validates video durations and aspect ratios in 15ms in the browser without uploading files to the server or consuming VPS CPU.
* **Architecture:**
  - Offscreen `<video>` element with `URL.createObjectURL(file)` reads `videoWidth`, `videoHeight`, and `duration`.
  - Canvas `createImageBitmap` validates 4:5 / 9:16 aspect ratios.
* **Checklist:**
  - [ ] Implement `validateMediaClientSide()` in `public/app.js`.
  - [ ] Enforce Threads 300s ceiling and X 140s ceiling directly in browser memory.

---

### Task 2.3: Keyboard Shortcuts & Ergonomic Hotkeys
* **User Value:** Power users manage multi-client campaigns without touching their mouse.
* **Key Bindings:**
  - `Cmd/Ctrl + K`: Fuzzy-search brand workspace switcher.
  - `Cmd/Ctrl + Enter`: Submit to next open Recurring Queue Slot.
  - `Cmd/Ctrl + Shift + L`: Move body URL to First Comment slot with 1 keystroke.
* **Checklist:**
  - [ ] Add global keydown event listener in `public/app.js`.
  - [ ] Add shortcut cheat-sheet modal (`?` key).

---

## 📈 Sprint 3: Content Growth & Lifecycle Multipliers

### Task 3.1: One-Click Content Multiplier & Sentence Thread Splitter
* **User Value:** Automatically converts long-form LinkedIn posts (3,000 chars) into numbered `(1/N)` sentence-aware threads for X (270 chars) and Threads (490 chars).
* **Architecture:**
  - Native `Intl.Segmenter` sentence packing into connected thread replies.
* **Checklist:**
  - [ ] Add thread auto-splitter utility in `src/compiler.js`.
  - [ ] Add "⚡ Split into Thread for X & Threads" button in Composer.

---

### Task 3.2: Evergreen Content Recycling Queue
* **User Value:** Client social channels never go dark when new drafts run out; proven top posts auto-fill empty recurring queue slots.
* **Architecture:**
  - Add `is_evergreen INTEGER DEFAULT 0` and `last_queued_at TEXT` to `posts`.
  - Background scheduler queries least-recently-used evergreen post when a queue slot has no pending draft.
* **Checklist:**
  - [ ] Add evergreen columns to SQLite in `src/db.js`.
  - [ ] Update `src/scheduler.js` queue filler to rotate evergreen watermarks.
  - [ ] Add "🔁 Mark as Evergreen" toggle on post cards.

---

### Task 3.3: T+30m "Golden Hour" Native Mobile Deep-Link Pings
* **User Value:** Solves the community engagement problem with zero scraping code and zero account ban risk.
* **Architecture:**
  - 30 minutes after a post publishes, sends a webhook ping with a 1-tap mobile deep link (`twitter://...`, `linkedin://...`) prompting the creator to reply natively during the algorithmic golden hour.
* **Checklist:**
  - [ ] Schedule golden hour alert in `src/scheduler.js`.
  - [ ] Dispatch to Slack/Discord with direct app links.

---

### Task 3.4: Dynamic Variable Snippets & Hashtag Presets
* **User Value:** Insert reusable tokens (`{{cta_book}}`, `{{tags}}`) that expand platform-specifically (5 tags on Instagram, 2 on LinkedIn, 1 on Threads).
* **Checklist:**
  - [ ] Add `snippets` table in SQLite.
  - [ ] Provide quick-insert dropdown in Composer.
