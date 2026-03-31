# FaceImpose

Face similarity matching — capture your face via webcam and find the most similar faces in an archive of images.

## Setup

```bash
npm install
npm run download-models
```

## Usage

1. Add face images (`.jpg`, `.png`, etc.) to the `archive/` folder.
2. Start the server:

```bash
npm start
```

3. Open http://localhost:3000 in your browser.
4. Grant webcam permission when prompted.
5. Click **Capture & Match** to find the top 3 most similar faces from your archive.

## How it works

- Uses [face-api.js](https://github.com/justadudewhohacks/face-api.js) with TinyFaceDetector for fast face detection.
- Extracts 128-dimensional face descriptors and compares them using Euclidean distance.
- Caches face descriptors in IndexedDB so archive images are only processed once (until they change).
- If multiple faces are found in an image, the largest face is used.

## Configuration

Set `ARCHIVE_DIR` environment variable to use a custom archive path:

```bash
ARCHIVE_DIR=/path/to/faces npm start
```
