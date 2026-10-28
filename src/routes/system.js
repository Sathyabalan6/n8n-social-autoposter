const express = require('express');
const db = require('../db');
const { getStoredTokens, getYouTubeDailyQuotaUsage } = require('../platforms/youtube');
const { compilePost, YOUTUBE_CATEGORIES } = require('../compiler');
const { checkPostgresHealth } = require('../db/postgres');
const { isCloudStorageConfigured } = require('../media/storage');
const { circuitBreaker } = require('../queue/circuit-breaker');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Liveness Probe: Verifies process uptime
router.get('/healthz', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Readiness Probe: Verifies core database and storage dependencies
router.get('/readyz', async (_req, res) => {
  try {
    const pgHealth = await checkPostgresHealth();
    const storageConfigured = isCloudStorageConfigured();
    const circuits = circuitBreaker.getStatus();

    res.status(200).json({
      status: 'ready',
      database: {
        sqlite: 'connected',
        postgres: pgHealth
      },
      storage: {
        cloud_s3_configured: storageConfigured
      },
      circuit_breakers: circuits,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'unready',
      error: err.message
    });
  }
});

// Comprehensive Status & Platform Topology
router.get('/api/status', (req, res) => {
  const clientId = req.query.clientId ? parseInt(req.query.clientId, 10) : null;
  const ytTokens = getStoredTokens(clientId);
  res.json({
    status: 'ok',
    version: '2.0.0',
    platforms: {
      youtube: {
        configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        connected: Boolean(ytTokens?.refresh_token || ytTokens?.access_token),
        quota_used_today: getYouTubeDailyQuotaUsage(clientId || 1),
        quota_daily_limit: 10000
      },
      x: { configured: Boolean(process.env.X_API_KEY) },
      linkedin: { configured: Boolean(process.env.LINKEDIN_ACCESS_TOKEN) },
      instagram: { configured: Boolean(process.env.META_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID) },
      threads: { configured: Boolean(process.env.THREADS_ACCESS_TOKEN) },
      facebook: { configured: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID) }
    },
    circuit_breakers: circuitBreaker.getStatus()
  });
});

// YouTube Categories Taxonomy
router.get('/api/youtube/categories', (_req, res) => {
  res.json({ success: true, categories: YOUTUBE_CATEGORIES });
});

// Live Validation & Preview compiler
router.post('/api/compile', requireAuth, (req, res) => {
  try {
    const compiled = compilePost(req.body);
    res.json({ success: true, compiled });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Prometheus Observability Metrics Probe
router.get('/metrics', (_req, res) => {
  try {
    const posts = db.getAllPosts();
    const counts = { completed: 0, scheduled: 0, draft: 0, failed: 0, partially_completed: 0 };
    posts.forEach((p) => {
      if (counts[p.status] !== undefined) counts[p.status]++;
    });

    const ytQuota = getYouTubeDailyQuotaUsage(1);
    const cbStatus = circuitBreaker.getStatus();

    let output = '';
    output += '# HELP process_uptime_seconds Process uptime in seconds\n';
    output += '# TYPE process_uptime_seconds gauge\n';
    output += `process_uptime_seconds ${process.uptime()}\n\n`;

    output += '# HELP socialpulse_posts_total Count of social media posts by status\n';
    output += '# TYPE socialpulse_posts_total gauge\n';
    Object.entries(counts).forEach(([status, val]) => {
      output += `socialpulse_posts_total{status="${status}"} ${val}\n`;
    });
    output += '\n';

    output += '# HELP socialpulse_youtube_quota_units_used Estimated daily YouTube API quota used\n';
    output += '# TYPE socialpulse_youtube_quota_units_used gauge\n';
    output += `socialpulse_youtube_quota_units_used ${ytQuota}\n\n`;

    output += '# HELP socialpulse_circuit_breaker_tripped Circuit breaker open state (1 = open, 0 = closed)\n';
    output += '# TYPE socialpulse_circuit_breaker_tripped gauge\n';
    Object.entries(cbStatus).forEach(([plat, state]) => {
      output += `socialpulse_circuit_breaker_tripped{platform="${plat}"} ${state.state === 'OPEN' ? 1 : 0}\n`;
    });

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(output);
  } catch (err) {
    res.status(500).send(`# Error generating metrics: ${err.message}\n`);
  }
});

module.exports = router;
