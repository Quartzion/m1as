import { BrowserContentInput, BrowserContentOutput, BrowserContentProcessor } from "../BrowserContentProcessor.js";

export class SvgBrowserContentProcessor implements BrowserContentProcessor {
  readonly supportedMimeTypes = Object.freeze([
    "image/svg+xml"
  ]);

  /**
   * Pure pass-through isolation proxy.
   * Overriding or cleaning SVG elements inline is disabled to protect performance and avoid bypass exploits.
   */
  async process(input: BrowserContentInput): Promise<BrowserContentOutput> {
    return {
      mimeType: input.mimeType,
      buffer: input.buffer,
      displayName: input.displayName
    };
  }
}
