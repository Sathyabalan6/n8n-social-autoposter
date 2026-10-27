require('dotenv').config();
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const db = require('./db');
const logger = require('./logger');
const { compilePost, YOUTUBE_CATEGORIES, calculateNextAvailableSlot } = require('./compiler');
const { dispatchPost, syncPostMetrics, syncInboundComments, replyToEngagementTask } = require('./platforms');
const { getAuthUrl, handleAuthCallback, getStoredTokens } = require('./platforms/youtube');
const { inspectMedia, transcodeToVerticalInWorker, extractThumbnail } = require('./media/transcoder');
const { isCloudStorageConfigured, generatePresignedUploadUrl } = require('./media/storage');
const { generateApprovalToken, validateApprovalToken } = require('./crypto');
const { startScheduler, stopScheduler } = require('./scheduler');
const { authenticate, requireAuth, requireRole, enforceTenantScope } = require('./middleware/auth');
const { validateBody } = require('./middleware/validate');
const {
  loginSchema,
  registerSchema,
  createClientSchema,
  createAccountSchema,
  reschedulePostSchema,
  queueRuleSchema,
  replyInboxSchema
} = require('./validation/schemas');
const { generateToken, verifyPassword, hashPassword, ROLES } = require('./auth');
const { isPostgresConfigured, checkPostgresHealth, runPostgresMigrations } = require('./db/postgres');
const { circuitBreaker } = require('./queue/circuit-breaker');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup dedicated uploads folder outside public web root
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Security Headers via Helmet (with permissive script settings for local SPA dashboard)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// Global Rate Limiting: 300 requests per minute
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests from this IP, please try again shortly' }
});
app.use(globalLimiter);

// Strict Authentication Limiter: 15 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts, please try again in 15 minutes' }
});

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
  const host = (req.headers.host || '').toLowerCase();
  const hostname = host.split(':')[0];
  const origin = req.headers.origin;

  // Allow localhost / 127.0.0.1 or configured BASE_URL host
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  const configuredHost = safeGetUrlHost(process.env.BASE_URL);

  if (!isLocalHost) {
    if (!configuredHost || (host !== configuredHost && hostname !== configuredHost.split(':')[0])) {
      return res.status(403).json({ success: false, error: 'Forbidden: Invalid Host Header' });
    }
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

// Global Token Authentication Middleware
app.use(authenticate);

// Dedicated route for uploaded media with traversal protection
app.get('/uploads/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(uploadDir, safeFilename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  const legacyPath = path.join(__dirname, '..', 'public', 'uploads', safeFilename);
  if (fs.existsSync(legacyPath)) {
    return res.sendFile(legacyPath);
  }
  res.status(404).send('File not found');
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================================================
// HEALTH & OBSERVABILITY PROBES (Kubernetes / Production Monitoring)
// ============================================================================

// Liveness Probe: Verifies the process is alive and responsive
app.get('/healthz', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Readiness Probe: Verifies core database and storage dependencies
app.get('/readyz', async (_req, res) => {
  try {
    const pgHealth = await checkPostgresHealth();
    const storageConfigured = isCloudStorageConfigured();
    const circuits = circuitBreaker.getStatus();

    res.status(200).json({
      status: 'ready',
      database: {
        sqlite: 'connected',
        postgres: pgHealth
      },
      storage: {
        cloud_s3_configured: storageConfigured
      },
      circuit_breakers: circuits,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'unready',
      error: err.message
    });
  }
});

// Comprehensive Status & Platform Topology
app.get('/api/status', (req, res) => {
  const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;
  const ytTokens = getStoredTokens(clientId);
  res.json({
    status: 'ok',
    version: '2.0.0',
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
    },
    circuit_breakers: circuitBreaker.getStatus()
  });
});

// ============================================================================
// AUTHENTICATION & RBAC ENDPOINTS
// ============================================================================

app.post('/api/auth/login', authLimiter, validateBody(loginSchema), (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.getUserByEmail(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      logger.warn({ email, ip: req.ip }, '[Auth] Failed login attempt');
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = generateToken(user, '24h');
    db.logAudit({
      user_id: user.id,
      client_id: user.client_id,
      action: 'USER_LOGIN',
      entity_type: 'USER',
      entity_id: user.id,
      ip_address: req.ip
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        client_id: user.client_id
      }
    });
  } catch (err) {
    logger.error({ err: err.message }, '[Auth] Login error');
    res.status(500).json({ success: false, error: 'Authentication service error' });
  }
});

app.post('/api/auth/register', authLimiter, validateBody(registerSchema), (req, res) => {
  try {
    // Only existing ADMIN or OWNER can register new users
    if (req.user && req.user.role !== ROLES.OWNER && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges to register accounts' });
    }

    const { email, password, name, role, client_id } = req.body;
    const existing = db.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ success: false, error: 'A user with this email already exists' });
    }

    const passwordHash = hashPassword(password);
    const newUser = db.createUser({
      email,
      password_hash: passwordHash,
      name,
      role: role || ROLES.EDITOR,
      client_id: client_id || 1
    });

    db.logAudit({
      user_id: req.user?.sub || null,
      client_id: client_id || 1,
      action: 'USER_REGISTERED',
      entity_type: 'USER',
      entity_id: newUser.id,
      metadata: { email, role: newUser.role },
      ip_address: req.ip
    });

    res.json({ success: true, user: newUser });
  } catch (err) {
    logger.error({ err: err.message }, '[Auth] Registration error');
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.getUserById(req.user.sub);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User profile not found' });
  }
  res.json({ success: true, user });
});

app.get('/api/users', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), (req, res) => {
  try {
    const clientId = req.user.role === ROLES.OWNER && req.query.clientId
      ? parseInt(req.query.clientId, 10)
      : req.user.client_id;
    const users = db.getUsersByClient(clientId);
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// AGENCY CLIENTS & ACCOUNTS ROUTES
// ============================================================================

app.get('/api/clients', requireAuth, (req, res) => {
  try {
    const allClients = db.getClients();
    // Non-owners can only see their assigned client workspace
    const clients = req.user.role === ROLES.OWNER
      ? allClients
      : allClients.filter((c) => c.id === req.user.client_id);
    res.json({ success: true, clients });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/clients', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), validateBody(createClientSchema), (req, res) => {
  try {
    const { name, color_code } = req.body;
    const client = db.createClient(name.trim(), color_code);
    db.logAudit({
      user_id: req.user.sub,
      client_id: client.id,
      action: 'CLIENT_CREATED',
      entity_type: 'CLIENT',
      entity_id: client.id,
      metadata: { name },
      ip_address: req.ip
    });
    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/clients/:id', requireAuth, requireRole(ROLES.OWNER), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    db.deleteClient(clientId);
    db.logAudit({
      user_id: req.user.sub,
      client_id: clientId,
      action: 'CLIENT_DELETED',
      entity_type: 'CLIENT',
      entity_id: clientId,
      ip_address: req.ip
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/clients/:id/accounts', requireAuth, enforceTenantScope, (req, res) => {
  try {
    const accounts = db.getAccountsByClient(req.params.id);
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/accounts', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), (_req, res) => {
  try {
    const accounts = db.getAllAccounts();
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/clients/:id/accounts', requireAuth, enforceTenantScope, validateBody(createAccountSchema), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const { platform, account_name, account_handle, tokens } = req.body;
    const id = db.saveAccountTokens(clientId, platform.toLowerCase(), account_name.trim(), account_handle || '', '', tokens || {});
    db.logAudit({
      user_id: req.user.sub,
      client_id: clientId,
      action: 'ACCOUNT_CONNECTED',
      entity_type: 'SOCIAL_ACCOUNT',
      entity_id: id,
      metadata: { platform, account_name },
      ip_address: req.ip
    });
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/accounts/:id', requireAuth, (req, res) => {
  try {
    const accountId = parseInt(req.params.id, 10);
    const accounts = db.getAllAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    if (req.user.role !== ROLES.OWNER && account.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to this account is denied' });
    }

    db.deleteAccount(accountId);
    db.logAudit({
      user_id: req.user.sub,
      client_id: account.client_id,
      action: 'ACCOUNT_DELETED',
      entity_type: 'SOCIAL_ACCOUNT',
      entity_id: accountId,
      ip_address: req.ip
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// YouTube Categories Taxonomy
app.get('/api/youtube/categories', (_req, res) => {
  res.json({ success: true, categories: YOUTUBE_CATEGORIES });
});

// Live Validation & Preview compiler
app.post('/api/compile', requireAuth, (req, res) => {
  try {
    const compiled = compilePost(req.body);
    res.json({ success: true, compiled });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ============================================================================
// MEDIA ENGINE & TRANSCODING ROUTES
// ============================================================================

app.get('/api/media/storage-status', requireAuth, (_req, res) => {
  res.json({ success: true, configured: isCloudStorageConfigured() });
});

app.post('/api/media/presign-upload', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    if (!isCloudStorageConfigured()) {
      return res.status(400).json({ success: false, error: 'Cloud storage is not configured in .env' });
    }
    const { filename, mimetype, tenantId } = req.body;
    if (!filename) return res.status(400).json({ success: false, error: 'filename is required' });
    const targetTenant = req.user.role === ROLES.OWNER ? (tenantId || String(req.user.client_id)) : String(req.user.client_id);
    const { uploadUrl, objectKey } = await generatePresignedUploadUrl(filename, mimetype, targetTenant);
    res.json({ success: true, uploadUrl, objectKey });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/media/inspect', requireAuth, upload.single('media'), async (req, res) => {
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

app.post('/api/media/transcode/vertical', requireAuth, upload.single('media'), async (req, res) => {
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

    await transcodeToVerticalInWorker(inputPath, outputPath);
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

app.post('/api/media/thumbnail', requireAuth, async (req, res) => {
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

// ============================================================================
// POSTS CRUD WITH IDEMPOTENCY & AUDIT LOGGING
// ============================================================================

app.post('/api/posts', requireAuth, enforceTenantScope, uploadFields, async (req, res) => {
  try {
    // 1. Idempotency Key Guard: Protect against duplicate submissions
    const idempotencyKey = req.headers['idempotency-key'];
    if (idempotencyKey) {
      const cached = db.getIdempotencyKey(idempotencyKey);
      if (cached && cached.response) {
        logger.info({ idempotencyKey, postId: cached.post_id }, '[API] Idempotent replay hit');
        return res.json(cached.response);
      }
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

    // Anti-IDOR Client ID resolution: only OWNER can post on behalf of other clients
    const clientId = req.user.role === ROLES.OWNER && body.client_id
      ? parseInt(body.client_id, 10)
      : req.user.client_id;

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

    if (body.action === 'draft') {
      postRecord.status = 'draft';
    } else {
      postRecord.status = compiled.is_scheduled ? 'scheduled' : 'processing';
    }

    const id = db.insertPost(postRecord);
    postRecord.id = id;

    if (body.action !== 'draft' && !compiled.is_scheduled) {
      const { results, finalStatus, errorSummary } = await dispatchPost(postRecord);
      postRecord.status = finalStatus;
      postRecord.results = results;
      postRecord.error_summary = errorSummary;
      db.updatePostStatus(id, finalStatus, results, errorSummary);
    }

    db.logAudit({
      user_id: req.user?.sub || null,
      client_id: clientId,
      action: 'POST_CREATED',
      entity_type: 'POST',
      entity_id: id,
      metadata: { platforms, status: postRecord.status },
      ip_address: req.ip
    });

    const responsePayload = {
      success: true,
      postId: id,
      post: {
        id,
        ...postRecord
      }
    };

    if (idempotencyKey) {
      db.saveIdempotencyKey(idempotencyKey, id, responsePayload, 86400);
    }

    res.json(responsePayload);
  } catch (err) {
    logger.error({ err: err.message }, '[API] Error creating post');
    res.status(500).json({ success: false, error: err.message });
  }
});

// List posts (Scaped by Client ID)
app.get('/api/posts', requireAuth, (req, res) => {
  try {
    let clientId = req.user.client_id;
    if (req.user.role === ROLES.OWNER) {
      clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;
    }
    const posts = db.getAllPosts(clientId);
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update / Edit post
app.put('/api/posts/:id', requireAuth, enforceTenantScope, uploadFields, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.getPostById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (req.user.role !== ROLES.OWNER && existing.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to this post is denied' });
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

    db.logAudit({
      user_id: req.user?.sub || null,
      client_id: existing.client_id,
      action: 'POST_UPDATED',
      entity_type: 'POST',
      entity_id: id,
      ip_address: req.ip
    });

    res.json({ success: true, postId: id });
  } catch (err) {
    logger.error({ err: err.message }, '[API] Error updating post');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Atomic Drag-and-Drop Reschedule
app.patch('/api/posts/:id/schedule', requireAuth, enforceTenantScope, validateBody(reschedulePostSchema), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { scheduled_at } = req.body;

    const existing = db.getPostById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (req.user.role !== ROLES.OWNER && existing.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to this post is denied' });
    }

    if (existing.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot reschedule a completed post. Duplicate or create a new post to schedule again.'
      });
    }

    const newStatus = existing.status === 'draft' ? 'draft' : 'scheduled';
    db.updatePostSchedule(id, scheduled_at, newStatus);

    db.logAudit({
      user_id: req.user?.sub || null,
      client_id: existing.client_id,
      action: 'POST_RESCHEDULED',
      entity_type: 'POST',
      entity_id: id,
      metadata: { scheduled_at },
      ip_address: req.ip
    });

    res.json({ success: true, id, scheduled_at, status: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Post
app.delete('/api/posts/:id', requireAuth, enforceTenantScope, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const post = db.getPostById(id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (req.user.role !== ROLES.OWNER && post.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to this post is denied' });
    }

    db.deletePost(id);
    db.logAudit({
      user_id: req.user?.sub || null,
      client_id: post.client_id,
      action: 'POST_DELETED',
      entity_type: 'POST',
      entity_id: id,
      ip_address: req.ip
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// PERFORMANCE METRICS & ENGAGEMENT INBOX
// ============================================================================

app.get('/api/posts/:id/metrics', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const post = db.getPostById(id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    if (req.user.role !== ROLES.OWNER && post.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to this post is denied' });
    }

    const snapshots = db.getMetricsForPost(id);
    const latest = db.getLatestPostMetrics(id);
    res.json({ success: true, postId: id, snapshots, latest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/posts/:id/sync-metrics', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const post = db.getPostById(id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    if (req.user.role !== ROLES.OWNER && post.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to this post is denied' });
    }

    const result = await syncPostMetrics(post, 'MANUAL');
    const latest = db.getLatestPostMetrics(id);
    res.json({ success: true, postId: id, result, latest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/clients/:id/inbox', requireAuth, enforceTenantScope, (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const isRepliedParam = req.query.is_replied;
    const isReplied = isRepliedParam !== undefined ? (isRepliedParam === '1' || isRepliedParam === 'true') : null;
    const tasks = db.getEngagementTasks(clientId, isReplied);
    res.json({ success: true, tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/inbox/:id/reply', requireAuth, validateBody(replyInboxSchema), async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { reply_text, client_id } = req.body;

    const task = db.getEngagementTaskById(taskId);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    if (req.user.role !== ROLES.OWNER && task.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to this task is denied' });
    }

    const targetClientId = req.user.role === ROLES.OWNER && client_id ? client_id : task.client_id;
    const result = await replyToEngagementTask(task, reply_text.trim(), targetClientId);
    db.logAudit({
      user_id: req.user.sub,
      client_id: task.client_id,
      action: 'INBOX_REPLY_SENT',
      entity_type: 'ENGAGEMENT_TASK',
      entity_id: taskId,
      ip_address: req.ip
    });
    res.json({ success: true, taskId, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/inbox/sync', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const clientId = req.user.role === ROLES.OWNER && req.body.client_id
      ? parseInt(req.body.client_id, 10)
      : req.user.client_id;
    const syncRes = await syncInboundComments(clientId);
    res.json({ success: true, syncRes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/inbox/:id', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const task = db.getEngagementTaskById(taskId);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    if (req.user.role !== ROLES.OWNER && task.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to this task is denied' });
    }

    db.deleteEngagementTask(taskId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// QUEUE RULES & SMART BUFFER-STYLE SLOTS
// ============================================================================

app.get('/api/clients/:id/queue-rules', requireAuth, enforceTenantScope, (req, res) => {
  try {
    const rules = db.getQueueRules(req.params.id);
    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/clients/:id/queue-rules', requireAuth, enforceTenantScope, validateBody(queueRuleSchema), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const { timezone, iso_weekday, local_time } = req.body;
    const rule = db.createQueueRule(clientId, timezone, iso_weekday, local_time);
    res.json({ success: true, rule });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/queue-rules/:id', requireAuth, (req, res) => {
  try {
    db.deleteQueueRule(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/clients/:id/next-slot', requireAuth, enforceTenantScope, (req, res) => {
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

// ============================================================================
// AUDIT LOGS & GDPR COMPLIANCE
// ============================================================================

app.get('/api/clients/:id/audit', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const logs = db.getAuditLogs(clientId, limit);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GDPR Data Subject Access Request (DSAR) Export
app.get('/api/clients/:id/export', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const data = db.exportClientData(clientId);
    if (!data) return res.status(404).json({ success: false, error: 'Client not found' });

    db.logAudit({
      user_id: req.user.sub,
      client_id: clientId,
      action: 'GDPR_DATA_EXPORTED',
      entity_type: 'CLIENT',
      entity_id: clientId,
      ip_address: req.ip
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GDPR Right to Erasure
app.delete('/api/clients/:id/erase', requireAuth, requireRole(ROLES.OWNER), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    db.eraseClientData(clientId);
    logger.warn({ clientId, erasedBy: req.user.sub }, '[GDPR] Client data permanently erased');
    res.json({ success: true, message: `All data for client #${clientId} has been permanently erased in accordance with GDPR.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// CLIENT REVIEW GATES & SINGLE-USE MAGIC LINKS
// ============================================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

app.post('/api/posts/:id/request-approval', requireAuth, enforceTenantScope, (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const post = db.getPostById(postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    if (req.user.role !== ROLES.OWNER && post.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to this post is denied' });
    }

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
  const safeToken = (token || '').replace(/[^a-f0-9]/gi, '');

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
            body: JSON.stringify({ token: '${safeToken}' })
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
            body: JSON.stringify({ token: '${safeToken}', notes })
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

// ============================================================================
// GOOGLE OAUTH ROUTES
// ============================================================================

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
  const stateParam = req.query.state;
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

// ============================================================================
// DAEMON INITIALIZATION & GRACEFUL SHUTDOWN
// ============================================================================

// Run PostgreSQL migrations if configured in environment
if (isPostgresConfigured()) {
  runPostgresMigrations().catch((err) => {
    logger.error({ err: err.message }, 'Failed to apply PostgreSQL migrations on boot');
  });
}

let server = null;

// Only bind listener and start scheduler daemon when executed directly
if (require.main === module) {
  startScheduler(60000);

  const HOST = process.env.HOST || '127.0.0.1';
  server = app.listen(PORT, HOST, () => {
    logger.info(`=======================================================`);
    logger.info(`🚀 SocialPulse Studio Enterprise Engine v2.0 running at:`);
    logger.info(`👉 http://${HOST}:${PORT}`);
    logger.info(`=======================================================`);
  });
}

// Graceful Shutdown Signal Handling
async function handleShutdown(signal) {
  logger.info({ signal }, 'Received termination signal, initiating graceful shutdown...');
  await stopScheduler(5000);
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force exit after 10s if connections linger
  setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = { app, server };
