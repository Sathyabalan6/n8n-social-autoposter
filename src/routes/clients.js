const express = require('express');
const db = require('../db');
const logger = require('../logger');
const { ROLES } = require('../auth');
const { requireAuth, requireRole, enforceTenantScope } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { createClientSchema, createAccountSchema } = require('../validation/schemas');

const router = express.Router();

router.get('/api/clients', requireAuth, (req, res) => {
  try {
    const allClients = db.getClients();
    const clients = req.user.role === ROLES.OWNER
      ? allClients
      : allClients.filter((c) => c.id === req.user.client_id);
    res.json({ success: true, clients });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/clients', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), validateBody(createClientSchema), (req, res) => {
  try {
    const { name, color_code } = req.body;
    const client = db.createClient(name.trim(), color_code);
    db.logAudit({
      user_id: req.user.sub,
      client_id: client.id,
      action: 'CLIENT_CREATED',
      entity_type: 'CLIENT',
      entity_id: client.id,
      metadata: { name },
      ip_address: req.ip
    });
    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/clients/:id', requireAuth, requireRole(ROLES.OWNER), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    db.deleteClient(clientId);
    db.logAudit({
      user_id: req.user.sub,
      client_id: clientId,
      action: 'CLIENT_DELETED',
      entity_type: 'CLIENT',
      entity_id: clientId,
      ip_address: req.ip
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/clients/:id/accounts', requireAuth, enforceTenantScope, (req, res) => {
  try {
    const accounts = db.getAccountsByClient(req.params.id);
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/accounts', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), (_req, res) => {
  try {
    const accounts = db.getAllAccounts();
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/clients/:id/accounts', requireAuth, enforceTenantScope, validateBody(createAccountSchema), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const { platform, account_name, account_handle, tokens } = req.body;
    const id = db.saveAccountTokens(clientId, platform.toLowerCase(), account_name.trim(), account_handle || '', '', tokens || {});
    db.logAudit({
      user_id: req.user.sub,
      client_id: clientId,
      action: 'ACCOUNT_CONNECTED',
      entity_type: 'SOCIAL_ACCOUNT',
      entity_id: id,
      metadata: { platform, account_name },
      ip_address: req.ip
    });
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/accounts/:id', requireAuth, (req, res) => {
  try {
    const accountId = parseInt(req.params.id, 10);
    const accounts = db.getAllAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    if (req.user.role !== ROLES.OWNER && account.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Access to this account is denied' });
    }

    db.deleteAccount(accountId);
    db.logAudit({
      user_id: req.user.sub,
      client_id: account.client_id,
      action: 'ACCOUNT_DELETED',
      entity_type: 'SOCIAL_ACCOUNT',
      entity_id: accountId,
      ip_address: req.ip
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Audit Logs
router.get('/api/clients/:id/audit', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const logs = db.getAuditLogs(clientId, limit);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GDPR Data Subject Access Request (DSAR) Export
router.get('/api/clients/:id/export', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const data = db.exportClientData(clientId);
    if (!data) return res.status(404).json({ success: false, error: 'Client not found' });

    db.logAudit({
      user_id: req.user.sub,
      client_id: clientId,
      action: 'GDPR_DATA_EXPORTED',
      entity_type: 'CLIENT',
      entity_id: clientId,
      ip_address: req.ip
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GDPR Right to Erasure
router.delete('/api/clients/:id/erase', requireAuth, requireRole(ROLES.OWNER), (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    db.eraseClientData(clientId);
    logger.warn({ clientId, erasedBy: req.user.sub }, '[GDPR] Client data permanently erased');
    res.json({ success: true, message: `All data for client #${clientId} has been permanently erased in accordance with GDPR.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
