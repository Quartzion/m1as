import crypto from "crypto";

const DEFAULT_MAX_LENGTH = 128;
const SAFE_FILENAME_REGEX = /[^a-zA-Z0-9._-]/g;
const CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/g;
const PATH_SEPARATORS_REGEX = /[\\/]/;

function generateFallbackName(ext = ".bin") {
  return `file_${crypto.randomUUID()}${ext}`;
}

export function normalizeFilename(
  input: string | undefined | null,
  options: {
    maxLength?: number;
    fallbackExtension?: string;
    mode?: "strict" | "sanitize";
  } = {}
) {
  const original = input ?? "";
  const {
    maxLength = DEFAULT_MAX_LENGTH,
    fallbackExtension = ".bin",
    mode = "sanitize",
  } = options;

  if (!original) {
    return {
      filename: generateFallbackName(fallbackExtension),
      original,
      sanitized: true,
      reason: "empty_filename",
    };
  }

  // Unicode normalize
  let name = original.normalize("NFKC");

  // Strip control characters
  name = name.replace(CONTROL_CHARS_REGEX, "");

  // Reject path separators early
  if (PATH_SEPARATORS_REGEX.test(name)) {
    if (mode === "strict") {
      return {
        filename: generateFallbackName(fallbackExtension),
        original,
        sanitized: true,
        reason: "path_separators_detected",
      };
    }
    name = name.replace(PATH_SEPARATORS_REGEX, "_");
  }

  // Apply allowlist
  name = name.replace(SAFE_FILENAME_REGEX, "_");

  // Collapse repeated underscores
  name = name.replace(/_+/g, "_");

  // Trim dots/underscores
  name = name.replace(/^[_\.]+|[_\.]+$/g, "");

  // Enforce length
  if (name.length > maxLength) {
    name = name.slice(0, maxLength);
  }

  if (!name) {
    return {
      filename: generateFallbackName(fallbackExtension),
      original,
      sanitized: true,
      reason: "fully_sanitized_empty",
    };
  }

  return {
    filename: name,
    original,
    sanitized: name !== original,
  };
}
