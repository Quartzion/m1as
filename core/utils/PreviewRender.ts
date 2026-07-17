import { BrowserContentPolicy } from "../security/browser/BrowserContentPolicy.js";

export interface PreviewRenderInput {
    mimeType: string;
    buffer: Buffer;
    displayName: string;
}

export function renderPreview(
    input: PreviewRenderInput,
    policy: BrowserContentPolicy
) {
    if (!policy.supportsPreview) {
        return {
            status: "not_previewable" as const
        };
    }

    switch (policy.previewMode) {

        case "sandboxed":
            return {
                status: "ok" as const,
                html: buildSandboxedFrame(input)
            };

        case "inline":
            return {
                status: "ok" as const,
                html: buildInlineView(input)
            };
    }
}

function buildSandboxedFrame(input: PreviewRenderInput): string {
    const base64 = input.buffer.toString("base64");

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body>
  <iframe
    sandbox=""
    style="width:100%;height:100vh;border:0"
    src="data:${input.mimeType};base64,${base64}">
  </iframe>
</body>
</html>
`;
}

function buildInlineView(input: PreviewRenderInput): string {
    const text = input.buffer.toString("utf-8");

    return `
<!DOCTYPE html>
<html>
<body>
<pre>${escapeHtml(text)}</pre>
</body>
</html>
`;
}

function escapeHtml(str: string) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

