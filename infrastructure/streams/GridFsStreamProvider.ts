import { GridFSBucket, ObjectId } from "mongodb";
import { PublicError } from "../../core/middleware/publicErrorHandler.js";
import { StreamProvider, StreamRange, StreamResult } from "../../core/stream/StreamProvider.js";

export class GridFsStreamProvider implements StreamProvider {
    constructor(private bucket: GridFSBucket) { }

    async openStream(
        storagePath: string,
        range?: StreamRange
    ): Promise<StreamResult> {
        const _id = new ObjectId(storagePath);

        const file = await this.bucket.find({ _id }).next();
        if (!file) {
            throw new PublicError("Asset not found", 404, "NOT_FOUND");
        }

        let stream;

        if (range) {
            // Clamp start and end within file length
            const start = Math.max(0, Math.min(range.start, file.length - 1));
            const end = typeof range.end === "number"
                ? Math.max(start, Math.min(range.end, file.length - 1))
                : undefined;
            // DEV LOGGING
            // console.log("open download stream GridFS range:", {
            //     start,
            //     end,
            //     fileLength: file.length,
            //     range
            // });

            if (typeof end === "number") {
                stream = this.bucket.openDownloadStream(_id, {
                    start,
                    end: file.length
                });
            } else {
                stream = this.bucket.openDownloadStream(_id, {
                    start,
                    end: file.length
                });
            }
        } else {
            // DEV LOGGING
            // console.log("GridFS range:", {
            //     fileLength: file.length,
            //     range
            // });
            stream = this.bucket.openDownloadStream(_id);
        }

        stream.on("error", (err) => {
            console.error("GridFS stream error:", err);
        });

        return {
            stream,
            size: file.length,
            contentType: (file.metadata as any)?.contentType || "application/octet-stream"
        };
    }
}
