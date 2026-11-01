import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";
import { GLB_MIN_SOURCE } from "../vendor/GlbVendor.js";

export class GlbBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "model/gltf-binary"
  ]);

  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    const base64Data = input.buffer.toString("base64");

    const htmlStructure = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* 🎨 ADJUSTED: Subtle gradient background shift from slate to concrete helps light objects pop */
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: linear-gradient(135deg, #dfdfdf 0%, #bebebe 100%); }
    model-viewer { width: 100%; height: 100%; display: block; }
    #loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-family: sans-serif; color: #333; font-weight: bold; }
  </style>
  
  <script type="module">
    ${GLB_MIN_SOURCE}
  </script>
</head>
<body>

  <data id="glb-binary" style="display: none;">${base64Data}</data>

  <div id="loading">Preparing 3D viewport canvas...</div>

  <!-- 💡 VISIBILITY TUNING EXTRA ATTRIBUTES ADDED: -->
  <!-- 1. environment-image="neutral": Forces rich studio lighting variations across surface faces -->
  <!-- 2. shadow-intensity="1.5": Casts highly descriptive shadows on the floor grid plane below -->
  <!-- 3. shadow-softness="0.5": Sharpens shadow edges for clear spatial anchoring -->
  <!-- 4. exposure="1.2": Moderates illumination to reveal texture detail -->
  <model-viewer 
    id="viewer"
    alt="M1AS 3D Asset Preview (${input.displayName})" 
    environment-image="neutral"
    shadow-intensity="1.5"
    shadow-softness="0.5"
    exposure="1.2"
    auto-rotate 
    camera-controls 
    ar-status="not-presenting"
    style="visibility: hidden;">
  </model-viewer>

  <script type="module">
    (function() {
      try {
        const b64Data = document.getElementById('glb-binary').textContent.trim();
        
        const byteCharacters = atob(b64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        
        const blob = new Blob([byteArray], { type: 'model/gltf-binary' });
        const objectUrl = URL.createObjectURL(blob);
        
        const viewer = document.getElementById('viewer');
        const loading = document.getElementById('loading');
        
        viewer.src = objectUrl;
        viewer.style.visibility = 'visible';
        loading.style.display = 'none';
        
        viewer.addEventListener('load', () => {
          URL.revokeObjectURL(objectUrl);
        });
      } catch (err) {
        document.getElementById('loading').innerText = "Failed to parse 3D Model: " + err.message;
      }
    })();
  </script>
</body>
</html>`;

    return {
      mimeType: "text/html",
      buffer: Buffer.from(htmlStructure, "utf-8"),
      displayName: input.displayName
    };
  }
}
