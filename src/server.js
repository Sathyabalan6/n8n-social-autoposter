require('dotenv').config();
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');

const db = require('./db');
const { compilePost, YOUTUBE_CATEGORIES, calculateNextAvailableSlot } = require('./compiler');
const { dispatchPost } = require('./platforms');
const { getAuthUrl, handleAuthCallback, getStoredTokens } = require('./platforms/youtube');
const { inspectMedia, transcodeToVertical, extractThumbnail } = require('./media/transcoder');
const { generateApprovalToken, validateApprovalToken } = require('./crypto');
const { startScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup uploads folder inside public
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed safe extensions
const ALLOWED_MIME_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf'
]);

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed. Only video, image, or PDF files are permitted.`));
    }
  }
});
const uploadFields = upload.fields([
  { name: 'media', maxCount: 1 },
  { name: 'media_youtube', maxCount: 1 },
  { name: 'media_x', maxCount: 1 },
  { name: 'media_linkedin', maxCount: 1 },
  { name: 'media_instagram', maxCount: 1 },
  { name: 'media_threads', maxCount: 1 },
  { name: 'media_facebook', maxCount: 1 },
  { name: 'youtube_custom_thumb', maxCount: 1 },
  { name: 'linkedin_doc', maxCount: 1 }
]);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function safeGetUrlHost(urlStr) {
  if (!urlStr) return null;
  try {
    return new URL(urlStr).host;
  } catch {
    return null;
  }
}

function safeGetUrlOrigin(urlStr) {
  if (!urlStr) return null;
  try {
    return new URL(urlStr).origin;
  } catch {
    return null;
  }
}

// Security Middleware: Prevent DNS rebinding and cross-site request attacks
app.use((req, res, next) => {
  const host = req.headers.host || '';
  const origin = req.headers.origin;

  // Allow localhost / 127.0.0.1 or configured BASE_URL host
  const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const configuredHost = safeGetUrlHost(process.env.BASE_URL);

  if (!isLocalHost && configuredHost && host !== configuredHost) {
    return res.status(403).json({ success: false, error: 'Forbidden: Invalid Host Header' });
  }

  if (origin) {
    try {
      const originUrl = new URL(origin);
      const isLocalOrigin = originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
      const configuredOrigin = safeGetUrlOrigin(process.env.BASE_URL);
      if (!isLocalOrigin && configuredOrigin && origin !== configuredOrigin) {
        return res.status(403).json({ success: false, error: 'Forbidden: Cross-Origin Request Blocked' });
      }
    } catch {
      return res.status(403).json({ success: false, error: 'Forbidden: Malformed Origin Header' });
    }
  }

  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// --- API ROUTES ---

// 1. Health check & status
app.get('/api/status', (req, res) => {
  const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;
  const ytTokens = getStoredTokens(clientId);
  res.json({
    status: 'ok',
    version: '1.1.0',
    platforms: {
      youtube: {
        configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        connected: Boolean(ytTokens?.refresh_token || ytTokens?.access_token)
      },
      x: { configured: Boolean(process.env.X_API_KEY) },
      linkedin: { configured: Boolean(process.env.LINKEDIN_ACCESS_TOKEN) },
      instagram: { configured: Boolean(process.env.META_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID) },
      threads: { configured: Boolean(process.env.THREADS_ACCESS_TOKEN) },
      facebook: { configured: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID) }
    }
  });
});

// --- AGENCY CLIENTS & ACCOUNTS ROUTES ---
app.get('/api/clients', (_req, res) => {
  try {
    const clients = db.getClients();
    res.json({ success: true, clients });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/clients', (req, res) => {
  try {
    const { name, color_code } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Client name is required' });
    }
    const client = db.createClient(name.trim(), color_code || '#3B82F6');
    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/clients/:id', (req, res) => {
  try {
    db.deleteClient(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/clients/:id/accounts', (req, res) => {
  try {
    const accounts = db.getAccountsByClient(req.params.id);
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/accounts', (_req, res) => {
  try {
    const accounts = db.getAllAccounts();
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/clients/:id/accounts', (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const { platform, account_name, account_handle, tokens } = req.body;
    if (!platform || !account_name) {
      return res.status(400).json({ success: false, error: 'Platform and Account Name are required' });
    }
    const id = db.saveAccountTokens(clientId, platform.toLowerCase(), account_name.trim(), account_handle || '', '', tokens || {});
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  try {
    db.deleteAccount(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1b. YouTube Categories Taxonomy
app.get('/api/youtube/categories', (_req, res) => {
  res.json({ success: true, categories: YOUTUBE_CATEGORIES });
});

// 2. Live Validation & Preview compiler
app.post('/api/compile', (req, res) => {
  try {
    const compiled = compilePost(req.body);
    res.json({ success: true, compiled });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// --- MEDIA ENGINE & TRANSCODING ROUTES ---
app.post('/api/media/inspect', upload.single('media'), async (req, res) => {
  try {
    let filePath = req.file?.path;
    if (!filePath && req.body.filename) {
      filePath = path.join(uploadDir, path.basename(req.body.filename));
    }
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ success: false, error: 'No media file provided or file does not exist.' });
    }

    const info = await inspectMedia(filePath);
    res.json({ success: true, info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/media/transcode/vertical', upload.single('media'), async (req, res) => {
  try {
    let inputPath = req.file?.path;
    let originalName = req.file?.originalname || req.body.filename || 'video.mp4';

    if (!inputPath && req.body.filename) {
      inputPath = path.join(uploadDir, path.basename(req.body.filename));
    }

    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(400).json({ success: false, error: 'No media file provided or file not found.' });
    }

    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const outFilename = `vertical-${Date.now()}-${baseName}.mp4`;
    const outputPath = path.join(uploadDir, outFilename);

    await transcodeToVertical(inputPath, outputPath);
    const info = await inspectMedia(outputPath);

    res.json({
      success: true,
      filename: outFilename,
      path: outputPath,
      url: `/uploads/${outFilename}`,
      info
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/media/thumbnail', async (req, res) => {
  try {
    const { filename, timestamp } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, error: 'filename is required' });
    }

    const inputPath = path.join(uploadDir, path.basename(filename));
    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ success: false, error: 'Input file not found' });
    }

    const thumbFilename = `thumb-${Date.now()}.jpg`;
    const outputPath = path.join(uploadDir, thumbFilename);

    await extractThumbnail(inputPath, outputPath, timestamp || '00:00:01');

    res.json({
      success: true,
      filename: thumbFilename,
      path: outputPath,
      url: `/uploads/${thumbFilename}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Create / Submit Post (Immediate or Scheduled)
app.post('/api/posts', uploadFields, async (req, res) => {
  try {
    const body = req.body;
    let platforms = [];
    if (typeof body.platforms === 'string') {
      try {
        platforms = JSON.parse(body.platforms);
      } catch {
        platforms = [body.platforms];
      }
    } else if (Array.isArray(body.platforms)) {
      platforms = body.platforms;
    }

    const compiled = compilePost({
      ...body,
      platforms
    });

    let mediaPath = '';
    let mediaFilename = '';
    let mediaMimetype = '';

    const files = req.files || {};
    if (files.media && files.media[0]) {
      mediaPath = files.media[0].path;
      mediaFilename = files.media[0].originalname;
      mediaMimetype = files.media[0].mimetype;
    }

    let ytCustomThumb = compiled.youtube_custom_thumb_path;
    if (files.youtube_custom_thumb && files.youtube_custom_thumb[0]) {
      ytCustomThumb = files.youtube_custom_thumb[0].path;
    }

    let liDocPath = compiled.linkedin_doc_path;
    if (files.linkedin_doc && files.linkedin_doc[0]) {
      liDocPath = files.linkedin_doc[0].path;
    }

    // Process per-platform media overrides
    const mediaOverrides = {};
    const platformKeys = ['youtube', 'x', 'linkedin', 'instagram', 'threads', 'facebook'];
    for (const key of platformKeys) {
      const fieldKey = `media_${key}`;
      if (files[fieldKey] && files[fieldKey][0]) {
        mediaOverrides[key] = {
          path: files[fieldKey][0].path,
          filename: files[fieldKey][0].originalname,
          mimetype: files[fieldKey][0].mimetype
        };
      }
    }

    const clientId = body.client_id ? parseInt(body.client_id, 10) : 1;

    const postRecord = {
      ...compiled,
      client_id: clientId,
      media_path: mediaPath,
      media_filename: mediaFilename,
      media_mimetype: mediaMimetype,
      media_overrides: mediaOverrides,
      youtube_custom_thumb_path: ytCustomThumb,
      linkedin_doc_path: liDocPath
    };

    // Check if user chose "Save as Draft"
    if (body.action === 'draft') {
      postRecord.status = 'draft';
    } else {
      postRecord.status = compiled.is_scheduled ? 'scheduled' : 'processing';
    }

    const id = db.insertPost(postRecord);
    postRecord.id = id;

    // 2. If immediate and not draft, dispatch and update status
    if (body.action !== 'draft' && !compiled.is_scheduled) {
      const { results, finalStatus, errorSummary } = await dispatchPost(postRecord);
      postRecord.status = finalStatus;
      postRecord.results = results;
      postRecord.error_summary = errorSummary;
      db.updatePostStatus(id, finalStatus, results, errorSummary);
    }

    res.json({
      success: true,
      postId: id,
      post: {
        id,
        ...postRecord
      }
    });
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. List all posts (Queue & History, optionally filtered by client)
app.get('/api/posts', (req, res) => {
  try {
    const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;
    const posts = db.getAllPosts(clientId);
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Update / Edit post
app.put('/api/posts/:id', uploadFields, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.getPostById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const body = req.body;
    let platforms = [];
    if (typeof body.platforms === 'string') {
      try {
        platforms = JSON.parse(body.platforms);
      } catch {
        platforms = [body.platforms];
      }
    } else if (Array.isArray(body.platforms)) {
      platforms = body.platforms;
    }

    const compiled = compilePost({
      ...body,
      platforms: platforms.length ? platforms : existing.platforms
    });

    const files = req.files || {};
    let mediaPath = existing.media_path;
    let mediaFilename = existing.media_filename;
    let mediaMimetype = existing.media_mimetype;

    if (files.media && files.media[0]) {
      mediaPath = files.media[0].path;
      mediaFilename = files.media[0].originalname;
      mediaMimetype = files.media[0].mimetype;
    }

    let ytCustomThumb = compiled.youtube_custom_thumb_path || existing.youtube_custom_thumb_path;
    if (files.youtube_custom_thumb && files.youtube_custom_thumb[0]) {
      ytCustomThumb = files.youtube_custom_thumb[0].path;
    }

    let liDocPath = compiled.linkedin_doc_path || existing.linkedin_doc_path;
    if (files.linkedin_doc && files.linkedin_doc[0]) {
      liDocPath = files.linkedin_doc[0].path;
    }

    const mediaOverrides = existing.media_overrides || {};
    const platformKeys = ['youtube', 'x', 'linkedin', 'instagram', 'threads', 'facebook'];
    for (const key of platformKeys) {
      const fieldKey = `media_${key}`;
      if (files[fieldKey] && files[fieldKey][0]) {
        mediaOverrides[key] = {
          path: files[fieldKey][0].path,
          filename: files[fieldKey][0].originalname,
          mimetype: files[fieldKey][0].mimetype
        };
      }
    }

    let status = 'completed';
    if (body.action === 'draft') {
      status = 'draft';
    } else if (compiled.is_scheduled) {
      status = 'scheduled';
    }

    db.updatePostContent(id, {
      ...compiled,
      status,
      media_path: mediaPath,
      media_filename: mediaFilename,
      media_mimetype: mediaMimetype,
      media_overrides: mediaOverrides,
      youtube_custom_thumb_path: ytCustomThumb,
      linkedin_doc_path: liDocPath
    });

    res.json({ success: true, postId: id });
  } catch (err) {
    console.error('Error updating post:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5b. Reschedule post (Atomic for Calendar Drag-and-Drop)
app.patch('/api/posts/:id/schedule', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { scheduled_at } = req.body;
    if (!scheduled_at) {
      return res.status(400).json({ success: false, error: 'scheduled_at is required' });
    }

    const existing = db.getPostById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Safety Invariant: Never reschedule already completed posts to prevent duplicate broadcasts
    if (existing.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot reschedule a completed post. Please duplicate or create a new post to schedule again.'
      });
    }

    // Retain draft status if already draft; otherwise transition back to scheduled
    const newStatus = existing.status === 'draft' ? 'draft' : 'scheduled';
    db.updatePostSchedule(id, scheduled_at, newStatus);

    res.json({ success: true, id, scheduled_at, status: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Delete post
app.delete('/api/posts/:id', (req, res) => {
  try {
    db.deletePost(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- QUEUE RULES & SMART BUFFER-STYLE SLOTS ---
app.get('/api/clients/:id/queue-rules', (req, res) => {
  try {
    const rules = db.getQueueRules(req.params.id);
    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/clients/:id/queue-rules', (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const { timezone, iso_weekday, local_time } = req.body;
    if (!iso_weekday || !local_time) {
      return res.status(400).json({ success: false, error: 'iso_weekday (1-7) and local_time (HH:mm) are required' });
    }
    const rule = db.createQueueRule(clientId, timezone || 'UTC', parseInt(iso_weekday, 10), String(local_time).trim());
    res.json({ success: true, rule });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/queue-rules/:id', (req, res) => {
  try {
    db.deleteQueueRule(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/clients/:id/next-slot', (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const rules = db.getQueueRules(clientId);
    const pendingPosts = db.getPendingScheduledPosts(clientId);
    const occupiedSlots = pendingPosts.map((p) => p.scheduled_at);
    const clientTz = rules[0]?.timezone || req.query.tz || 'UTC';

    const nextSlotIso = calculateNextAvailableSlot(rules, occupiedSlots, clientTz, new Date());
    res.json({ success: true, nextSlotIso, timezone: clientTz });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- CLIENT REVIEW GATES & SINGLE-USE MAGIC LINKS ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

app.post('/api/posts/:id/request-approval', (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const post = db.getPostById(postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const { rawToken, tokenHash, expiresAt } = generateApprovalToken();
    db.setApprovalToken(postId, tokenHash, expiresAt);

    const baseUrl = process.env.BASE_URL || `http://${req.headers.host || 'localhost:3000'}`;
    const magicLink = `${baseUrl}/review/${postId}?token=${rawToken}`;

    res.json({ success: true, magicLink, expiresAt });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/review/:id', (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const token = req.query.token;
  const post = db.getPostById(postId);

  if (!post) {
    return res.status(404).send('<h1>Post Not Found</h1><p>This draft does not exist or has been removed.</p>');
  }

  const isValid = validateApprovalToken(token, post.approval_token_hash, post.token_expires_at);

  let badgeClass = 'badge-expired';
  let badgeText = 'Link Expired';
  if (post.workflow_state === 'APPROVED') {
    badgeClass = 'badge-approved';
    badgeText = 'Approved';
  } else if (isValid) {
    badgeClass = 'badge-pending';
    badgeText = 'Pending Review';
  }

  let footerMsg = 'This review link is invalid or has expired.';
  if (post.workflow_state === 'APPROVED') {
    footerMsg = '✓ This post has been approved and scheduled.';
  }

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Post Review — Post #${post.id}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #fafafa; margin: 0; padding: 20px; display: flex; justify-content: center; }
    .card { background: #111113; border: 1px solid #27272a; border-radius: 8px; max-width: 520px; width: 100%; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .title { font-size: 16px; font-weight: 600; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .badge { font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 500; }
    .badge-pending { background: #eab308; color: #000; }
    .badge-approved { background: #22c55e; color: #000; }
    .badge-expired { background: #ef4444; color: #fff; }
    .content-box { background: #18181b; border: 1px solid #222226; border-radius: 6px; padding: 14px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; margin: 16px 0; }
    .meta-row { font-size: 12px; color: #a1a1aa; margin-bottom: 16px; }
    .btn-group { display: flex; gap: 10px; margin-top: 20px; }
    .btn { flex: 1; padding: 12px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; text-align: center; }
    .btn-approve { background: #22c55e; color: #000; }
    .btn-reject { background: #27272a; color: #fafafa; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">
      <span>Review Draft Post #${post.id}</span>
      <span class="badge ${badgeClass}">${badgeText}</span>
    </div>
    <div class="meta-row">
      Scheduled for: <strong>${new Date(post.scheduled_at).toLocaleString()}</strong> • Channels: <strong>${(post.platforms || []).join(', ')}</strong>
    </div>
    <div class="content-box">${escapeHtml(post.master_text)}</div>
    ${post.first_comment ? '<div style="font-size: 12px; color: #22c55e; margin-bottom: 12px;"><strong>First Comment (Outbound Link):</strong> ' + escapeHtml(post.first_comment) + '</div>' : ''}
    ${post.media_filename ? '<div style="font-size: 12px; color: #a1a1aa; margin-bottom: 14px;">📎 Attachment: ' + escapeHtml(post.media_filename) + '</div>' : ''}
    
    ${isValid && post.workflow_state !== 'APPROVED' ? `
      <div class="btn-group">
        <button class="btn btn-approve" id="btn-approve">Approve & Schedule</button>
        <button class="btn btn-reject" id="btn-reject">Request Revisions</button>
      </div>
      <script>
        document.getElementById('btn-approve').onclick = async () => {
          const res = await fetch('/api/review/${post.id}/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: '${token}' })
          });
          const data = await res.json();
          if (data.success) {
            alert('Post approved successfully!');
            window.location.reload();
          } else {
            alert('Approval failed: ' + data.error);
          }
        };
        document.getElementById('btn-reject').onclick = async () => {
          const notes = prompt('Enter revision notes for the creator:');
          if (!notes) return;
          const res = await fetch('/api/review/${post.id}/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: '${token}', notes })
          });
          const data = await res.json();
          if (data.success) {
            alert('Feedback sent.');
            window.location.reload();
          }
        };
      </script>
    ` : `
      <div style="text-align: center; color: #a1a1aa; font-size: 13px; margin-top: 20px;">
        ${footerMsg}
      </div>
    `}
  </div>
</body>
</html>
  `);
});

app.post('/api/review/:id/approve', (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const { token } = req.body;
    const post = db.getPostById(postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const isValid = validateApprovalToken(token, post.approval_token_hash, post.token_expires_at);
    if (!isValid) {
      return res.status(403).json({ success: false, error: 'Invalid or expired approval token' });
    }

    db.setWorkflowState(postId, 'APPROVED');
    db.updatePostSchedule(postId, post.scheduled_at, 'scheduled');

    res.json({ success: true, postId, status: 'scheduled' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/review/:id/reject', (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const { token, notes } = req.body;
    const post = db.getPostById(postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const isValid = validateApprovalToken(token, post.approval_token_hash, post.token_expires_at);
    if (!isValid) {
      return res.status(403).json({ success: false, error: 'Invalid or expired approval token' });
    }

    db.setWorkflowState(postId, 'REJECTED');
    res.json({ success: true, postId, status: 'rejected', notes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- GOOGLE OAUTH ROUTES ---
app.get('/auth/youtube', (req, res) => {
  try {
    const clientId = req.query.clientId ? String(req.query.clientId) : '1';
    const url = getAuthUrl(clientId);
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== 'https://accounts.google.com') {
      throw new Error('Untrusted redirect target');
    }
    res.writeHead(302, { Location: parsedUrl.href });
    res.end();
  } catch (err) {
    res.status(500).send(`Error starting YouTube OAuth: ${err.message}`);
  }
});

app.get('/auth/youtube/callback', async (req, res) => {
  const code = req.query.code;
  const stateParam = req.query.state; // contains clientId!
  if (!code) {
    return res.status(400).send('Missing authorization code from Google.');
  }

  try {
    await handleAuthCallback(code, stateParam);
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>YouTube Connected</title></head>
        <body style="font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc;">
          <h1 style="color: #10B981;">YouTube Connected Successfully!</h1>
          <p>Your OAuth tokens have been encrypted and linked to this client profile.</p>
          <a href="/" style="display: inline-block; padding: 12px 24px; background: #3B82F6; color: white; text-decoration: none; border-radius: 8px; margin-top: 20px; font-weight: 600;">Return to Dashboard</a>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Error completing YouTube OAuth: ${err.message}`);
  }
});

// Start background scheduler & HTTP server
startScheduler(60000);

const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Social Media Auto-Poster Web App running at:`);
  console.log(`👉 http://${HOST}:${PORT}`);
  console.log(`=======================================================`);
});
