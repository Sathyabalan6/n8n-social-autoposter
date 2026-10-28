# 📡 SocialPulse Studio — REST API Reference (v2.0)

This document provides complete technical specifications for all REST endpoints exposed by SocialPulse Studio.

---

## Authentication & Headers

Protected endpoints require a JSON Web Token (JWT) in the `Authorization` header:

```http
Authorization: Bearer <token>
```

For idempotent post creation, pass the optional `Idempotency-Key` header:

```http
Idempotency-Key: <unique-uuid-or-hash>
```

---

## 1. Health, Probes & Status

### 1.1. Liveness Probe (Kubernetes / Orchestrator)

```http
GET /healthz
```

**Response (200 OK):**
```json
{
  "status": "healthy",
  "uptime": 124.5,
  "timestamp": "2026-10-25T15:30:00.000Z"
}
```

### 1.2. Readiness Probe (Dependencies & Circuit Breakers)

```http
GET /readyz
```

**Response (200 OK):**
```json
{
  "status": "ready",
  "database": {
    "sqlite": "connected",
    "postgres": { "configured": false, "status": "disabled" }
  },
  "storage": {
    "cloud_s3_configured": true
  },
  "circuit_breakers": {
    "x": { "state": "CLOSED", "failures": 0, "lastFailure": null }
  },
  "timestamp": "2026-10-25T15:30:00.000Z"
}
```

### 1.3. Platform Status & Topology

```http
GET /api/status?clientId={clientId}
```

---

## 2. Authentication & User Management

### 2.1. User Login

```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "admin@socialpulse.local",
  "password": "SocialPulseAdmin2026!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@socialpulse.local",
    "name": "System Administrator",
    "role": "OWNER",
    "client_id": 1
  }
}
```

### 2.2. Register User (Requires `OWNER` or `ADMIN`)

```http
POST /api/auth/register
```

**Request Body:**
```json
{
  "email": "editor@agency.com",
  "password": "StrongPassword123!",
  "name": "Jane Editor",
  "role": "EDITOR",
  "client_id": 1
}
```

### 2.3. Current User Profile

```http
GET /api/auth/me
```

### 2.4. List Workspace Users

```http
GET /api/users?clientId={clientId}
```

---

## 3. Compliance & Audit Logs

### 3.1. Retrieve Workspace Audit Logs

```http
GET /api/clients/:id/audit?limit=50
```

### 3.2. GDPR Data Subject Access Request (DSAR) Export

```http
GET /api/clients/:id/export
```

**Response (200 OK):** Returns structured JSON containing all client data, account metadata, posts, engagement tasks, and users.

### 3.3. GDPR Right to Erasure

```http
DELETE /api/clients/:id/erase
```

**Response (200 OK):** Permanently cascades and deletes all tenant data across all tables.

---

## 4. System & Taxonomy Endpoints

### 1.1. Health Check & Platform Status

```http
GET /api/status?clientId={clientId}
```

**Query Parameters:**
- `clientId` *(optional, integer)*: Check token connection status for a specific client workspace.

**Response (200 OK):**
```json
{
  "status": "ok",
  "version": "1.1.0",
  "platforms": {
    "youtube": { "configured": true, "connected": true },
    "x": { "configured": true },
    "linkedin": { "configured": true },
    "instagram": { "configured": true },
    "threads": { "configured": true },
    "facebook": { "configured": true }
  }
}
```

### 1.2. YouTube Categories Taxonomy

```http
GET /api/youtube/categories
```

**Response (200 OK):**
```json
{
  "success": true,
  "categories": {
    "1": "Film & Animation",
    "2": "Autos & Vehicles",
    "10": "Music",
    "15": "Pets & Animals",
    "17": "Sports",
    "20": "Gaming",
    "22": "People & Blogs",
    "23": "Comedy",
    "24": "Entertainment",
    "25": "News & Politics",
    "26": "Howto & Style",
    "27": "Education",
    "28": "Science & Technology",
    "29": "Nonprofits & Activism"
  }
}
```

---

## 2. Compilation & Validation Gateway

### 2.1. Compile & Format Post Copy

```http
POST /api/compile
Content-Type: application/json
```

**Request Body:**
```json
{
  "master_text": "Check out our distributed architecture whitepaper: https://example.com/whitepaper",
  "master_hashtags": "tech cloud architecture",
  "platforms": ["youtube", "x", "linkedin", "instagram"],
  "auto_decouple_links": true,
  "youtube_title": "Distributed Gateways 2026",
  "youtube_category_id": "28",
  "youtube_made_for_kids": false,
  "youtube_synthetic_media": false,
  "youtube_notify_subscribers": true,
  "x_alt_text": "Architecture diagram illustrating edge ingress",
  "linkedin_disable_reshare": true,
  "instagram_audio_name": "Studio Tech Audio",
  "instagram_is_trial": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "compiled": {
    "status": "completed",
    "scheduled_at": "2026-10-21T12:00:00.000Z",
    "is_scheduled": false,
    "master_text": "Check out our distributed architecture whitepaper: https://example.com/whitepaper",
    "master_hashtags": "tech cloud architecture",
    "first_comment": "https://example.com/whitepaper",
    "has_decoupled_links": true,
    "warnings": [],
    "platforms": ["youtube", "x", "linkedin", "instagram"],
    "youtube_title": "Distributed Gateways 2026",
    "youtube_tags": "tech, cloud, architecture",
    "youtube_description": "Check out our distributed architecture whitepaper: https://example.com/whitepaper",
    "youtube_category_id": "28",
    "youtube_category_name": "Science & Technology",
    "youtube_made_for_kids": 0,
    "youtube_synthetic_media": 0,
    "youtube_notify_subscribers": 1,
    "x_post": "Check out our distributed architecture whitepaper:  #tech #cloud",
    "x_alt_text": "Architecture diagram illustrating edge ingress",
    "x_reply_settings": "everyone",
    "linkedin_post": "Check out our distributed architecture whitepaper: \n\n#Tech #Cloud #Architecture",
    "linkedin_disable_reshare": 1,
    "instagram_caption": "Check out our distributed architecture whitepaper: https://example.com/whitepaper\n\n#tech #cloud #architecture",
    "instagram_audio_name": "Studio Tech Audio",
    "instagram_is_trial": 1,
    "facebook_post": "Check out our distributed architecture whitepaper: https://example.com/whitepaper\n\n#tech"
  }
}
```

---

## 3. Post Publishing & Scheduling Endpoints

### 3.1. Create Post (Immediate or Scheduled)

```http
POST /api/posts
Content-Type: multipart/form-data
```

**Form Fields:**
- `client_id` *(integer, default: 1)*: Target workspace ID.
- `master_text` *(string, required)*: Master post copy.
- `master_hashtags` *(string)*: Space-separated hashtags.
- `platforms` *(JSON array of strings)*: e.g. `["youtube", "x", "linkedin"]`.
- `action` *(string)*: `'publish'` or `'draft'`.
- `first_comment` *(string)*: Decoupled outbound links or secondary CTA.
- `auto_decouple_links` *(boolean string)*: `'true'` or `'false'`.
- `schedule_date` *(string)*: `YYYY-MM-DD` (if scheduled).
- `schedule_time` *(string)*: `HH:mm` (if scheduled).
- `youtube_title` *(string)*: Custom title for YouTube video.
- `youtube_category_id` *(string)*: Numerical category ID (default: `'28'`).
- `youtube_made_for_kids` *(integer)*: `1` or `0`.
- `youtube_synthetic_media` *(integer)*: `1` or `0`.
- `youtube_notify_subscribers` *(integer)*: `1` or `0`.
- `x_override` *(string)*: Platform-specific copy for X.
- `x_alt_text` *(string)*: Semantic alt-text for image/video.
- `linkedin_override` *(string)*: Platform-specific copy for LinkedIn.
- `linkedin_disable_reshare` *(integer)*: `1` or `0`.
- `instagram_override` *(string)*: Platform-specific caption for Instagram.
- `instagram_audio_name` *(string)*: Original audio track name.
- `instagram_is_trial` *(integer)*: `1` or `0`.

**File Attachments (Multipart):**
- `media`: Master video, image, or document.
- `media_youtube`, `media_x`, `media_linkedin`, etc.: Platform-specific media overrides.
- `youtube_custom_thumb`: Custom thumbnail image file (up to 2MB API ceiling).
- `linkedin_doc`: Swipeable PDF document carousel asset.

**Response (200 OK):**
```json
{
  "success": true,
  "postId": 42,
  "results": {
    "x": {
      "platform": "x",
      "success": true,
      "tweetId": "1848392019283749",
      "url": "https://x.com/i/web/status/1848392019283749"
    },
    "first_comments": {
      "x": {
        "success": true,
        "replyId": "1848392023948576"
      }
    }
  }
}
```

### 3.2. List Posts in Queue & History

```http
GET /api/posts?clientId={clientId}
```

**Response (200 OK):**
```json
{
  "success": true,
  "posts": [
    {
      "id": 42,
      "client_id": 1,
      "status": "completed",
      "scheduled_at": "2026-10-21T12:00:00.000Z",
      "master_text": "Architecture announcement",
      "first_comment": "https://example.com/paper",
      "platforms": ["x", "linkedin"],
      "youtube_category_id": "28",
      "x_alt_text": "System diagram",
      "results": {}
    }
  ]
}
```

### 3.3. Atomic Post Rescheduling (Calendar Drag-and-Drop)

```http
PATCH /api/posts/:id/schedule
Content-Type: application/json
```

**Request Body:**
```json
{
  "scheduled_at": "2026-10-25T14:30:00.000Z"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "id": 42,
  "scheduled_at": "2026-10-25T14:30:00.000Z",
  "status": "scheduled"
}
```

### 3.4. Update Post Content

```http
PUT /api/posts/:id
Content-Type: multipart/form-data
```

Updates existing post content, media, or algorithmic parameters before publishing.

### 3.5. Delete Post

```http
DELETE /api/posts/:id
```

**Response (200 OK):**
```json
{
  "success": true
}
```

---

## 4. Media Engine & Transcoding Endpoints

### 4.1. Inspect Media File

```http
POST /api/media/inspect
Content-Type: multipart/form-data (or application/json with {"filename": "..."})
```

**Response (200 OK):**
```json
{
  "success": true,
  "info": {
    "hasVideo": true,
    "hasAudio": true,
    "width": 1920,
    "height": 1080,
    "duration": 42.5,
    "aspectRatio": "1920:1080",
    "ratioDecimal": 1.78,
    "isVertical": false,
    "isHorizontal": true,
    "isSquare": false,
    "videoCodec": "h264",
    "audioCodec": "aac",
    "sizeMb": 18.4,
    "warnings": [
      "Horizontal video (16:9): Recommended to convert to 9:16 vertical for Shorts & Reels."
    ]
  }
}
```

### 4.2. Transcode Video to 9:16 Vertical with Blur Padding

```http
POST /api/media/transcode/vertical
Content-Type: multipart/form-data (or application/json with {"filename": "..."})
```

**Response (200 OK):**
```json
{
  "success": true,
  "filename": "vertical-1729510000000-video.mp4",
  "path": "/.../public/uploads/vertical-1729510000000-video.mp4",
  "url": "/uploads/vertical-1729510000000-video.mp4",
  "info": {
    "width": 1080,
    "height": 1920,
    "duration": 42.5,
    "isVertical": true
  }
}
```

### 4.3. Extract High-Res Poster Frame Thumbnail

```http
POST /api/media/thumbnail
Content-Type: application/json
```

**Request Body:**
```json
{
  "filename": "video.mp4",
  "timestamp": "00:00:02"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "filename": "thumb-1729510000000.jpg",
  "url": "/uploads/thumb-1729510000000.jpg"
}
```

---

## 5. Client Workspace & Credential Vault Endpoints

### 5.1. List Client Workspaces

```http
GET /api/clients
```

### 5.2. Create Client Workspace

```http
POST /api/clients
Content-Type: application/json

{
  "name": "Acme Brand",
  "color_code": "#10B981"
}
```

### 5.3. Save Encrypted Platform Credentials

```http
POST /api/clients/:id/accounts
Content-Type: application/json

{
  "platform": "x",
  "account_name": "@acmebrand",
  "tokens": {
    "apiKey": "your_api_key",
    "apiSecret": "your_api_secret",
    "accessToken": "your_access_token",
    "accessSecret": "your_access_secret"
  }
}
```

Credentials are encrypted at rest with AES-256-GCM prior to storage.

---

## 6. Recurring Queue Rules & Auto-Slot Endpoints

### 6.1. List Client Weekly Recurring Slots

```http
GET /api/clients/:id/queue-rules
```

**Response (200 OK):**
```json
{
  "success": true,
  "rules": [
    {
      "id": 1,
      "client_id": 1,
      "timezone": "America/New_York",
      "iso_weekday": 1,
      "local_time": "09:30",
      "created_at": "2026-10-21T10:00:00.000Z"
    }
  ]
}
```

### 6.2. Add Weekly Recurring Slot

```http
POST /api/clients/:id/queue-rules
Content-Type: application/json

{
  "timezone": "America/New_York",
  "iso_weekday": 3,
  "local_time": "14:00"
}
```

### 6.3. Delete Recurring Slot

```http
DELETE /api/queue-rules/:id
```

### 6.4. Calculate Next Available Queue Slot

```http
GET /api/clients/:id/next-slot?tz=America/New_York
```

**Response (200 OK):**
```json
{
  "success": true,
  "nextSlotIso": "2026-10-26T13:30:00.000Z",
  "timezone": "America/New_York"
}
```

---

## 7. Client Approval Workflow & Magic Link Endpoints

### 7.1. Generate Single-Use Magic Approval Link

```http
POST /api/posts/:id/request-approval
```

**Response (200 OK):**
```json
{
  "success": true,
  "magicLink": "http://localhost:3000/review/42?token=7f9b8c2d...",
  "expiresAt": 1729769200000
}
```

### 7.2. Client Standalone Review Portal

```http
GET /review/:id?token={rawToken}
```
Serves an accessible, mobile-responsive review interface for external clients.

### 7.3. Client Approve Post Action

```http
POST /api/review/:id/approve
Content-Type: application/json

{
  "token": "7f9b8c2d..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "postId": 42,
  "status": "scheduled"
}
```

### 7.4. Client Reject Post Action

```http
POST /api/review/:id/reject
Content-Type: application/json

{
  "token": "7f9b8c2d...",
  "notes": "Please update the graphic to version 2"
}
```

---

## 8. Community Engagement Inbox Endpoints

### 8.1. List Actionable Engagement Tasks

```http
GET /api/clients/:id/inbox?is_replied=0
```

**Query Parameters:**
- `is_replied` *(optional)*: `0` (unanswered comments only) or `1` (replied history). Omitting returns all tasks.

**Response (200 OK):**
```json
{
  "success": true,
  "tasks": [
    {
      "id": 1,
      "client_id": 1,
      "platform": "YOUTUBE",
      "external_comment_id": "UgxK98...",
      "parent_post_id": "video_123",
      "author_name": "Tech Enthusiast",
      "comment_text": "Is this compatible with Node 24?",
      "created_at": "2026-10-22T14:30:00.000Z",
      "is_replied": 0,
      "reply_text": null,
      "replied_at": null
    }
  ]
}
```

### 8.2. Dispatch Quick Reply to Comment

```http
POST /api/inbox/:id/reply
Content-Type: application/json

{
  "reply_text": "Yes, fully tested and supported on Node 24!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "taskId": 1,
  "result": { "success": true, "replyId": "Ugx..." }
}
```

### 8.3. Sync Inbound Comments from Live Platforms

```http
POST /api/inbox/sync
Content-Type: application/json

{
  "client_id": 1
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "syncRes": { "success": true, "newTasksCount": 3 }
}
```

### 8.4. Dismiss Engagement Task

```http
DELETE /api/inbox/:id
```
