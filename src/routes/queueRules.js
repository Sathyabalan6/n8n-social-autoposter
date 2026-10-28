const express = require('express');
const db = require('../db');
const { calculateNextAvailableSlot } = require('../compiler');

const router = express.Router();

router.get('/api/clients/:id/queue-rules', (req, res) => {
  try {
    const rules = db.getQueueRules(req.params.id);
    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/clients/:id/queue-rules', (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const { timezone, iso_weekday, local_time } = req.body;
    if (!iso_weekday || !local_time) {
      return res.status(400).json({ success: false, error: 'iso_weekday (1-7) and local_time (HH:mm) are required' });
    }
    const rule = db.createQueueRule(clientId, timezone || 'UTC', parseInt(iso_weekday, 10), String(local_time).trim());
    res.json({ success: true, rule });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/queue-rules/:id', (req, res) => {
  try {
    db.deleteQueueRule(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/clients/:id/next-slot', (req, res) => {
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

module.exports = router;
