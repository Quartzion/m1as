export const m1asConfig = {
  maxFileSizeBytes:
    Number(process.env.M1AS_MAX_FILE_SIZE_BYTES) || 10 * 1024 * 1024,
};