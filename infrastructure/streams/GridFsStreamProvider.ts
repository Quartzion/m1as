import { GridFSBucket, ObjectId } from "mongodb";
import { PublicError } from "../../core/middleware/publicErrorHandler.js";
import { StreamProvider, StreamRange, StreamResult } from "../../core/stream/StreamProvider.js";
import { m1asConfig } from "../../config/m1asConfig.js";

export class GridFsStreamProvider implements StreamProvider {
    constructor(private bucket: GridFSBucket) { }

    // open stream
    async openStream(
        storagePath: string,
        range?: StreamRange
    ): Promise<StreamResult> {

        const _id = new ObjectId(storagePath);
        const file = await this.bucket.find({ _id }).next();
        
        if (!file) {
            throw new PublicError(
                "Asset not found",
                404,
                "NOT_FOUND"
            );
        }

        let stream;
        let actualStart = 0;
        let actualEnd = file.length - 1;

        if (range) {

            const start = Math.max(
                0,
                Math.min(range.start, file.length - 1)
            );

            const requestedEnd =
                typeof range.end === "number"
                    ? Math.max(
                        start,
                        Math.min(
                            range.end,
                            file.length - 1
                        )
                    )
                    : file.length - 1;

            // range streaming optimization
            const maxRangeWindowBytes =
                m1asConfig.streaming.maxRangeWindowBytes;

            const effectiveEnd = Math.min(
                requestedEnd,
                start + maxRangeWindowBytes - 1
            );

            actualStart = start;
            actualEnd = effectiveEnd;
            
            stream = this.bucket.openDownloadStream(_id, {
                start,
                end: file.length
            });

        } else {

            stream = this.bucket.openDownloadStream(_id);

        }

        stream.on("error", (err) => {
            console.error(
                "GridFS stream error:",
                err
            );
        });

        return {
            stream,
            size: file.length,
            contentType:
                (file.metadata as any)?.contentType ||
                "application/octet-stream",
            actualStart,
            actualEnd
        };
    }
}