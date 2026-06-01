import { IncomingHttpHeaders } from "http";
import { Readable } from "stream";

export interface StreamAssetOptions {
    headers: IncomingHttpHeaders;
    stream: Readable;
    fileSize: number;
    mimeType: string;
    writeHead: (status: number, headers: Record<string, string | number>) => void;
    pipe: (stream: Readable) => void;
    end: () => void;
}

export function streamAsset(options: StreamAssetOptions) {
    const { headers, stream, fileSize, mimeType, writeHead, pipe, end } = options;
    const rangeHeader = headers.range;

    // No Range header → full file
    if (!rangeHeader) {
        writeHead(200, {
            "Content-Length": fileSize,
            "Content-Type": mimeType,
            "Accept-Ranges": "bytes",
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

    const contentLength = endByte - start + 1;

    // 206 Partial Content headers
    
    // DEV LOGGING range streaming
    // console.log("206 response", {
    //     start,
    //     endByte,
    //     contentLength
    // });

    writeHead(206, {
        "Content-Range": `bytes ${start}-${endByte}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": contentLength,
        "Content-Type": mimeType,
    });

    // Pipe the already ranged stream
    pipe(stream);
}
