export type BrowserDisposition =
  | "inline"
  | "attachment";

export type BrowserPreviewMode =
  | "inline"
  | "sandboxed";

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

    "Content-Security-Policy":
        "default-src 'none'; sandbox;"
});

// Inline renders without needing sandbox safety
const INLINE_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "inline",
    supportsPreview: true,
    headers: NOSNIFF_HEADERS
});

// HTML/XHTML are never delivered inline.
// They may later be viewed through the dedicated sandboxed preview pipeline.
const HTML_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "attachment",
    previewMode: "sandboxed",
    supportsPreview: true,
    headers: SANDBOX_HEADERS
});

// SVG remains inline-capable but is flagged for sandboxed preview so
// future preview implementations can apply sanitization and CSP.
const SVG_POLICY = Object.freeze<BrowserContentPolicy>({
    disposition: "inline",
    previewMode: "sandboxed",
    supportsPreview: true,
    headers: SANDBOX_HEADERS
});

const HTML_TYPES = new Set([
    "text/html",
    "application/xhtml+xml"
]);

const SVG_TYPES = new Set([
    "image/svg+xml"
]);

export function getBrowserContentPolicy(
    mimeType: string
): BrowserContentPolicy {

    if (HTML_TYPES.has(mimeType)) {
        return HTML_POLICY;
    }

    if (SVG_TYPES.has(mimeType)) {
        return SVG_POLICY;
    }

    return INLINE_POLICY;
}