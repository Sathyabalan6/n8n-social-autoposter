# 📋 Client Onboarding & Social Media API Requirements Checklist

Use this intake checklist when onboarding a new brand or agency client onto **SocialPulse Studio**. This document lists all credentials, platform permissions, and technical assets required to enable automated, algorithm-optimized publishing.

---

## 🏢 1. General Brand Information

| Field | Description | Client Input |
| :--- | :--- | :--- |
| **Brand / Company Name** | Full legal or display brand name | |
| **Brand Accent Color** | Hex code for dashboard workspace (e.g. `#3B82F6`) | |
| **Primary Timezone** | IANA format (e.g. `America/New_York`, `Europe/London`, `Asia/Kolkata`) | |
| **Default Posting Slots** | Preferred weekly schedule (e.g. Mon, Wed, Fri at 10:00 AM) | |
| **Primary Contact Email** | Email for Magic Link approval notifications | |
| **Slack / Discord Webhook** | *(Optional)* Channel webhook for instant publish/failure alerts | |

---

## 📺 2. YouTube Channel Requirements

To enable automated video/Shorts uploads, SimClusters categorization, and thumbnail publishing:

- [ ] **Google Account Access / Manager Role:**
  - Add the agency's Google email as a **Manager** or **Editor** in [YouTube Studio Permissions](https://studio.youtube.com/) under **Settings > Permissions**.
  - *(Alternatively)* Complete the 1-click Google OAuth prompt provided in the SocialPulse dashboard.
- [ ] **COPPA & Audience Policy:**
  - Is this channel's content directed toward children under 13?  
    `[ ] No (Recommended for general brands)   [ ] Yes (COPPA Compliance)`
- [ ] **Default Video Category:**
  - Target audience category:  
    `[ ] Science & Technology (28)   [ ] Education (27)   [ ] Entertainment (24)   [ ] Howto & Style (26)   [ ] Business/People (22)`
- [ ] **AI Disclosure Policy:**
  - Does the brand produce synthetic or AI-altered video/audio?  
    `[ ] No   [ ] Yes (Will declare 'containsSyntheticMedia: true' to comply with YouTube guidelines)`

---

## 💼 3. LinkedIn Page Requirements

To publish company updates, swipeable PDF carousels, and automated first-comment links:

- [ ] **LinkedIn Page Admin Role:**
  - Grant the agency email **Super Admin** or **Content Admin** access on the LinkedIn Company Page.
- [ ] **LinkedIn Developer Authorization:**
  - Authorize the agency's LinkedIn OAuth App with the following scopes:
    - `w_member_social` (personal profile posting)
    - `w_organization_social` (company page posting)
    - `openid`, `profile`, `email` (automatic Member URN discovery)
- [ ] **Comment Velocity Policy:**
  - Enable *Disable Native Reshares* by default?  
    `[ ] Yes (Forces users to comment and tag colleagues, driving 3x higher comment engagement)   [ ] No`

---

## 🐦 4. X (Twitter) Account Requirements

To publish tweets, media alt-text, and threaded first-replies:

- [ ] **Developer App Access / Credentials:**
  - Provide API keys from the [X Developer Portal](https://developer.x.com/):
    - `API Key (Consumer Key)`: `____________________`
    - `API Secret (Consumer Secret)`: `____________________`
    - `OAuth 1.0a Access Token`: `____________________`
    - `OAuth 1.0a Access Token Secret`: `____________________`
- [ ] **Alt-Text Policy:**
  - Does the brand require mandatory accessibility alt-text for semantic search indexing on all media?  
    `[ ] Yes (Recommended for Heavy Ranker SEO)   [ ] No`

---

## 📸 5. Meta (Instagram & Facebook) Requirements

To publish Instagram Reels, carousel posts, and Facebook Page updates:

- [ ] **Account Type & Linkage:**
  - Confirm the Instagram account is converted to an **Instagram Professional Account (Business or Creator)**.
  - Confirm the Instagram account is actively connected to the client's **Facebook Page**.
- [ ] **Page Access Token:**
  - Provide a long-lived, never-expiring Meta Page Access Token with permissions:
    - `instagram_basic`
    - `instagram_content_publish`
    - `pages_show_list`
    - `pages_manage_posts`
- [ ] **Account Identifiers:**
  - `Facebook Page ID`: `____________________`
  - `Instagram Business Account ID`: `____________________`
- [ ] **Reels Audio Branding:**
  - Desired default original audio track title (e.g. `Acme Brand Audio`): `____________________`

---

## ☁️ 6. Cloud Storage (Optional / Multi-Tenant SaaS)

If the client requires self-contained cloud storage for media hosting:

- [ ] **Cloudflare R2 / AWS S3 Bucket:**
  - `Bucket Name`: `____________________`
  - `Endpoint URL`: `____________________`
  - `Access Key ID`: `____________________`
  - `Secret Access Key`: `____________________`

---

## 🚀 Intake Hand-off Checklist for the Developer

When the client returns this form:
1. Open SocialPulse Studio 👉 **Workspaces & APIs**.
2. Click **+ New Client** and enter the client's name and brand color.
3. Select the client from the workspace dropdown.
4. Click **Connect Channel** for each platform and paste the encrypted credentials.
5. Setup their weekly posting slots in the Queue Rules.
