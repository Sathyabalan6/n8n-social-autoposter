/**
 * Dedicated Background Worker Thread for CPU-Heavy FFmpeg Transcoding
 * Runs on a separate OS thread to keep Node's main event loop 100% responsive.
 * Spawns ffmpeg-static directly via execFile with safe argument arrays.
 */

const { parentPort, workerData } = require('node:worker_threads');
const { execFile } = require('node:child_process');
const ffmpegStatic = require('ffmpeg-static');

const { inputPath, outputPath, threads = 2 } = workerData || {};

if (!inputPath || !outputPath) {
  parentPort.postMessage({ type: 'error', error: 'Missing inputPath or outputPath in workerData' });
  process.exit(1);
}

const filterComplex = '[0:v]split[bg_in][fg_in];' +
  '[bg_in]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg_blurred];' +
  '[fg_in]scale=1080:1920:force_original_aspect_ratio=decrease[fg_scaled];' +
  '[bg_blurred][fg_scaled]overlay=(W-w)/2:(H-h)/2[outv]';

const args = [
  '-i', inputPath,
  '-filter_complex', filterComplex,
  '-map', '[outv]',
  '-map', '0:a?',
  '-threads', String(threads),
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-preset', 'fast',
  '-crf', '23',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-y',
  outputPath
];

execFile(ffmpegStatic, args, (err) => {
  if (err) {
    parentPort.postMessage({ type: 'error', error: err.message });
  } else {
    parentPort.postMessage({ type: 'done', outputPath });
  }
});
