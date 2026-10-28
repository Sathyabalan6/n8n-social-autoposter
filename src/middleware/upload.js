const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');

// Setup uploads folder outside public web root
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed safe extensions
const ALLOWED_MIME_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf'
]);

// Multer storage with cryptographically unguessable UUID filenames
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = crypto.randomUUID();
    cb(null, `${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed. Only video, image, or PDF files are permitted.`));
    }
  }
});

const uploadFields = upload.fields([
  { name: 'media', maxCount: 1 },
  { name: 'media_youtube', maxCount: 1 },
  { name: 'media_x', maxCount: 1 },
  { name: 'media_linkedin', maxCount: 1 },
  { name: 'media_instagram', maxCount: 1 },
  { name: 'media_threads', maxCount: 1 },
  { name: 'media_facebook', maxCount: 1 },
  { name: 'youtube_custom_thumb', maxCount: 1 },
  { name: 'linkedin_doc', maxCount: 1 }
]);

module.exports = {
  uploadDir,
  upload,
  uploadFields
};
