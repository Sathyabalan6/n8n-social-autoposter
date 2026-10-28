const express = require('express');
const db = require('../db');
const { ROLES } = require('../auth');
const { requireAuth, enforceTenantScope } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { replyInboxSchema } = require('../validation/schemas');
const { syncInboundComments, replyToEngagementTask } = require('../platforms');

const router = express.Router();

router.get('/api/clients/:id/inbox', requireAuth, enforceTenantScope, (req, res) => {
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

router.post('/api/inbox/:id/reply', requireAuth, validateBody(replyInboxSchema), async (req, res) => {
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

router.post('/api/inbox/sync', requireAuth, enforceTenantScope, async (req, res) => {
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

router.delete('/api/inbox/:id', requireAuth, (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const task = db.getEngagementTaskById(taskId);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    if (req.user.role !== ROLES.OWNER && task.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to this task is denied' });
    }

    db.deleteEngagementTask(taskId);
    db.logAudit({
      user_id: req.user.sub,
      client_id: task.client_id,
      action: 'INBOX_TASK_DISMISSED',
      entity_type: 'ENGAGEMENT_TASK',
      entity_id: taskId,
      ip_address: req.ip
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
