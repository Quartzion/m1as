import { Readable } from "stream";

export interface StreamRange {
    start: number;
    end?: number;
}

export interface StreamResult {
    stream: Readable;
    size: number;
    contentType?: string;
}

export interface StreamProvider {
    openStream(
        assetId: string,
        range?: StreamRange,
    ): Promise<StreamResult>;
}