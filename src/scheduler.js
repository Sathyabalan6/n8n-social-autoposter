/**
 * Background Scheduler
 * Checks the SQLite database every minute for posts where status = 'scheduled' and scheduled_at <= now()
 * Runs inside the Node.js process without any external cron daemon or Redis!
 */

const db = require('./db');
const { dispatchPost } = require('./platforms');

let isRunning = false;
let timerId = null;

async function checkAndProcessDuePosts() {
  if (isRunning) return; // Prevent concurrent overlap
  isRunning = true;

  try {
    const duePosts = db.getDuePosts();
    if (duePosts.length > 0) {
      console.log(`[Scheduler] Found ${duePosts.length} due post(s) to process.`);
    }

    for (const post of duePosts) {
      console.log(`[Scheduler] Processing Post #${post.id} scheduled for ${post.scheduled_at}...`);
      db.updatePostStatus(post.id, 'processing');

      const { results, hasErrors, errorSummary } = await dispatchPost(post);
      const finalStatus = hasErrors ? 'failed' : 'completed';

      db.updatePostStatus(post.id, finalStatus, results, errorSummary);
      console.log(`[Scheduler] Post #${post.id} finished with status: ${finalStatus}`);
    }
  } catch (err) {
    console.error('[Scheduler] Error checking due posts:', err);
  } finally {
    isRunning = false;
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
