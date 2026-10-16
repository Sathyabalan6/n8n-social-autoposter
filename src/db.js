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

// Initialize tables with DAG state machine & lease locking
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'completed',
    scheduled_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    master_text TEXT NOT NULL,
    master_hashtags TEXT,
    media_path TEXT,
    media_filename TEXT,
    media_mimetype TEXT,
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
try {
  db.exec(`
    ALTER TABLE posts ADD COLUMN first_comment TEXT;
    ALTER TABLE posts ADD COLUMN worker_id TEXT;
    ALTER TABLE posts ADD COLUMN locked_until INTEGER DEFAULT 0;
    ALTER TABLE posts ADD COLUMN attempts INTEGER DEFAULT 0;
  `);
} catch {
  // Columns already exist
}

try {
  db.exec(`ALTER TABLE settings ADD COLUMN encrypted INTEGER DEFAULT 0;`);
} catch {
  // Column already exists
}

function safeJsonParse(jsonString, fallback) {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

const stmtInsert = db.prepare(`
  INSERT INTO posts (
    status, scheduled_at, created_at, updated_at, master_text, master_hashtags,
    media_path, media_filename, media_mimetype, platforms,
    youtube_title, youtube_tags, youtube_privacy,
    x_post, linkedin_post, instagram_caption, threads_post, facebook_post,
    results, error_summary, first_comment, attempts
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?
  )
`);

const stmtGetAll = db.prepare(`SELECT * FROM posts ORDER BY id DESC`);
const stmtGetById = db.prepare(`SELECT * FROM posts WHERE id = ?`);
const stmtUpdateStatus = db.prepare(`UPDATE posts SET status = ?, updated_at = ?, results = ?, error_summary = ? WHERE id = ?`);
const stmtDelete = db.prepare(`DELETE FROM posts WHERE id = ?`);

const stmtGetSetting = db.prepare(`SELECT value, encrypted FROM settings WHERE key = ?`);
const stmtSetSetting = db.prepare(`INSERT INTO settings (key, value, encrypted) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, encrypted = excluded.encrypted`);

module.exports = {
  db,
  insertPost: (post) => {
    const now = new Date().toISOString();
    const result = stmtInsert.run(
      post.status || 'completed',
      post.scheduled_at || now,
      now,
      now,
      post.master_text || '',
      post.master_hashtags || '',
      post.media_path || '',
      post.media_filename || '',
      post.media_mimetype || '',
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
  getAllPosts: () => {
    const rows = stmtGetAll.all();
    return rows.map(r => ({
      ...r,
      platforms: safeJsonParse(r.platforms, []),
      results: safeJsonParse(r.results, {})
    }));
  },
  getPostById: (id) => {
    const row = stmtGetById.get(id);
    if (!row) return null;
    return {
      ...row,
      platforms: safeJsonParse(row.platforms, []),
      results: safeJsonParse(row.results, {})
    };
  },
  /**
   * Atomically claims the next due or zombie task using lease-time locking.
   * Eliminates concurrency races without Redis!
   */
  claimNextJob: (workerId, leaseDurationMs = 30000) => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const lockedUntil = nowMs + leaseDurationMs;

    // Find candidate job: either due 'scheduled' OR abandoned/crashed 'claimed' whose lease expired
    const candidateStmt = db.prepare(`
      SELECT id FROM posts 
      WHERE (status = 'scheduled' AND scheduled_at <= ?)
         OR (status = 'claimed' AND locked_until < ?)
      ORDER BY id ASC 
      LIMIT 1
    `);
    const candidate = candidateStmt.get(nowIso, nowMs);
    if (!candidate) return null;

    // Atomically lock candidate
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
      return null; // Another worker claimed it in between
    }

    const job = stmtGetById.get(candidate.id);
    return {
      ...job,
      platforms: safeJsonParse(job.platforms, []),
      results: safeJsonParse(job.results, {})
    };
  },
  updatePostStatus: (id, status, results = {}, errorSummary = '') => {
    const now = new Date().toISOString();
    stmtUpdateStatus.run(status, now, JSON.stringify(results), errorSummary, id);
  },
  deletePost: (id) => {
    stmtDelete.run(id);
  },
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
