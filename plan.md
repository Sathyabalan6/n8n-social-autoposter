# 📋 SocialPulse Studio — Algorithmic Optimization & Implementation Plan

This master plan establishes the phased roadmap to upgrade SocialPulse Studio into an **Algorithm-First Social Media Publishing & Growth Engine**, integrating all structural parameters, engagement multipliers, and anti-penalty publishing mechanisms identified in the Technical Specification.

---

## 🎯 Architecture Goals

1. **Anti-Penalty Link Decoupling (The First-Comment Engine):**
   - Automatically decouple outbound links from main posts across X, LinkedIn, YouTube, Instagram, and Threads to eliminate up to **80% organic visibility penalties**.
2. **Deep Algorithmic Knobs (Network-Specific Growth Levers):**
   - **YouTube:** Custom 50MB thumbnails (`thumbnails.set`), Category ID (`snippet.categoryId`), COPPA compliance (`selfDeclaredMadeForKids`), AI disclosure (`containsSyntheticMedia`), and notification shielding (`notifySubscribers=false`).
   - **X (Twitter):** Media Alt-Text injection (`metadata/create.json`), universal reply opening (`reply_settings: "everyone"`), and threaded replies (`in_reply_to_tweet_id`).
   - **LinkedIn:** PDF document carousels (`urn:li:document`), forced comment velocity (`isReshareDisabledByAuthor: true`), and comment-edge links.
   - **Instagram:** Reels format routing, custom audio indexing (`audio_name`), and Explore-only distribution testing (`trial_params`).
   - **Meta Threads:** Relational quote chains (`quote_post_id`) and asymmetric quota exploitation (1,000 replies/day).
3. **Two-Stage Atomic Dispatch Pipeline:**
   - **Stage 1:** Primary media and text post dispatch with full reach schemas.
   - **Stage 2:** Delayed (5–10s) automated first-comment injection carrying external URLs and secondary calls-to-action.

---

## 📅 Phased Execution Breakdown

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Database Tier Evolution (SQLite Schema & Migration)          │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 2: Compiler & Algorithmic Validation Gate                        │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 3: Platform Dispatcher Upgrades (YT, X, LinkedIn, IG, Threads)  │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 4: Two-Stage Dispatch Engine & First-Comment Scheduler           │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 5: Composer UI ("Algorithm & Reach Studio" Drawers)              │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 6: End-to-End Verification & Synthetic Compliance Testing        │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Database Tier Evolution (`src/db.js`)

Add native schema support for reach knobs, compliance flags, and first-comment decoupling with backwards-compatible SQLite migrations.

- [x] **1.1. Schema Extension:** Add new optimization columns to the `posts` table:
  - `first_comment TEXT`: Outbound links and secondary call-to-action copy.
  - `youtube_category_id TEXT DEFAULT '28'`: SimCluster category taxonomy.
  - `youtube_made_for_kids INTEGER DEFAULT 0`: COPPA compliance gate (0=false, 1=true).
  - `youtube_synthetic_media INTEGER DEFAULT 0`: AI transparency flag (0=false, 1=true).
  - `youtube_notify_subscribers INTEGER DEFAULT 1`: Flagship vs Shorts alert shield (0=silent, 1=notify).
  - `youtube_custom_thumb_path TEXT`: Path to high-res custom thumbnail image (up to 50MB).
  - `x_alt_text TEXT`: Semantic image/video accessibility metadata.
  - `linkedin_disable_reshare INTEGER DEFAULT 0`: Comment velocity trigger.
  - `linkedin_doc_path TEXT`: Path to swipeable PDF document asset.
  - `instagram_audio_name TEXT`: Original audio branding title.
  - `instagram_is_trial INTEGER DEFAULT 0`: Explore-only non-follower test parameter.
- [x] **1.2. Safe Migration Utility:** Add automated `ALTER TABLE posts ADD COLUMN` statements wrapped in SQLite `pragma_table_info` checks so existing databases upgrade without data loss.
- [x] **1.3. Query Statement Updates:** Update `stmtInsert`, `stmtUpdateFull`, and serialization mappers in `src/db.js` to persist and retrieve all new algorithmic fields.

---

### Phase 2: Compiler & Algorithmic Validation Gate (`src/compiler.js`)

Enhance the deterministic compiler to validate and format platform payloads before hitting the network.

- [x] **2.1. Link-Detection & Auto-Decoupling Warning:**
  - Detect URLs in `master_text`.
  - Provide an automated extraction rule: strip external URLs from body copy and propose moving them to `first_comment` to avoid the 80% visibility penalty on X and 40% penalty on LinkedIn.
- [x] **2.2. YouTube Category Validation:**
  - Map default human-readable categories to YouTube numerical category IDs:
    - Science & Technology: `28`
    - Education: `27`
    - Entertainment: `24`
    - Gaming: `20`
    - Howto & Style: `26`
    - People & Blogs: `22`
- [x] **2.3. COPPA & Synthetic Media Validation:**
  - Ensure `status.selfDeclaredMadeForKids` is explicitly a boolean (not null/omitted).
  - Enforce `status.containsSyntheticMedia` boolean.
- [x] **2.4. Instagram Reel & Constraint Gates:**
  - Enforce 2,200 character cap, maximum 30 hashtags, and 4:5 to 1.91:1 aspect ratio validation to prevent error subcodes `36004` and `36003`.

---

### Phase 3: Platform Dispatcher Upgrades (`src/platforms/`)

Upgrade each platform adapter to execute the exact official API schemas and endpoint calls.

#### 3.1. YouTube Adapter (`src/platforms/youtube.js`)
- [x] **3.1.1. Comprehensive Metadata Insertion:**
  - Pass `categoryId`, `selfDeclaredMadeForKids`, `containsSyntheticMedia`, and `publishAt`.
  - Pass `notifySubscribers` parameter in the upload endpoint URL query string.
- [x] **3.1.2. High-Res Thumbnail Pipeline:**
  - Immediately following successful video insertion (before `publishAt` release), call `POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={id}` with custom or extracted thumbnail bytes (up to 50MB).
- [x] **3.1.3. Pinned First Comment:**
  - Implement `postYouTubeFirstComment(videoId, commentText, tokens)` using `POST https://www.googleapis.com/youtube/v3/commentThreads?part=snippet`.

#### 3.2. X (Twitter) Adapter (`src/platforms/x.js`)
- [x] **3.2.1. Semantic Alt-Text Injection:**
  - Following the `FINALIZE` step of media upload, call `POST https://upload.twitter.com/1.1/media/metadata/create.json` with `{ media_id, alt_text: { text } }`.
- [x] **3.2.2. Heavy Ranker Multiplier Settings:**
  - Explicitly set `reply_settings: "everyone"` in all `POST /2/tweets` payloads to unlock the 27x–150x reply weights.
- [x] **3.2.3. Threaded First-Reply (Link Anti-Penalty):**
  - Implement `postXFirstReply(tweetId, replyText, creds)` sending `POST /2/tweets` with `{ text, reply: { in_reply_to_tweet_id: tweetId } }`.

#### 3.3. LinkedIn Adapter (`src/platforms/linkedin.js`)
- [x] **3.3.1. PDF Document Upload Pipeline:**
  - Support `application/pdf` uploads via `POST /rest/documents?action=initializeUpload`.
  - Push binary PDF to `uploadUrl` and reference the resulting `urn:li:document` in post content.
- [x] **3.3.2. Comment Velocity Trigger:**
  - Pass `isReshareDisabledByAuthor: Boolean(post.linkedin_disable_reshare)` in `POST /rest/posts`.
- [x] **3.3.3. First-Comment Link Strategy:**
  - Implement `postLinkedInFirstComment(postUrn, commentText, token)` via `POST /rest/posts/{postUrn}/comments`.

#### 3.4. Instagram Adapter (`src/platforms/instagram.js` & `src/platforms/index.js`)
- [x] **3.4.1. Reels Optimization:**
  - Pass `media_type: "REELS"`, `share_to_feed: true`, and custom `audio_name`.
- [x] **3.4.2. Trial Reels (Explore-Only Testing):**
  - Pass `trial_params: { graduation_strategy: "MANUAL" }` when trial mode is toggled.
- [x] **3.4.3. First Comment for Clean Captions:**
  - Implement `postInstagramFirstComment(mediaId, commentText, token)` via `POST /{media-id}/comments`.

#### 3.5. Meta Threads Adapter (`src/platforms/threads.js` & `src/platforms/index.js`)
- [x] **3.5.1. Relational Quote Chains:**
  - Accept optional `quote_post_id` in container creation.
- [x] **3.5.2. 30-Second Transcoder Delay & Threading:**
  - Implement delay between container generation and publication to prevent `EXPIRED` state errors.
  - Implement native threaded reply via `reply_to_id`.

---

### Phase 4: Two-Stage Dispatch Engine & Scheduler (`src/platforms/index.js` & `src/scheduler.js`)

Orchestrate the 2-step publishing sequence reliably across all channels.

- [x] **4.1. Two-Stage Orchestration in `dispatchPost`:**
  - **Stage 1 (Primary Dispatches):** Execute primary video/post creations concurrently via `Promise.allSettled`.
  - **Stage 2 (Automated First-Comment Loop):**
    - For all platforms where Stage 1 succeeded and `post.first_comment` exists:
    - Wait 5 seconds (to allow platform feed indexing).
    - Dispatch first comment / threaded reply referencing the created post ID / URN.
- [x] **4.2. Queue Logging & Analytics Recording:**
  - Record first-comment URLs and IDs in `posts.results` JSON object for auditability.

---

### Phase 5: Composer UI ("Algorithm & Reach Studio" Drawers)

Upgrade `public/index.html` and `public/app.js` with dedicated, intuitive growth drawers.

- [x] **5.1. Master First-Comment Drawer:**
  - Add dedicated **"First Comment / Link Anti-Penalty"** textarea right below the Master Copy box in Composer.
  - Add an explanatory badge: *"Outbound links placed here preserve up to 80% more reach on X & LinkedIn."*
- [x] **5.2. YouTube Algorithmic Drawer (in YouTube Lens):**
  - Category selector dropdown (`Science & Technology`, `Education`, `Gaming`, `Entertainment`, etc.).
  - Checkbox: `Made for Kids (COPPA)` (defaults unchecked).
  - Checkbox: `Contains AI / Altered Synthetic Media`.
  - Toggle: `Notify Subscribers` (toggle off for high-frequency Shorts).
  - Custom Thumbnail uploader (with preview and size indicator up to 50MB).
- [x] **5.3. X Heavy Ranker Drawer (in X Lens):**
  - Alt-Text input box for accessibility and semantic search indexing.
  - Real-time indicator displaying: *"Replies enabled for everyone (150x multiplier active)"*.
- [x] **5.4. LinkedIn Dwell Drawer (in LinkedIn Lens):**
  - PDF Document carousel attachment zone.
  - Toggle: `Disable Native Reshare (Forces Commenting & Tagging)`.
- [x] **5.5. Instagram Reels Drawer (in Instagram Lens):**
  - Custom `Audio Title / Track Name` input.
  - Toggle: `Explore-Only Trial Reel (Test with non-followers first)`.

---

### Phase 6: Automated End-to-End Verification & Compliance Testing

- [x] **6.1. Database Migration & Schema Test:**
  - Verify SQLite safely upgrades existing `posts.sqlite` without dropping data.
- [x] **6.2. Platform Mock & Live Endpoint Verification:**
  - Run synthetic validation scripts testing all new parameters against YouTube, X, and LinkedIn API endpoints.
- [x] **6.3. Media & Transcoding Verification:**
  - Verify thumbnail generator seamlessly produces 50MB-compliant UHD/FHD cover frames.
- [x] **6.4. Documentation Synchronization:**
  - Update `README.md` and `ARCHITECTURE.md` with the new schema, drawers, and API fields.

---

## 🚀 Execution Order

1. **Phase 1** ➔ Safe SQLite Schema Extension (`src/db.js`)
2. **Phase 2** ➔ Validation & Link Decoupling Logic (`src/compiler.js`)
3. **Phase 3 & 4** ➔ Upgraded Adapters & Two-Stage Dispatch Engine (`src/platforms/`)
4. **Phase 5** ➔ Frontend UI Growth Drawers (`public/index.html` & `public/app.js`)
5. **Phase 6** ➔ End-to-End Verification & Tests
