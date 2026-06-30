import { IncomingHttpHeaders } from "http";
import { Readable } from "stream";
import { BrowserContentPolicy } from "../security/BrowserContentPolicy.js";

export interface StreamAssetOptions {
    headers: IncomingHttpHeaders;
    stream: Readable;
    fileSize: number;
    mimeType: string;
    policy: BrowserContentPolicy;
    actualStart?: number;
    actualEnd?: number;
    writeHead: (status: number, headers: Record<string, string | number>) => void;
    pipe: (stream: Readable) => void;
    end: () => void;
}

export function streamAsset(options: StreamAssetOptions) {
    const { 
        headers,
        stream,
        fileSize,
        mimeType,
        policy,
        actualStart,
        actualEnd,
        writeHead,
        pipe,
        end 
    } = options;
    const rangeHeader = headers.range;

    // No Range header → full file
    if (!rangeHeader) {
        writeHead(200, {
            "Content-Length": fileSize,
            "Content-Type": mimeType,
            "Accept-Ranges": "bytes",
            ...policy.headers
        });
        pipe(stream);
        return;
    }

    // Parse Range header
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
        writeHead(416, { "Content-Range": `bytes */${fileSize}` });
        end();
        return;
    }

    // Determine start/end
    let start = match[1] ? parseInt(match[1], 10) : 0;
    let endByte = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    // Clamp start/end to file bounds
    start = Math.max(0, Math.min(start, fileSize - 1));
    endByte = Math.max(start, Math.min(endByte, fileSize - 1));

    // Invalid range
    if (start > endByte) {
        writeHead(416, { "Content-Range": `bytes */${fileSize}` });
        end();
        return;
    }

    const responseStart = actualStart ?? start;
    const responseEnd = actualEnd ?? endByte;
    const contentLength = responseEnd - responseStart + 1;

    // 206 Partial Content headers
    writeHead(206, {
        "Content-Range": `bytes ${responseStart}-${responseEnd}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": contentLength,
        "Content-Type": mimeType,
        ...policy.headers
    });

    // Pipe the already ranged stream
    pipe(stream);
}
