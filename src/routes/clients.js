const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/api/clients', (_req, res) => {
  try {
    const clients = db.getClients();
    res.json({ success: true, clients });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/clients', (req, res) => {
  try {
    const { name, color_code } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Client name is required' });
    }
    const client = db.createClient(name.trim(), color_code || '#3B82F6');
    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/clients/:id', (req, res) => {
  try {
    db.deleteClient(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/clients/:id/accounts', (req, res) => {
  try {
    const accounts = db.getAccountsByClient(req.params.id);
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/accounts', (_req, res) => {
  try {
    const accounts = db.getAllAccounts();
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/clients/:id/accounts', (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const { platform, account_name, account_handle, tokens } = req.body;
    if (!platform || !account_name) {
      return res.status(400).json({ success: false, error: 'Platform and Account Name are required' });
    }
    const id = db.saveAccountTokens(clientId, platform.toLowerCase(), account_name.trim(), account_handle || '', '', tokens || {});
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/api/accounts/:id', (req, res) => {
  try {
    db.deleteAccount(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
