import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";

export class GlbBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "model/gltf-binary"
  ]);

  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    const base64Data = input.buffer.toString("base64");
    const dataUri = `data:model/gltf-binary;base64,${base64Data}`;

    const htmlStructure = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #ececec; }
    model-viewer { width: 100%; height: 100%; display: block; }
  </style>
  <script type="module" src="https://jsdelivr.net"></script>
</head>
<body>

  <model-viewer 
    src="${dataUri}" 
    alt="M1AS 3D Asset Preview (${input.displayName})" 
    auto-rotate 
    camera-controls 
    ar-status="not-presenting">
  </model-viewer>

</body>
</html>`;

    return {
      mimeType: "text/html",
      buffer: Buffer.from(htmlStructure, "utf-8"),
      displayName: input.displayName
    };
  }
}
