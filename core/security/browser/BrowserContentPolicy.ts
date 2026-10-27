export type BrowserDisposition = "inline" | "attachment";
export type BrowserPreviewMode = "inline" | "sandboxed";

export interface BrowserContentPolicy {
  disposition: BrowserDisposition;
  previewMode: BrowserPreviewMode;
  supportsPreview: boolean;
  headers: Readonly<Record<string, string>>;
}

const NOSNIFF_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff"
});

const SANDBOX_HEADERS = Object.freeze({
  ...NOSNIFF_HEADERS,
  "Content-Security-Policy": "default-src 'none'; sandbox;"
});

const INLINE_POLICY = Object.freeze<BrowserContentPolicy>({
  disposition: "inline",
  previewMode: "inline",
  supportsPreview: false,
  headers: NOSNIFF_HEADERS
});

const HTML_POLICY = Object.freeze<BrowserContentPolicy>({
  disposition: "attachment",
  previewMode: "sandboxed",
  supportsPreview: true,
  headers: SANDBOX_HEADERS
});

const SVG_POLICY = Object.freeze<BrowserContentPolicy>({
  disposition: "inline",
  previewMode: "sandboxed",
  supportsPreview: true,
  headers: SANDBOX_HEADERS
});

const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const SVG_TYPES = new Set(["image/svg+xml"]);

export function getBrowserContentPolicy(mimeType: string): BrowserContentPolicy {
  if (!mimeType) return HTML_POLICY; // Defensive fallback if type is empty/missing
  
  // Clean parameter formatting like text/html;charset=utf-8
  const cleanMime = mimeType.toLowerCase().split(";")[0].trim();

  if (HTML_TYPES.has(cleanMime)) {
    return HTML_POLICY;
  }

  if (SVG_TYPES.has(cleanMime)) {
    return SVG_POLICY;
  }

  return INLINE_POLICY;
}
