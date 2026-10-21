# 🛠️ SocialPulse Studio — Production Deployment & Developer Setup Guide

This guide walks you through setting up developer apps on official social platforms, configuring the application, and deploying SocialPulse Studio in production.

---

## 📋 System Prerequisites

- **Node.js:** v24.0.0 or higher (required for native `node:sqlite`, global `fetch`, and modern web APIs).
- **RAM:** Minimum 1GB (2GB recommended if running heavy FFmpeg video transcoding).
- **Disk:** 5GB+ SSD storage (media files are automatically purged 24h after posting).
- **Docker:** **NOT required**. SocialPulse runs 100% natively.

---

## 🔑 Official Developer Portal Setup

### 1. YouTube Data API v3 (Google Cloud Console)

1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `SocialPulse Publishing`).
3. Under **APIs & Services > Library**, search for and enable **YouTube Data API v3**.
4. Under **APIs & Services > OAuth consent screen**:
   - User Type: **External**.
   - Add scopes: `https://www.googleapis.com/auth/youtube.upload` and `https://www.googleapis.com/auth/youtube.readonly`.
   - Add your Google account as a Test User if keeping the app in "Testing" mode.
5. Under **APIs & Services > Credentials**:
   - Click **Create Credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Authorized redirect URI: `http://localhost:3000/auth/youtube/callback` (or your domain e.g. `https://social.yourdomain.com/auth/youtube/callback`).
6. Copy `Client ID` and `Client Secret` into your `.env`:
   ```env
   GOOGLE_CLIENT_ID=your_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/youtube/callback
   ```

---

### 2. X (Twitter) API v2 (Developer Portal)

1. Open the [X Developer Portal](https://developer.x.com/en/portal/dashboard).
2. Create a Project and App with **Read and Write** permissions.
3. Under **Keys and Tokens**:
   - Generate **Consumer Keys (API Key & API Secret)**.
   - Generate **Authentication Tokens (Access Token & Secret)** under OAuth 1.0a User Context.
4. Add to `.env` or input directly in **Workspaces & APIs** in the web dashboard:
   ```env
   X_API_KEY=your_consumer_key
   X_API_SECRET=your_consumer_secret
   X_ACCESS_TOKEN=your_access_token
   X_ACCESS_SECRET=your_access_token_secret
   ```

---

### 3. LinkedIn REST Posts API (LinkedIn Developers)

1. Open the [LinkedIn Developer Portal](https://www.linkedin.com/developers/).
2. Create an App and associate it with your LinkedIn Page.
3. Under **Products**, request access to:
   - **Share on LinkedIn** (for personal profile posts)
   - **Sign In with LinkedIn using OpenID Connect** (for auto URN discovery)
   - **Community Management API** (if posting on behalf of an Organization/Company Page)
4. Under **Auth**, generate an Access Token with scopes: `w_member_social`, `openid`, `profile`, and optionally `w_organization_social`.
5. Add to `.env` or save in the dashboard vault:
   ```env
   LINKEDIN_ACCESS_TOKEN=your_oauth_token
   ```
   *(Note: SocialPulse automatically discovers your member URN via `/v2/userinfo`. You do not need to manually locate your URN).*

---

### 4. Meta (Instagram Graph API & Facebook Pages)

1. Open the [Meta for Developers Portal](https://developers.facebook.com/).
2. Create an App of type **Business**.
3. Under **Add Products**, add **Instagram Graph API** and **Facebook Login for Business**.
4. Connect an Instagram Professional (Creator or Business) Account to a Facebook Page.
5. In Graph API Explorer, generate a Never-Expiring Page Access Token with permissions:
   `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
6. Add to `.env` or save in the dashboard vault:
   ```env
   META_ACCESS_TOKEN=your_long_lived_token
   META_PAGE_ID=your_facebook_page_id
   INSTAGRAM_ACCOUNT_ID=your_instagram_business_id
   ```

---

## 🔒 Security Configuration

Generate a 64-character hexadecimal encryption secret for the AES-256-GCM vault:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set this in your `.env`:

```env
ENCRYPTION_SECRET=your_generated_64_char_hex_secret
```

---

## 🚀 Production Deployment Options

### Option A: Running with PM2 (Recommended)

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```
2. Start SocialPulse Studio:
   ```bash
   pm2 start src/server.js --name "socialpulse"
   ```
3. Enable auto-restart on system reboot:
   ```bash
   pm2 startup
   pm2 save
   ```

---

### Option B: Running as a systemd Service (Linux/Ubuntu)

1. Create a service unit file `/etc/systemd/system/socialpulse.service`:
   ```ini
   [Unit]
   Description=SocialPulse Studio Publishing Server
   After=network.target

   [Service]
   Type=simple
   User=ubuntu
   WorkingDirectory=/var/www/socialpulse
   ExecStart=/usr/bin/node src/server.js
   Restart=always
   RestartSec=10
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```
2. Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable socialpulse
   sudo systemctl start socialpulse
   ```

---

### Option C: Reverse Proxy with Nginx & SSL

1. Create Nginx config `/etc/nginx/sites-available/socialpulse`:
   ```nginx
   server {
       server_name social.yourdomain.com;

       client_max_body_size 500M;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
2. Enable SSL with Let's Encrypt Certbot:
   ```bash
   sudo ln -s /etc/nginx/sites-available/socialpulse /etc/nginx/sites-enabled/
   sudo certbot --nginx -d social.yourdomain.com
   ```

---

## 💾 Database Backups

Because SocialPulse uses embedded SQLite, backing up your data is instantaneous:

```bash
# Automated SQLite backup using sqlite3 CLI or file copy
sqlite3 posts.sqlite ".backup 'backup-$(date +%Y%m%d).sqlite'"
```
All posts, clients, settings, and AES-256-GCM encrypted tokens are fully preserved in this single file.
