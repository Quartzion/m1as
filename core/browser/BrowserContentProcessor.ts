export interface BrowserContentInput {
    mimeType: string;
    buffer: Buffer;
    displayName: string;
}

export interface BrowserContentOutput {
    mimeType: string;
    buffer: Buffer;
    displayName: string;
}

export interface BrowserContentProcessor {

    readonly supportedMimeTypes: readonly string[];

    process(
        input: BrowserContentInput
    ): Promise<BrowserContentOutput>;
}