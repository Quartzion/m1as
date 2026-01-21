import { AssetStorageAdapter } from "../../core/assets/contracts.js";
import { Readable } from "stream";
import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";

interface StoredFile {
  storagePath: string; // internal ID in GridFS
  publicUrl?: string;  // optional URL endpoint for retrieval
}

export class MongoStorageAdapter implements AssetStorageAdapter {
  private bucket: GridFSBucket;

  constructor() {
    const connection = mongoose.connection;
    const db = connection.db;
    if (!db) {
      throw new Error("MongoDB connection is not initialized");
    }
    this.bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: "assets",
      writeConcern: { w: "majority" }
    });
  }

  // Save file buffer to GridFS
  async save(input: { buffer: Buffer; filename: string; mimeType: string }): Promise<StoredFile> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.bucket.openUploadStream(input.filename, {
        metadata: { contentType: input.mimeType },
      });

      const fileId = uploadStream.id;

      const readable = new Readable();
      readable.push(input.buffer);
      readable.push(null);

      readable.pipe(uploadStream)
        .on("error", async (err) => {
          try {
            if (fileId) {
              await this.bucket.delete(fileId);
            }
          } catch { }
          reject(err);
        })
        .on("finish", () => {
          resolve({
            storagePath: uploadStream.id.toString(), // GridFS ObjectId as string
            publicUrl: `/assets/${uploadStream.id.toString()}/file` // optional retrieval endpoint
          });
        });
    });
  }

  // Retrieve file buffer from GridFS
  async get(id: string): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
    return new Promise((resolve, reject) => {
      const _id = new ObjectId(id);
      const chunks: Buffer[] = [];
      const downloadStream = this.bucket.openDownloadStream(_id);

      downloadStream.on("data", (chunk) => chunks.push(chunk));
      downloadStream.on("error", (err) => reject(err));
      downloadStream.on("end", async () => {
        try {
          const files = await this.bucket.find({ _id }).toArray();
          if (!files || files.length === 0) return resolve(null);
          resolve({
            buffer: Buffer.concat(chunks),
            filename: files[0].filename,
            mimeType: (files[0].metadata as any)?.contentType || "application/octet-stream"
          });
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  // Delete file from GridFS
  async delete(id: string): Promise<void> {
    const _id = new ObjectId(id);

    try {
      await this.bucket.delete(_id);
    } catch (err: any) {
      // GridFS throws if file does not exist
      if (
        err?.code === 26 || // NamespaceNotFound
        err?.message?.includes("File not found")
      ) {
        return; // idempotent success
      }

      throw err;
    }
  }

}
