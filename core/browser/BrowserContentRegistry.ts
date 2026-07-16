import { BrowserContentProcessor } from "./BrowserContentProcessor.js";

export class BrowserContentRegistry {

    constructor(
        private readonly processors: BrowserContentProcessor[],
        private readonly fallback: BrowserContentProcessor
    ) {}

    resolve(
        mimeType: string
    ): BrowserContentProcessor {

        return (
            this.processors.find(p =>
                p.supportedMimeTypes.includes(mimeType)
            ) ??
            this.fallback
        );

    }

}