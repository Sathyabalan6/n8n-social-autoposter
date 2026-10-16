const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { encrypt, decrypt } = require('./crypto');

const dbPath = path.join(__dirname, '..', 'posts.sqlite');
const db = new DatabaseSync(dbPath);

// Enterprise SQLite High-Concurrency Configuration
try {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);
} catch (e) {
  console.warn('[DB] Pragma initialization warning:', e.message);
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
    attempts INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    encrypted INTEGER DEFAULT 0
  );
`);

// Safe migrations for existing databases
const migrations = [
  'ALTER TABLE posts ADD COLUMN client_id INTEGER DEFAULT 1;',
  'ALTER TABLE posts ADD COLUMN first_comment TEXT;',
  'ALTER TABLE posts ADD COLUMN worker_id TEXT;',
  'ALTER TABLE posts ADD COLUMN locked_until INTEGER DEFAULT 0;',
  'ALTER TABLE posts ADD COLUMN attempts INTEGER DEFAULT 0;',
  'ALTER TABLE posts ADD COLUMN media_overrides TEXT;'
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
    results, error_summary, first_comment, attempts
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?
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
      post.attempts || 0
    );
    return result.lastInsertRowid;
  },
  getAllPosts: (clientId = null) => {
    const rows = clientId ? stmtGetByClient.all(clientId) : stmtGetAll.all();
    return rows.map(r => ({
      ...r,
      media_overrides: safeJsonParse(r.media_overrides, {}),
      platforms: safeJsonParse(r.platforms, []),
      results: safeJsonParse(r.results, {})
    }));
  },
  getPostById: (id) => {
    const row = stmtGetById.get(id);
    if (!row) return null;
    return {
      ...row,
      media_overrides: safeJsonParse(row.media_overrides, {}),
      platforms: safeJsonParse(row.platforms, []),
      results: safeJsonParse(row.results, {})
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
  }
};
