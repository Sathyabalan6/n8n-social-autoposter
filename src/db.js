const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { encrypt, decrypt } = require('./crypto');
const logger = require('./logger');

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'posts.sqlite');
const db = new DatabaseSync(dbPath);

// Enterprise SQLite High-Concurrency Configuration
try {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);
} catch (e) {
  logger.warn({ err: e.message }, '[DB] Pragma initialization warning');
}

// 1. Core Agency Tables: clients, social_accounts, posts, settings
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color_code TEXT DEFAULT '#3B82F6',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS social_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_handle TEXT,
    avatar_url TEXT,
    encrypted_tokens TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'completed',
    scheduled_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    master_text TEXT NOT NULL,
    master_hashtags TEXT,
    media_path TEXT,
    media_filename TEXT,
    media_mimetype TEXT,
    media_overrides TEXT,
    platforms TEXT NOT NULL,
    youtube_title TEXT,
    youtube_tags TEXT,
    youtube_privacy TEXT DEFAULT 'unlisted',
    x_post TEXT,
    linkedin_post TEXT,
    instagram_caption TEXT,
    threads_post TEXT,
    facebook_post TEXT,
    results TEXT,
    error_summary TEXT,
    first_comment TEXT,
    worker_id TEXT,
    locked_until INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    youtube_category_id TEXT DEFAULT '28',
    youtube_made_for_kids INTEGER DEFAULT 0,
    youtube_synthetic_media INTEGER DEFAULT 0,
    youtube_notify_subscribers INTEGER DEFAULT 1,
    youtube_custom_thumb_path TEXT,
    x_alt_text TEXT,
    linkedin_disable_reshare INTEGER DEFAULT 0,
    linkedin_doc_path TEXT,
    instagram_audio_name TEXT,
    instagram_is_trial INTEGER DEFAULT 0,
    workflow_state TEXT DEFAULT 'APPROVED',
    approval_token_hash TEXT,
    token_expires_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS queue_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    iso_weekday INTEGER NOT NULL CHECK(iso_weekday BETWEEN 1 AND 7),
    local_time TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS post_metrics_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    snapshot_type TEXT NOT NULL,
    snapshot_time INTEGER NOT NULL,
    impression_count INTEGER DEFAULT 0,
    reach_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    repost_count INTEGER DEFAULT 0,
    raw_metrics TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS engagement_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    external_comment_id TEXT NOT NULL,
    parent_post_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    is_replied INTEGER DEFAULT 0,
    reply_text TEXT,
    replied_at TEXT,
    FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
    UNIQUE(platform, external_comment_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    encrypted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL DEFAULT 1,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'EDITOR',
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    client_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS idempotency_keys (
    idempotency_key TEXT PRIMARY KEY,
    post_id INTEGER,
    response_payload TEXT,
    created_at TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS revoked_tokens (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Safe migrations for existing databases
const migrations = [
  'ALTER TABLE posts ADD COLUMN client_id INTEGER DEFAULT 1;',
  'ALTER TABLE posts ADD COLUMN first_comment TEXT;',
  'ALTER TABLE posts ADD COLUMN worker_id TEXT;',
  'ALTER TABLE posts ADD COLUMN locked_until INTEGER DEFAULT 0;',
  'ALTER TABLE posts ADD COLUMN attempts INTEGER DEFAULT 0;',
  'ALTER TABLE posts ADD COLUMN media_overrides TEXT;',
  "ALTER TABLE posts ADD COLUMN youtube_category_id TEXT DEFAULT '28';",
  'ALTER TABLE posts ADD COLUMN youtube_made_for_kids INTEGER DEFAULT 0;',
  'ALTER TABLE posts ADD COLUMN youtube_synthetic_media INTEGER DEFAULT 0;',
  'ALTER TABLE posts ADD COLUMN youtube_notify_subscribers INTEGER DEFAULT 1;',
  'ALTER TABLE posts ADD COLUMN youtube_custom_thumb_path TEXT;',
  'ALTER TABLE posts ADD COLUMN x_alt_text TEXT;',
  'ALTER TABLE posts ADD COLUMN linkedin_disable_reshare INTEGER DEFAULT 0;',
  'ALTER TABLE posts ADD COLUMN linkedin_doc_path TEXT;',
  'ALTER TABLE posts ADD COLUMN instagram_audio_name TEXT;',
  'ALTER TABLE posts ADD COLUMN instagram_is_trial INTEGER DEFAULT 0;',
  "ALTER TABLE posts ADD COLUMN workflow_state TEXT DEFAULT 'APPROVED';",
  'ALTER TABLE posts ADD COLUMN approval_token_hash TEXT;',
  'ALTER TABLE posts ADD COLUMN token_expires_at INTEGER;'
];

for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch {
    // Column already exists
  }
}

try {
  db.exec(`ALTER TABLE settings ADD COLUMN encrypted INTEGER DEFAULT 0;`);
} catch {
  // Column already exists
}

// Seed default clients if empty
const countClients = db.prepare('SELECT COUNT(*) as c FROM clients').get();
if (countClients.c === 0) {
  const now = new Date().toISOString();
  db.exec(`
    INSERT INTO clients (name, color_code, created_at) VALUES 
    ('Main Agency Brand', '#3B82F6', '${now}'),
    ('Client Alpha (E-commerce)', '#10B981', '${now}'),
    ('Client Beta (Tech Startup)', '#8B5CF6', '${now}');
  `);
}

// Seed starter demo posts if empty for smooth first-run onboarding
const countPosts = db.prepare('SELECT COUNT(*) as c FROM posts').get();
if (countPosts.c === 0) {
  const now = new Date();
  const pastIso = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  tomorrow.setHours(9, 30, 0, 0);
  const futureIso = tomorrow.toISOString();

  // 1. Completed demo post
  db.exec(`
    INSERT INTO posts (
      client_id, status, scheduled_at, created_at, updated_at,
      master_text, master_hashtags, platforms, youtube_title,
      first_comment, results
    ) VALUES (
      1, 'completed', '${pastIso}', '${pastIso}', '${pastIso}',
      '🚀 Welcome to SocialPulse! Your self-hosted multi-channel social studio is running.',
      'buildinpublic tech opensource',
      '["youtube", "x", "linkedin"]',
      'Welcome to SocialPulse Studio',
      'Check out the project repository on GitHub: https://github.com/Sathyabalan6/social-auto-post',
      '{"youtube":{"success":true,"videoId":"demo_vid_01"},"x":{"success":true,"tweetId":"demo_tw_01"},"linkedin":{"success":true,"postUrn":"urn:li:share:demo01"}}'
    );
  `);

  const demoPostRow = db.prepare('SELECT id FROM posts ORDER BY id DESC LIMIT 1').get();
  if (demoPostRow) {
    db.exec(`
      INSERT INTO post_metrics_snapshots (
        post_id, platform, snapshot_type, snapshot_time,
        impression_count, reach_count, like_count, reply_count, repost_count,
        created_at
      ) VALUES 
      (${demoPostRow.id}, 'YOUTUBE', 'MANUAL', ${Date.now()}, 420, 390, 38, 5, 0, '${pastIso}'),
      (${demoPostRow.id}, 'X', 'MANUAL', ${Date.now()}, 890, 810, 64, 12, 9, '${pastIso}');
    `);
  }

  // 2. Scheduled demo post for tomorrow
  db.exec(`
    INSERT INTO posts (
      client_id, status, scheduled_at, created_at, updated_at,
      master_text, master_hashtags, platforms, youtube_title,
      first_comment
    ) VALUES (
      1, 'scheduled', '${futureIso}', '${now.toISOString()}', '${now.toISOString()}',
      '💡 Pro-tip: Decoupling your external links into the First Comment boosts organic reach by up to 80% on X and LinkedIn.',
      'socialmedia growth strategy',
      '["x", "linkedin", "threads"]',
      'Growth Strategy Tip',
      'Read the full benchmark study at https://example.com/algorithm-reach'
    );
  `);

  // Default queue rules
  db.exec(`
    INSERT INTO queue_rules (client_id, timezone, iso_weekday, local_time, created_at) VALUES
    (1, 'UTC', 1, '09:30', '${now.toISOString()}'),
    (1, 'UTC', 3, '14:00', '${now.toISOString()}'),
    (1, 'UTC', 5, '10:00', '${now.toISOString()}');
  `);
}

function safeJsonParse(jsonString, fallback) {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

// Prepared Statements
const stmtInsert = db.prepare(`
  INSERT INTO posts (
    client_id, status, scheduled_at, created_at, updated_at, master_text, master_hashtags,
    media_path, media_filename, media_mimetype, media_overrides, platforms,
    youtube_title, youtube_tags, youtube_privacy,
    x_post, linkedin_post, instagram_caption, threads_post, facebook_post,
    results, error_summary, first_comment, attempts,
    youtube_category_id, youtube_made_for_kids, youtube_synthetic_media, youtube_notify_subscribers, youtube_custom_thumb_path,
    x_alt_text, linkedin_disable_reshare, linkedin_doc_path, instagram_audio_name, instagram_is_trial
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?
  )
`);

const stmtGetAll = db.prepare(`
  SELECT p.*, c.name as client_name, c.color_code as client_color 
  FROM posts p 
  LEFT JOIN clients c ON p.client_id = c.id 
  ORDER BY p.id DESC
`);

const stmtGetByClient = db.prepare(`
  SELECT p.*, c.name as client_name, c.color_code as client_color 
  FROM posts p 
  LEFT JOIN clients c ON p.client_id = c.id 
  WHERE p.client_id = ? 
  ORDER BY p.id DESC
`);

const stmtGetById = db.prepare(`SELECT * FROM posts WHERE id = ?`);
const stmtUpdateStatus = db.prepare(`UPDATE posts SET status = ?, updated_at = ?, results = ?, error_summary = ? WHERE id = ?`);
const stmtUpdateSchedule = db.prepare(`UPDATE posts SET scheduled_at = ?, status = ?, updated_at = ? WHERE id = ?`);
const stmtDelete = db.prepare(`DELETE FROM posts WHERE id = ?`);

// Clients Statements
const stmtGetClients = db.prepare(`SELECT * FROM clients ORDER BY id ASC`);
const stmtInsertClient = db.prepare(`INSERT INTO clients (name, color_code, created_at) VALUES (?, ?, ?)`);
const stmtDeleteClient = db.prepare(`DELETE FROM clients WHERE id = ?`);

// Social Accounts Statements
const stmtGetAccountsByClient = db.prepare(`SELECT * FROM social_accounts WHERE client_id = ? AND is_active = 1`);
const stmtGetAllAccounts = db.prepare(`SELECT a.*, c.name as client_name FROM social_accounts a JOIN clients c ON a.client_id = c.id WHERE a.is_active = 1`);
const stmtUpsertAccount = db.prepare(`
  INSERT INTO social_accounts (client_id, platform, account_name, account_handle, avatar_url, encrypted_tokens, is_active, created_at)
  VALUES (?, ?, ?, ?, ?, ?, 1, ?)
`);
const stmtDeleteAccount = db.prepare(`DELETE FROM social_accounts WHERE id = ?`);

const stmtGetSetting = db.prepare(`SELECT value, encrypted FROM settings WHERE key = ?`);
const stmtSetSetting = db.prepare(`INSERT INTO settings (key, value, encrypted) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, encrypted = excluded.encrypted`);

// Queue Rules Statements
const stmtGetQueueRules = db.prepare(`SELECT * FROM queue_rules WHERE client_id = ? ORDER BY iso_weekday ASC, local_time ASC`);
const stmtInsertQueueRule = db.prepare(`INSERT INTO queue_rules (client_id, timezone, iso_weekday, local_time, created_at) VALUES (?, ?, ?, ?, ?)`);
const stmtDeleteQueueRule = db.prepare(`DELETE FROM queue_rules WHERE id = ?`);
const stmtGetPendingScheduledPosts = db.prepare(`SELECT id, scheduled_at FROM posts WHERE client_id = ? AND status = 'scheduled' ORDER BY scheduled_at ASC`);

// Approval Workflow Statements
const stmtSetApprovalToken = db.prepare(`UPDATE posts SET approval_token_hash = ?, token_expires_at = ?, workflow_state = ?, updated_at = ? WHERE id = ?`);
const stmtSetWorkflowState = db.prepare(`UPDATE posts SET workflow_state = ?, approval_token_hash = NULL, updated_at = ? WHERE id = ?`);
const stmtConsumeApprovalToken = db.prepare(`
  UPDATE posts 
  SET workflow_state = ?, 
      approval_token_hash = NULL, 
      token_expires_at = 0,
      status = CASE WHEN ? = 'APPROVED' THEN 'scheduled' ELSE status END,
      updated_at = ?
  WHERE id = ? AND approval_token_hash = ? AND token_expires_at > ?
`);

// Metrics Snapshots Statements (Time-Series Dual-Snapshot Engine)
const stmtInsertMetricsSnapshot = db.prepare(`
  INSERT INTO post_metrics_snapshots (
    post_id, platform, snapshot_type, snapshot_time,
    impression_count, reach_count, like_count, reply_count, repost_count,
    raw_metrics, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtGetMetricsByPost = db.prepare(`
  SELECT * FROM post_metrics_snapshots WHERE post_id = ? ORDER BY snapshot_time ASC
`);

const stmtGetLatestPostMetrics = db.prepare(`
  SELECT post_id, platform, snapshot_type, snapshot_time,
         impression_count, reach_count, like_count, reply_count, repost_count
  FROM post_metrics_snapshots
  WHERE post_id = ?
  ORDER BY snapshot_time DESC
`);

const stmtGetAggregatedMetrics = db.prepare(`
  SELECT post_id, 
         SUM(impression_count) as total_impressions,
         SUM(like_count) as total_likes,
         SUM(reply_count) as total_replies,
         SUM(repost_count) as total_reposts
  FROM (
    SELECT post_id, platform, impression_count, like_count, reply_count, repost_count
    FROM post_metrics_snapshots
    GROUP BY post_id, platform
    HAVING snapshot_time = MAX(snapshot_time)
  )
  GROUP BY post_id
`);

const stmtGetPostsDueForT24H = db.prepare(`
  SELECT p.* FROM posts p
  WHERE p.status = 'completed'
    AND p.created_at <= datetime('now', '-24 hours')
    AND p.id NOT IN (
      SELECT post_id FROM post_metrics_snapshots WHERE snapshot_type = 'T24H'
    )
  LIMIT 10
`);

// Engagement Tasks Statements (Task-Based Actionable Inbox)
const stmtInsertTask = db.prepare(`
  INSERT INTO engagement_tasks (
    client_id, platform, external_comment_id, parent_post_id,
    author_name, comment_text, created_at, is_replied
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  ON CONFLICT(platform, external_comment_id) DO NOTHING
`);

const stmtGetTasksByClient = db.prepare(`
  SELECT * FROM engagement_tasks 
  WHERE client_id = ? AND is_replied = ? 
  ORDER BY id DESC
`);

const stmtGetAllTasksByClient = db.prepare(`
  SELECT * FROM engagement_tasks 
  WHERE client_id = ? 
  ORDER BY id DESC
`);

const stmtGetTaskById = db.prepare(`
  SELECT * FROM engagement_tasks WHERE id = ?
`);

const stmtMarkTaskReplied = db.prepare(`
  UPDATE engagement_tasks 
  SET is_replied = 1, reply_text = ?, replied_at = ? 
  WHERE id = ?
`);

const stmtDeleteTask = db.prepare(`
  DELETE FROM engagement_tasks WHERE id = ?
`);

// Users Statements
const stmtInsertUser = db.prepare(`
  INSERT INTO users (client_id, email, password_hash, role, name, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const stmtGetUserByEmail = db.prepare(`SELECT * FROM users WHERE email = ?`);
const stmtGetUserById = db.prepare(`SELECT id, client_id, email, role, name, created_at, updated_at FROM users WHERE id = ?`);
const stmtGetUsersByClient = db.prepare(`SELECT id, client_id, email, role, name, created_at, updated_at FROM users WHERE client_id = ? ORDER BY id ASC`);
const stmtCountUsers = db.prepare(`SELECT COUNT(*) as count FROM users`);
const stmtUpdateUserRole = db.prepare(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`);
const stmtDeleteUser = db.prepare(`DELETE FROM users WHERE id = ?`);

// Audit Logs Statements
const stmtInsertAudit = db.prepare(`
  INSERT INTO audit_logs (user_id, client_id, action, entity_type, entity_id, metadata, ip_address, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtGetAuditLogs = db.prepare(`
  SELECT a.*, u.email as user_email, u.name as user_name 
  FROM audit_logs a 
  LEFT JOIN users u ON a.user_id = u.id 
  WHERE a.client_id = ? 
  ORDER BY a.id DESC 
  LIMIT ?
`);

// Idempotency Keys Statements
const stmtGetIdempotency = db.prepare(`SELECT * FROM idempotency_keys WHERE idempotency_key = ?`);
const stmtInsertIdempotency = db.prepare(`
  INSERT INTO idempotency_keys (idempotency_key, post_id, response_payload, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(idempotency_key) DO UPDATE SET
    post_id = excluded.post_id,
    response_payload = excluded.response_payload,
    expires_at = excluded.expires_at
`);
const stmtCleanExpiredIdempotency = db.prepare(`DELETE FROM idempotency_keys WHERE expires_at < ?`);

// Revoked Tokens Statements (JWT Logout Denylist)
const stmtInsertRevokedToken = db.prepare(`
  INSERT INTO revoked_tokens (token_hash, expires_at, created_at) VALUES (?, ?, ?)
  ON CONFLICT(token_hash) DO NOTHING
`);
const stmtIsTokenRevoked = db.prepare(`SELECT 1 FROM revoked_tokens WHERE token_hash = ? AND expires_at > ?`);
const stmtCleanRevokedTokens = db.prepare(`DELETE FROM revoked_tokens WHERE expires_at <= ?`);

// Seed default Admin user if none exists
try {
  const userCount = stmtCountUsers.get()?.count || 0;
  if (userCount === 0) {
    const { hashPassword } = require('./crypto');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@socialpulse.local';
    const adminPass = process.env.ADMIN_PASSWORD || 'SocialPulseAdmin2026!';
    const now = new Date().toISOString();
    stmtInsertUser.run(1, adminEmail.toLowerCase(), hashPassword(adminPass), 'OWNER', 'System Administrator', now, now);
    logger.info({ email: adminEmail }, '[Security] Seeded initial OWNER account');
  }
} catch (e) {
  logger.warn({ err: e.message }, '[DB] User auto-seed warning');
}

module.exports = {
  db,
  insertPost: (post) => {
    const now = new Date().toISOString();
    const result = stmtInsert.run(
      post.client_id || 1,
      post.status || 'completed',
      post.scheduled_at || now,
      now,
      now,
      post.master_text || '',
      post.master_hashtags || '',
      post.media_path || '',
      post.media_filename || '',
      post.media_mimetype || '',
      JSON.stringify(post.media_overrides || {}),
      JSON.stringify(post.platforms || []),
      post.youtube_title || '',
      post.youtube_tags || '',
      post.youtube_privacy || 'unlisted',
      post.x_post || '',
      post.linkedin_post || '',
      post.instagram_caption || '',
      post.threads_post || '',
      post.facebook_post || '',
      JSON.stringify(post.results || {}),
      post.error_summary || '',
      post.first_comment || '',
      post.attempts || 0,
      post.youtube_category_id || '28',
      post.youtube_made_for_kids ? 1 : 0,
      post.youtube_synthetic_media ? 1 : 0,
      post.youtube_notify_subscribers !== undefined ? (post.youtube_notify_subscribers ? 1 : 0) : 1,
      post.youtube_custom_thumb_path || '',
      post.x_alt_text || '',
      post.linkedin_disable_reshare ? 1 : 0,
      post.linkedin_doc_path || '',
      post.instagram_audio_name || '',
      post.instagram_is_trial ? 1 : 0
    );
    return result.lastInsertRowid;
  },
  getAllPosts: (clientId = null) => {
    const rows = clientId ? stmtGetByClient.all(clientId) : stmtGetAll.all();
    const aggMetrics = stmtGetAggregatedMetrics.all();
    const metricsMap = new Map(aggMetrics.map((m) => [m.post_id, m]));

    return rows.map(r => ({
      ...r,
      media_overrides: safeJsonParse(r.media_overrides, {}),
      platforms: safeJsonParse(r.platforms, []),
      results: safeJsonParse(r.results, {}),
      metrics: metricsMap.get(r.id) || null
    }));
  },
  getPostById: (id) => {
    const row = stmtGetById.get(id);
    if (!row) return null;
    const latestMetrics = stmtGetLatestPostMetrics.all(id);
    return {
      ...row,
      media_overrides: safeJsonParse(row.media_overrides, {}),
      platforms: safeJsonParse(row.platforms, []),
      results: safeJsonParse(row.results, {}),
      latest_metrics: latestMetrics
    };
  },
  claimNextJob: (workerId, leaseDurationMs = 30000) => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const lockedUntil = nowMs + leaseDurationMs;

    const candidateStmt = db.prepare(`
      SELECT id FROM posts 
      WHERE (status = 'scheduled' AND scheduled_at <= ?)
         OR (status = 'claimed' AND locked_until < ?)
      ORDER BY id ASC 
      LIMIT 1
    `);
    const candidate = candidateStmt.get(nowIso, nowMs);
    if (!candidate) return null;

    const lockStmt = db.prepare(`
      UPDATE posts 
      SET status = 'claimed', 
          worker_id = ?, 
          locked_until = ?, 
          attempts = attempts + 1,
          updated_at = ?
      WHERE id = ? AND (status = 'scheduled' OR (status = 'claimed' AND locked_until < ?))
    `);

    const result = lockStmt.run(workerId, lockedUntil, nowIso, candidate.id, nowMs);
    if (result.changes === 0) {
      return null;
    }

    const job = stmtGetById.get(candidate.id);
    return {
      ...job,
      media_overrides: safeJsonParse(job.media_overrides, {}),
      platforms: safeJsonParse(job.platforms, []),
      results: safeJsonParse(job.results, {})
    };
  },
  updatePostStatus: (id, status, results = {}, errorSummary = '') => {
    const now = new Date().toISOString();
    stmtUpdateStatus.run(status, now, JSON.stringify(results), errorSummary, id);
  },
  updatePostSchedule: (id, scheduledAt, status = 'scheduled') => {
    const now = new Date().toISOString();
    stmtUpdateSchedule.run(scheduledAt, status, now, id);
    return true;
  },
  updatePostContent: (id, updatedFields) => {
    const now = new Date().toISOString();
    const existing = stmtGetById.get(id);
    if (!existing) return null;

    const stmtUpdateFull = db.prepare(`
      UPDATE posts SET
        master_text = ?,
        master_hashtags = ?,
        platforms = ?,
        scheduled_at = ?,
        status = ?,
        youtube_title = ?,
        youtube_tags = ?,
        youtube_privacy = ?,
        x_post = ?,
        linkedin_post = ?,
        instagram_caption = ?,
        threads_post = ?,
        facebook_post = ?,
        media_path = COALESCE(?, media_path),
        media_filename = COALESCE(?, media_filename),
        media_mimetype = COALESCE(?, media_mimetype),
        media_overrides = COALESCE(?, media_overrides),
        first_comment = ?,
        youtube_category_id = ?,
        youtube_made_for_kids = ?,
        youtube_synthetic_media = ?,
        youtube_notify_subscribers = ?,
        youtube_custom_thumb_path = COALESCE(?, youtube_custom_thumb_path),
        x_alt_text = ?,
        linkedin_disable_reshare = ?,
        linkedin_doc_path = COALESCE(?, linkedin_doc_path),
        instagram_audio_name = ?,
        instagram_is_trial = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmtUpdateFull.run(
      updatedFields.master_text || existing.master_text,
      updatedFields.master_hashtags !== undefined ? updatedFields.master_hashtags : existing.master_hashtags,
      JSON.stringify(updatedFields.platforms || safeJsonParse(existing.platforms, [])),
      updatedFields.scheduled_at || existing.scheduled_at,
      updatedFields.status || existing.status,
      updatedFields.youtube_title || existing.youtube_title,
      updatedFields.youtube_tags !== undefined ? updatedFields.youtube_tags : existing.youtube_tags,
      updatedFields.youtube_privacy || existing.youtube_privacy,
      updatedFields.x_post || existing.x_post,
      updatedFields.linkedin_post || existing.linkedin_post,
      updatedFields.instagram_caption || existing.instagram_caption,
      updatedFields.threads_post || existing.threads_post,
      updatedFields.facebook_post || existing.facebook_post,
      updatedFields.media_path || null,
      updatedFields.media_filename || null,
      updatedFields.media_mimetype || null,
      updatedFields.media_overrides ? JSON.stringify(updatedFields.media_overrides) : null,
      updatedFields.first_comment !== undefined ? updatedFields.first_comment : existing.first_comment,
      updatedFields.youtube_category_id !== undefined ? updatedFields.youtube_category_id : (existing.youtube_category_id || '28'),
      updatedFields.youtube_made_for_kids !== undefined ? (updatedFields.youtube_made_for_kids ? 1 : 0) : (existing.youtube_made_for_kids || 0),
      updatedFields.youtube_synthetic_media !== undefined ? (updatedFields.youtube_synthetic_media ? 1 : 0) : (existing.youtube_synthetic_media || 0),
      updatedFields.youtube_notify_subscribers !== undefined ? (updatedFields.youtube_notify_subscribers ? 1 : 0) : (existing.youtube_notify_subscribers ?? 1),
      updatedFields.youtube_custom_thumb_path || null,
      updatedFields.x_alt_text !== undefined ? updatedFields.x_alt_text : existing.x_alt_text,
      updatedFields.linkedin_disable_reshare !== undefined ? (updatedFields.linkedin_disable_reshare ? 1 : 0) : (existing.linkedin_disable_reshare || 0),
      updatedFields.linkedin_doc_path || null,
      updatedFields.instagram_audio_name !== undefined ? updatedFields.instagram_audio_name : existing.instagram_audio_name,
      updatedFields.instagram_is_trial !== undefined ? (updatedFields.instagram_is_trial ? 1 : 0) : (existing.instagram_is_trial || 0),
      now,
      id
    );

    return true;
  },
  deletePost: (id) => {
    stmtDelete.run(id);
  },
  // Clients API
  getClients: () => stmtGetClients.all(),
  createClient: (name, color = '#3B82F6') => {
    const now = new Date().toISOString();
    const res = stmtInsertClient.run(name, color, now);
    return { id: res.lastInsertRowid, name, color_code: color, created_at: now };
  },
  deleteClient: (id) => stmtDeleteClient.run(id),
  // Social Accounts API
  getAccountsByClient: (clientId) => {
    const rows = stmtGetAccountsByClient.all(clientId);
    return rows.map(r => ({
      ...r,
      tokens: r.encrypted_tokens ? safeJsonParse(decrypt(r.encrypted_tokens), null) : null
    }));
  },
  getAllAccounts: () => {
    const rows = stmtGetAllAccounts.all();
    return rows.map(r => ({
      id: r.id,
      client_id: r.client_id,
      client_name: r.client_name,
      platform: r.platform,
      account_name: r.account_name,
      account_handle: r.account_handle,
      avatar_url: r.avatar_url,
      has_tokens: Boolean(r.encrypted_tokens),
      created_at: r.created_at
    }));
  },
  saveAccountTokens: (clientId, platform, accountName, handle, avatarUrl, tokens) => {
    const now = new Date().toISOString();
    const encTokens = encrypt(JSON.stringify(tokens));
    const res = stmtUpsertAccount.run(clientId, platform, accountName, handle || '', avatarUrl || '', encTokens, now);
    return res.lastInsertRowid;
  },
  deleteAccount: (id) => stmtDeleteAccount.run(id),
  // Settings API
  getSetting: (key) => {
    const row = stmtGetSetting.get(key);
    if (!row) return null;
    if (row.encrypted === 1) {
      return decrypt(row.value);
    }
    return row.value;
  },
  setSetting: (key, value, shouldEncrypt = false) => {
    const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (shouldEncrypt) {
      stmtSetSetting.run(key, encrypt(strVal), 1);
    } else {
      stmtSetSetting.run(key, strVal, 0);
    }
  },
  // Queue Rules API
  getQueueRules: (clientId) => stmtGetQueueRules.all(clientId),
  createQueueRule: (clientId, timezone, isoWeekday, localTime) => {
    const now = new Date().toISOString();
    const res = stmtInsertQueueRule.run(clientId, timezone || 'UTC', isoWeekday, localTime, now);
    return { id: res.lastInsertRowid, client_id: clientId, timezone, iso_weekday: isoWeekday, local_time: localTime, created_at: now };
  },
  deleteQueueRule: (id) => stmtDeleteQueueRule.run(id),
  getPendingScheduledPosts: (clientId) => stmtGetPendingScheduledPosts.all(clientId),
  // Approval Workflow API
  setApprovalToken: (postId, tokenHash, expiresAt) => {
    const now = new Date().toISOString();
    stmtSetApprovalToken.run(tokenHash, expiresAt, 'PENDING_APPROVAL', now, postId);
    return true;
  },
  setWorkflowState: (postId, workflowState) => {
    const now = new Date().toISOString();
    stmtSetWorkflowState.run(workflowState, now, postId);
    return true;
  },
  consumeApprovalToken: (postId, tokenHash, workflowState = 'APPROVED') => {
    const now = new Date();
    const result = stmtConsumeApprovalToken.run(workflowState, workflowState, now.toISOString(), postId, tokenHash, now.getTime());
    return result.changes > 0;
  },
  // Metrics Snapshot API
  saveMetricsSnapshot: (postId, platform, snapshotType, metrics = {}) => {
    const now = new Date();
    const epochMs = now.getTime();
    db.exec('BEGIN IMMEDIATE');
    try {
      const res = stmtInsertMetricsSnapshot.run(
        postId,
        platform.toUpperCase(),
        snapshotType,
        epochMs,
        metrics.impressions || metrics.views || 0,
        metrics.reach || 0,
        metrics.likes || 0,
        metrics.replies || metrics.comments || 0,
        metrics.reposts || metrics.retweets || 0,
        JSON.stringify(metrics.raw || metrics),
        now.toISOString()
      );
      db.exec('COMMIT');
      return res.lastInsertRowid;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },
  getMetricsForPost: (postId) => stmtGetMetricsByPost.all(postId),
  getLatestPostMetrics: (postId) => stmtGetLatestPostMetrics.all(postId),
  getPostsDueForMetricsSync: () => {
    const rows = stmtGetPostsDueForT24H.all();
    return rows.map(r => ({
      ...r,
      media_overrides: safeJsonParse(r.media_overrides, {}),
      platforms: safeJsonParse(r.platforms, []),
      results: safeJsonParse(r.results, {})
    }));
  },
  // Revoked Tokens API (Logout Denylist)
  revokeToken: (token, expiresAtEpochMs) => {
    if (!token) return;
    const crypto = require('node:crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();
    stmtInsertRevokedToken.run(tokenHash, expiresAtEpochMs || (Date.now() + 86400000), now.toISOString());
  },
  isTokenRevoked: (token) => {
    if (!token) return false;
    const crypto = require('node:crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = stmtIsTokenRevoked.get(tokenHash, Date.now());
    return Boolean(row);
  },
  cleanExpiredRevokedTokens: () => {
    stmtCleanRevokedTokens.run(Date.now());
  },
  // Engagement Tasks API (Actionable Inbox)
  createEngagementTask: (task) => {
    const now = new Date().toISOString();
    const res = stmtInsertTask.run(
      task.client_id || 1,
      task.platform.toUpperCase(),
      task.external_comment_id,
      String(task.parent_post_id),
      task.author_name || 'Follower',
      task.comment_text,
      task.created_at || now
    );
    return res.lastInsertRowid;
  },
  getEngagementTasks: (clientId, isReplied = null) => {
    if (isReplied !== null) {
      return stmtGetTasksByClient.all(clientId, isReplied ? 1 : 0);
    }
    return stmtGetAllTasksByClient.all(clientId);
  },
  getEngagementTaskById: (id) => stmtGetTaskById.get(id),
  markTaskReplied: (id, replyText) => {
    const now = new Date().toISOString();
    stmtMarkTaskReplied.run(replyText, now, id);
    return true;
  },
  deleteEngagementTask: (id) => stmtDeleteTask.run(id),
  // Users API
  createUser: (user) => {
    const now = new Date().toISOString();
    const res = stmtInsertUser.run(
      user.client_id || 1,
      user.email.toLowerCase().trim(),
      user.password_hash,
      user.role || 'EDITOR',
      user.name || '',
      now,
      now
    );
    return {
      id: res.lastInsertRowid,
      client_id: user.client_id || 1,
      email: user.email.toLowerCase().trim(),
      role: user.role || 'EDITOR',
      name: user.name || '',
      created_at: now
    };
  },
  getUserByEmail: (email) => stmtGetUserByEmail.get(email.toLowerCase().trim()),
  getUserById: (id) => stmtGetUserById.get(id),
  getUsersByClient: (clientId) => stmtGetUsersByClient.all(clientId),
  updateUserRole: (id, role) => {
    const now = new Date().toISOString();
    stmtUpdateUserRole.run(role, now, id);
    return true;
  },
  deleteUser: (id) => stmtDeleteUser.run(id),
  // Audit Logging API
  logAudit: (entry) => {
    const now = new Date().toISOString();
    stmtInsertAudit.run(
      entry.user_id || null,
      entry.client_id || 1,
      entry.action,
      entry.entity_type,
      String(entry.entity_id || ''),
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.ip_address || '',
      now
    );
  },
  getAuditLogs: (clientId, limit = 50) => stmtGetAuditLogs.all(clientId, limit),
  // Idempotency API
  getIdempotencyKey: (key) => {
    const row = stmtGetIdempotency.get(key);
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      return null;
    }
    return {
      post_id: row.post_id,
      response: safeJsonParse(row.response_payload, null)
    };
  },
  saveIdempotencyKey: (key, postId, responsePayload, ttlSeconds = 86400) => {
    const now = new Date().toISOString();
    const expiresAt = Date.now() + ttlSeconds * 1000;
    stmtInsertIdempotency.run(key, postId, JSON.stringify(responsePayload), now, expiresAt);
  },
  cleanExpiredIdempotencyKeys: () => {
    stmtCleanExpiredIdempotency.run(Date.now());
  },
  // GDPR Compliance API (DSAR & Right to Erasure)
  exportClientData: (clientId) => {
    const client = stmtGetClients.all().find((c) => c.id === clientId);
    if (!client) return null;
    const accounts = stmtGetAccountsByClient.all(clientId).map((a) => ({
      ...a,
      encrypted_tokens: '[REDACTED FOR EXPORT]'
    }));
    const posts = stmtGetByClient.all(clientId);
    const tasks = stmtGetAllTasksByClient.all(clientId);
    const users = stmtGetUsersByClient.all(clientId);
    return {
      client,
      accounts,
      posts,
      engagement_tasks: tasks,
      users,
      exported_at: new Date().toISOString()
    };
  },
  eraseClientData: (clientId) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM audit_logs WHERE client_id = ?').run(clientId);
      db.prepare('DELETE FROM engagement_tasks WHERE client_id = ?').run(clientId);
      db.prepare('DELETE FROM queue_rules WHERE client_id = ?').run(clientId);
      db.prepare('DELETE FROM posts WHERE client_id = ?').run(clientId);
      db.prepare('DELETE FROM social_accounts WHERE client_id = ?').run(clientId);
      db.prepare('DELETE FROM users WHERE client_id = ?').run(clientId);
      stmtDeleteClient.run(clientId);
      db.exec('COMMIT');
      return true;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
};
