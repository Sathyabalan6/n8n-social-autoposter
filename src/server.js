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

// 1. Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: false,
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

// 6. Static Dashboard & Uploads Serving
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(uploadDir));

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
