export const IDLE_TITLE = "ARCHIVAL TWIN";
export const IDLE_SUBTITLE = "Face the camera. Press the button. The archive will respond.";
export const PROCESSING_TEXT = "The system is reading your face.";
export const NO_MATCH_TITLE = "NO ARCHIVAL RECORD";
export const ERROR_MESSAGES: Record<string, string> = {
  no_face_detected: "No face detected. Please face the camera directly.",
  multiple_faces: "Multiple faces detected. One subject at a time.",
  low_confidence: "Insufficient clarity. Step closer to the camera.",
  engine_unavailable: "The classification engine is offline. Notify the operator.",
  archive_empty: "The archive contains no records.",
  network_error: "Connection to the system lost. Stand by.",
  invalid_image: "The submitted image could not be read.",
};
