import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";

export class MarkdownBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "text/markdown",
    "text/x-markdown"
  ]);

  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    const markdownRaw = input.buffer.toString("utf-8");
    const structuralHtml = this.translateMarkdownToGithubStyle(markdownRaw);

    // Using an array-join assembly mechanism completely prevents interpolation character collisions during compile
    const pageShell = [
      "<!DOCTYPE html>",
      "<html>",
      "<head>",
      "  <meta charset=\"utf-8\">",
      "  <style>",
      "    body { padding: 35px; background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif; color: #24292f; line-height: 1.5; }",
      "    .markdown-body { max-width: 850px; margin: 0 auto; background: #ffffff; padding: 45px; border: 1px solid #d0d7de; border-radius: 6px; }",
      "    h1 { font-size: 2rem; border-bottom: 1px solid #d8dee4; padding-bottom: 0.3em; margin-top: 0; }",
      "    h2 { font-size: 1.5rem; border-bottom: 1px solid #d8dee4; padding-bottom: 0.3em; }",
      "    h3 { font-size: 1.25rem; }",
      "    p { margin-bottom: 16px; }",
      "    code { background-color: rgba(175,184,193,0.2); padding: 0.2em 0.4em; border-radius: 6px; font-size: 85%; font-family: monospace; }",
      "    pre { padding: 16px; background-color: #f6f8fa; border-radius: 6px; overflow: auto; font-family: monospace; }",
      "    .mermaid { background: #ffffff; padding: 20px; border: 1px solid #d0d7de; border-radius: 6px; margin: 20px 0; display: flex; justify-content: center; }",
      "  </style>",
      "</head>",
      "<body>",
      "  <div class=\"markdown-body\">",
      structuralHtml,
      "  </div>",
      "  <script type=\"module\">",
      "    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';",
      "    mermaid.initialize({ startOnLoad: true, securityLevel: 'loose', theme: 'default' });",
      "  </script>",
      "</body>",
      "</html>"
    ].join("\n");

    return {
      mimeType: "text/html",
      buffer: Buffer.from(pageShell, "utf-8"),
      displayName: input.displayName
    };
  }

  private translateMarkdownToGithubStyle(markdown: string): string {
    const lines = markdown.split(/\r?\n/);
    
    let outputHtml = "";
    let isInsideMermaid = false;
    let currentMermaidContent: string[] = [];
    let isInsideCodeBlock = false;
    let currentCodeContent: string[] = [];
    let paragraphBuffer: string[] = [];

    const flushParagraph = () => {
      if (paragraphBuffer.length > 0) {
        let text = paragraphBuffer.join(" ");
        text = text.replace(/^### (.*\$)/gim, '<h3>\$1</h3>');
        text = text.replace(/^## (.*\$)/gim, '<h2>\$1</h2>');
        text = text.replace(/^# (.*\$)/gim, '<h1>\$1</h1>');
        text = text.replace(/\*\*(.*)\*\*/gim, '<strong>\$1</strong>');
        text = text.replace(/\*(.*)\*/gim, '<em>\$1</em>');
        text = text.replace(/`([^`]+)`/gim, '<code>\$1</code>');
        outputHtml += `<p>${text}</p>\n`;
        paragraphBuffer = [];
      }
    };

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith("```")) {
        flushParagraph();

        if (isInsideMermaid) {
          // Closed Block: Join layout instructions with standard line breaks
          outputHtml += `\n<div class="mermaid">\n${currentMermaidContent.join("\n")}\n</div>\n`;
          currentMermaidContent = [];
          isInsideMermaid = false;
        } else if (isInsideCodeBlock) {
          outputHtml += `\n<div><code>${this.escapeText(currentCodeContent.join("\n"))}</code></div>\n`;
          currentCodeContent = [];
          isInsideCodeBlock = false;
        } else {
          if (trimmedLine.toLowerCase().includes("mermaid")) {
            isInsideMermaid = true;
          } else {
            isInsideCodeBlock = true;
          }
        }
        continue;
      }

      if (isInsideMermaid) {
        // Safe Token Collector: Strip Windows character noise but preserve semantic chart indentation spaces
        currentMermaidContent.push(line.replace(/\r/g, "")); 
      } else if (isInsideCodeBlock) {
        currentCodeContent.push(line);
      } else {
        if (trimmedLine === "") {
          flushParagraph();
        } else if (trimmedLine.startsWith("#")) {
          flushParagraph();
          if (trimmedLine.startsWith("### ")) outputHtml += `<h3>${trimmedLine.slice(4)}</h3>\n`;
          else if (trimmedLine.startsWith("## ")) outputHtml += `<h2>${trimmedLine.slice(3)}</h2>\n`;
          else if (trimmedLine.startsWith("# ")) outputHtml += `<h1>${trimmedLine.slice(2)}</h1>\n`;
        } else {
          paragraphBuffer.push(trimmedLine);
        }
      }
    }

    flushParagraph();
    return outputHtml;
  }

  private escapeText(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
