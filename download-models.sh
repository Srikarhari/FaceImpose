#!/usr/bin/env bash
set -euo pipefail

MODEL_DIR="./models"
BASE_URL="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

FILES=(
  tiny_face_detector_model-weights_manifest.json
  tiny_face_detector_model-shard1
  face_landmark_68_model-weights_manifest.json
  face_landmark_68_model-shard1
  face_recognition_model-weights_manifest.json
  face_recognition_model-shard1
  face_recognition_model-shard2
)

mkdir -p "$MODEL_DIR"

for file in "${FILES[@]}"; do
  if [ -f "$MODEL_DIR/$file" ]; then
    echo "Already exists: $file"
  else
    echo "Downloading: $file"
    curl -fSL -o "$MODEL_DIR/$file" "$BASE_URL/$file"
  fi
done

echo "All models downloaded to $MODEL_DIR"
