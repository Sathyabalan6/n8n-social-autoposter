const express = require('express');
const db = require('../db');
const { syncInboundComments, replyToEngagementTask } = require('../platforms');

const router = express.Router();

router.get('/api/clients/:id/inbox', (req, res) => {
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

router.post('/api/inbox/:id/reply', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { reply_text, client_id } = req.body;
    if (!reply_text || !reply_text.trim()) {
      return res.status(400).json({ success: false, error: 'reply_text is required' });
    }

    const task = db.getEngagementTaskById(taskId);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    const result = await replyToEngagementTask(task, reply_text.trim(), client_id);
    res.json({ success: true, taskId, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/inbox/sync', async (req, res) => {
  try {
    const clientId = req.body.client_id ? parseInt(req.body.client_id, 10) : 1;
    const syncRes = await syncInboundComments(clientId);
    res.json({ success: true, syncRes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/inbox/:id', (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    db.deleteEngagementTask(taskId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
