import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";

export class HtmlBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "text/html",
    "application/xhtml+xml"
  ]);

  /**
   * Pure pass-through isolation proxy.
   * Modifying or sanitizing raw HTML inside Node core is forbidden.
   * Safety is enforced via downstream HTTP headers (attachment + sandbox CSP).
   */
  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    return {
      mimeType: input.mimeType,
      buffer: input.buffer,
      displayName: input.displayName
    };
  }
}
