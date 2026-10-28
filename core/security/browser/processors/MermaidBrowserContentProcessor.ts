import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";

export class MermaidBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "text/vnd.mermaid",
    "text/mermaid"
  ]);

  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    const rawText = input.buffer.toString("utf-8");

    // Clean out wrapping markdown backtick structures cleanly
    const lines = rawText.split(/\r?\n/);
    const cleanedLines = lines.filter(line => {
      const trimmed = line.trim().toLowerCase();
      return !trimmed.startsWith("```mermaid") && trimmed !== "```";
    });

    const cleanDiagram = cleanedLines.join("\n").trim();

    // Raw HTML template structure block
    const htmlStructure = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 25px; background: #ffffff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; }
    .mermaid { width: 100%; max-width: 100%; }
  </style>
</head>
<body>
  <div class="mermaid">
${cleanDiagram}
  </div>

  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ 
      startOnLoad: true, 
      securityLevel: 'loose', 
      theme: 'default' 
    });
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
