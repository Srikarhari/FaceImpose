(function () {
  'use strict';

  var db = null;
  var archiveDescriptors = []; // { filename, url, descriptor }
  var statusEl = document.getElementById('status');
  var captureBtn = document.getElementById('capture-btn');
  var webcamEl = document.getElementById('webcam');
  var canvasEl = document.getElementById('capture-canvas');
  var matchPanel = document.getElementById('match-panel');
  var matchImg = document.getElementById('match-img');
  var similaritySection = document.getElementById('similarity-section');
  var similarityFill = document.getElementById('similarity-fill');
  var similarityPct = document.getElementById('similarity-pct');
  var matchFilename = document.getElementById('match-filename');

  // ── Status helpers ──

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = 'status' + (isError ? ' error' : '');
  }

  // ── IndexedDB cache ──

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('faceimpose-cache', 1);
      req.onupgradeneeded = function (e) {
        var store = e.target.result;
        if (!store.objectStoreNames.contains('descriptors')) {
          store.createObjectStore('descriptors', { keyPath: 'cacheKey' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function getFromCache(cacheKey) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('descriptors', 'readonly');
      var req = tx.objectStore('descriptors').get(cacheKey);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function putInCache(entry) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('descriptors', 'readwrite');
      var req = tx.objectStore('descriptors').put(entry);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  }

  // ── Face detection helpers ──

  var detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });

  function getLargestFace(detections) {
    if (!detections || detections.length === 0) return null;
    var largest = detections[0];
    var maxArea = 0;
    for (var i = 0; i < detections.length; i++) {
      var box = detections[i].detection.box;
      var area = box.width * box.height;
      if (area > maxArea) {
        maxArea = area;
        largest = detections[i];
      }
    }
    return largest;
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Failed to load: ' + url)); };
      img.src = url;
    });
  }

  // ── Similarity ──

  function euclideanDistance(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i++) {
      var diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  function computeSimilarity(desc1, desc2) {
    var distance = euclideanDistance(desc1, desc2);
    var maxDistance = 0.8;
    var clamped = Math.min(distance, maxDistance);
    var similarity = (1 - clamped / maxDistance) * 100;
    return Math.max(0, Math.min(100, similarity));
  }

  // ── Similarity color ──

  function similarityColor(pct) {
    if (pct >= 70) return '#22c55e';
    if (pct >= 40) return '#eab308';
    return '#ef4444';
  }

  // ── Archive processing ──

  async function processArchive() {
    setStatus('Fetching archive list...');
    var res = await fetch('/api/archive');
    var images = await res.json();

    if (images.length === 0) {
      setStatus('No images found in archive. Add face images to the archive/ folder and refresh.');
      return;
    }

    archiveDescriptors = [];
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      setStatus('Processing archive: ' + (i + 1) + '/' + images.length + ' — ' + img.filename);

      // Check cache
      var cached = await getFromCache(img.cacheKey);
      if (cached) {
        if (!cached.noFace && cached.descriptor) {
          archiveDescriptors.push({
            filename: img.filename,
            url: img.url,
            descriptor: new Float32Array(cached.descriptor)
          });
        }
        continue;
      }

      // Cache miss — detect face
      try {
        var imgEl = await loadImage(img.url);
        var detections = await faceapi
          .detectAllFaces(imgEl, detectorOptions)
          .withFaceLandmarks()
          .withFaceDescriptors();

        var face = getLargestFace(detections);
        if (face) {
          var descArray = Array.from(face.descriptor);
          await putInCache({
            cacheKey: img.cacheKey,
            filename: img.filename,
            url: img.url,
            descriptor: descArray,
            noFace: false
          });
          archiveDescriptors.push({
            filename: img.filename,
            url: img.url,
            descriptor: face.descriptor
          });
        } else {
          // Negative cache
          await putInCache({
            cacheKey: img.cacheKey,
            filename: img.filename,
            url: img.url,
            descriptor: null,
            noFace: true
          });
        }
      } catch (err) {
        console.warn('Skipping ' + img.filename + ':', err.message);
      }
    }

    var faceCount = archiveDescriptors.length;
    setStatus('Ready — ' + faceCount + ' face(s) loaded from ' + images.length + ' archive image(s).');
    captureBtn.disabled = false;
  }

  // ── Capture & Match ──

  async function captureAndMatch() {
    captureBtn.disabled = true;
    setStatus('Capturing...');

    // Draw current video frame to canvas
    canvasEl.width = webcamEl.videoWidth;
    canvasEl.height = webcamEl.videoHeight;
    var ctx = canvasEl.getContext('2d');
    ctx.drawImage(webcamEl, 0, 0);

    // Detect face
    var detections = await faceapi
      .detectAllFaces(canvasEl, detectorOptions)
      .withFaceLandmarks()
      .withFaceDescriptors();

    var face = getLargestFace(detections);
    if (!face) {
      setStatus('No face detected. Try again with better lighting or position.', true);
      captureBtn.disabled = false;
      return;
    }

    setStatus('Matching...');
    var webcamDesc = face.descriptor;

    // Compute similarities
    var matches = [];
    for (var i = 0; i < archiveDescriptors.length; i++) {
      var a = archiveDescriptors[i];
      matches.push({
        filename: a.filename,
        url: a.url,
        similarity: computeSimilarity(webcamDesc, a.descriptor)
      });
    }

    // Sort descending, take top 1
    matches.sort(function (a, b) { return b.similarity - a.similarity; });
    var best = matches[0];

    displayResult(best);
    setStatus('Top match: ' + best.filename + ' (' + best.similarity.toFixed(1) + '%)');
    captureBtn.disabled = false;
  }

  // ── Display result ──

  function displayResult(match) {
    var pct = match.similarity.toFixed(1);
    var color = similarityColor(match.similarity);

    matchImg.src = match.url;
    matchImg.alt = match.filename;
    matchPanel.style.visibility = 'visible';

    matchFilename.textContent = match.filename;
    similarityPct.textContent = pct + '%';
    similarityPct.style.color = color;
    similarityFill.style.width = pct + '%';
    similarityFill.style.background = color;
    similaritySection.style.display = 'block';
  }

  // ── Init ──

  async function init() {
    try {
      // Load face-api.js models
      setStatus('Loading face detection models...');
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models')
      ]);

      // Start webcam
      setStatus('Starting webcam...');
      var stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      webcamEl.srcObject = stream;

      // Open IndexedDB
      db = await openDB();

      // Process archive
      await processArchive();
    } catch (err) {
      setStatus('Error: ' + err.message, true);
      console.error(err);
    }
  }

  // ── Event listeners ──

  captureBtn.addEventListener('click', captureAndMatch);
  init();
})();
