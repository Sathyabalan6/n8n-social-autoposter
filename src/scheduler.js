/**
 * Enterprise Background Queue Scheduler & Worker Daemon
 * Features atomic worker lease locking, exponential backoff with jitter,
 * dead-letter protection, circuit breaker integration, and automated media GC.
 */

const fs = require('node:fs');
const db = require('./db');
const { dispatchPost, syncPostMetrics } = require('./platforms');
const { circuitBreaker } = require('./queue/circuit-breaker');
const logger = require('./logger');

const workerId = `worker-${process.pid}-${Math.round(Math.random() * 1e6)}`;
const MAX_ATTEMPTS = 5;
let timerId = null;
let isShuttingDown = false;
let activeJobCount = 0;
let gcCounter = 0;
let metricsCounter = 0;

async function checkAndProcessDuePosts() {
  if (isShuttingDown) return;

  try {
    let job = db.claimNextJob(workerId, 300000); // 5-minute atomic lease lock

    while (job && !isShuttingDown) {
      activeJobCount += 1;
      const platforms = Array.isArray(job.platforms) ? job.platforms : [];

      // Check Circuit Breakers: if all platforms are currently open, postpone job
      const allCircuitsOpen = platforms.length > 0 && platforms.every((p) => circuitBreaker.isOpen(String(p).toLowerCase()));
      if (allCircuitsOpen) {
        logger.warn(
          { jobId: job.id, platforms },
          '[Scheduler] Target platform circuits OPEN. Postponing job execution.'
        );
        // Postpone 2 minutes into the future
        const postponeTime = new Date(Date.now() + 120000).toISOString();
        db.updatePostSchedule(job.id, postponeTime, 'scheduled');
        activeJobCount -= 1;
        job = db.claimNextJob(workerId, 300000);
        continue;
      }

      logger.info(
        { workerId, jobId: job.id, attempt: job.attempts, platforms },
        '[Scheduler] Atomically claimed and executing job'
      );

      try {
        const { results, finalStatus, errorSummary } = await dispatchPost(job);

        // Record Circuit Breaker telemetry (normalized lowercase keys)
        for (const p of platforms) {
          const key = String(p).toLowerCase();
          const res = results[key] || results[p];
          if (res && res.success) {
            circuitBreaker.recordSuccess(key);
          } else if (res && !res.success) {
            circuitBreaker.recordFailure(key, new Error(res.error || 'Dispatch failed'));
          }
        }

        if (finalStatus === 'failed' && job.attempts < MAX_ATTEMPTS) {
          // Exponential backoff with jitter: 2^attempts * 60s + jitter
          const baseDelay = Math.min(3600000, 60000 * Math.pow(2, job.attempts));
          const jitter = Math.floor(Math.random() * 15000);
          const nextRetry = new Date(Date.now() + baseDelay + jitter).toISOString();

          logger.warn(
            { jobId: job.id, attempt: job.attempts, nextRetry, errorSummary },
            '[Scheduler] Job failed, scheduling retry with exponential backoff'
          );
          db.updatePostSchedule(job.id, nextRetry, 'scheduled');
        } else {
          // Mark final status (completed or dead-letter failed)
          db.updatePostStatus(job.id, finalStatus, results, errorSummary);
          logger.info(
            { jobId: job.id, finalStatus },
            '[Scheduler] Job resolved successfully or reached max attempts'
          );
        }
      } catch (err) {
        logger.error({ jobId: job.id, err: err.message }, '[Scheduler] Unhandled job dispatch exception');
        if (job.attempts >= MAX_ATTEMPTS) {
          db.updatePostStatus(job.id, 'failed', {}, `Dead-letter: exceeded ${MAX_ATTEMPTS} attempts: ${err.message}`);
        }
      } finally {
        activeJobCount -= 1;
      }

      // Claim next job in the queue
      job = db.claimNextJob(workerId, 300000);
    }
  } catch (err) {
    logger.error({ err: err.message }, '[Scheduler] Queue loop processing error');
  }

  // Periodic Maintenance
  gcCounter += 1;
  if (gcCounter >= 10) {
    gcCounter = 0;
    cleanupOldMedia();
    db.cleanExpiredIdempotencyKeys();
  }

  metricsCounter += 1;
  if (metricsCounter >= 15) {
    metricsCounter = 0;
    syncDuePostMetrics();
  }
}

/**
 * Syncs T24H metrics for completed posts older than 24 hours
 */
async function syncDuePostMetrics() {
  try {
    const duePosts = db.getPostsDueForMetricsSync();
    for (const post of duePosts) {
      await syncPostMetrics(post, 'T24H');
    }
  } catch (err) {
    logger.error({ err: err.message }, '[Analytics Poller] Background sync error');
  }
}

/**
 * Purges media files for posts completed > 24 hours ago to prevent disk exhaustion
 */
function cleanupOldMedia() {
  try {
    const posts = db.getAllPosts();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const post of posts) {
      if (post.status === 'completed' && post.updated_at) {
        const updateTime = new Date(post.updated_at).getTime();
        if (updateTime < oneDayAgo) {
          // Remove master media
          if (post.media_path && fs.existsSync(post.media_path)) {
            try {
              fs.unlinkSync(post.media_path);
              logger.debug({ postId: post.id }, '[GC] Cleaned up master media file');
            } catch {
              // ignore deletion err
            }
          }
          // Remove custom overrides
          const overrides = post.media_overrides || {};
          for (const key of Object.keys(overrides)) {
            const p = overrides[key]?.path;
            if (p && fs.existsSync(p)) {
              try {
                fs.unlinkSync(p);
                logger.debug({ postId: post.id, platform: key }, '[GC] Cleaned up override media file');
              } catch {
                // ignore deletion err
              }
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, '[GC] Garbage collection error');
  }
}

function startScheduler(intervalMs = 60000) {
  if (timerId) clearInterval(timerId);
  logger.info({ intervalSec: intervalMs / 1000 }, '[Scheduler] Started background worker daemon');

  // Initial check on startup
  checkAndProcessDuePosts();

  // Periodic interval
  timerId = setInterval(checkAndProcessDuePosts, intervalMs);
}

async function stopScheduler(gracePeriodMs = 5000) {
  logger.info('[Scheduler] Stopping scheduler, awaiting active jobs...');
  isShuttingDown = true;
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }

  const start = Date.now();
  while (activeJobCount > 0 && Date.now() - start < gracePeriodMs) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  logger.info('[Scheduler] Scheduler stopped cleanly.');
}

module.exports = {
  startScheduler,
  stopScheduler,
  checkAndProcessDuePosts,
  cleanupOldMedia
};
