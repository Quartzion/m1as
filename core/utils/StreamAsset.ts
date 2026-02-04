// m1as/core/utils/streamAsset.ts
import fs from "fs";
import { IncomingHttpHeaders } from "http";

export interface StreamAssetOptions {
  headers: IncomingHttpHeaders;
  filePath: string;
  fileSize: number;
  mimeType: string;
  writeHead: (status: number, headers: Record<string, string | number>) => void;
  pipe: (stream: fs.ReadStream) => void;
  end: () => void;
}

export function streamAsset(options: StreamAssetOptions) {
  const { headers, filePath, fileSize, mimeType, writeHead, pipe, end } = options;
  const range = headers.range;

  if (!range) {
    writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
    });

    pipe(fs.createReadStream(filePath));
    return;
  }

  const match = range.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    writeHead(416, { "Content-Range": `bytes */${fileSize}` });
    end();
    return;
  }

  let start = match[1] ? parseInt(match[1], 10) : 0;
  let endByte = match[2] ? parseInt(match[2], 10) : fileSize - 1;

  if (start >= fileSize || endByte >= fileSize || start > endByte) {
    writeHead(416, { "Content-Range": `bytes */${fileSize}` });
    end();
    return;
  }

  writeHead(206, {
    "Content-Range": `bytes ${start}-${endByte}/${fileSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": endByte - start + 1,
    "Content-Type": mimeType,
  });

  pipe(fs.createReadStream(filePath, { start, end: endByte }));
}
