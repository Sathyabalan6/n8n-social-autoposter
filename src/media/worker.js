/**
 * Dedicated Background Worker Thread for CPU-Heavy FFmpeg Transcoding
 * Runs on a separate OS thread to keep Node's main event loop 100% responsive.
 */

const { parentPort, workerData } = require('node:worker_threads');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegStatic);

const { inputPath, outputPath, threads = 2 } = workerData || {};

if (!inputPath || !outputPath) {
  parentPort.postMessage({ type: 'error', error: 'Missing inputPath or outputPath in workerData' });
  process.exit(1);
}

// FFmpeg complex filter:
// [0:v] split [bg_in][fg_in]
// [bg_in] scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5 [bg]
// [fg_in] scale=1080:1920:force_original_aspect_ratio=decrease [fg]
// [bg][fg] overlay=(W-w)/2:(H-h)/2 [outv]
ffmpeg(inputPath)
  .complexFilter([
    {
      filter: 'split',
      inputs: '0:v',
      outputs: ['bg_in', 'fg_in']
    },
    {
      filter: 'scale',
      options: { w: 1080, h: 1920, force_original_aspect_ratio: 'increase' },
      inputs: 'bg_in',
      outputs: 'bg_scaled'
    },
    {
      filter: 'crop',
      options: { w: 1080, h: 1920 },
      inputs: 'bg_scaled',
      outputs: 'bg_cropped'
    },
    {
      filter: 'boxblur',
      options: { luma_radius: 20, luma_power: 5 },
      inputs: 'bg_cropped',
      outputs: 'bg_blurred'
    },
    {
      filter: 'scale',
      options: { w: 1080, h: 1920, force_original_aspect_ratio: 'decrease' },
      inputs: 'fg_in',
      outputs: 'fg_scaled'
    },
    {
      filter: 'overlay',
      options: { x: '(W-w)/2', y: '(H-h)/2' },
      inputs: ['bg_blurred', 'fg_scaled'],
      outputs: 'outv'
    }
  ], 'outv')
  .outputOptions([
    `-threads ${threads}`,
    '-c:v libx264',
    '-pix_fmt yuv420p',
    '-preset fast',
    '-crf 23',
    '-c:a aac',
    '-b:a 192k'
  ])
  .output(outputPath)
  .on('progress', (progress) => {
    if (progress && progress.percent) {
      parentPort.postMessage({ type: 'progress', percent: Math.round(progress.percent) });
    }
  })
  .on('end', () => {
    parentPort.postMessage({ type: 'done', outputPath });
  })
  .on('error', (err) => {
    parentPort.postMessage({ type: 'error', error: err.message });
  })
  .run();
