"""Image utilities: base64 decode, format conversion, resize, preprocessing."""

import base64

import cv2
import numpy as np


class ImageDecodeError(Exception):
    pass


def decode_base64_image(data: str) -> np.ndarray:
    """Decode a base64-encoded image string to a BGR OpenCV ndarray."""
    # Strip data URI prefix if present (e.g. "data:image/jpeg;base64,...")
    if "," in data:
        data = data.split(",", 1)[1]

    try:
        raw = base64.b64decode(data)
    except Exception as exc:
        raise ImageDecodeError(f"Invalid base64 data: {exc}") from exc

    buf = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if image is None:
        raise ImageDecodeError("Could not decode image. Ensure it is a valid JPEG or PNG.")

    return image


def bgr_to_rgb(image: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def resize_for_detection(image: np.ndarray, max_dim: int = 1280) -> np.ndarray:
    """Resize image so the longest side is at most max_dim, preserving aspect ratio."""
    h, w = image.shape[:2]
    if max(h, w) <= max_dim:
        return image
    scale = max_dim / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)


def enhance_contrast(image_bgr: np.ndarray) -> np.ndarray:
    """Apply CLAHE to the luminance channel (LAB) to normalise contrast across lighting conditions.

    Applied to live captures before embedding — reduces sensitivity to harsh/flat lighting
    without discarding colour information.
    """
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = cv2.merge([clahe.apply(l_ch), a_ch, b_ch])
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
