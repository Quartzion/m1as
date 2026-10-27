import { getBrowserContentPolicy } from "./BrowserContentPolicy.js";
import { BrowserCapabilities } from "./BrowserCapabilities.js";

// Immutable prefixes allowed to stream safely (e.g. video/mp4, audio/mpeg)
const SAFE_STREAM_PREFIXES = Object.freeze([
  "video/",
  "audio/"
]);

// Rigid, exact MIME types allowed to stream natively without risk of vector injection
const SAFE_STREAM_EXACT_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain"
]);

export function getBrowserCapabilities(mimeType: string): BrowserCapabilities {
  const policy = getBrowserContentPolicy(mimeType);
  const cleanMime = (mimeType || "").toLowerCase().split(";")[0].trim();

  // Evaluate streaming safety deterministically against our rigid match configurations
  const matchesPrefix = SAFE_STREAM_PREFIXES.some(prefix => cleanMime.startsWith(prefix));
  const matchesExact = SAFE_STREAM_EXACT_TYPES.includes(cleanMime);
  
  // An asset is streamable ONLY if it hits a safe media prefix or is explicitly whitelisted as a safe exact type
  const isMediaStreamable = matchesPrefix || matchesExact;

  return {
    canStream: isMediaStreamable,
    canPreview: policy.supportsPreview,
    previewMode: policy.supportsPreview ? policy.previewMode : "none",
    canDownload: policy.disposition === "attachment"
  };
}
