require('dotenv').config();
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('./logger');
const { startScheduler, stopScheduler } = require('./scheduler');
const { authenticate } = require('./middleware/auth');
const { validateHostAndOrigin } = require('./middleware/security');
const { uploadDir } = require('./middleware/upload');
const { verifySignedLocalMediaUrl } = require('./media/storage');
const { isPostgresConfigured, runPostgresMigrations } = require('./db/postgres');

// Modular Route Handlers
const systemRoutes = require('./routes/system');
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const postRoutes = require('./routes/posts');
const mediaRoutes = require('./routes/media');
const inboxRoutes = require('./routes/inbox');
const queueRuleRoutes = require('./routes/queueRules');
const reviewRoutes = require('./routes/review');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Security Headers via Helmet (with CSP policy allowlisting fonts, media blobs, and dashboard scripts)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        mediaSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: ["'self'", "https://graph.threads.net", "https://graph.facebook.com", "https://api.twitter.com", "https://upload.twitter.com", "https://api.linkedin.com", "https://www.googleapis.com", "https://*.trycloudflare.com"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// 2. Global Rate Limiter: 300 requests per minute
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests from this IP, please try again shortly' }
});
app.use(globalLimiter);

// 3. Request Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Host Header & DNS Rebinding Security Guard
app.use(validateHostAndOrigin);

// 5. Global Authentication Token / API Key Extractor
app.use(authenticate);

// 6. Static Dashboard & Uploads Serving (Protected by Auth or HMAC Signature)
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', (req, res, next) => {
  const filename = path.basename(req.path);
  const { sig, exp } = req.query;
  const isAuthenticated = Boolean(req.user);
  const isValidSignature = verifySignedLocalMediaUrl(filename, sig, exp);

  if (isAuthenticated || isValidSignature) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'Forbidden: Access to client media requires active authentication or a valid signed URL.'
  });
}, express.static(uploadDir));

// 7. Mount All Route Modules
app.use(systemRoutes);
app.use(authRoutes);
app.use(clientRoutes);
app.use(postRoutes);
app.use(mediaRoutes);
app.use(inboxRoutes);
app.use(queueRuleRoutes);
app.use(reviewRoutes);

// 8. Run PostgreSQL migrations if configured in environment
if (isPostgresConfigured()) {
  runPostgresMigrations().catch((err) => {
    logger.error({ err: err.message }, 'Failed to apply PostgreSQL migrations on boot');
  });
}

let server = null;

// 9. Startup & Scheduler (when run directly)
if (require.main === module) {
  // Production Security Sanity Check: Refuse default credentials
  if (process.env.NODE_ENV === 'production') {
    const adminPass = process.env.ADMIN_PASSWORD || '';
    if (!adminPass || adminPass === 'SocialPulseAdmin2026!' || adminPass === 'ChangeMeOnFirstBoot2026!') {
      logger.error('[Security Fatal] In production (NODE_ENV=production), ADMIN_PASSWORD cannot be left as the default placeholder. Server refused to boot.');
      process.exit(1);
    }
    const encSecret = process.env.ENCRYPTION_SECRET || '';
    if (!encSecret || encSecret.length < 32 || encSecret.includes('your_super_secret')) {
      logger.error('[Security Fatal] In production, ENCRYPTION_SECRET must be at least 32 characters and cannot be a placeholder. Server refused to boot.');
      process.exit(1);
    }
  }

  startScheduler(60000);

  const HOST = process.env.HOST || '127.0.0.1';
  server = app.listen(PORT, HOST, () => {
    logger.info(`=======================================================`);
    logger.info(`🚀 SocialPulse running at:`);
    logger.info(`👉 http://${HOST}:${PORT}`);
    logger.info(`=======================================================`);
  });
}

// 10. Graceful Shutdown Signal Handling
async function handleShutdown(signal) {
  logger.info({ signal }, 'Received termination signal, initiating graceful shutdown...');
  await stopScheduler(5000);
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed. Exiting process.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = { app, server };
