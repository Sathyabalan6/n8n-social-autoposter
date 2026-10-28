const express = require('express');
const db = require('../db');
const logger = require('../logger');
const { ROLES } = require('../auth');
const { requireAuth, enforceTenantScope } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { reschedulePostSchema } = require('../validation/schemas');
const { compilePost } = require('../compiler');
const { dispatchPost, syncPostMetrics } = require('../platforms');
const { uploadFields } = require('../middleware/upload');

const router = express.Router();

// 1. Create Post (Immediate or Scheduled)
router.post('/api/posts', requireAuth, enforceTenantScope, uploadFields, async (req, res) => {
  try {
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

// 2. List posts
router.get('/api/posts', requireAuth, (req, res) => {
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

// 3. Update / Edit post
router.put('/api/posts/:id', requireAuth, enforceTenantScope, uploadFields, async (req, res) => {
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

// 4. Atomic Reschedule
router.patch('/api/posts/:id/schedule', requireAuth, enforceTenantScope, validateBody(reschedulePostSchema), (req, res) => {
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

// 5. Delete post
router.delete('/api/posts/:id', requireAuth, enforceTenantScope, (req, res) => {
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

// 6. Metrics & Snapshots
router.get('/api/posts/:id/metrics', requireAuth, (req, res) => {
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

router.post('/api/posts/:id/sync-metrics', requireAuth, async (req, res) => {
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

// 7. Retry Failed Post
router.post('/api/posts/:id/retry', requireAuth, enforceTenantScope, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.getPostById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (existing.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Post is already successfully completed.' });
    }

    logger.info({ postId: id }, 'Retrying failed post dispatch');
    const { results, finalStatus, errorSummary } = await dispatchPost(existing);
    db.updatePostStatus(id, finalStatus, results, errorSummary);

    res.json({
      success: true,
      postId: id,
      status: finalStatus,
      results,
      error_summary: errorSummary
    });
  } catch (err) {
    logger.error({ postId: req.params.id, err: err.message }, 'Retry post dispatch failed');
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
