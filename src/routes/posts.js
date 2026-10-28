const express = require('express');
const db = require('../db');
const { compilePost, YOUTUBE_CATEGORIES } = require('../compiler');
const { dispatchPost, syncPostMetrics } = require('../platforms');
const { getStoredTokens } = require('../platforms/youtube');
const { uploadFields } = require('../middleware/upload');

const router = express.Router();

// 1. Health check & status
router.get('/api/status', (req, res) => {
  const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;
  const ytTokens = getStoredTokens(clientId);
  res.json({
    status: 'ok',
    version: '1.2.0',
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

// 1b. YouTube Categories Taxonomy
router.get('/api/youtube/categories', (_req, res) => {
  res.json({ success: true, categories: YOUTUBE_CATEGORIES });
});

// 2. Live Validation & Preview compiler
router.post('/api/compile', (req, res) => {
  try {
    const compiled = compilePost(req.body);
    res.json({ success: true, compiled });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 3. Create / Submit Post (Immediate or Scheduled)
router.post('/api/posts', uploadFields, async (req, res) => {
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
router.get('/api/posts', (req, res) => {
  try {
    const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;
    const posts = db.getAllPosts(clientId);
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Update / Edit post
router.put('/api/posts/:id', uploadFields, async (req, res) => {
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
router.patch('/api/posts/:id/schedule', (req, res) => {
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

    if (existing.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot reschedule a completed post. Please duplicate or create a new post to schedule again.'
      });
    }

    const newStatus = existing.status === 'draft' ? 'draft' : 'scheduled';
    db.updatePostSchedule(id, scheduled_at, newStatus);

    res.json({ success: true, id, scheduled_at, status: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- POST PERFORMANCE METRICS ENDPOINTS ---
router.get('/api/posts/:id/metrics', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const post = db.getPostById(id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const snapshots = db.getMetricsForPost(id);
    const latest = db.getLatestPostMetrics(id);
    res.json({ success: true, postId: id, snapshots, latest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/posts/:id/sync-metrics', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const post = db.getPostById(id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const result = await syncPostMetrics(post, 'MANUAL');
    const latest = db.getLatestPostMetrics(id);
    res.json({ success: true, postId: id, result, latest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Delete post
router.delete('/api/posts/:id', (req, res) => {
  try {
    db.deletePost(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
