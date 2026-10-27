import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";

export class MermaidBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "text/vnd.mermaid",
    "text/mermaid"
  ]);

  /**
   * Translates raw diagram text into a structural HTML document embedding the Mermaid rendering layer.
   * Focuses purely on translation, relying completely on the downstream pipeline's
   * isolation headers for execution security.
   */
  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    // 1. Read raw diagram bytes as clean UTF-8 text
    const diagramRaw = input.buffer.toString("utf-8");

    // 2. Generate a structural HTML shell that loads Mermaid via an isolated CDN reference
    const htmlStructure = this.buildMermaidHtmlStructure(diagramRaw);

    // 3. Return the modified structure wrapped securely inside an inlineable preview payload
    return {
      mimeType: "text/html", // Escalate target to trigger HTML pipeline sandboxing
      buffer: Buffer.from(htmlStructure, "utf-8"),
      displayName: input.displayName
    };
  }

  /**
   * Constructs an isolated HTML shell that handles client-side diagram generation safely.
   */
  private buildMermaidHtmlStructure(diagram: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 20px; background: #ffffff; font-family: sans-serif; display: flex; justify-content: center; }
    .mermaid { width: 100%; max-width: 100%; }
  </style>
</head>
<body>
  <pre class="mermaid">
${this.escapeHtmlEntities(diagram)}
  </pre>
  <script type="module">
    import mermaid from 'https://jsdelivr.net';
    mermaid.initialize({ startOnLoad: true, securityLevel: 'strict', theme: 'default' });
  </script>
</body>
</html>`;
  }

  /**
   * Helper to ensure raw syntax characters do not break structural page boundaries.
   */
  private escapeHtmlEntities(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
