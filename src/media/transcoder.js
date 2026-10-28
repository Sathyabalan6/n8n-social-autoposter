/**
 * Media Transcoding & Video Aspect Ratio Engine
 * Uses self-contained static FFmpeg & FFprobe binaries directly via child_process
 * Zero external wrappers, safe argument arrays without shell injection risks.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

/**
 * Inspects a media file and extracts video, audio, and container metadata
 */
function inspectMedia(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ];

    execFile(ffprobeStatic.path, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        return reject(new Error(`FFprobe inspection error: ${err.message}`));
      }

      try {
        const metadata = JSON.parse(stdout);
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
      } catch (parseErr) {
        reject(new Error(`Failed to parse FFprobe output: ${parseErr.message}`));
      }
    });
  });
}

/**
 * Extracts a frame from a video to use as high-resolution thumbnail
 */
function extractThumbnail(inputPath, outputPath, timestamp = '00:00:01') {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    const args = [
      '-ss', String(timestamp),
      '-i', inputPath,
      '-vframes', '1',
      '-q:v', '2',
      '-y',
      outputPath
    ];

    execFile(ffmpegStatic, args, (err) => {
      if (err) {
        return reject(new Error(`Thumbnail extraction failed: ${err.message}`));
      }
      resolve({
        success: true,
        outputPath,
        filename: path.basename(outputPath)
      });
    });
  });
}

/**
 * Transcodes a horizontal video to a 9:16 vertical video using blurred padding
 */
function transcodeToVertical(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
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
        return reject(new Error(`FFmpeg vertical transcoding failed: ${err.message}`));
      }
      resolve({
        success: true,
        outputPath,
        filename: path.basename(outputPath)
      });
    });
  });
}

/**
 * Transcodes a video in a separate background OS worker thread.
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
