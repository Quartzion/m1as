export const m1asConfig = {
  maxFileSizeBytes: Number(process.env.M1AS_MAX_FILE_SIZE_BYTES) ?? 10 * 1024 * 1024, // 10 MB
  allowedMimeTypes: (process.env.M1AS_ALLOWED_MIME_TYPES
    ? process.env.M1AS_ALLOWED_MIME_TYPES.split(",")
    : ["image/png", "image/jpeg", "image/webp"]), // default allowlist 
  maxJsonUploadBytes: Number(process.env.M1AS_MAX_JSON_UPLOAD_BYTES) ?? 2 * 1024 * 1024, // 2 MB
  multipartAllowedFields: ["visibility"],
  logger: process.env.M1AS_LOGGER ?? "console",
  logFile: process.env.M1AS_LOG_FILE ?? "./logs/m1as.log",
  logLevel: process.env.M1AS_LOG_LEVEL ?? "error",
  m1asServerPort: Number(process.env.M1AS_SERVER_PORT ?? 3000),
  rateLimit: {
    windowMs: Number(process.env.M1AS_RL_LOCKOUT_TIME) ?? 1_200_000, // default 20 min
    uploadMax: Number(process.env.M1AS_RL_UPLOAD_MAX) ?? 10, // default 10 uploads
    readMax: Number(process.env.M1AS_RL_READ_MAX) ?? 60, // default 60 reads
    deleteMax: Number(process.env.M1AS_RL_DELETE_MAX) ?? 10, // default 10 delets
    enabled: process.env.M1AS_RATE_LIMIT !== "off" // default to on. to turn off explicitly set to M1AS_RATE_LIMIT=off
  }
};

