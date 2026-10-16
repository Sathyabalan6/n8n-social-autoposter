const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = path.join(__dirname, '..', 'posts.sqlite');
const db = new DatabaseSync(dbPath);

// Initialize schema
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
    error_summary TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const stmtInsert = db.prepare(`
  INSERT INTO posts (
    status, scheduled_at, created_at, updated_at, master_text, master_hashtags,
    media_path, media_filename, media_mimetype, platforms,
    youtube_title, youtube_tags, youtube_privacy,
    x_post, linkedin_post, instagram_caption, threads_post, facebook_post,
    results, error_summary
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?
  )
`);

const stmtGetAll = db.prepare(`SELECT * FROM posts ORDER BY id DESC`);
const stmtGetById = db.prepare(`SELECT * FROM posts WHERE id = ?`);
const stmtGetDue = db.prepare(`SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at <= ?`);
const stmtUpdateStatus = db.prepare(`UPDATE posts SET status = ?, updated_at = ?, results = ?, error_summary = ? WHERE id = ?`);
const stmtDelete = db.prepare(`DELETE FROM posts WHERE id = ?`);

const stmtGetSetting = db.prepare(`SELECT value FROM settings WHERE key = ?`);
const stmtSetSetting = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);

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
      post.error_summary || ''
    );
    return result.lastInsertRowid;
  },
  getAllPosts: () => {
    const rows = stmtGetAll.all();
    return rows.map(r => ({
      ...r,
      platforms: JSON.parse(r.platforms || '[]'),
      results: JSON.parse(r.results || '{}')
    }));
  },
  getPostById: (id) => {
    const row = stmtGetById.get(id);
    if (!row) return null;
    return {
      ...row,
      platforms: JSON.parse(row.platforms || '[]'),
      results: JSON.parse(row.results || '{}')
    };
  },
  getDuePosts: (cutoffTime = new Date().toISOString()) => {
    const rows = stmtGetDue.all(cutoffTime);
    return rows.map(r => ({
      ...r,
      platforms: JSON.parse(r.platforms || '[]'),
      results: JSON.parse(r.results || '{}')
    }));
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
    return row ? row.value : null;
  },
  setSetting: (key, value) => {
    stmtSetSetting.run(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
};
