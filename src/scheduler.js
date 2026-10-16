/**
 * Background Scheduler
 * Checks the SQLite database every minute for posts where status = 'scheduled' and scheduled_at <= now()
 * Runs inside the Node.js process without any external cron daemon or Redis!
 */

const db = require('./db');
const { dispatchPost } = require('./platforms');

const workerId = `worker-${process.pid}-${Math.round(Math.random() * 1e6)}`;
let timerId = null;

async function checkAndProcessDuePosts() {
  try {
    let job = db.claimNextJob(workerId, 45000); // 45s atomic lease lock

    while (job) {
      console.log(`[Scheduler] ${workerId} atomically claimed Job #${job.id} (Attempt ${job.attempts})`);

      const { results, finalStatus, errorSummary } = await dispatchPost(job);
      db.updatePostStatus(job.id, finalStatus, results, errorSummary);

      console.log(`[Scheduler] Job #${job.id} resolved with status: ${finalStatus}`);

      // Claim next available job in queue
      job = db.claimNextJob(workerId, 45000);
    }
  } catch (err) {
    console.error('[Scheduler] Queue processing error:', err.message);
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
  checkAndProcessDuePosts
};
