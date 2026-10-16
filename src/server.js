require('dotenv').config();
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');

const db = require('./db');
const { compilePost } = require('./compiler');
const { dispatchPost } = require('./platforms');
const { getAuthUrl, handleAuthCallback, getStoredTokens } = require('./platforms/youtube');
const { startScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup uploads folder inside public
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max
});
const uploadFields = upload.fields([
  { name: 'media', maxCount: 1 },
  { name: 'media_youtube', maxCount: 1 },
  { name: 'media_x', maxCount: 1 },
  { name: 'media_linkedin', maxCount: 1 },
  { name: 'media_instagram', maxCount: 1 },
  { name: 'media_threads', maxCount: 1 },
  { name: 'media_facebook', maxCount: 1 }
]);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- API ROUTES ---

// 1. Health check & status
app.get('/api/status', (_req, res) => {
  const ytTokens = getStoredTokens();
  res.json({
    status: 'ok',
    version: '1.0.0',
    platforms: {
      youtube: {
        configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        connected: Boolean(ytTokens?.refresh_token || ytTokens?.access_token)
      },
      x: { configured: Boolean(process.env.X_API_KEY) },
      linkedin: { configured: Boolean(process.env.LINKEDIN_ACCESS_TOKEN) },
      instagram: { configured: Boolean(process.env.META_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID) },
      threads: { configured: Boolean(process.env.THREADS_ACCESS_TOKEN) },
      facebook: { configured: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID) }
    }
  });
});

// 2. Live Validation & Preview compiler
app.post('/api/compile', (req, res) => {
  try {
    const compiled = compilePost(req.body);
    res.json({ success: true, compiled });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 3. Create / Submit Post (Immediate or Scheduled)
app.post('/api/posts', uploadFields, async (req, res) => {
  try {
    const body = req.body;
    let platforms = [];
    if (typeof body.platforms === 'string') {
      try {
        platforms = JSON.parse(body.platforms);
      } catch {
        platforms = [body.platforms];
      }
    } else if (Array.isArray(body.platforms)) {
      platforms = body.platforms;
    }

    const compiled = compilePost({
      ...body,
      platforms
    });

    let mediaPath = '';
    let mediaFilename = '';
    let mediaMimetype = '';

    const files = req.files || {};
    if (files.media && files.media[0]) {
      mediaPath = files.media[0].path;
      mediaFilename = files.media[0].originalname;
      mediaMimetype = files.media[0].mimetype;
    }

    // Process per-platform media overrides
    const mediaOverrides = {};
    const platformKeys = ['youtube', 'x', 'linkedin', 'instagram', 'threads', 'facebook'];
    for (const key of platformKeys) {
      const fieldKey = `media_${key}`;
      if (files[fieldKey] && files[fieldKey][0]) {
        mediaOverrides[key] = {
          path: files[fieldKey][0].path,
          filename: files[fieldKey][0].originalname,
          mimetype: files[fieldKey][0].mimetype
        };
      }
    }

    const postRecord = {
      ...compiled,
      media_path: mediaPath,
      media_filename: mediaFilename,
      media_mimetype: mediaMimetype,
      media_overrides: mediaOverrides
    };

    // If immediate, dispatch right away!
    if (!compiled.is_scheduled) {
      const { results, finalStatus, errorSummary } = await dispatchPost(postRecord);
      postRecord.status = finalStatus;
      postRecord.results = results;
      postRecord.error_summary = errorSummary;
    } else {
      postRecord.status = 'scheduled';
    }

    const id = db.insertPost(postRecord);

    res.json({
      success: true,
      postId: id,
      post: {
        id,
        ...postRecord
      }
    });
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. List all posts (Queue & History)
app.get('/api/posts', (_req, res) => {
  try {
    const posts = db.getAllPosts();
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Delete post
app.delete('/api/posts/:id', (req, res) => {
  try {
    db.deletePost(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- GOOGLE OAUTH ROUTES ---
app.get('/auth/youtube', (_req, res) => {
  try {
    const url = getAuthUrl();
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== 'https://accounts.google.com') {
      throw new Error('Untrusted redirect target');
    }
    res.writeHead(302, { Location: parsedUrl.href });
    res.end();
  } catch (err) {
    res.status(500).send(`Error starting YouTube OAuth: ${err.message}`);
  }
});

app.get('/auth/youtube/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing authorization code from Google.');
  }

  try {
    await handleAuthCallback(code);
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>YouTube Connected</title></head>
        <body style="font-family: system-ui, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #10B981;">YouTube Connected Successfully!</h1>
          <p>Your OAuth tokens have been stored. You can close this tab and return to the dashboard.</p>
          <a href="/" style="display: inline-block; padding: 10px 20px; background: #2563EB; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px;">Return to Dashboard</a>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Error completing YouTube OAuth: ${err.message}`);
  }
});

// Start background scheduler & HTTP server
startScheduler(60000);

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Social Media Auto-Poster Web App running at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
