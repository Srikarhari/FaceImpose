(function () {
  'use strict';

  var db = null;
  var archiveData = []; // { filename, url, descriptor, landmarks, skinColor, hairColor }
  var statusEl = document.getElementById('status');
  var captureBtn = document.getElementById('capture-btn');
  var webcamEl = document.getElementById('webcam');
  var canvasEl = document.getElementById('capture-canvas');
  var matchPanel = document.getElementById('match-panel');
  var matchImg = document.getElementById('match-img');
  var similaritySection = document.getElementById('similarity-section');
  var matchFilename = document.getElementById('match-filename');
  var gaugesGrid = document.getElementById('gauges-grid');

  var FEATURE_LABELS = [
    'Overall', 'Eyes', 'Eyebrows', 'Jawline',
    'Lips', 'Cheekbones', 'Skin Tone', 'Hair'
  ];

  // ── Status helpers ──

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = 'status' + (isError ? ' error' : '');
  }

  // ── IndexedDB cache ──

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('faceimpose-cache', 2);
      req.onupgradeneeded = function (e) {
        var store = e.target.result;
        if (store.objectStoreNames.contains('descriptors')) {
          store.deleteObjectStore('descriptors');
        }
        store.createObjectStore('descriptors', { keyPath: 'cacheKey' });
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

  // ── Similarity helpers ──

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

  function similarityColor(pct) {
    if (pct >= 70) return '#22c55e';
    if (pct >= 40) return '#eab308';
    return '#ef4444';
  }

  // ── Landmark extraction ──

  function extractLandmarkArrays(landmarks) {
    return {
      leftEye: landmarks.getLeftEye().map(function (p) { return { x: p.x, y: p.y }; }),
      rightEye: landmarks.getRightEye().map(function (p) { return { x: p.x, y: p.y }; }),
      leftEyeBrow: landmarks.getLeftEyeBrow().map(function (p) { return { x: p.x, y: p.y }; }),
      rightEyeBrow: landmarks.getRightEyeBrow().map(function (p) { return { x: p.x, y: p.y }; }),
      jaw: landmarks.getJawOutline().map(function (p) { return { x: p.x, y: p.y }; }),
      mouth: landmarks.getMouth().map(function (p) { return { x: p.x, y: p.y }; }),
      nose: landmarks.getNose().map(function (p) { return { x: p.x, y: p.y }; })
    };
  }

  // Normalize points relative to bounding box so shape is scale/position invariant
  function normalizePoints(points, box) {
    return points.map(function (p) {
      return {
        x: (p.x - box.x) / box.width,
        y: (p.y - box.y) / box.height
      };
    });
  }

  // Compare two sets of normalized points; returns 0-100 similarity
  function compareShapes(pts1, pts2, box1, box2) {
    var n1 = normalizePoints(pts1, box1);
    var n2 = normalizePoints(pts2, box2);
    var len = Math.min(n1.length, n2.length);
    var totalDist = 0;
    for (var i = 0; i < len; i++) {
      var dx = n1[i].x - n2[i].x;
      var dy = n1[i].y - n2[i].y;
      totalDist += Math.sqrt(dx * dx + dy * dy);
    }
    var avgDist = totalDist / len;
    // max expected avg distance ~0.15 for very different shapes
    var maxDist = 0.15;
    var score = (1 - Math.min(avgDist, maxDist) / maxDist) * 100;
    return Math.max(0, Math.min(100, score));
  }

  // ── Pixel sampling ──

  function sampleAvgColor(ctx, points, radius) {
    var r = 0, g = 0, b = 0, count = 0;
    for (var i = 0; i < points.length; i++) {
      var px = Math.round(points[i].x);
      var py = Math.round(points[i].y);
      for (var dy = -radius; dy <= radius; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
          var data = ctx.getImageData(px + dx, py + dy, 1, 1).data;
          r += data[0]; g += data[1]; b += data[2];
          count++;
        }
      }
    }
    return count > 0 ? [r / count, g / count, b / count] : [128, 128, 128];
  }

  function getSkinSamplePoints(landmarks) {
    // Sample from cheek areas: midpoint between eye outer corners and jaw
    var jaw = landmarks.jaw;
    var leftEye = landmarks.leftEye;
    var rightEye = landmarks.rightEye;
    var points = [];
    // Left cheek: between jaw[3] and leftEye[0]
    points.push({
      x: (jaw[3].x + leftEye[0].x) / 2,
      y: (jaw[3].y + leftEye[0].y) / 2
    });
    // Right cheek: between jaw[13] and rightEye[3]
    points.push({
      x: (jaw[13].x + rightEye[3].x) / 2,
      y: (jaw[13].y + rightEye[3].y) / 2
    });
    return points;
  }

  function getHairSamplePoints(landmarks) {
    // Sample from region above forehead (above eyebrow midpoints)
    var lb = landmarks.leftEyeBrow;
    var rb = landmarks.rightEyeBrow;
    var midBrowY = (lb[2].y + rb[2].y) / 2;
    var midBrowX = (lb[2].x + rb[2].x) / 2;
    // Go above the brow by ~30% of face height estimate
    var jawBottom = landmarks.jaw[8].y;
    var faceHeight = jawBottom - midBrowY;
    var hairY = midBrowY - faceHeight * 0.3;
    return [
      { x: midBrowX - 20, y: hairY },
      { x: midBrowX, y: hairY },
      { x: midBrowX + 20, y: hairY }
    ];
  }

  function colorSimilarity(c1, c2) {
    var dr = c1[0] - c2[0];
    var dg = c1[1] - c2[1];
    var db = c1[2] - c2[2];
    var dist = Math.sqrt(dr * dr + dg * dg + db * db);
    // max color distance ~441 (black vs white), but realistic max ~200
    var maxDist = 200;
    var score = (1 - Math.min(dist, maxDist) / maxDist) * 100;
    return Math.max(0, Math.min(100, score));
  }

  // ── Extract colors from image element ──

  function extractColors(imgEl, landmarks) {
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = imgEl.naturalWidth || imgEl.width;
    tempCanvas.height = imgEl.naturalHeight || imgEl.height;
    var ctx = tempCanvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);

    var skinPts = getSkinSamplePoints(landmarks);
    var hairPts = getHairSamplePoints(landmarks);
    var skinColor = sampleAvgColor(ctx, skinPts, 3);
    var hairColor = sampleAvgColor(ctx, hairPts, 3);
    return { skinColor: skinColor, hairColor: hairColor };
  }

  // ── Per-feature similarity ──

  function computeFeatureSimilarities(webcamFace, webcamColors, archiveEntry) {
    var wBox = webcamFace.detection.box;
    var aBox = archiveEntry.box;
    var wLm = webcamFace._landmarks;
    var aLm = archiveEntry.landmarks;

    // Cheekbone points: jaw indices 1-4 and 12-15, plus outer eye corners
    var wCheek = [aLm.jaw[1], aLm.jaw[2], aLm.jaw[3], aLm.jaw[4],
                  aLm.jaw[12], aLm.jaw[13], aLm.jaw[14], aLm.jaw[15]];
    var aCheek = [wLm.jaw[1], wLm.jaw[2], wLm.jaw[3], wLm.jaw[4],
                  wLm.jaw[12], wLm.jaw[13], wLm.jaw[14], wLm.jaw[15]];
    // Swap was intentional fix — actually let me fix the variable names:
    var wCheekPts = [wLm.jaw[1], wLm.jaw[2], wLm.jaw[3], wLm.jaw[4],
                     wLm.jaw[12], wLm.jaw[13], wLm.jaw[14], wLm.jaw[15]];
    var aCheekPts = [aLm.jaw[1], aLm.jaw[2], aLm.jaw[3], aLm.jaw[4],
                     aLm.jaw[12], aLm.jaw[13], aLm.jaw[14], aLm.jaw[15]];

    return {
      overall: computeSimilarity(webcamFace.descriptor, archiveEntry.descriptor),
      eyes: compareShapes(
        wLm.leftEye.concat(wLm.rightEye),
        aLm.leftEye.concat(aLm.rightEye),
        wBox, aBox
      ),
      eyebrows: compareShapes(
        wLm.leftEyeBrow.concat(wLm.rightEyeBrow),
        aLm.leftEyeBrow.concat(aLm.rightEyeBrow),
        wBox, aBox
      ),
      jawline: compareShapes(wLm.jaw, aLm.jaw, wBox, aBox),
      lips: compareShapes(wLm.mouth, aLm.mouth, wBox, aBox),
      cheekbones: compareShapes(wCheekPts, aCheekPts, wBox, aBox),
      skinTone: colorSimilarity(webcamColors.skinColor, archiveEntry.skinColor),
      hair: colorSimilarity(webcamColors.hairColor, archiveEntry.hairColor)
    };
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

    archiveData = [];
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      setStatus('Processing archive: ' + (i + 1) + '/' + images.length + ' — ' + img.filename);

      // Check cache
      var cached = await getFromCache(img.cacheKey);
      if (cached && cached.landmarks) {
        if (!cached.noFace && cached.descriptor) {
          archiveData.push({
            filename: img.filename,
            url: img.url,
            descriptor: new Float32Array(cached.descriptor),
            landmarks: cached.landmarks,
            box: cached.box,
            skinColor: cached.skinColor,
            hairColor: cached.hairColor
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
          var lm = extractLandmarkArrays(face.landmarks);
          var box = {
            x: face.detection.box.x,
            y: face.detection.box.y,
            width: face.detection.box.width,
            height: face.detection.box.height
          };
          var colors = extractColors(imgEl, lm);

          await putInCache({
            cacheKey: img.cacheKey,
            filename: img.filename,
            url: img.url,
            descriptor: descArray,
            landmarks: lm,
            box: box,
            skinColor: colors.skinColor,
            hairColor: colors.hairColor,
            noFace: false
          });
          archiveData.push({
            filename: img.filename,
            url: img.url,
            descriptor: face.descriptor,
            landmarks: lm,
            box: box,
            skinColor: colors.skinColor,
            hairColor: colors.hairColor
          });
        } else {
          await putInCache({
            cacheKey: img.cacheKey,
            filename: img.filename,
            url: img.url,
            descriptor: null,
            landmarks: null,
            box: null,
            skinColor: null,
            hairColor: null,
            noFace: true
          });
        }
      } catch (err) {
        console.warn('Skipping ' + img.filename + ':', err.message);
      }
    }

    var faceCount = archiveData.length;
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

    // Extract webcam face data
    var webcamLm = extractLandmarkArrays(face.landmarks);
    face._landmarks = webcamLm;
    var webcamColors = {
      skinColor: sampleAvgColor(ctx, getSkinSamplePoints(webcamLm), 3),
      hairColor: sampleAvgColor(ctx, getHairSamplePoints(webcamLm), 3)
    };

    // Find best match by overall descriptor similarity
    var bestIdx = 0;
    var bestOverall = -1;
    for (var i = 0; i < archiveData.length; i++) {
      var sim = computeSimilarity(face.descriptor, archiveData[i].descriptor);
      if (sim > bestOverall) {
        bestOverall = sim;
        bestIdx = i;
      }
    }

    var best = archiveData[bestIdx];
    var scores = computeFeatureSimilarities(face, webcamColors, best);

    displayResult(best, scores);
    setStatus('Top match: ' + best.filename + ' (' + scores.overall.toFixed(1) + '%)');

    // Save the matched image to Latest_image folder
    fetch('/api/save-latest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: best.filename })
    }).catch(function (err) {
      console.warn('Failed to save latest match image:', err.message);
    });

    captureBtn.disabled = false;
  }

  // ── Display result with radial gauges ──

  function createGaugeSVG(pct, color) {
    var radius = 36;
    var circumference = 2 * Math.PI * radius;
    var offset = circumference * (1 - pct / 100);

    return '<svg viewBox="0 0 90 90">' +
      '<circle class="gauge-bg" cx="45" cy="45" r="' + radius + '"/>' +
      '<circle class="gauge-fill" cx="45" cy="45" r="' + radius + '"' +
      ' stroke="' + color + '"' +
      ' stroke-dasharray="' + circumference + '"' +
      ' stroke-dashoffset="' + offset + '"' +
      ' transform="rotate(-90 45 45)"/>' +
      '<text class="gauge-text" x="45" y="45">' + pct.toFixed(0) + '%</text>' +
      '</svg>';
  }

  function displayResult(match, scores) {
    matchImg.src = match.url;
    matchImg.alt = match.filename;
    matchPanel.style.visibility = 'visible';

    matchFilename.textContent = match.filename;

    var scoreValues = [
      scores.overall, scores.eyes, scores.eyebrows, scores.jawline,
      scores.lips, scores.cheekbones, scores.skinTone, scores.hair
    ];

    var html = '';
    for (var i = 0; i < FEATURE_LABELS.length; i++) {
      var pct = scoreValues[i];
      var color = similarityColor(pct);
      html += '<div class="gauge">' +
        createGaugeSVG(pct, color) +
        '<div class="gauge-label">' + FEATURE_LABELS[i] + '</div>' +
        '</div>';
    }
    gaugesGrid.innerHTML = html;

    similaritySection.style.display = 'block';
  }

  // ── Init ──

  async function init() {
    try {
      setStatus('Loading face detection models...');
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models')
      ]);

      setStatus('Starting webcam...');
      var stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      webcamEl.srcObject = stream;

      db = await openDB();
      await processArchive();
    } catch (err) {
      setStatus('Error: ' + err.message, true);
      console.error(err);
    }
  }

  captureBtn.addEventListener('click', captureAndMatch);
  init();
})();
