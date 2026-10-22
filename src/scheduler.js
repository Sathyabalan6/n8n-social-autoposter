/**
 * Background Scheduler & Cleanup Daemon
 * Checks the SQLite database every minute for posts where status = 'scheduled' and scheduled_at <= now()
 * Automatically purges temporary uploads for completed posts after 24h retention window!
 */

const fs = require('node:fs');
const db = require('./db');
const { dispatchPost, syncPostMetrics } = require('./platforms');

const workerId = `worker-${process.pid}-${Math.round(Math.random() * 1e6)}`;
let timerId = null;
let gcCounter = 0;
let metricsCounter = 0;

async function checkAndProcessDuePosts() {
  try {
    let job = db.claimNextJob(workerId, 300000); // 5-minute atomic lease lock for media transfers

    while (job) {
      console.log(`[Scheduler] ${workerId} atomically claimed Job #${job.id} (Attempt ${job.attempts})`);

      const { results, finalStatus, errorSummary } = await dispatchPost(job);
      db.updatePostStatus(job.id, finalStatus, results, errorSummary);

      console.log(`[Scheduler] Job #${job.id} resolved with status: ${finalStatus}`);

      // Claim next available job in queue
      job = db.claimNextJob(workerId, 300000);
    }
  } catch (err) {
    console.error('[Scheduler] Queue processing error:', err.message);
  }

  // Run media garbage collector once every 10 cycles (~10 minutes)
  gcCounter += 1;
  if (gcCounter >= 10) {
    gcCounter = 0;
    cleanupOldMedia();
  }

  // Run analytics dual-snapshot poller every 15 cycles (~15 minutes)
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
    console.error('[Analytics Poller] Background sync error:', err.message);
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
              console.log(`[GC] Cleaned up master media file for Post #${post.id}`);
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
                console.log(`[GC] Cleaned up ${key} media file for Post #${post.id}`);
              } catch {
                // ignore deletion err
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[GC] Garbage collection error:', err.message);
  }
}

function startScheduler(intervalMs = 60000) {
  if (timerId) clearInterval(timerId);
  console.log(`[Scheduler] Started. Checking for due posts every ${intervalMs / 1000}s...`);

  // Initial check on startup
  checkAndProcessDuePosts();

  // Periodic interval
  timerId = setInterval(checkAndProcessDuePosts, intervalMs);
}

function stopScheduler() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
    console.log('[Scheduler] Stopped.');
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  checkAndProcessDuePosts,
  cleanupOldMedia
};
