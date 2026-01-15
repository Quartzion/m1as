export const m1asConfig = {
  maxFileSizeBytes: Number(process.env.M1AS_MAX_FILE_SIZE_BYTES) || 10 * 1024 * 1024, // 10 MB
  allowedMimeTypes: (process.env.M1AS_ALLOWED_MIME_TYPES
    ? process.env.M1AS_ALLOWED_MIME_TYPES.split(",")
    : ["image/png", "image/jpeg", "image/webp"]) // default allowlist 
};

