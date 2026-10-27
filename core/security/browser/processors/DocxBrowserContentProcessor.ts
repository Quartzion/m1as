import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";
import mammoth from "mammoth"; // Clean OpenXML format translator baseline

export class DocxBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);

  /**
   * Translates compressed binary docx data into rich structural HTML fragments.
   * Leverages mammoth to extract semantic paragraphs, headers, and bullet points.
   */
  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    let documentHtml = "";

    try {
      // 1. Pass the raw asset buffer directly to the translation engine
      const result = await mammoth.convertToHtml({ buffer: input.buffer });
      documentHtml = result.value; // Extracted clean semantic layout code
      
      if (!documentHtml || documentHtml.trim() === "") {
        documentHtml = `<p style="color: #6b7280; font-style: italic;">This document contains no readable text content.</p>`;
      }
    } catch (err: any) {
      documentHtml = `<p style="color: #ef4444;">Extraction runtime error: ${this.escapeHtml(err.message)}</p>`;
    }

    // 2. Wrap text fragments inside your secure presentation layout skeleton
    const fullHtmlWrapper = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { padding: 35px; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; line-height: 1.6; }
    .word-page { max-width: 800px; margin: 0 auto; background: #ffffff; padding: 50px 60px; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .meta-tag { font-size: 0.8rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px; font-weight: 60px; }
    h2 { margin-top: 0; color: #111827; border-bottom: 2px solid #f3f4f6; padding-bottom: 15px; font-size: 1.5rem; }
    p { margin-bottom: 1.25rem; font-size: 1.05rem; color: #374151; text-align: justify; }
    ul, ol { margin-bottom: 1.25rem; padding-left: 20px; color: #374151; }
    li { margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <div class="word-page">
    <div class="meta-tag">Asset Processing Isolation Node</div>
    <h2>${this.escapeHtml(input.displayName)}</h2>
    <div class="document-content">
      ${documentHtml}
    </div>
  </div>
</body>
</html>`;

    return {
      mimeType: "text/html",
      buffer: Buffer.from(fullHtmlWrapper, "utf-8"),
      displayName: input.displayName
    };
  }

  private escapeHtml(text: string): string {
    return (text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
