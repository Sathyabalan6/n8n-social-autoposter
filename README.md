# Multi-Platform Social Media Auto-Poster & Scheduler

An automated publishing system built directly inside your local n8n instance (`http://127.0.0.1:5678`).

---

## 🚀 Overview

- **Workflow Name:** `Multi-Platform Social Media Auto-Poster & Scheduler`
- **Workflow ID:** `leRpBQifPnpbfGEb`
- **Queue Data Table ID:** `04Y6TGIEdNDWPCp7` (`social_post_queue`)
- **Supported Platforms:**
  - **X (Twitter)**
  - **LinkedIn**
  - **Facebook Pages**
  - **Instagram**
  - **Threads**
  - **YouTube (Shorts / Video)**

---

## 🛠️ Architecture

### 1. Intake Branch (n8n Form Trigger)
1. **Form Trigger:** Provides a clean web form to enter:
   - **Master Content:** Base text and hashtags.
   - **Media Attachment:** File upload field (Images/Videos).
   - **Schedule Time:** Optional date/time picker (leave blank for immediate publishing).
   - **Platform Checkboxes:** Selectively enable/disable X, LinkedIn, Facebook, Instagram, Threads, or YouTube.
   - **Platform Overrides:** Optional custom text fields for X (character limit), LinkedIn (story copy), Instagram (caption/hashtags), Threads, and YouTube title.
2. **Normalize Form Input (Code Node):** Parses selections and defaults `scheduled_at` to the current timestamp if left empty.
3. **Enqueue Post (n8n Data Table Node):** Stores the post into the `social_post_queue` table with `status: 'scheduled'`.

### 2. Dispatcher Branch (Timer & Scheduler)
1. **Schedule Trigger (Cron):** Runs every 1 minute.
2. **Fetch Scheduled Posts (Data Table):** Reads all rows with `status = 'scheduled'`.
3. **Filter Due Posts & Format Content (Code Node):** Filters only posts where `scheduled_at <= now()`, and prepares tailored text strings per platform.
4. **Mark Post as Completed (Data Table):** Immediately updates `status: 'completed'` to prevent duplicate runs.
5. **Parallel Platform Routing (IF Nodes):**
   - Each platform is gated by a conditional IF check (`post_to_x == true`, etc.).
   - Each posting node uses `onError: 'continueRegularOutput'` so an API failure on one network does not stop other networks.

---

## 🔑 Credentials Setup in n8n

Open your n8n UI at [http://127.0.0.1:5678](http://127.0.0.1:5678) and connect your accounts:

1. **LinkedIn:** Open the `Post to LinkedIn` node → select or create a `LinkedIn OAuth2 API` credential.
2. **X (Twitter):** Open the `Post to X (Twitter)` node → select or create a `Twitter OAuth1 / OAuth2 API` credential.
3. **Facebook:** Open the `Post to Facebook` node → select or create a `Facebook Graph API` credential (with `pages_manage_posts` permission).
4. **Instagram & Threads:** Open the HTTP nodes → add your Meta Bearer Access Token in the Header Auth or query parameter.
5. **YouTube:** Open the `Post to YouTube` node → select or create a `YouTube OAuth2 API` credential.

---

## 📌 Media Hosting Note for Local n8n
- **Direct Upload Platforms (X, LinkedIn, YouTube):** Accept media binary data directly from local n8n.
- **Meta Platforms (Instagram, Facebook, Threads):** Meta Graph API requires an external public HTTPS image/video URL. If uploading media locally, route the file through a cloud bucket (such as Cloudinary, Supabase Storage, or AWS S3) to produce a public URL before sending to Meta.
