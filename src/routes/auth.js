const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const logger = require('../logger');
const { generateToken, verifyPassword, hashPassword, ROLES } = require('../auth');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { loginSchema, registerSchema } = require('../validation/schemas');
const { getAuthUrl, handleAuthCallback } = require('../platforms/youtube');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts, please try again in 15 minutes' }
});

router.post('/api/auth/login', authLimiter, validateBody(loginSchema), (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.getUserByEmail(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      logger.warn({ email, ip: req.ip }, '[Auth] Failed login attempt');
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = generateToken(user, '24h');
    db.logAudit({
      user_id: user.id,
      client_id: user.client_id,
      action: 'USER_LOGIN',
      entity_type: 'USER',
      entity_id: user.id,
      ip_address: req.ip
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        client_id: user.client_id
      }
    });
  } catch (err) {
    logger.error({ err: err.message }, '[Auth] Login error');
    res.status(500).json({ success: false, error: 'Authentication service error' });
  }
});

router.post('/api/auth/register', authLimiter, validateBody(registerSchema), (req, res) => {
  try {
    if (req.user && req.user.role !== ROLES.OWNER && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges to register accounts' });
    }

    const { email, password, name, role, client_id } = req.body;
    const existing = db.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ success: false, error: 'A user with this email already exists' });
    }

    const passwordHash = hashPassword(password);
    const newUser = db.createUser({
      email,
      password_hash: passwordHash,
      name,
      role: role || ROLES.EDITOR,
      client_id: client_id || 1
    });

    db.logAudit({
      user_id: req.user?.sub || null,
      client_id: client_id || 1,
      action: 'USER_REGISTERED',
      entity_type: 'USER',
      entity_id: newUser.id,
      metadata: { email, role: newUser.role },
      ip_address: req.ip
    });

    res.json({ success: true, user: newUser });
  } catch (err) {
    logger.error({ err: err.message }, '[Auth] Registration error');
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.getUserById(req.user.sub);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User profile not found' });
  }
  res.json({ success: true, user });
});

router.post('/api/auth/logout', requireAuth, (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const expiresAt = req.user?.exp ? req.user.exp * 1000 : Date.now() + 86400000;
    db.revokeToken(token, expiresAt);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/api/users', requireAuth, requireRole(ROLES.OWNER, ROLES.ADMIN), (req, res) => {
  try {
    const clientId = req.user.role === ROLES.OWNER && req.query.clientId
      ? parseInt(req.query.clientId, 10)
      : req.user.client_id;
    const users = db.getUsersByClient(clientId);
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/auth/youtube', (req, res) => {
  try {
    const clientId = req.query.clientId ? String(req.query.clientId) : '1';
    const url = getAuthUrl(clientId);
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== 'https://accounts.google.com') {
      throw new Error('Untrusted redirect target');
    }
    res.writeHead(302, { Location: parsedUrl.href });
    res.end();
  } catch (err) {
    res.status(500).send(`Error starting YouTube OAuth: ${err.message}`);
  }
});

router.get('/auth/youtube/callback', async (req, res) => {
  const code = req.query.code;
  const stateParam = req.query.state;
  if (!code) {
    return res.status(400).send('Missing authorization code from Google.');
  }

  try {
    await handleAuthCallback(code, stateParam);
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>YouTube Connected</title></head>
        <body style="font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc;">
          <h1 style="color: #10B981;">YouTube Connected Successfully!</h1>
          <p>Your OAuth tokens have been encrypted and linked to this client profile.</p>
          <a href="/" style="display: inline-block; padding: 12px 24px; background: #3B82F6; color: white; text-decoration: none; border-radius: 8px; margin-top: 20px; font-weight: 600;">Return to Dashboard</a>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Error completing YouTube OAuth: ${err.message}`);
  }
});

module.exports = router;
