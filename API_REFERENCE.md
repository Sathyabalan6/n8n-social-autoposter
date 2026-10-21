# 📡 SocialPulse Studio — REST API Reference

This document provides complete technical specifications for all REST endpoints exposed by SocialPulse Studio.

---

## Base URL

```text
http://localhost:3000
```

---

## 1. System & Taxonomy Endpoints

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
- `youtube_custom_thumb`: Custom thumbnail image file (up to 50MB).
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
