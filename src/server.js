require('dotenv').config();
const path = require('node:path');
const express = require('express');

const { apiKeyAuth } = require('./middleware/auth');
const { startScheduler } = require('./scheduler');

// Route modules
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const postRoutes = require('./routes/posts');
const mediaRoutes = require('./routes/media');
const inboxRoutes = require('./routes/inbox');
const queueRuleRoutes = require('./routes/queueRules');
const reviewRoutes = require('./routes/review');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// Request body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function safeGetUrlHost(urlStr) {
  if (!urlStr) return null;
  try {
    return new URL(urlStr).host;
  } catch {
    return null;
  }
}

function safeGetUrlOrigin(urlStr) {
  if (!urlStr) return null;
  try {
    return new URL(urlStr).origin;
  } catch {
    return null;
  }
}

// Security Middleware: Prevent DNS rebinding and cross-site request attacks
app.use((req, res, next) => {
  const host = req.headers.host || '';
  const origin = req.headers.origin;

  // Allow localhost / 127.0.0.1 or configured BASE_URL host
  const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const configuredHost = safeGetUrlHost(process.env.BASE_URL);

  if (!isLocalHost && configuredHost && host !== configuredHost) {
    return res.status(403).json({ success: false, error: 'Forbidden: Invalid Host Header' });
  }

  if (origin) {
    try {
      const originUrl = new URL(origin);
      const isLocalOrigin = originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
      const configuredOrigin = safeGetUrlOrigin(process.env.BASE_URL);
      if (!isLocalOrigin && configuredOrigin && origin !== configuredOrigin) {
        return res.status(403).json({ success: false, error: 'Forbidden: Cross-Origin Request Blocked' });
      }
    } catch {
      return res.status(403).json({ success: false, error: 'Forbidden: Malformed Origin Header' });
    }
  }

  next();
});

// Authentication Guard (Active when API_KEY is configured in .env)
app.use(apiKeyAuth);

// Static Dashboard Assets
app.use(express.static(path.join(__dirname, '..', 'public')));

// Mount Modular Route Handlers
app.use(authRoutes);
app.use(clientRoutes);
app.use(postRoutes);
app.use(mediaRoutes);
app.use(inboxRoutes);
app.use(queueRuleRoutes);
app.use(reviewRoutes);

// Start background scheduler & HTTP server
startScheduler(60000);

app.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 SocialPulse Studio running at:`);
  console.log(`👉 http://${HOST}:${PORT}`);
  console.log(`=======================================================`);
});
