const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { generateApprovalToken, validateApprovalToken } = require('../crypto');
const { ROLES } = require('../auth');
const { requireAuth, enforceTenantScope } = require('../middleware/auth');

const router = express.Router();

const reviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many review requests, please try again in a minute.' }
});

router.use('/review', reviewLimiter);
router.use('/api/review', reviewLimiter);
const reviewTemplatePath = path.join(__dirname, '..', 'views', 'review.html');
let reviewTemplate = '';

try {
  reviewTemplate = fs.readFileSync(reviewTemplatePath, 'utf8');
} catch {
  // Loaded dynamically on request if not pre-read
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

router.post('/api/posts/:id/request-approval', requireAuth, enforceTenantScope, (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const post = db.getPostById(postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    if (req.user && req.user.role !== ROLES.OWNER && post.client_id !== req.user.client_id) {
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

router.get('/review/:id', (req, res) => {
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

  const firstCommentHtml = post.first_comment
    ? `<div style="font-size: 12px; color: #22c55e; margin-bottom: 12px;"><strong>First Comment (Outbound Link):</strong> ${escapeHtml(post.first_comment)}</div>`
    : '';

  const attachmentHtml = post.media_filename
    ? `<div style="font-size: 12px; color: #a1a1aa; margin-bottom: 14px;">📎 Attachment: ${escapeHtml(post.media_filename)}</div>`
    : '';

  let actionControlsHtml = `<div style="text-align: center; color: #a1a1aa; font-size: 13px; margin-top: 20px;">${escapeHtml(footerMsg)}</div>`;

  if (isValid && post.workflow_state !== 'APPROVED') {
    actionControlsHtml = `
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
    `;
  }

  const template = reviewTemplate || fs.readFileSync(reviewTemplatePath, 'utf8');
  const rendered = template
    .replace(/{{POST_ID}}/g, String(post.id))
    .replace('{{BADGE_CLASS}}', badgeClass)
    .replace('{{BADGE_TEXT}}', badgeText)
    .replace('{{SCHEDULED_TIME}}', escapeHtml(new Date(post.scheduled_at).toLocaleString()))
    .replace('{{CHANNELS}}', escapeHtml((post.platforms || []).join(', ')))
    .replace('{{MASTER_TEXT}}', escapeHtml(post.master_text))
    .replace('{{FIRST_COMMENT_HTML}}', firstCommentHtml)
    .replace('{{ATTACHMENT_HTML}}', attachmentHtml)
    .replace('{{ACTION_CONTROLS_HTML}}', actionControlsHtml);

  res.send(rendered);
});

router.post('/api/review/:id/approve', (req, res) => {
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

router.post('/api/review/:id/reject', (req, res) => {
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

module.exports = router;
