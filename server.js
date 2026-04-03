const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(__dirname, 'archive');
const MODELS_DIR = path.join(__dirname, 'models');
const LATEST_IMAGE_DIR = path.join(__dirname, 'Latest_image');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

// Startup validation
if (!fs.existsSync(MODELS_DIR) || !fs.readdirSync(MODELS_DIR).some(f => f.endsWith('_manifest.json'))) {
  console.error('ERROR: Model weights not found in ./models/');
  console.error('Run: npm run download-models');
  process.exit(1);
}

// Ensure archive directory exists
if (!fs.existsSync(ARCHIVE_DIR)) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

// Ensure Latest_image directory exists
if (!fs.existsSync(LATEST_IMAGE_DIR)) {
  fs.mkdirSync(LATEST_IMAGE_DIR, { recursive: true });
}

app.use(express.json());

// Static routes
app.use(express.static(path.join(__dirname, 'public')));
app.use('/models', express.static(MODELS_DIR));
app.use('/archive-images', express.static(ARCHIVE_DIR));
app.get('/face-api.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', 'face-api.js', 'dist', 'face-api.min.js'));
});

// API: list archive images with metadata
app.get('/api/archive', (req, res) => {
  let files;
  try {
    files = fs.readdirSync(ARCHIVE_DIR);
  } catch (err) {
    return res.json([]);
  }

  const images = [];
  for (const filename of files) {
    const ext = path.extname(filename).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;

    try {
      const stat = fs.statSync(path.join(ARCHIVE_DIR, filename));
      images.push({
        filename,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        url: '/archive-images/' + encodeURIComponent(filename),
        cacheKey: filename + '_' + stat.size + '_' + Math.floor(stat.mtimeMs)
      });
    } catch (err) {
      // skip files we can't stat
    }
  }

  res.json(images);
});

// API: save latest matched image
app.post('/api/save-latest', (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: 'Missing filename' });
  }

  // Prevent path traversal
  const safeName = path.basename(filename);
  const srcPath = path.join(ARCHIVE_DIR, safeName);
  const destPath = path.join(LATEST_IMAGE_DIR, 'latest_match.jpg');

  if (!fs.existsSync(srcPath)) {
    return res.status(404).json({ error: 'Source image not found' });
  }

  try {
    fs.copyFileSync(srcPath, destPath);
    res.json({ ok: true, saved: destPath });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save image' });
  }
});

app.listen(PORT, () => {
  console.log(`FaceImpose running at http://localhost:${PORT}`);
  console.log(`Archive directory: ${ARCHIVE_DIR}`);
});
