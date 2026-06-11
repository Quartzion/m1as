export type BrowserDisposition = "inline" | "attachment";

export interface BrowserContentDecision {
  disposition: BrowserDisposition;
  reason?: string;
}

const FORBIDDEN_INLINE_RENDER_MIME = new Set([
  "text/html",
  "application/xhtml+xml"
]);

export function getBrowserContentPolicy(
  mimeType: string
): BrowserContentDecision {
  if (FORBIDDEN_INLINE_RENDER_MIME.has(mimeType)) {
    return {
      disposition: "attachment",
      reason: "unsafe_renderable_mime"
    };
  }

  return {
    disposition: "inline",
    reason: "default_inline_safe"
  };

}