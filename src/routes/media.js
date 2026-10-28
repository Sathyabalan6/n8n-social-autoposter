const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { inspectMedia, transcodeToVerticalInWorker, extractThumbnail } = require('../media/transcoder');
const { isCloudStorageConfigured, generatePresignedUploadUrl } = require('../media/storage');
const { upload, uploadDir } = require('../middleware/upload');

const router = express.Router();

router.get('/api/media/storage-status', (_req, res) => {
  res.json({ success: true, configured: isCloudStorageConfigured() });
});

router.post('/api/media/presign-upload', async (req, res) => {
  try {
    if (!isCloudStorageConfigured()) {
      return res.status(400).json({ success: false, error: 'Cloud storage is not configured in .env' });
    }
    const { filename, mimetype, tenantId } = req.body;
    if (!filename) return res.status(400).json({ success: false, error: 'filename is required' });
    const { uploadUrl, objectKey } = await generatePresignedUploadUrl(filename, mimetype, tenantId || 'default');
    res.json({ success: true, uploadUrl, objectKey });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/media/inspect', upload.single('media'), async (req, res) => {
  try {
    let filePath = req.file?.path;
    if (!filePath && req.body.filename) {
      filePath = path.join(uploadDir, path.basename(req.body.filename));
    }
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ success: false, error: 'No media file provided or file does not exist.' });
    }

    const info = await inspectMedia(filePath);
    res.json({ success: true, info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/media/transcode/vertical', upload.single('media'), async (req, res) => {
  try {
    let inputPath = req.file?.path;
    let originalName = req.file?.originalname || req.body.filename || 'video.mp4';

    if (!inputPath && req.body.filename) {
      inputPath = path.join(uploadDir, path.basename(req.body.filename));
    }

    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(400).json({ success: false, error: 'No media file provided or file not found.' });
    }

    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const outFilename = `vertical-${Date.now()}-${baseName}.mp4`;
    const outputPath = path.join(uploadDir, outFilename);

    await transcodeToVerticalInWorker(inputPath, outputPath);
    const info = await inspectMedia(outputPath);

    res.json({
      success: true,
      filename: outFilename,
      path: outputPath,
      url: `/uploads/${outFilename}`,
      info
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/api/media/thumbnail', async (req, res) => {
  try {
    const { filename, timestamp } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, error: 'filename is required' });
    }

    const inputPath = path.join(uploadDir, path.basename(filename));
    if (!fs.existsSync(inputPath)) {
      return res.status(404).json({ success: false, error: 'Input file not found' });
    }

    const thumbFilename = `thumb-${Date.now()}.jpg`;
    const outputPath = path.join(uploadDir, thumbFilename);

    await extractThumbnail(inputPath, outputPath, timestamp || '00:00:01');

    res.json({
      success: true,
      filename: thumbFilename,
      path: outputPath,
      url: `/uploads/${thumbFilename}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
