import { getBrowserContentPolicy } from "./BrowserContentPolicy.js";
import { BrowserCapabilities } from "./BrowserCapabilities.js";

export function getBrowserCapabilities(mimeType: string): BrowserCapabilities {
  const policy = getBrowserContentPolicy(mimeType);
  const cleanMime = (mimeType || "").toLowerCase().split(";")[0].trim();

  // 4.6 Streaming Rule: Media types natively support chunked transport layouts
  const isMediaStreamable = cleanMime.startsWith("video/") || cleanMime.startsWith("audio/");

  return {
    canStream: isMediaStreamable,
    canPreview: policy.supportsPreview,
    previewMode: policy.supportsPreview ? policy.previewMode : "none",
    // If the policy dictates a direct download execution, reflect it here natively
    canDownload: policy.disposition === "attachment"
  };
}
