import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";

export class MarkdownBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "text/markdown",
    "text/x-markdown"
  ]);

  /**
   * Translates raw markdown text into structural markup representation.
   * Following the architectural mandate, this focuses solely on translation.
   * Downstream delivery maps this directly to isolated sandbox contexts.
   */
  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    // 1. Convert the incoming asset binary buffer to standard utf-8 plaintext string
    const markdownRaw = input.buffer.toString("utf-8");

    // 2. Perform structural transformation
    // Note: If you choose to pull in an external dependency like 'marked' or 'micromark' later,
    // you would safely drop its parser method straight right here.
    const HTMLStructure = this.simpleMarkdownToHtml(markdownRaw);

    // 3. Return the modified structure wrapped securely inside a previewable payload
    return {
      mimeType: "text/html", // Elevate the mime type to signal delivery handling mechanics
      buffer: Buffer.from(HTMLStructure, "utf-8"),
      displayName: input.displayName
    };
  }

  /**
   * Lightweight structural translation matrix to handle baseline Markdown syntax.
   */
  private simpleMarkdownToHtml(markdown: string): string {
    return markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
      .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>")
      .replace(/\n$/gim, '<br />');
  }
}
