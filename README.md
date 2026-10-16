# 🚀 SocialPulse Studio - Multi-Platform Social Media Auto-Poster

A lightweight, standalone web application and automated publishing engine for teams. Publish and schedule posts across **YouTube (Videos & Shorts), X (Twitter), LinkedIn, Facebook, Instagram, and Threads** with **ZERO Docker** and **ZERO external database servers**.

---

## 🌟 Key Features

1. **Zero Docker, Zero External Databases:** Runs 100% natively on your machine using Node.js and embedded **`node:sqlite`**. A single local `posts.sqlite` file manages the entire database.
2. **3-Step Guided Team Wizard:**
   - **Step 1:** Core post description, hashtags, drag-and-drop media upload, and channel selection.
   - **Step 2:** Platform fine-tuning (YouTube titles, 280-char X copy, LinkedIn narrative) with automatic reuse of master media.
   - **Step 3:** Team review and approval gate before anything goes live.
3. **Live Social Media Mockup Previews:**
   - Real-time previews of how your post will render on **YouTube, X (Twitter), LinkedIn, Threads, and Instagram**.
   - Dynamic 280-character counter with visual warning states.
   - Automatic video/image preview rendering.
4. **Platform Compiler & Validation Gate:**
   - **YouTube:** Strips illegal characters, limits to 8 tags, caps at 500 characters, sets unlisted/public privacy.
   - **X (Twitter):** Hard 280-character word-boundary truncation, caps at 2 hashtags.
   - **LinkedIn:** CamelCase tag sanitization, reserves top 200 chars for the "See More" dwell-time hook.
   - **Threads:** Strictly extracts **exactly 1 Topic Tag** without `#`, enforces 500-char limit.
   - **Instagram:** Enforces 2,200 chars, limits to 5 high-relevance tags.
5. **Built-in Background Scheduler:** A background timer checks the local SQLite queue every minute for scheduled posts.

---

## 🚀 Quick Start (Standalone Web App)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Your `.env` is already configured with your verified Google credentials. To add other platforms:
```env
PORT=3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### 3. Start the Server
```bash
npm start
```

Open your browser at:  
👉 **`http://localhost:3000`**

---

## 📁 Project Structure

```text
├── public/
│   ├── index.html        # Modern 3-step wizard & live social mockups UI
│   ├── app.js            # Reactive frontend controller & live sync
│   ├── styles.css        # Clean responsive styling with dark theme
│   └── uploads/          # Local media storage directory
├── src/
│   ├── server.js         # Express HTTP server & API endpoints
│   ├── db.js             # Native node:sqlite database operations
│   ├── compiler.js       # 2026 platform validation matrix & auto-formatter
│   ├── scheduler.js      # Background timer for scheduled publishing
│   └── platforms/
│       ├── index.js      # Multi-platform dispatcher registry
│       └── youtube.js    # Direct YouTube upload & OAuth token manager
├── package.json
└── social_auto_poster_workflow.json # Optional n8n workflow backup
```

---

## 🔗 YouTube 1-Click Connect
In the web dashboard, navigate to **Settings** and click **Connect YouTube**. It will authenticate your channel with Google OAuth and automatically store tokens in `posts.sqlite`.
