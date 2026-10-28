const express = require('express');
const db = require('../db');
const { calculateNextAvailableSlot } = require('../compiler');
const { requireAuth, enforceTenantScope } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { queueRuleSchema } = require('../validation/schemas');

const router = express.Router();

router.get('/api/clients/:id/queue-rules', requireAuth, enforceTenantScope, (req, res) => {
  try {
    const rules = db.getQueueRules(req.params.id);
    res.json({ success: true, rules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/clients/:id/queue-rules', requireAuth, enforceTenantScope, validateBody(queueRuleSchema), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const { timezone, iso_weekday, local_time } = req.body;
    const rule = db.createQueueRule(clientId, timezone, iso_weekday, local_time);
    res.json({ success: true, rule });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/queue-rules/:id', requireAuth, (req, res) => {
  try {
    db.deleteQueueRule(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/clients/:id/next-slot', requireAuth, enforceTenantScope, (req, res) => {
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
