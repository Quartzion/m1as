import { BrowserContentInput } from "./BrowserContentProcessor.js";
import { BrowserContentProcessor } from "./BrowserContentProcessor.js";

export class DefaultBrowserContentProcessor
implements BrowserContentProcessor {

    readonly supportedMimeTypes = [];

    async process(input: BrowserContentInput) {

        return {
            mimeType: input.mimeType,
            buffer: input.buffer,
            displayName: input.displayName
        };

    }

}