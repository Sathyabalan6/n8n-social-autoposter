/**
 * Media Transcoding & Video Aspect Ratio Engine
 * Uses self-contained static FFmpeg & FFprobe binaries (Zero-Docker, cross-platform)
 */

const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

// Configure static binary paths
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

/**
 * Inspects a media file and extracts video, audio, and container metadata
 */
function inspectMedia(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(new Error(`FFprobe inspection error: ${err.message}`));
      }

      const streams = metadata.streams || [];
      const videoStream = streams.find((s) => s.codec_type === 'video');
      const audioStream = streams.find((s) => s.codec_type === 'audio');

      const width = videoStream ? parseInt(videoStream.width, 10) : 0;
      const height = videoStream ? parseInt(videoStream.height, 10) : 0;
      const duration = parseFloat(metadata.format?.duration || videoStream?.duration || 0);
      const sizeBytes = parseInt(metadata.format?.size || fs.statSync(filePath).size, 10);

      const ratio = height > 0 ? (width / height) : 1;
      const isVertical = ratio < 0.85; // e.g. 9:16 is ~0.5625
      const isHorizontal = ratio > 1.25; // e.g. 16:9 is ~1.777
      const isSquare = Math.abs(ratio - 1.0) <= 0.25; // e.g. 1:1

      const warnings = [];
      if (duration > 60) {
        warnings.push('Duration exceeds 60s: Ineligible for YouTube Shorts (will upload as regular video).');
      }
      if (duration > 90) {
        warnings.push('Duration exceeds 90s: Ineligible for Instagram Reels.');
      }
      if (duration > 140) {
        warnings.push('Duration exceeds 140s: Exceeds standard X (Twitter) video length limit.');
      }
      if (isHorizontal) {
        warnings.push('Horizontal video (16:9): Recommended to convert to 9:16 vertical for Shorts & Reels.');
      }

      resolve({
        hasVideo: Boolean(videoStream),
        hasAudio: Boolean(audioStream),
        width,
        height,
        duration: Math.round(duration * 100) / 100,
        aspectRatio: `${width}:${height}`,
        ratioDecimal: Math.round(ratio * 100) / 100,
        isVertical,
        isHorizontal,
        isSquare,
        videoCodec: videoStream?.codec_name || 'unknown',
        audioCodec: audioStream?.codec_name || 'none',
        sizeBytes,
        sizeMb: Math.round((sizeBytes / (1024 * 1024)) * 100) / 100,
        warnings
      });
    });
  });
}

/**
 * Transcodes a horizontal 16:9 video to a 9:16 vertical video (1080x1920)
 * Uses blurred background padding to preserve 100% of the original content
 */
function transcodeToVertical(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    // FFmpeg complex filter:
    // [0:v] split [bg_in][fg_in]
    // [bg_in] scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5 [bg]
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
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset fast',
        '-crf 23',
        '-c:a aac',
        '-b:a 192k'
      ])
      .output(outputPath)
      .on('end', () => {
        resolve({
          success: true,
          outputPath,
          filename: path.basename(outputPath)
        });
      })
      .on('error', (err) => {
        reject(new Error(`FFmpeg vertical transcoding failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Extracts a frame from a video to use as high-resolution thumbnail / cover image
 */
function extractThumbnail(inputPath, outputPath, timestamp = '00:00:01') {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    ffmpeg(inputPath)
      .seekInput(timestamp)
      .outputOptions(['-vframes 1', '-q:v 2'])
      .output(outputPath)
      .on('end', () => {
        resolve({
          success: true,
          outputPath,
          filename: path.basename(outputPath)
        });
      })
      .on('error', (err) => {
        reject(new Error(`Thumbnail extraction failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Transcodes a video in a separate background OS worker thread.
 * Guarantees zero event loop blocking for the main Express server.
 */
function transcodeToVerticalInWorker(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    const workerPath = path.join(__dirname, 'worker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        inputPath,
        outputPath,
        threads: options.threads || 2
      }
    });

    worker.on('message', (msg) => {
      if (msg.type === 'done') {
        resolve({
          success: true,
          outputPath,
          filename: path.basename(outputPath)
        });
      } else if (msg.type === 'error') {
        reject(new Error(`Worker transcoding error: ${msg.error}`));
      }
    });

    worker.on('error', (err) => {
      reject(new Error(`Transcoder worker thread failed: ${err.message}`));
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Transcoder worker stopped with exit code ${code}`));
      }
    });
  });
}

module.exports = {
  inspectMedia,
  transcodeToVertical,
  transcodeToVerticalInWorker,
  extractThumbnail
};
